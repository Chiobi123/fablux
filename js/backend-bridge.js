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
async function renderAccount(){const box=document.getElementById('accountPage');if(!box)return;try{const d=await api.account();if(!d||!d.user){location.href='login.html?return='+encodeURIComponent(location.pathname+location.search);return}box.querySelector('[data-user-name]').textContent=d.user.name;box.querySelector('[data-user-email]').textContent=d.user.email;box.querySelector('[data-user-phone]').textContent=d.user.phone||'Not added';const role=(d.user.role||'customer');const welcome=box.querySelector('.section-title p');let badge=document.getElementById('roleBadge');if(!badge&&welcome){badge=document.createElement('span');badge.id='roleBadge';badge.className='account-role';welcome.appendChild(badge)}if(badge)badge.textContent=role==='admin'?'ADMINISTRATOR':'MEMBER';let adminCard=document.getElementById('adminShortcut');if(role==='admin'&&!adminCard){adminCard=document.createElement('article');adminCard.className='pro-card';adminCard.id='adminShortcut';adminCard.innerHTML='<div><h3>Admin Console</h3><p>Orders, payment confirmation, dispatch and store settings.</p><a class="pro-card-link" href="admin.html">Open Admin Console</a></div>';const grid=box.querySelector('.pro-card-grid');if(grid)grid.prepend(adminCard)}else if(role!=='admin'&&adminCard){adminCard.remove()}const logout=box.querySelector('[data-logout]');if(logout)logout.onclick=async()=>{await api.logout();location.href='login.html';};let section=document.getElementById('addressBook');if(!section){section=document.createElement('section');section.id='addressBook';section.style.marginTop='40px';box.appendChild(section)}section.innerHTML=`<div class="section-title"><span>DELIVERY</span><h3>Address Book</h3></div><form id="addressForm" class="pro-form"><label>Label<input name="label" required></label><label>Address<textarea name="address" rows="3" required></textarea></label><label>City<input name="city" required></label><label>State<input name="state" required></label><button class="btn">Save Address</button></form><div class="pro-card-grid" style="margin-top:20px">${d.addresses.map(a=>`<article class="pro-card"><div><strong>${a.label}</strong><p>${a.address}<br>${a.city}, ${a.state}</p><button type="button" data-delete-address="${a.id}">Remove</button></div></article>`).join('')}</div>`;section.querySelector('#addressForm').onsubmit=async e=>{e.preventDefault();try{await api.createAddress(Object.fromEntries(new FormData(e.target)));toast('✓ Address saved');renderAccount()}catch(err){toast(err.message)}};section.querySelectorAll('[data-delete-address]').forEach(b=>b.onclick=async()=>{try{await api.deleteAddress(b.dataset.deleteAddress);renderAccount()}catch(e){toast(e.message)}})}catch(e){if(e&&(e.network||/Network problem/i.test(String(e.message||'')))){toast(e.message||'Network problem — please try again.');return}location.href='login.html?return='+encodeURIComponent(location.pathname+location.search)}}
const STATUS_LABEL={pending_payment:'Order received',payment_confirmed:'Payment confirmed',confirmed:'Order confirmed',processing:'Preparing parcel',ready_for_dispatch:'Ready for dispatch',shipped:'Collected by courier',delivered:'Delivered',cancelled:'Cancelled'};
async function renderOrders(){const box=document.getElementById('ordersPage');if(!box)return;try{const d=await api.orders();box.innerHTML=d.orders.length?d.orders.map(o=>`<article class="pro-order"><div><strong>${o.reference||o.id}</strong><span>${new Date(o.created_at).toLocaleDateString('en-NG')}</span></div><p>${(o.items||[]).map(i=>`${i.name} × ${i.quantity}`).join(', ')}</p><div><strong>${money(o.total)}</strong><span class="status">${STATUS_LABEL[o.status]||o.status}</span></div><div class="pro-card-link" style="display:flex;gap:14px;flex-wrap:wrap"><a href="order-success.html?ref=${encodeURIComponent(o.reference||'')}&token=${encodeURIComponent(o.tracking_token||localStorage.getItem('fablux_last_order_token')||'')}">Order Details</a><a href="track.html?ref=${encodeURIComponent(o.reference||'')}&token=${encodeURIComponent(o.tracking_token||'')}">Track Order</a></div></article>`).join(''):'<div class="pro-empty"><h2>No orders yet</h2><a class="btn" href="shop.html">Start Shopping</a></div>'}catch(e){box.innerHTML='<div class="pro-empty"><h2>Your orders</h2><p>'+e.message+'</p><a class="btn" href="login.html?return=orders.html">Sign In</a> <a class="btn" href="shop.html">Continue as guest</a></div>'}}
async function handleCheckout(event){const f=event.target;if(!f.closest('#checkoutPage'))return;event.preventDefault();event.stopImmediatePropagation();const cart=getCart();if(!cart.length){toast('Your cart is empty');return}try{const d=Object.fromEntries(new FormData(f));if(!window.FabluXAPI){throw new Error('Checkout is unavailable right now.')}const fp=JSON.stringify(cart.map(x=>[x.id,x.quantity]))+'|'+(d.payment||'');let key=sessionStorage.getItem('fablux_idem_fp')||'';let idem=sessionStorage.getItem('fablux_idem')||'';if(key!==fp||!idem){idem=(crypto&&crypto.randomUUID)?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2);sessionStorage.setItem('fablux_idem',idem);sessionStorage.setItem('fablux_idem_fp',fp);}const order=await api.createOrder({name:d.name,email:d.email,phone:d.phone,address:d.address,state:d.state,city:d.city,landmark:d.landmark||'',instructions:d.instructions||'',deliveryMethod:d.delivery||'standard',paymentMethod:d.payment||'pay-on-delivery',idempotencyKey:idem,items:cart.map(x=>({productId:x.id,quantity:x.quantity}))});sessionStorage.removeItem('fablux_idem');sessionStorage.removeItem('fablux_idem_fp');localStorage.setItem('fablux_last_order_id_v1',order.order.id);localStorage.setItem('fablux_last_order_ref',order.order.reference);localStorage.setItem('fablux_last_order_token',order.order.tracking_token);if(order.payment&&order.payment.authorizationUrl){location.href=order.payment.authorizationUrl;return;}location.href='order-success.html?ref='+encodeURIComponent(order.order.reference)+'&token='+encodeURIComponent(order.order.tracking_token)}catch(e){toast(e.message)}}
async function handleReview(event){const f=event.target;if(f.id!=='reviewForm')return;event.preventDefault();event.stopImmediatePropagation();try{const id=new URLSearchParams(location.search).get('id');const d=Object.fromEntries(new FormData(f));await api.review({productId:id,rating:Number(d.rating),text:d.text});toast('✓ Review submitted');f.reset()}catch(e){toast(e.message)}}
async function handleReturn(event){const f=event.target;if(!document.title.includes('Returns')||!f.classList.contains('pro-form'))return;event.preventDefault();event.stopImmediatePropagation();try{const d=Object.fromEntries(new FormData(f));await api.returnRequest({orderId:d['Order Number'],reason:d.reason,details:d.details});toast('✓ Return request submitted');f.reset()}catch(e){toast(e.message)}}
async function handleContact(event){const f=event.target;if(!f.classList.contains('contact-form'))return;event.preventDefault();event.stopImmediatePropagation();try{await api.contact(Object.fromEntries(new FormData(f)));f.reset();toast('✓ Message sent successfully')}catch(e){toast(e.message)}}
async function handleNewsletter(event){const f=event.target;if(!f.classList.contains('newsletter-form'))return;event.preventDefault();event.stopImmediatePropagation();try{await api.newsletter({email:f.querySelector('input[type=email]')?.value});f.reset();toast('✓ You are subscribed to FabluX.U.Design updates')}catch(e){toast(e.message)}}
async function renderAdmin(){const box=document.getElementById('adminPage');if(!box)return;if(window.FabluXAdmin&&window.FabluXAdmin.render){try{await window.FabluXAdmin.render(box)}catch(e){box.innerHTML='<div class="pro-empty"><h2>Admin access required</h2><p>'+e.message+'</p><a class="btn" href="login.html?return=admin.html">Admin Login</a></div>'}return}try{const d=await api.adminDashboard();box.innerHTML=`<div class="section-title"><span>FABLUX ADMIN</span><h2>Store Control Center</h2><p>Secure backend-connected administration.</p></div><div class="fablux-admin-grid"><div class="fablux-admin-stat">Products<strong>${d.stats.products}</strong></div><div class="fablux-admin-stat">Customers<strong>${d.stats.customers}</strong></div><div class="fablux-admin-stat">Orders<strong>${d.stats.orders}</strong></div><div class="fablux-admin-stat">Reviews<strong>${d.stats.reviews}</strong></div></div>`}catch(e){box.innerHTML='<div class="pro-empty"><h2>Admin access required</h2><p>Please sign in with an administrator account.</p><a class="btn" href="login.html?return=admin.html">Admin Login</a></div>'}}

