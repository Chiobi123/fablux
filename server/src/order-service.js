const crypto = require('node:crypto');
const repo = require('./repository');
const config = require('./config');
const v = require('./validation');

const DELIVERY_FEES = Object.freeze({ standard: 2500, express: 5000, pickup: 0 });

function orderId() {
  return `FAB-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function cleanItems(items) {
  if (!Array.isArray(items) || !items.length) throw Object.assign(new Error('Cart is empty.'), {status: 400});
  const clean = [];
  for (const item of items) {
    const product = repo.one('SELECT id,name,price,stock,reserved_stock,active FROM products WHERE id=?', [String(item.productId)]);
    if (!product || !product.active) throw Object.assign(new Error(`Product ${item.productId} is unavailable.`), {status: 400});
    const quantity = v.int(item.quantity, 'Quantity', {min: 1, max: 100});
    const available = Number(product.stock) - Number(product.reserved_stock || 0);
    if (available < quantity) throw Object.assign(new Error(`${product.name} does not have enough stock.`), {status: 409});
    clean.push({product, quantity});
  }
  return clean;
}

function createOrder({user, name, email, phone, address, city, state, deliveryMethod='standard', paymentMethod='pay-on-delivery', items}) {
  const clean = cleanItems(items);
  if (!DELIVERY_FEES.hasOwnProperty(deliveryMethod)) throw Object.assign(new Error('Invalid delivery method.'), {status: 400});
  const normalizedPayment = String(paymentMethod || 'pay-on-delivery');
  if (!['pay-on-delivery', 'paystack'].includes(normalizedPayment)) throw Object.assign(new Error('Unsupported payment method.'), {status: 400});
  const subtotal = clean.reduce((sum, x) => sum + Number(x.product.price) * x.quantity, 0);
  const deliveryFee = DELIVERY_FEES[deliveryMethod];
  const discount = 0; // Discounts are server-controlled; never trust a client-supplied amount.
  const total = subtotal + deliveryFee;
  const id = orderId();
  const t = repo.now();
  const status = normalizedPayment === 'paystack' ? 'pending_payment' : 'pending';

  repo.transaction(() => {
    repo.run('INSERT INTO orders(id,user_id,status,subtotal,delivery_fee,discount,total,payment_method,delivery_method,customer_name,email,phone,address,city,state,created_at,updated_at,payment_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
      id, user.id, status, subtotal, deliveryFee, discount, total, normalizedPayment, deliveryMethod,
      v.string(name || user.name, 'Name', {max:120}), v.email(email || user.email),
      v.string(phone || user.phone || '', 'Phone', {max:40}), v.string(address, 'Address', {max:500}),
      v.string(city, 'City', {max:80}), v.string(state, 'State', {max:80}), t, t,
      normalizedPayment === 'paystack' ? 'pending' : 'not_required'
    ]);
    for (const item of clean) {
      repo.run('INSERT INTO order_items(order_id,product_id,name,price,quantity) VALUES(?,?,?,?,?)', [id, item.product.id, item.product.name, item.product.price, item.quantity]);
      if (normalizedPayment === 'paystack') {
        repo.run('UPDATE products SET reserved_stock=reserved_stock+?,updated_at=? WHERE id=?', [item.quantity, t, item.product.id]);
      } else {
        repo.run('UPDATE products SET stock=stock-?,updated_at=? WHERE id=?', [item.quantity, t, item.product.id]);
      }
    }
  });
  return {id, status, subtotal, deliveryFee, discount, total, createdAt:t};
}

function finalizePaidOrder(orderId, reference) {
  const order = repo.one('SELECT * FROM orders WHERE id=?', [orderId]);
  if (!order) throw Object.assign(new Error('Order not found.'), {status:404});
  if (order.payment_status === 'paid') return order;
  const items = repo.many('SELECT product_id,quantity FROM order_items WHERE order_id=?', [orderId]);
  const t = repo.now();
  repo.transaction(() => {
    for (const item of items) {
      const p = repo.one('SELECT stock,reserved_stock FROM products WHERE id=?', [item.product_id]);
      if (!p || Number(p.reserved_stock) < Number(item.quantity) || Number(p.stock) < Number(item.quantity)) {
        throw Object.assign(new Error('Stock reservation is no longer valid.'), {status:409});
      }
      repo.run('UPDATE products SET stock=stock-?,reserved_stock=reserved_stock-?,updated_at=? WHERE id=?', [item.quantity, item.quantity, t, item.product_id]);
    }
    repo.run('UPDATE orders SET status=?,payment_status=?,payment_reference=?,paid_at=?,updated_at=? WHERE id=?', ['confirmed','paid',reference,t,t,orderId]);
    repo.run('UPDATE payment_transactions SET status=?,verified_at=?,updated_at=? WHERE reference=?', ['success',t,t,reference]);
  });
  return repo.one('SELECT * FROM orders WHERE id=?', [orderId]);
}

function releaseReservation(orderId, paymentStatus='failed') {
  const order = repo.one('SELECT * FROM orders WHERE id=?', [orderId]);
  if (!order || order.payment_status === 'paid' || order.status !== 'pending_payment') return;
  const items = repo.many('SELECT product_id,quantity FROM order_items WHERE order_id=?', [orderId]);
  const t = repo.now();
  repo.transaction(() => {
    for (const item of items) repo.run('UPDATE products SET reserved_stock=MAX(0,reserved_stock-?),updated_at=? WHERE id=?', [item.quantity,t,item.product_id]);
    repo.run('UPDATE orders SET status=?,payment_status=?,updated_at=? WHERE id=?', ['cancelled',paymentStatus,t,orderId]);
  });
}

function releaseExpiredReservations() {
  const expired = repo.many("SELECT order_id FROM payment_transactions WHERE status='pending' AND expires_at<=?", [repo.now()]);
  for (const row of expired) releaseReservation(row.order_id, 'expired');
  if (expired.length) repo.run("UPDATE payment_transactions SET status='expired',updated_at=? WHERE status='pending' AND expires_at<=?", [repo.now(), repo.now()]);
}

module.exports = {createOrder, finalizePaidOrder, releaseReservation, releaseExpiredReservations};
