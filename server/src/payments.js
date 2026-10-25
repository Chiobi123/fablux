const crypto = require('node:crypto');
const repo = require('./repository');
const config = require('./config');
const {randomId} = require('./security');
const orders = require('./order-service');

async function paystack(path, options={}) {
  if (!config.paystackSecretKey) throw Object.assign(new Error('Payment service is not configured.'), {status:503});
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...options,
    headers: {'Authorization': `Bearer ${config.paystackSecretKey}`, 'Content-Type':'application/json', ...(options.headers||{})}
  });
  const data = await response.json().catch(()=>null);
  if (!response.ok || !data?.status) throw Object.assign(new Error(data?.message || 'Payment provider request failed.'), {status:502});
  return data;
}

async function initializePaystack({user, order}) {
  const reference = `FAB-${order.id.replace(/[^A-Za-z0-9=._-]/g,'')}-${crypto.randomBytes(5).toString('hex')}`;
  const expires = new Date(Date.now() + config.paymentReservationMinutes * 60000).toISOString();
  repo.run('INSERT INTO payment_transactions(id,order_id,provider,reference,amount,currency,status,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)', [randomId('pay'),order.id,'paystack',reference,order.total,'NGN','pending',expires,repo.now(),repo.now()]);
  try {
    const result = await paystack('/transaction/initialize', {
      method:'POST',
      body:JSON.stringify({email:user.email, amount:String(order.total*100), currency:'NGN', reference, callback_url:`${config.appBaseUrl.replace(/\/$/,'')}/payment-callback.html`})
    });
    repo.run('UPDATE orders SET payment_reference=?,updated_at=? WHERE id=?',[reference,repo.now(),order.id]);
    return {authorizationUrl:result.data.authorization_url,reference};
  } catch (error) {
    orders.releaseReservation(order.id,'provider_error');
    repo.run('UPDATE payment_transactions SET status=?,updated_at=? WHERE reference=?',['failed',repo.now(),reference]);
    throw error;
  }
}

async function verifyPaystack(reference, user) {
  const tx = repo.one('SELECT * FROM payment_transactions WHERE reference=? AND provider=?',[reference,'paystack']);
  if (!tx) throw Object.assign(new Error('Payment reference not found.'),{status:404});
  const order = repo.one('SELECT * FROM orders WHERE id=? AND user_id=?',[tx.order_id,user.id]);
  if (!order) throw Object.assign(new Error('Order not found.'),{status:404});
  const result = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`, {method:'GET'});
  const data = result.data;
  if (data.status !== 'success') {
    if (['failed','abandoned','reversed'].includes(data.status)) orders.releaseReservation(order.id,data.status);
    repo.run('UPDATE payment_transactions SET status=?,provider_status=?,updated_at=? WHERE reference=?',[data.status,data.status,repo.now(),reference]);
    return {paid:false,status:data.status};
  }
  if (Number(data.amount) !== Number(order.total*100) || String(data.currency||'NGN') !== 'NGN') throw Object.assign(new Error('Payment amount or currency did not match the order.'),{status:409});
  orders.finalizePaidOrder(order.id,reference);
  return {paid:true,status:'success',orderId:order.id};
}

function verifyWebhookSignature(rawBody, signature) {
  if (!config.paystackSecretKey || !signature) return false;
  const digest=crypto.createHmac('sha512',config.paystackSecretKey).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest),Buffer.from(String(signature)));
}

async function handleWebhook(rawBody, signature) {
  if (!verifyWebhookSignature(rawBody,signature)) throw Object.assign(new Error('Invalid webhook signature.'),{status:401});
  const event=JSON.parse(rawBody.toString('utf8'));
  if (event.event !== 'charge.success') return {ok:true,ignored:true};
  const reference=event.data?.reference;
  if (!reference) return {ok:true,ignored:true};
  const tx=repo.one('SELECT * FROM payment_transactions WHERE reference=?',[reference]);
  if (!tx) return {ok:true,ignored:true};
  if (tx.status==='success') return {ok:true};
  const order=repo.one('SELECT * FROM orders WHERE id=?',[tx.order_id]);
  if (!order) return {ok:true,ignored:true};
  if (Number(event.data.amount)!==Number(order.total*100) || String(event.data.currency||'NGN')!=='NGN') throw Object.assign(new Error('Webhook amount mismatch.'),{status:409});
  orders.finalizePaidOrder(order.id,reference);
  return {ok:true};
}

module.exports={initializePaystack,verifyPaystack,handleWebhook};
