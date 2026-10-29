/* ============================================================
   Image fallback: some photos are not uploaded yet (0-byte files),
   which would leave blank boxes. Any image that fails to load is
   replaced with a branded FabluX placeholder of the same size.
   Drop a real photo on top of the same path and it shows again.
   ============================================================ */
(function(){
'use strict';
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function wrap(text,per,max){
  const words=String(text||'FABLU X').split(/\s+/).filter(Boolean); let lines=[], cur='';
  for(const w of words){
    if(!cur){cur=w}
    else if((cur+' '+w).length<=per){cur+=' '+w}
    else{lines.push(cur);cur=w}
    if(lines.length>=max)break;
  }
  if(cur&&lines.length<max)lines.push(cur);
  if(lines.length>max)lines=lines.slice(0,max);
  if(lines.length&&words.join(' ').length>lines.join(' ').length)lines[lines.length-1]=lines[lines.length-1].slice(0,Math.max(1,per-1))+'…';
  return lines;
}
function placeholder(img){
  const alt=(img.getAttribute('alt')||img.getAttribute('title')||'FabluX').trim()||'FabluX';
  const lines=wrap(alt.toUpperCase(),16,3);
  const t=lines.map((l,i)=>'<text x="300" y="'+(400+i*54)+'" text-anchor="middle" font-family="Poppins,Arial,sans-serif" font-size="40" font-weight="700" fill="#ffffff">'+esc(l)+'</text>').join('');
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750" width="600" height="750">'+
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'+
    '<stop offset="0" stop-color="#241033"/><stop offset="0.55" stop-color="#3d1a5c"/><stop offset="1" stop-color="#7B2CBF"/>'+
    '</linearGradient></defs>'+
    '<rect width="600" height="750" fill="url(#g)"/>'+
    '<rect x="18" y="18" width="564" height="714" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="2" stroke-dasharray="10 8"/>'+
    '<g fill="none" stroke="rgba(255,255,255,.55)" stroke-width="7" stroke-linecap="round">'+
    '<path d="M300 176 a26 26 0 1 1 26 26 c-16 0-26 12-26 26"/>'+
    '<path d="M300 228 L188 300 c-14 9-8 30 9 30 h206 c17 0 23-21 9-30 L300 228"/>'+
    '</g>'+
    '<text x="300" y="560" text-anchor="middle" font-family="Poppins,Arial,sans-serif" font-size="26" font-weight="600" letter-spacing="6" fill="rgba(255,255,255,.75)">FABLU X</text>'+
    '<text x="300" y="606" text-anchor="middle" font-family="Poppins,Arial,sans-serif" font-size="22" fill="rgba(255,255,255,.6)">photo coming soon</text>'+
    t+
    '</svg>';
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
function swap(img){
  if(!img||img.tagName!=='IMG'||img.dataset.fabluxPlaceholder)return;
  img.dataset.fabluxPlaceholder='1';
  try{ img.src=placeholder(img); }catch(e){}
}
// capture-phase: fires for every image, including ones added later
document.addEventListener('error',function(e){swap(e.target)},true);
// images that failed before this script ran
function sweep(){Array.prototype.forEach.call(document.images,swap)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sweep);else sweep();
window.addEventListener('load',sweep);
})();

(function(){
'use strict';
const api=window.FabluXAPI; if(!api)return;
const money=n=>'₦'+Number(n||0).toLocaleString('en-NG');
const toast=m=>window.FabluXStore?.toast(m);
const getCart=()=>window.FabluXStore?.getCart?.()||[];
/* Signed-in people go to the right place: an approved administrator lands on
   the admin console, everyone else on their own account page. */
async function redirectAfterLogin(){if(typeof window.redirectAfterLogin==='function'){window.redirectAfterLogin();return}const ret=new URLSearchParams(location.search).get('return');if(ret){location.href=ret;return}let role='customer';try{const d=await api.me();if(d&&d.user)role=d.user.role||'customer'}catch(e){}location.href=(role==='admin')?'admin.html':'account.html';}
async function handleAuth(event){const f=event.target;if(f.id!=='loginForm'&&f.id!=='registerForm'&&f.id!=='forgotForm')return;event.preventDefault();event.stopImmediatePropagation();try{if(f.id==='loginForm'){await api.login({email:f.email.value,password:f.password.value});toast('✓ Welcome back');await redirectAfterLogin();}else if(f.id==='registerForm'){await api.register({name:f.name.value, email:f.email.value, phone:f.phone.value, password:f.password.value});toast('✓ Account created');await redirectAfterLogin();}else{await api.forgotPassword(f.email.value.trim());toast('If the email exists, a reset link has been sent. Check your inbox.');}}catch(e){toast(e.message)}finally{if(window.FabluXSyncAccount)window.FabluXSyncAccount();}}

/* Returns page: the request is written to the Supabase returns table
   (row level security keeps it private to the customer and visible to the
   administrators, who can move it along from the console). */
function handleReturnForm(){
  const f=document.getElementById('returnForm'); if(!f)return;
  f.onsubmit=async e=>{
    e.preventDefault();
    try{
      await api.returnRequest({orderId:f.order.value.trim(),reason:f.reason.value,details:f.details.value.trim()});
      toast('✓ Return request submitted');
      f.reset();
    }catch(err){
      const m=String((err&&err.message)||'');
      if(/sign in/i.test(m)){location.href='login.html?return='+encodeURIComponent(location.pathname+location.search);return}
      toast(m);
    }
  };
}

/* Capture the Supabase recovery tokens from the reset link (#access_token=...&refresh_token=...).
   This is the only password-reset entry point: no local account store is involved. */
function captureResetToken(){
  const raw=(location.hash||'')+'&'+(location.search||'');
  const p=new URLSearchParams(raw.replace(/^#/,''));
  const at=p.get('access_token'), rt=p.get('refresh_token');
  if(at&&window.FabluXAuthTokenKey){localStorage.setItem(window.FabluXAuthTokenKey,at);localStorage.removeItem('fablux_api_user_v1');history.replaceState(null,'',location.pathname);}
}
async function handleReset(event){
  const f=event.target; if(f.id!=='resetForm')return;
  event.preventDefault(); event.stopImmediatePropagation();
  try{
    if(!f.password.value||f.password.value.length<8){toast('Password must be at least 8 characters');return}
    if(f.password.value!==f.confirm.value){toast('Passwords do not match');return}
    const tok=(location.hash||location.search||'');
    if(/access_token=/.test(tok))captureResetToken();
    await api.resetPassword(null,f.password.value);
    toast('✓ Password updated — please sign in');
    setTimeout(()=>{location.href='login.html'},700);
  }catch(e){toast(e.message)}
}
async function renderAccount(){const box=document.getElementById('accountPage');if(!box)return;try{const d=await api.account();if(!d||!d.user){location.href='login.html?return='+encodeURIComponent(location.pathname+location.search);return}box.querySelector('[data-user-name]').textContent=d.user.name;box.querySelector('[data-user-email]').textContent=d.user.email;box.querySelector('[data-user-phone]').textContent=d.user.phone||'Not added';const role=(d.user.role||'customer');const welcome=box.querySelector('.section-title p');let badge=document.getElementById('roleBadge');if(!badge&&welcome){badge=document.createElement('span');badge.id='roleBadge';badge.className='account-role';welcome.appendChild(badge)}if(badge)badge.textContent=role==='admin'?'ADMINISTRATOR':'MEMBER';let adminCard=document.getElementById('adminShortcut');if(role==='admin'&&!adminCard){adminCard=document.createElement('article');adminCard.className='pro-card';adminCard.id='adminShortcut';adminCard.innerHTML='<div><h3>Admin Console</h3><p>Orders, payment confirmation, dispatch and store settings.</p><a class="pro-card-link" href="admin.html">Open Admin Console</a></div>';const grid=box.querySelector('.pro-card-grid');if(grid)grid.prepend(adminCard)}else if(role!=='admin'&&adminCard){adminCard.remove()}const logout=box.querySelector('[data-logout]');if(logout)logout.onclick=async()=>{await api.logout();location.href='login.html';};let section=document.getElementById('addressBook');if(!section){section=document.createElement('section');section.id='addressBook';section.style.marginTop='40px';box.appendChild(section)}section.innerHTML=`<div class="section-title"><span>DELIVERY</span><h3>Address Book</h3></div><form id="addressForm" class="pro-form"><label>Label<input name="label" required></label><label>Address<textarea name="address" rows="3" required></textarea></label><label>City<input name="city" required></label><label>State<input name="state" required></label><button class="btn">Save Address</button></form><div class="pro-card-grid" style="margin-top:20px">${d.addresses.map(a=>`<article class="pro-card"><div><strong>${esc(a.label)}</strong><p>${esc(a.address)}<br>${esc(a.city)}, ${esc(a.state)}</p><button type="button" data-delete-address="${esc(a.id)}">Remove</button></div></article>`).join('')}</div>`;section.querySelector('#addressForm').onsubmit=async e=>{e.preventDefault();try{await api.createAddress(Object.fromEntries(new FormData(e.target)));toast('✓ Address saved');renderAccount()}catch(err){toast(err.message)}};section.querySelectorAll('[data-delete-address]').forEach(b=>b.onclick=async()=>{try{await api.deleteAddress(b.dataset.deleteAddress);renderAccount()}catch(e){toast(e.message)}})}catch(e){if(e&&(e.network||/Network problem/i.test(String(e.message||'')))){toast(e.message||'Network problem — please try again.');return}location.href='login.html?return='+encodeURIComponent(location.pathname+location.search)}}
const STATUS_LABEL={pending_payment:'Order received',payment_confirmed:'Payment confirmed',confirmed:'Order confirmed',processing:'Preparing parcel',ready_for_dispatch:'Ready for dispatch',shipped:'Collected by courier',delivered:'Delivered',cancelled:'Cancelled'};
async function renderOrders(){const box=document.getElementById('ordersPage');if(!box)return;try{const d=await api.orders();box.innerHTML=d.orders.length?d.orders.map(o=>`<article class="pro-order"><div><strong>${esc(o.reference||o.id)}</strong><span>${new Date(o.created_at).toLocaleDateString('en-NG')}</span></div><p>${(o.items||[]).map(i=>`${esc(i.name)} × ${i.quantity}`).join(', ')}</p><div><strong>${money(o.total)}</strong><span class="status">${STATUS_LABEL[o.status]||o.status}</span></div><div class="pro-card-link" style="display:flex;gap:14px;flex-wrap:wrap"><a href="order-success.html?ref=${encodeURIComponent(o.reference||'')}&token=${encodeURIComponent(o.tracking_token||localStorage.getItem('fablux_last_order_token')||'')}">Order Details</a><a href="track.html?ref=${encodeURIComponent(o.reference||'')}&token=${encodeURIComponent(o.tracking_token||'')}">Track Order</a></div></article>`).join(''):'<div class="pro-empty"><h2>No orders yet</h2><a class="btn" href="shop.html">Start Shopping</a></div>'}catch(e){box.innerHTML='<div class="pro-empty"><h2>Your orders</h2><p>'+esc(e.message)+'</p><a class="btn" href="login.html?return=orders.html">Sign In</a> <a class="btn" href="shop.html">Continue as guest</a></div>'}}
async function handleCheckout(event){const f=event.target;if(!f.closest('#checkoutPage'))return;event.preventDefault();event.stopImmediatePropagation();const cart=getCart();if(!cart.length){toast('Your cart is empty');return}try{const d=Object.fromEntries(new FormData(f));if(!window.FabluXAPI){throw new Error('Checkout is unavailable right now.')}const fp=JSON.stringify(cart.map(x=>[x.id,x.quantity]))+'|'+(d.payment||'');let key=sessionStorage.getItem('fablux_idem_fp')||'';let idem=sessionStorage.getItem('fablux_idem')||'';if(key!==fp||!idem){idem=(crypto&&crypto.randomUUID)?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2);sessionStorage.setItem('fablux_idem',idem);sessionStorage.setItem('fablux_idem_fp',fp);}const order=await api.createOrder({name:d.name,email:d.email,phone:d.phone,address:d.address,state:d.state,city:d.city,landmark:d.landmark||'',instructions:d.instructions||'',deliveryMethod:d.delivery||'standard',paymentMethod:d.payment||'pay-on-delivery',promoCode:checkoutPromo?checkoutPromo.code:null,idempotencyKey:idem,items:cart.map(x=>({productId:x.id,quantity:x.quantity}))});checkoutPromo=null;sessionStorage.removeItem('fablux_idem');sessionStorage.removeItem('fablux_idem_fp');localStorage.setItem('fablux_last_order_id_v1',order.order.id);localStorage.setItem('fablux_last_order_ref',order.order.reference);localStorage.setItem('fablux_last_order_token',order.order.tracking_token);if(order.payment&&order.payment.authorizationUrl){location.href=order.payment.authorizationUrl;return;}location.href='order-success.html?ref='+encodeURIComponent(order.order.reference)+'&token='+encodeURIComponent(order.order.tracking_token)}catch(e){toast(e.message)}}
async function handleReview(event){const f=event.target;if(f.id!=='reviewForm')return;event.preventDefault();event.stopImmediatePropagation();try{const id=new URLSearchParams(location.search).get('id');const d=Object.fromEntries(new FormData(f));await api.review({productId:id,rating:Number(d.rating),text:d.text});toast('✓ Review submitted');f.reset()}catch(e){toast(e.message)}}
async function handleContact(event){const f=event.target;if(!f.classList.contains('contact-form'))return;event.preventDefault();event.stopImmediatePropagation();try{const d=Object.fromEntries(new FormData(f));if(!d.consent){toast('Please agree to the privacy policy first');return}await api.contact({name:d.name,email:d.email,subject:d.subject,message:d.message,consent:true,honeypot:d.website||''});f.reset();toast('✓ Message sent successfully')}catch(e){toast(e.message)}}
async function handleNewsletter(event){const f=event.target;if(!f.classList.contains('newsletter-form'))return;event.preventDefault();event.stopImmediatePropagation();try{const d=Object.fromEntries(new FormData(f));if(!d.consent){toast('Please agree to the privacy policy first');return}await api.newsletter({email:f.querySelector('input[type=email]')?.value,consent:true,honeypot:d.website||''});f.reset();toast('✓ You are subscribed to FabluX.U.Design updates')}catch(e){toast(e.message)}}
async function handleUnsubscribe(event){const f=event.target;if(f.id!=='unsubscribeForm')return;event.preventDefault();event.stopImmediatePropagation();try{const em=f.querySelector('input[type=email]')?.value;await api.unsubscribe(em);f.reset();toast('✓ You have been unsubscribed')}catch(e){toast(e.message)}}
async function renderAdmin(){
  const box=document.getElementById('adminPage'); if(!box) return;
  /* The console never hands a stranger a sign-in section: a signed-out
     visitor is quietly taken to the normal sign-in page, and a signed-in
     customer is simply told that this area is not theirs. */
  const deny=async()=>{
    let u=null; try{ u=(await api.me()).user }catch(e){}
    if(!u){ location.replace('login.html?return=admin.html'); return; }
    box.innerHTML='<div class="pro-empty"><h2>Administrators only</h2><p>This area is reserved for the FabluX store administrators.</p><a class="btn" href="index.html">Back to the store</a></div>';
  };
  if(window.FabluXAdmin&&window.FabluXAdmin.render){
    try{ await window.FabluXAdmin.render(box); }catch(e){ await deny(); }
    return;
  }
  try{
    const d=await api.adminDashboard();
    box.innerHTML=`<div class="section-title"><span>FABLUX ADMIN</span><h2>Store Control Center</h2><p>Secure backend-connected administration.</p></div><div class="fablux-admin-grid"><div class="fablux-admin-stat">Products<strong>${d.stats.products}</strong></div><div class="fablux-admin-stat">Customers<strong>${d.stats.customers}</strong></div><div class="fablux-admin-stat">Orders<strong>${d.stats.orders}</strong></div><div class="fablux-admin-stat">Reviews<strong>${d.stats.reviews}</strong></div></div>`;
  }catch(e){ await deny(); }
}

/* Promo code applied at checkout (re-validated by the database when the
   order is placed — the page only ever displays the discount). */
let checkoutPromo=null;
async function renderCheckout(){const box=document.getElementById('checkoutPage');if(!box)return;try{const cart=getCart();if(!cart.length){box.innerHTML='<div class="pro-empty"><h2>Your cart is empty</h2><a class="btn" href="shop.html">Return to Shop</a></div>';return}const f=box.querySelector('form');let me={user:null};try{me=await api.me()}catch(e){}if(me.user){if(!f.querySelector('[name=name]').value)f.querySelector('[name=name]').value=me.user.name||'';if(!f.querySelector('[name=email]').value)f.querySelector('[name=email]').value=me.user.email||'';if(!f.querySelector('[name=phone]').value)f.querySelector('[name=phone]').value=me.user.phone||''}else if(!f.querySelector('[data-guest-note]')){const g=document.createElement('small');g.dataset.guestNote='1';g.style.display='block';g.style.opacity='.75';g.textContent='Checking out as a guest? Enter your email above — you will receive a secure tracking link.';f.querySelector('[name=email]').parentElement.after(g)}if(!f.querySelector('[name=payment]')){const l=document.createElement('label');l.innerHTML='Payment Method<select name="payment" required><option value="pay-on-delivery">Pay on Delivery (pay when you receive)</option><option value="bank-transfer">Bank Transfer (payment confirmed by the store)</option></select>';f.querySelector('[name=delivery]').parentElement.after(l)}let settings={deliveryFee:2500,expressSurcharge:0};try{settings=await api.publicSettings()}catch(e){}const promoRow=f.querySelector('[data-promo-row]'),promoInput=f.querySelector('[name=promo]'),applyBtn=f.querySelector('[data-apply-promo]');const cartTotal=()=>cart.reduce((s,x)=>s+x.price*x.quantity,0);const discount=()=>checkoutPromo?Math.min(checkoutPromo.discount,cartTotal()):0;const renderFees=()=>{const method=f.querySelector('[name=delivery]').value||'standard';let fee=Number(settings.deliveryFee)||0;if(method==='express')fee+=Number(settings.expressSurcharge)||0;if(method==='pickup')fee=0;const subtotal=cartTotal();const off=discount();const sum=f.querySelector('[data-summary]');if(sum)sum.innerHTML=cart.map(x=>`<div class="pro-summary-row"><span>${esc(x.name)} × ${x.quantity}</span><strong>${money(x.price*x.quantity)}</strong></div>`).join('');if(f.querySelector('[data-subtotal]'))f.querySelector('[data-subtotal]').textContent=money(subtotal);if(f.querySelector('[data-delivery]'))f.querySelector('[data-delivery]').textContent=money(fee);if(promoRow){promoRow.style.display=off>0?'':'none';if(off>0){const lab=f.querySelector('[data-promo-label]');if(lab&&checkoutPromo)lab.textContent='Discount ('+checkoutPromo.code+')';if(f.querySelector('[data-discount]'))f.querySelector('[data-discount]').textContent='-'+money(off)}}if(f.querySelector('[data-total]'))f.querySelector('[data-total]').textContent=money(Math.max(0,subtotal+fee-off))};renderFees();f.querySelector('[name=delivery]').addEventListener('change',renderFees);if(applyBtn&&promoInput){const doApply=async()=>{const code=promoInput.value.trim();if(!code){checkoutPromo=null;renderFees();return}applyBtn.classList.add('is-busy');applyBtn.disabled=true;try{const r=await api.validatePromo(code,cartTotal());if(r&&r.valid){checkoutPromo={code:r.code,discount:Number(r.discount)||0};renderFees();toast('✓ Promo applied — '+money(checkoutPromo.discount)+' off')}else{checkoutPromo=null;renderFees();toast((r&&r.message)||'That promo code is not valid')}}catch(e){checkoutPromo=null;renderFees();toast(e.message)}finally{applyBtn.classList.remove('is-busy');applyBtn.disabled=false}};applyBtn.addEventListener('click',doApply);promoInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();doApply()}})}}catch(e){toast(e.message)}}
async function renderInvoice(){const box=document.getElementById('invoicePage');if(!box)return;try{const id=new URLSearchParams(location.search).get('id');if(!id)throw new Error('Order reference is missing.');const d=await api.order(id),o=d.order;box.innerHTML=`<div class="invoice-head"><div><span>FABLUX.U.DESIGN</span><h1>Invoice</h1></div><strong>${esc(o.id)}</strong></div><p>${new Date(o.created_at).toLocaleString('en-NG')}</p><div class="pro-summary">${o.items.map(i=>`<div class="pro-summary-row"><span>${esc(i.name)} × ${i.quantity}</span><strong>${money(i.price*i.quantity)}</strong></div>`).join('')}<hr><div class="pro-summary-row"><span>Subtotal</span><strong>${money(o.subtotal)}</strong></div><div class="pro-summary-row"><span>Delivery</span><strong>${money(o.delivery_fee)}</strong></div><div class="pro-summary-row"><span>Discount</span><strong>-${money(o.discount)}</strong></div><div class="pro-summary-row"><strong>Total</strong><strong>${money(o.total)}</strong></div></div><button class="btn" onclick="window.print()">Print Invoice</button>`}catch(e){box.innerHTML=`<div class="pro-empty"><h2>Unable to load invoice</h2><p>${esc(e.message)}</p></div>`}}
async function renderOrderSuccess(){const box=document.getElementById('orderSuccess');if(!box)return;const q=new URLSearchParams(location.search);const ref=q.get('ref')||localStorage.getItem('fablux_last_order_ref')||'';const token=q.get('token')||localStorage.getItem('fablux_last_order_token')||'';if(!ref){box.innerHTML='<div class="pro-empty"><h2>No recent order</h2><a class="btn" href="shop.html">Continue Shopping</a></div>';return}try{const d=await api.track(ref,token);const o=d.order;const payLabel={pending:'Awaiting payment',successful:'Payment received',failed:'Payment failed',refunded:'Refunded'};box.innerHTML=`<div class="pro-success-head"><i class="fa-solid fa-circle-check"></i><h2>Thank you — your order is saved</h2><p>Order reference <strong>${esc(o.reference)}</strong></p></div><div class="pro-admin-section"><h3>Order summary</h3>${d.items.map(i=>`<div class="pro-summary-row"><span>${esc(i.name)} × ${i.quantity}</span><strong>${money(i.line_total)}</strong></div>`).join('')}<div class="pro-summary-row"><span>Subtotal</span><strong>${money(o.subtotal)}</strong></div><div class="pro-summary-row"><span>Delivery</span><strong>${money(o.delivery_fee)}</strong></div><div class="pro-summary-row"><strong>Total</strong><strong>${money(o.total)}</strong></div></div><div class="pro-admin-section"><h3>Status</h3><div class="pro-summary-row"><span>Order status</span><strong>${STATUS_LABEL[o.status]||o.status}</strong></div><div class="pro-summary-row"><span>Payment</span><strong>${payLabel[o.payment_status]||o.payment_status}</strong></div><div class="pro-summary-row"><span>Payment method</span><strong>${o.payment_method==='bank-transfer'?'Bank Transfer':'Pay on Delivery'}</strong></div><div class="pro-summary-row"><span>Placed</span><strong>${new Date(o.created_at).toLocaleString('en-NG')}</strong></div><div class="pro-summary-row"><span>Delivering to</span><strong>${esc(o.address)}, ${esc(o.city)}, ${esc(o.state)}</strong></div></div><div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:18px"><a class="btn" href="track.html?ref=${encodeURIComponent(o.reference)}&token=${encodeURIComponent(token||'')}">Track this order</a><a class="btn" href="shop.html">Continue Shopping</a></div><p style="margin-top:14px;opacity:.8">Keep your reference <strong>${esc(o.reference)}</strong> — it is the way to track, collect or return this order.</p>${!localStorage.getItem('fablux_api_token_v1')?`<div class="pro-admin-section" style="margin-top:20px"><h3>Save your details for next time</h3><p>You checked out as a guest. Create an account with Google so your delivery details are ready for your next order. If you need this order attached to your account, contact us with the reference above.</p><div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn btn-google" data-google><i class="fa-brands fa-google"></i> Continue with Google</button><a class="btn btn-outline" href="register.html?return=order-success.html">Create an account</a></div></div>`:''}`}catch(e){box.innerHTML='<div class="pro-empty"><h2>Order not found</h2><p>'+esc(e.message)+'</p><a class="btn" href="orders.html">My Orders</a></div>'}}

async function renderTrack(){const box=document.getElementById('trackPage');if(!box)return;const q=new URLSearchParams(location.search);const refInput=box.querySelector('[name=ref]');const tokInput=box.querySelector('[name=token]');const show=async(ref,token)=>{const out=box.querySelector('[data-track-result]');if(!out)return;out.innerHTML='<p>Loading…</p>';try{const d=await api.track(ref,token);const o=d.order;const steps=[['pending_payment','Order received'],['payment_confirmed','Payment confirmed'],['confirmed','Order confirmed'],['processing','Preparing parcel'],['ready_for_dispatch','Ready for dispatch'],['shipped','Collected by courier'],['delivered','Delivered']];const doneIdx=Math.max(0,steps.findIndex(s=>s[0]===o.status));const cancelled=o.status==='cancelled';const timeline=(d.events||[]).map(ev=>`<li><strong>${esc(ev.label)}</strong><span>${new Date(ev.created_at).toLocaleString('en-NG')}</span></li>`).join('');out.innerHTML=`<div class="pro-admin-section"><h3>Order ${esc(o.reference)}</h3><div class="pro-summary-row"><span>Current status</span><strong>${STATUS_LABEL[o.status]||o.status}</strong></div><div class="pro-summary-row"><span>Payment</span><strong>${o.payment_status}</strong></div><div class="pro-summary-row"><span>Total</span><strong>${money(o.total)}</strong></div><div class="pro-summary-row"><span>Delivering to</span><strong>${esc(o.city)}, ${esc(o.state)}</strong></div>${o.courier?`<div class="pro-summary-row"><span>Courier</span><strong>${esc(o.courier)}${o.courier_tracking?' — '+esc(o.courier_tracking):''}</strong></div>`:''}</div><div class="pro-admin-section"><h3>Progress</h3><ol class="fablux-timeline">${cancelled?'<li class="cancelled"><strong>Order cancelled</strong></li>':steps.map((s,i)=>`<li class="${i<=doneIdx?'done':''}"><strong>${s[1]}</strong></li>`).join('')}</ol></div><div class="pro-admin-section"><h3>History</h3><ul class="fablux-events">${timeline}</ul></div><div class="pro-admin-section"><h3>Items</h3>${d.items.map(i=>`<div class="pro-summary-row"><span>${esc(i.name)} × ${i.quantity}</span><strong>${money(i.line_total)}</strong></div>`).join('')}</div>`}catch(err){out.innerHTML='<div class="pro-empty"><h2>Cannot find that order</h2><p>'+esc(err.message)+'</p></div>'}};if(refInput&&tokInput){const form=box.querySelector('form');if(form)form.addEventListener('submit',e=>{e.preventDefault();show(refInput.value.trim(),tokInput.value.trim())});if(q.get('ref')){refInput.value=q.get('ref');tokInput.value=q.get('token')||'';show(refInput.value,tokInput.value)}}}

document.addEventListener('submit',handleAuth,true);
captureResetToken();document.addEventListener('submit',handleReset,true);document.addEventListener('submit',handleCheckout,true);document.addEventListener('submit',handleReview,true);document.addEventListener('submit',handleContact,true);document.addEventListener('submit',handleNewsletter,true);document.addEventListener('submit',handleUnsubscribe,true);

/* Google sign-in. Any element with [data-google] starts Supabase OAuth.
   The return destination respects ?return=… so a guest can sign in mid-flow. */
document.addEventListener('click',function(event){
  const btn=event.target.closest&&event.target.closest('[data-google]');
  if(!btn)return;
  event.preventDefault();
  if(!window.FabluXAPI||!api.loginWithGoogle){toast('Google sign-in is not available right now');return}
  const ret=new URLSearchParams(location.search).get('return');
  const dest=ret||(location.pathname.split('/').pop()==='order-success.html'?'account.html':'account.html');
  const go=function(){ api.loginWithGoogle(dest); };
  /* The provider has to be enabled in Supabase; saying so is better than
     sending the visitor to a raw JSON error page. */
  if(!api.googleAvailable){ go(); return; }
  btn.setAttribute('aria-busy','true');
  api.googleAvailable().then(function(r){
    btn.removeAttribute('aria-busy');
    if(r.ok){ go(); return; }
    toast((r.message||'Google sign-in is not enabled yet')+'. Please sign in with your email instead.');
  }).catch(function(){ btn.removeAttribute('aria-busy'); go(); });
},true);

/* Surface OAuth failures (provider disabled, redirect URL not allow-listed)
   on whichever page the visitor lands on, rather than failing silently. */
(function reportOAuthError(){
  const q=new URLSearchParams(location.search);
  const h=new URLSearchParams((location.hash||'').replace(/^#/,''));
  if(h.get('access_token')||q.get('access_token')) return;
  const err=q.get('error')||h.get('error');
  const desc=q.get('error_description')||h.get('error_description')||q.get('error_code');
  if(!err&&!desc) return;
  const msg=String(desc||err).replace(/\+/g,' ');
  setTimeout(function(){ if(typeof toast==='function') toast(msg); },400);
})();
/* ---- site chrome (works on every page, even those that do not load js/script.js) ---- */
function initSiteChrome(){
  /* Persistent Back / Home dock — one control that works on every page,
     regardless of how the visitor arrived or how many tabs are open. */
  /* The floating dock overlaps the Google button on small phones, and auth pages
     already have header navigation — skip it there. */
  const isAuthPage=!!(document.getElementById('loginForm')||document.getElementById('registerForm')||document.getElementById('forgotForm')||document.getElementById('resetForm'));
  if(!isAuthPage&&!document.getElementById('navDock')&&document.body){
    let canBack=false;
    try{
      canBack=history.length>1||(!!document.referrer&&new URL(document.referrer).origin===location.origin);
    }catch(e){canBack=false;}
    /* Up is added on pages that have no "back to top" button of their own
       (the admin console, account, checkout, orders, …). */
    const needsUp=!document.getElementById('topBtn');
    const upIcon='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">'+
      '<path d="M5 14l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const backIcon='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">'+
      '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const homeIcon='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">'+
      '<path d="M4 11.4L12 4.2l8 7.2M6.6 10.1V19.8h10.8V10.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const dock=document.createElement('nav');
    dock.id='navDock';
    dock.setAttribute('aria-label','Back, top and home');
    dock.innerHTML=
      (needsUp?'<button type="button" id="navUp" title="Back to top" aria-label="Back to top">'+upIcon+'</button>':'')+
      '<button type="button" id="navBack" title="Previous page" aria-label="Go back"'+(canBack?'':' disabled')+'>'+backIcon+'</button>'+
      '<a id="navHome" href="index.html" title="Home page" aria-label="Go to home page">'+homeIcon+'</a>';
    document.body.appendChild(dock);
    const up=dock.querySelector('#navUp');
    if(up)up.addEventListener('click',()=>{
      const y0=window.scrollY;
      try{window.scrollTo({top:0,behavior:'smooth'});}catch(e){window.scrollTo({top:0,behavior:'instant'});}
      /* guarantee the jump even where smooth scrolling is unavailable */
      setTimeout(()=>{ if(window.scrollY===y0&&window.scrollY>0) window.scrollTo({top:0,behavior:'instant'}); },400);
    });
    const back=dock.querySelector('#navBack');
    if(canBack)back.addEventListener('click',()=>{try{history.back();}catch(e){}});
  }
  const scriptLoaded=!!document.querySelector('script[src="js/script.js"]');
  const menuBtn=document.querySelector('.menu-toggle');
  const navLinks=document.querySelector('.nav-links');
  if(menuBtn&&navLinks&&!scriptLoaded&&!menuBtn.dataset.bound){
    menuBtn.dataset.bound='1';
    menuBtn.setAttribute('aria-label','Menu');
    menuBtn.addEventListener('click',()=>{
      const open=navLinks.classList.toggle('active');
      menuBtn.setAttribute('aria-expanded',open?'true':'false');
      document.body.classList.toggle('nav-open',open);
    });
    navLinks.addEventListener('click',e=>{
      if(e.target.closest('a')){navLinks.classList.remove('active');document.body.classList.remove('nav-open');}
    });
    document.addEventListener('click',e=>{
      if(navLinks.classList.contains('active')&&!e.target.closest('.nav-links')&&!e.target.closest('.menu-toggle')){
        navLinks.classList.remove('active');document.body.classList.remove('nav-open');
      }
    });
  }
  const topBtn=document.getElementById('topBtn');
  if(topBtn&&!scriptLoaded&&!topBtn.dataset.bound){
    topBtn.dataset.bound='1';
    topBtn.style.display='none';
    topBtn.addEventListener('click',()=>{
      const y0=window.scrollY;
      try{window.scrollTo({top:0,behavior:'smooth'});}catch(e){window.scrollTo({top:0,behavior:'instant'});}
      setTimeout(()=>{ if(window.scrollY===y0&&window.scrollY>0) window.scrollTo({top:0,behavior:'instant'}); },400);
    });
    const onScroll=()=>{topBtn.style.display=window.scrollY>400?'flex':'none';};
    window.addEventListener('scroll',onScroll,{passive:true});onScroll();
  }
  const loader=document.getElementById('loader');
  if(loader&&!loader.dataset.bound){
    loader.dataset.bound='1';
    const started=(window.performance&&performance.timeOrigin)||Date.now();
    let scheduled=false;
    const fade=()=>{if(loader.isConnected){loader.classList.add('loader-ready');setTimeout(()=>loader.remove(),500);}};
    const hide=()=>{
      if(scheduled||!loader.isConnected)return;
      scheduled=true;
      setTimeout(fade,Math.max(0,700-(Date.now()-started)));
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hide,{once:true});else hide();
    setTimeout(fade,4000); /* safety net: never trap the visitor */
  }
}

/* ============================================================
   LIVE CATALOGUE — the shop reads Supabase, so a product added,
   repriced or hidden in the admin console is exactly what
   shoppers see. Static markup stays as the offline fallback.
   ============================================================ */
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

/* Which filter chips a piece belongs to. A card may carry more than
   one bucket (space separated) so unisex pieces stay reachable from
   both the Men and the Women chip. */
function filterBucket(p){
  const s=String((p.category||'')+' '+(p.name||'')).toLowerCase();
  if(/shoe|sneaker|heel|boot|slipper|footwear|loafer|sandal|flip ?flop|slip-on|oxford|trainer/.test(s))return 'shoes';
  if(/watch|bag|jewel|accessor|sunglass|belt|cap\b|hat|scarf|headwear|necklace|bracelet|tie\b|backpack|beanie|fragrance|perfume/.test(s))return 'accessories';
  const w=/women|woman|ladies|feminine|dress|gown|skirt|eveningwear|blouse|legging|bodysuit|crop top|maxi|stiletto|lace/.test(s);
  const m=/menwear|men's|\bmen\b|masculine|suit|blazer|tuxedo/.test(s);
  if(w&&m)return 'men women';
  if(w)return 'women';
  if(m)return 'men';
  return 'men women';
}

function shopCardHtml(p){
  const id=esc(p.id), name=esc(p.name), cat=esc(p.category||''), priceTxt='₦'+(Number(p.price)||0).toLocaleString('en-NG');
  const img=p.image?esc(p.image):'';
  const available=Math.max(0,Number(p.stock||0)-Number(p.reserved_stock||0));
  const badge=available<=0?'<div class="product-badge sold-out">Sold out</div>'
    :(available<=3?'<div class="product-badge" style="background:#ff9800;box-shadow:0 2px 8px rgba(255,152,0,.4)">Low stock</div>':'');
  const pic=img?'<img src="'+img+'" alt="'+name+'" loading="lazy" decoding="async">'
    :'<div style="height:100%;display:flex;align-items:center;justify-content:center;opacity:.45;font-size:.8rem">No picture</div>';
  return '<div class="product-card shop-product-card'+(available<=0?' is-sold-out':'')+'" data-category="'+filterBucket(p)+
    '" data-product-id="'+id+'" data-product-name="'+name+'" data-product-price="'+priceTxt+
    '" data-product-category="'+cat+'" data-product-image="'+img+'">' +
    '<div class="product-image">'+pic+badge+
    '<div class="product-overlay"><button class="quick-view-btn" type="button" data-product-id="'+id+'">Quick View</button></div></div>' +
    '<div class="product-info"><h3>'+name+'</h3><p>'+cat+'</p>' +
    '<div class="product-price"><span>'+priceTxt+'</span>' +
    '<button class="cart-btn" type="button" aria-label="Add '+name+' to cart"><i class="fa-solid fa-cart-shopping"></i></button></div></div></div>';
}

let qvCurrent=null;
function ensureQuickView(){
  let m=document.getElementById('fxQuickView');
  if(m)return m;
  m=document.createElement('div');
  m.className='modal';
  m.id='fxQuickView';
  m.innerHTML='<div class="modal-content"><button class="modal-close" type="button" aria-label="Close">&times;</button>' +
    '<div class="modal-header"><div class="modal-image"><img id="fxQvImg" src="" alt=""></div>' +
    '<div class="modal-details"><h2 id="fxQvName"></h2><p id="fxQvCat"></p>' +
    '<div class="modal-price" id="fxQvPrice"></div>' +
    '<div class="modal-actions"><button class="add-to-cart-btn" id="fxQvCart" type="button"><i class="fa-solid fa-cart-shopping"></i> Add to Cart</button>' +
    '<button class="wishlist-btn" id="fxQvWish" type="button"><i class="fa-regular fa-heart"></i> Wishlist</button>' +
    '<a class="btn btn-outline" id="fxQvDetails" href="#" style="min-width:0;max-width:190px;height:48px">View details</a></div>' +
    '<div class="modal-description"><p id="fxQvStock"></p></div></div></div></div>';
  document.body.appendChild(m);
  m.addEventListener('click',function(e){
    if(e.target===m||e.target.closest('.modal-close')){m.classList.remove('active');return}
    if(e.target.closest('#fxQvCart')&&qvCurrent){
      window.FabluXStore?.addToCart(qvCurrent);
      m.classList.remove('active');
    }
    if(e.target.closest('#fxQvWish')&&qvCurrent){
      window.FabluXStore?.toggleWishlist(qvCurrent);
      m.classList.remove('active');
    }
  });
  return m;
}

function openQuickView(p,available){
  const m=ensureQuickView();
  qvCurrent=p;
  const img=m.querySelector('#fxQvImg');
  if(p.image){img.src=p.image;img.alt=p.name;img.style.display=''}else{img.removeAttribute('src');img.style.display='none'}
  m.querySelector('#fxQvName').textContent=p.name;
  m.querySelector('#fxQvCat').textContent=p.category||'FabluX Signature';
  m.querySelector('#fxQvPrice').textContent='₦'+(Number(p.price)||0).toLocaleString('en-NG');
  m.querySelector('#fxQvStock').textContent=available>0
    ? available+' available — ready to ship in 2–4 business days.'
    : 'Sold out. This piece is not taking orders right now.';
  const det=m.querySelector('#fxQvDetails');
  if(det)det.setAttribute('href','product.html?id='+encodeURIComponent(String(p.id)));
  m.classList.add('active');
}

function wireShopGrid(grid){
  const store=window.FabluXStore;
  Array.prototype.forEach.call(grid.querySelectorAll('.product-card'),function(card){
    const available=(function(){
      const rows=window.__fxRows||[];
      const r=rows.filter(function(x){return String(x.id)===String(card.dataset.productId)})[0];
      if(!r)return 99;
      return Math.max(0,Number(r.stock||0)-Number(r.reserved_stock||0));
    })();
    const cartBtn=card.querySelector('.cart-btn');
    if(cartBtn)cartBtn.addEventListener('click',function(e){
      e.preventDefault();
      if(available<=0){window.FabluXStore?.toast('This piece is sold out');return}
      const p=store&&store.productFromCard&&store.productFromCard(card);
      if(p)store.addToCart(p);
    });
    const qv=card.querySelector('.quick-view-btn');
    if(qv)qv.addEventListener('click',function(e){
      e.preventDefault();
      const p=store&&store.productFromCard&&store.productFromCard(card);
      if(p)openQuickView(p,available);
    });
  });
  const host=grid.closest('.shop-products');
  const bar=host&&host.querySelector('.filter-group');
  if(bar&&!bar.dataset.wired){
    bar.dataset.wired='1';
    bar.addEventListener('click',function(e){
      const b=e.target.closest&&e.target.closest('.filter-btn');
      if(!b)return;
      Array.prototype.forEach.call(bar.querySelectorAll('.filter-btn'),function(x){x.classList.remove('active')});
      b.classList.add('active');
      const f=b.dataset.filter||'all';
      Array.prototype.forEach.call(grid.querySelectorAll('.product-card'),function(c){
        const buckets=String(c.dataset.category||'').split(/\s+/).filter(Boolean);
        c.style.display=(f==='all'||buckets.indexOf(f)>=0)?'':'none';
      });
    });
  }
}

function syncFeaturedGrid(rows){
  const byId={};
  rows.forEach(function(r){byId[String(r.id)]=r});
  Array.prototype.forEach.call(document.querySelectorAll('.product-card[data-product-id]'),function(card){
    if(card.closest('.shop-products'))return;
    const row=byId[String(card.dataset.productId)];
    if(!row)return;
    const price='₦'+(Number(row.price)||0).toLocaleString('en-NG');
    card.dataset.productName=row.name;
    card.dataset.productPrice=price;
    card.dataset.productCategory=row.category||'';
    card.dataset.productImage=row.image||'';
    const h=card.querySelector('h3'); if(h)h.textContent=row.name;
    const sub=card.querySelector('.product-info p'); if(sub&&row.category)sub.textContent=row.category;
    const amt=card.querySelector('.product-info span'); if(amt)amt.textContent=price;
    const img=card.querySelector('.product-image img'); if(img&&row.image)img.src=row.image;
    if(!card.dataset.wired){
      card.dataset.wired='1';
      const add=card.querySelector('.feat-add');
      if(add&&window.FabluXStore)add.addEventListener('click',function(e){
        e.preventDefault();
        const prod=window.FabluXStore.productFromCard(card);
        if(prod)window.FabluXStore.addToCart(prod);
      });
    }
  });
}

function syncDetailPage(rows){
  if(!window.FabluXDetail)return;
  const id=new URLSearchParams(location.search).get('id');
  if(!id)return;
  const row=rows.filter(function(r){return String(r.id)===String(id)})[0];
  if(row)window.FabluXDetail.update(row);
}

async function syncCatalog(){
  let rows=[];
  try{
    const out=await api.products();
    rows=Array.isArray(out)?out:((out&&out.products)||[]);
  }catch(e){ return; }
  if(!Array.isArray(rows)||!rows.length)return;
  rows=rows.slice().sort(function(a,b){
    const na=Number(a.id),nb=Number(b.id);
    if(!isNaN(na)&&!isNaN(nb))return na-nb;
    return String(a.id).localeCompare(String(b.id));
  });
  window.__fxRows=rows;
  try{
    window.FAB_PRODUCTS=rows.map(function(r){
      return {id:String(r.id),name:r.name,price:Number(r.price)||0,category:r.category||'',image:r.image||''};
    });
  }catch(e){}
  Array.prototype.forEach.call(document.querySelectorAll('.product-grid'),function(grid){
    if(!grid.closest('.shop-products'))return;
    grid.innerHTML=rows.map(shopCardHtml).join('');
    wireShopGrid(grid);
  });
  syncFeaturedGrid(rows);
  syncDetailPage(rows);
  /* The grid's cards were just replaced, so re-apply whatever the shopper had
     already typed or selected — otherwise the live refresh silently clears it. */
  try{ if(typeof window.FabluXApplyShop==='function') window.FabluXApplyShop(); }catch(e){}
}

/* ============================================================
   Forms: consent checkbox, spam honeypot and accessible labels.
   Added at runtime so every page gets the same treatment and no
   form can be submitted without an explicit privacy agreement.
   ============================================================ */
function initFormsConsent(){
  const forms=document.querySelectorAll('.newsletter-form, .contact-form');
  Array.prototype.forEach.call(forms,function(f){
    if(f.dataset.consentReady)return; f.dataset.consentReady='1';
    const isNews=f.classList.contains('newsletter-form');
    if(!f.querySelector('[name="website"]')){
      const hp=document.createElement('input');
      hp.type='text'; hp.name='website'; hp.tabIndex=-1; hp.autocomplete='off';
      hp.setAttribute('aria-hidden','true');
      hp.style.cssText='position:absolute;left:-9999px;width:1px;height:1px;opacity:0';
      f.appendChild(hp);
    }
    if(!f.querySelector('[name="consent"]')){
      const lab=document.createElement('label');
      lab.className='consent-row';
      lab.innerHTML='<input type="checkbox" name="consent" required> <span>I agree to the <a href="privacy.html">privacy policy</a>'+(isNews?' and to receive occasional updates':'')+'.</span>';
      f.appendChild(lab);
    }
    const em=f.querySelector('input[type="email"]');
    if(em){ if(!em.getAttribute('aria-label'))em.setAttribute('aria-label',isNews?'Email address for the newsletter':'Your email address'); if(!em.getAttribute('autocomplete'))em.setAttribute('autocomplete','email'); em.setAttribute('inputmode','email'); }
    const btn=f.querySelector('button[type="submit"],button:not([type])');
    if(btn&&!btn.textContent.trim())btn.textContent=isNews?'Subscribe':'Send message';
  });
  /* Unsubscribe form (one-click, also linked from every email footer). */
  const uf=document.getElementById('unsubscribeForm');
  if(uf&&!uf.dataset.consentReady){uf.dataset.consentReady='1';}
}

/* Pull the store's real contact details from settings so the footer and
   legal pages never show a made-up address or phone number. */
async function hydrateStoreDetails(){
  if(!window.FabluXAPI)return;
  try{
    const s=await api.publicSettings(); const st=s.store||{};
    const set=function(sel,val){
      if(!val)return;
      Array.prototype.forEach.call(document.querySelectorAll(sel),function(e){
        e.textContent=val;
        if(e.tagName==='A'&&/^mailto:/.test(e.getAttribute('href')||''))e.href='mailto:'+val;
      });
    };
    set('[data-store-name]',st.name); set('[data-store-email]',st.email);
    set('[data-store-address]',st.address);
    /* Never publish a placeholder phone number. The row stays hidden until a
       real number is saved in Settings. */
    const realPhone=typeof st.contact==='string'&&st.contact.trim()&&!/x{3,}|placeholder|example\./i.test(st.contact);
    if(realPhone){
      set('[data-store-contact]',st.contact);
      Array.prototype.forEach.call(document.querySelectorAll('[data-store-phone-row]'),function(r){r.hidden=false});
    }
  }catch(e){}
}

document.addEventListener('DOMContentLoaded',()=>{initSiteChrome();initFormsConsent();hydrateStoreDetails();syncCatalog();renderAccount();renderOrders();renderAdmin();renderCheckout();renderInvoice();renderOrderSuccess();renderTrack();handleReturnForm();});
/* Never show a stale identity: re-render the account page whenever the tab
   becomes visible again (e.g. after signing in somewhere else). */
document.addEventListener('visibilitychange',()=>{if(document.hidden)return;if(document.getElementById('accountPage'))renderAccount();});
})();