async function renderCheckout(){const box=document.getElementById('checkoutPage');if(!box)return;try{const cart=getCart();if(!cart.length){box.innerHTML='<div class="pro-empty"><h2>Your cart is empty</h2><a class="btn" href="shop.html">Return to Shop</a></div>';return}const f=box.querySelector('form');let me={user:null};try{me=await api.me()}catch(e){}if(me.user){if(!f.querySelector('[name=name]').value)f.querySelector('[name=name]').value=me.user.name||'';if(!f.querySelector('[name=email]').value)f.querySelector('[name=email]').value=me.user.email||'';if(!f.querySelector('[name=phone]').value)f.querySelector('[name=phone]').value=me.user.phone||''}else if(!f.querySelector('[data-guest-note]')){const g=document.createElement('small');g.dataset.guestNote='1';g.style.display='block';g.style.opacity='.75';g.textContent='Checking out as a guest? Enter your email above — you will receive a secure tracking link.';f.querySelector('[name=email]').parentElement.after(g)}if(!f.querySelector('[name=payment]')){const l=document.createElement('label');l.innerHTML='Payment Method<select name="payment" required><option value="pay-on-delivery">Pay on Delivery (pay when you receive)</option><option value="bank-transfer">Bank Transfer (payment confirmed by the store)</option></select>';f.querySelector('[name=delivery]').parentElement.after(l)}let settings={deliveryFee:2500,expressSurcharge:0};try{settings=await api.publicSettings()}catch(e){}const renderFees=()=>{const method=f.querySelector('[name=delivery]').value||'standard';let fee=Number(settings.deliveryFee)||0;if(method==='express')fee+=Number(settings.expressSurcharge)||0;if(method==='pickup')fee=0;const subtotal=cart.reduce((s,x)=>s+x.price*x.quantity,0);const sum=f.querySelector('[data-summary]');if(sum)sum.innerHTML=cart.map(x=>`<div class="pro-summary-row"><span>${x.name} × ${x.quantity}</span><strong>${money(x.price*x.quantity)}</strong></div>`).join('');if(f.querySelector('[data-subtotal]'))f.querySelector('[data-subtotal]').textContent=money(subtotal);if(f.querySelector('[data-delivery]'))f.querySelector('[data-delivery]').textContent=money(fee);if(f.querySelector('[data-total]'))f.querySelector('[data-total]').textContent=money(subtotal+fee)};renderFees();f.querySelector('[name=delivery]').addEventListener('change',renderFees)}catch(e){toast(e.message)}}
async function renderInvoice(){const box=document.getElementById('invoicePage');if(!box)return;try{const id=new URLSearchParams(location.search).get('id');if(!id)throw new Error('Order reference is missing.');const d=await api.order(id),o=d.order;box.innerHTML=`<div class="invoice-head"><div><span>FABLUX.U.DESIGN</span><h1>Invoice</h1></div><strong>${o.id}</strong></div><p>${new Date(o.created_at).toLocaleString('en-NG')}</p><div class="pro-summary">${o.items.map(i=>`<div class="pro-summary-row"><span>${i.name} × ${i.quantity}</span><strong>${money(i.price*i.quantity)}</strong></div>`).join('')}<hr><div class="pro-summary-row"><span>Subtotal</span><strong>${money(o.subtotal)}</strong></div><div class="pro-summary-row"><span>Delivery</span><strong>${money(o.delivery_fee)}</strong></div><div class="pro-summary-row"><span>Discount</span><strong>-${money(o.discount)}</strong></div><div class="pro-summary-row"><strong>Total</strong><strong>${money(o.total)}</strong></div></div><button class="btn" onclick="window.print()">Print Invoice</button>`}catch(e){box.innerHTML=`<div class="pro-empty"><h2>Unable to load invoice</h2><p>${e.message}</p></div>`}}
async function renderOrderSuccess(){const box=document.getElementById('orderSuccess');if(!box)return;const q=new URLSearchParams(location.search);const ref=q.get('ref')||localStorage.getItem('fablux_last_order_ref')||'';const token=q.get('token')||localStorage.getItem('fablux_last_order_token')||'';if(!ref){box.innerHTML='<div class="pro-empty"><h2>No recent order</h2><a class="btn" href="shop.html">Continue Shopping</a></div>';return}try{const d=await api.track(ref,token);const o=d.order;const payLabel={pending:'Awaiting payment',successful:'Payment received',failed:'Payment failed',refunded:'Refunded'};box.innerHTML=`<div class="pro-success-head"><i class="fa-solid fa-circle-check"></i><h2>Thank you — your order is saved</h2><p>Order reference <strong>${o.reference}</strong></p></div><div class="pro-admin-section"><h3>Order summary</h3>${d.items.map(i=>`<div class="pro-summary-row"><span>${i.name} × ${i.quantity}</span><strong>${money(i.line_total)}</strong></div>`).join('')}<div class="pro-summary-row"><span>Subtotal</span><strong>${money(o.subtotal)}</strong></div><div class="pro-summary-row"><span>Delivery</span><strong>${money(o.delivery_fee)}</strong></div><div class="pro-summary-row"><strong>Total</strong><strong>${money(o.total)}</strong></div></div><div class="pro-admin-section"><h3>Status</h3><div class="pro-summary-row"><span>Order status</span><strong>${STATUS_LABEL[o.status]||o.status}</strong></div><div class="pro-summary-row"><span>Payment</span><strong>${payLabel[o.payment_status]||o.payment_status}</strong></div><div class="pro-summary-row"><span>Payment method</span><strong>${o.payment_method==='bank-transfer'?'Bank Transfer':'Pay on Delivery'}</strong></div><div class="pro-summary-row"><span>Placed</span><strong>${new Date(o.created_at).toLocaleString('en-NG')}</strong></div><div class="pro-summary-row"><span>Delivering to</span><strong>${o.address}, ${o.city}, ${o.state}</strong></div></div><div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:18px"><a class="btn" href="track.html?ref=${encodeURIComponent(o.reference)}&token=${encodeURIComponent(token||'')}">Track this order</a><a class="btn" href="shop.html">Continue Shopping</a></div><p style="margin-top:14px;opacity:.8">Keep your reference <strong>${o.reference}</strong> — it is the way to track, collect or return this order.</p>`}catch(e){box.innerHTML='<div class="pro-empty"><h2>Order not found</h2><p>'+e.message+'</p><a class="btn" href="orders.html">My Orders</a></div>'}}

async function renderTrack(){const box=document.getElementById('trackPage');if(!box)return;const q=new URLSearchParams(location.search);const refInput=box.querySelector('[name=ref]');const tokInput=box.querySelector('[name=token]');const show=async(ref,token)=>{const out=box.querySelector('[data-track-result]');if(!out)return;out.innerHTML='<p>Loading…</p>';try{const d=await api.track(ref,token);const o=d.order;const steps=[['pending_payment','Order received'],['payment_confirmed','Payment confirmed'],['confirmed','Order confirmed'],['processing','Preparing parcel'],['ready_for_dispatch','Ready for dispatch'],['shipped','Collected by courier'],['delivered','Delivered']];const doneIdx=Math.max(0,steps.findIndex(s=>s[0]===o.status));const cancelled=o.status==='cancelled';const timeline=(d.events||[]).map(ev=>`<li><strong>${ev.label}</strong><span>${new Date(ev.created_at).toLocaleString('en-NG')}</span></li>`).join('');out.innerHTML=`<div class="pro-admin-section"><h3>Order ${o.reference}</h3><div class="pro-summary-row"><span>Current status</span><strong>${STATUS_LABEL[o.status]||o.status}</strong></div><div class="pro-summary-row"><span>Payment</span><strong>${o.payment_status}</strong></div><div class="pro-summary-row"><span>Total</span><strong>${money(o.total)}</strong></div><div class="pro-summary-row"><span>Delivering to</span><strong>${o.city}, ${o.state}</strong></div>${o.courier?`<div class="pro-summary-row"><span>Courier</span><strong>${o.courier}${o.courier_tracking?' — '+o.courier_tracking:''}</strong></div>`:''}</div><div class="pro-admin-section"><h3>Progress</h3><ol class="fablux-timeline">${cancelled?'<li class="cancelled"><strong>Order cancelled</strong></li>':steps.map((s,i)=>`<li class="${i<=doneIdx?'done':''}"><strong>${s[1]}</strong></li>`).join('')}</ol></div><div class="pro-admin-section"><h3>History</h3><ul class="fablux-events">${timeline}</ul></div><div class="pro-admin-section"><h3>Items</h3>${d.items.map(i=>`<div class="pro-summary-row"><span>${i.name} × ${i.quantity}</span><strong>${money(i.line_total)}</strong></div>`).join('')}</div>`}catch(err){out.innerHTML='<div class="pro-empty"><h2>Cannot find that order</h2><p>'+err.message+'</p></div>'}};if(refInput&&tokInput){const form=box.querySelector('form');if(form)form.addEventListener('submit',e=>{e.preventDefault();show(refInput.value.trim(),tokInput.value.trim())});if(q.get('ref')){refInput.value=q.get('ref');tokInput.value=q.get('token')||'';show(refInput.value,tokInput.value)}}}

function injectMarketplaceState(){api.publicSettings().then(d=>{localStorage.setItem('fablux_marketplace_enabled_v1',d.marketplaceEnabled?'1':'0');const nav=document.querySelector('.nav-links');if(d.marketplaceEnabled&&nav&&!nav.querySelector('[data-pro-link="market"]')){const li=document.createElement('li');li.innerHTML='<a data-pro-link="market" href="marketplace.html">Marketplace</a>';nav.appendChild(li)}}).catch(()=>{});}
document.addEventListener('submit',handleAuth,true);
captureResetToken();document.addEventListener('submit',handleReset,true);document.addEventListener('submit',handleCheckout,true);document.addEventListener('submit',handleReview,true);document.addEventListener('submit',handleReturn,true);document.addEventListener('submit',handleContact,true);document.addEventListener('submit',handleNewsletter,true);
/* ---- site chrome (works on every page, even those that do not load js/script.js) ---- */
function initSiteChrome(){
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
    topBtn.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
    const onScroll=()=>{topBtn.style.display=window.scrollY>400?'flex':'none';};
    window.addEventListener('scroll',onScroll,{passive:true});onScroll();
  }
  const loader=document.getElementById('loader');
  if(loader&&!scriptLoaded){
    const hide=()=>{if(!loader.isConnected)return;loader.classList.add('loader-ready');requestAnimationFrame(()=>loader.remove());};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hide,{once:true});else hide();
    setTimeout(hide,600);
  }
}

document.addEventListener('DOMContentLoaded',()=>{initSiteChrome();injectMarketplaceState();renderAccount();renderOrders();renderAdmin();renderCheckout();renderInvoice();renderOrderSuccess();renderTrack();});
/* Never show a stale identity: re-render the account page whenever the tab
   becomes visible again (e.g. after signing in somewhere else). */
document.addEventListener('visibilitychange',()=>{if(document.hidden)return;if(document.getElementById('accountPage'))renderAccount();});
})();
