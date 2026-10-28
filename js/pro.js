(function(){
'use strict';
const K={users:'fablux_users_v1',user:'fablux_user_v1',orders:'fablux_orders_v1',reviews:'fablux_reviews_v1',addresses:'fablux_addresses_v1',recent:'fablux_recent_v1',newsletter:'fablux_newsletter_v1'};
const money=n=>'₦'+Number(n||0).toLocaleString('en-NG');
const read=(k,d=[])=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}};
const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const user=()=>read(K.user,null);
const products=()=>{
 const cards=[...document.querySelectorAll('.shop-product-card')];
 if(cards.length)return cards.map(c=>({id:String(c.dataset.productId),name:c.dataset.productName,price:Number((c.dataset.productPrice||'').replace(/[^0-9.]/g,'')),category:c.dataset.productCategory,image:c.dataset.productImage,group:c.dataset.category}));
 return window.FAB_PRODUCTS||[];
};
function toast(m){window.FabluXStore?.toast(m);if(!window.FabluXStore){let t=document.getElementById('fabluxToast');if(!t){t=document.createElement('div');t.id='fabluxToast';t.className='fablux-toast';document.body.appendChild(t)}t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2400)}}
function cleanupLegacyPersonalData(){if(localStorage.getItem('fablux_legacy_personal_data_cleared_v3')==='1')return;['fablux_users_v1','fablux_user_v1','fablux_orders_v1','fablux_addresses_v1','fablux_returns_v1','fablux_reviews_v1','fablux_newsletter_v1','fablux_coupon_v1','fablux_recent_v1'].forEach(k=>localStorage.removeItem(k));localStorage.setItem('fablux_legacy_personal_data_cleared_v3','1');}
cleanupLegacyPersonalData();
function injectHeader(){
 const nav=document.querySelector('.nav-links'); if(!nav)return;
 if(!nav.querySelector('[data-pro-link="account"]')){const li=document.createElement('li');li.innerHTML='<a data-pro-link="account" href="login.html">Account</a>';nav.appendChild(li)}
 const account=document.querySelector('[data-pro-link="account"]'); if(!account)return;
 if(window.FabluXAPI){
   // Account state always comes from the Supabase session, never from local storage.
   const here=encodeURIComponent(location.pathname+location.search);
   const signedOut=()=>{account.textContent='Sign In';account.href='login.html?return='+here};
   const sync=()=>{ signedOut();
     window.FabluXAPI.me().then(d=>{ if(d&&d.user){ account.textContent='My Account';account.href='account.html' }else{signedOut()} }).catch(signedOut);
   };
   sync();
   window.FabluXSyncAccount=sync;
   // Re-check whenever the tab becomes visible again, so a sign-in or sign-out
   // done in another tab is reflected immediately.
   document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
 } else if(user()){account.textContent='My Account';account.href='account.html'}
}
function productFromCard(c){return {id:String(c.dataset.productId),name:c.dataset.productName,price:Number((c.dataset.productPrice||'').replace(/[^0-9.]/g,'')),category:c.dataset.productCategory,image:c.dataset.productImage,group:c.dataset.category}}
function addRecent(p){let a=read(K.recent,[]).filter(x=>x.id!==String(p.id));a.unshift(p);write(K.recent,a.slice(0,8))}

function setupShop(){
 const grid=document.querySelector('.shop-products .product-grid');if(!grid)return;
 let toolbar=document.getElementById('proShopTools');
 if(!toolbar){toolbar=document.createElement('div');toolbar.id='proShopTools';toolbar.className='pro-shop-tools';toolbar.innerHTML='<input id="productSearch" type="search" placeholder="Search products..." aria-label="Search products"><select id="productSort"><option value="relevance">Sort: Relevance</option><option value="low">Price: Low to High</option><option value="high">Price: High to Low</option><option value="new">Newest</option></select><a class="pro-text-link" href="wishlist.html">♡ Wishlist</a>';grid.parentElement.insertBefore(toolbar,grid)}
 const search=document.getElementById('productSearch'),sort=document.getElementById('productSort');
  /* Deep links: shop.html?category=men opens the shop already filtered. */
  if(!window._fabFilterInit){
    window._fabFilterInit=1;
    const cat=new URLSearchParams(location.search).get('category');
    if(cat&&/^[a-z]+$/.test(cat)){
      window._fabFilter=cat;
      document.querySelectorAll('.filter-btn').forEach(function(x){x.classList.remove('active')});
      const b=document.querySelector('.filter-btn[data-filter="'+cat+'"]');
      if(b)b.classList.add('active');
    }
  }
 /* The live catalogue (syncCatalog in js/backend-bridge.js) replaces the grid's
    cards with the rows fetched from Supabase, so always read the CURRENT cards
    from the DOM. A reference captured at load time would go stale the moment the
    grid is re-rendered, and the search/sort would silently filter nothing. */
 function apply(){const cards=[...grid.querySelectorAll('.shop-product-card')];const q=(search.value||'').toLowerCase().trim();let list=cards.filter(c=>(!q||`${c.dataset.productName} ${c.dataset.productCategory}`.toLowerCase().includes(q))&&(!window._fabFilter||window._fabFilter==='all'||String(c.dataset.category||'').split(/\s+/).includes(window._fabFilter)));list.sort((a,b)=>{const pa=Number(a.dataset.productPrice.replace(/[^0-9.]/g,'')),pb=Number(b.dataset.productPrice.replace(/[^0-9.]/g,''));if(sort.value==='low')return pa-pb;if(sort.value==='high')return pb-pa;if(sort.value==='new')return Number(b.dataset.productId)-Number(a.dataset.productId);return 0});cards.forEach(c=>c.style.display=list.includes(c)?'':'none');
 /* Re-append the matching cards in the computed order so the sort choice is
    actually reflected in the DOM (display toggling alone never reorders). */
 list.forEach(c=>grid.appendChild(c));let empty=grid.querySelector('.pro-no-results');if(!list.length){if(!empty){empty=document.createElement('div');empty.className='pro-no-results';empty.innerHTML='<h3>No products found</h3><p>Try another search or category.</p>';grid.appendChild(empty)}}else empty?.remove()}
 window.FabluXApplyShop=apply;
 search.addEventListener('input',apply);sort.addEventListener('change',apply);document.querySelectorAll('.filter-btn').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.filter-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');window._fabFilter=b.dataset.filter||'all';setTimeout(apply,0)}));apply();
}
function setupProductLinks(){
 const grid=document.querySelector('.shop-products .product-grid');
 /* Clicks are handled by delegation on the grid itself, which survives the
    live catalogue re-render — binding each card once would stop working as
    soon as syncCatalog replaces the grid's cards with Supabase rows. */
 if(grid&&!grid.dataset.fxNavBound){
   grid.dataset.fxNavBound='1';
   grid.addEventListener('click',function(e){
     const c=e.target.closest('.shop-product-card');if(!c||!c.dataset.productId)return;
     const p=productFromCard(c);
     if(e.target.closest('h3')){addRecent(p);location.href='product.html?id='+encodeURIComponent(p.id);return}
     if(e.target.closest('img'))addRecent(p);
   });
 }
 document.querySelectorAll('.shop-product-card').forEach(c=>{
   if(grid&&grid.contains(c))return;
   const p=productFromCard(c);
   c.querySelector('h3')?.addEventListener('click',()=>{addRecent(p);location.href='product.html?id='+encodeURIComponent(p.id)});
   c.querySelector('img')?.addEventListener('click',()=>{addRecent(p)});
   c.style.cursor='default';
 });
}
function renderWishlist(){const box=document.getElementById('wishlistGrid');if(!box)return;const list=read('fablux_wishlist_v1',[]);if(!list.length){box.innerHTML='<div class="pro-empty"><h2>Your wishlist is empty</h2><p>Save pieces you love and find them here later.</p><a class="btn" href="shop.html">Explore Shop</a></div>';return}box.innerHTML=list.map(p=>`<article class="pro-card"><img src="${p.image}" alt="${p.name}"><div><h3>${p.name}</h3><p>${p.category||''}</p><strong>${money(p.price)}</strong><div class="pro-card-actions"><button data-cart="${p.id}">Add to Cart</button><button data-remove="${p.id}">Remove</button></div></div></article>`).join('');box.querySelectorAll('[data-cart]').forEach(b=>b.onclick=()=>{const p=list.find(x=>String(x.id)===b.dataset.cart);window.FabluXStore?.addToCart(p);});box.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{let a=read('fablux_wishlist_v1',[]).filter(x=>String(x.id)!==b.dataset.remove);write('fablux_wishlist_v1',a);renderWishlist();toast('Removed from wishlist')})}
function renderRecent(){const box=document.getElementById('recentGrid');if(!box)return;const list=read(K.recent,[]);box.innerHTML=list.length?list.map(p=>`<article class="pro-card"><img src="${p.image}" alt="${p.name}"><div><h3>${p.name}</h3><strong>${money(p.price)}</strong><a class="pro-card-link" href="product.html?id=${p.id}">View Product</a></div></article>`).join(''):'<div class="pro-empty"><p>No recently viewed products yet.</p></div>'}
function setupAuth(){/* LEGACY LOCAL SIGN-UP REMOVED.
 Authentication (sign in, sign up, password reset) is handled only by Supabase in js/backend-bridge.js.
 No account is ever written to or read from localStorage. */}
function setupAccount(){/* LEGACY LOCAL ACCOUNT REMOVED - js/backend-bridge.js renders account.html from Supabase */}
function setupCheckout(){/* LEGACY LOCAL CHECKOUT REMOVED - js/backend-bridge.js handles checkout via Supabase */}
function renderOrders(){/* LEGACY LOCAL ORDERS REMOVED - js/backend-bridge.js lists orders from Supabase */}
function renderInvoice(){/* LEGACY LOCAL INVOICE REMOVED - js/backend-bridge.js loads the invoice from Supabase */}
function setupOrderSuccess(){/* LEGACY LOCAL CONFIRMATION REMOVED - js/backend-bridge.js confirms orders from Supabase */}
function setupNewsletter(){/* LEGACY LOCAL SUBSCRIBER LIST REMOVED - no email is ever stored in this browser. Newsletter submissions are sent to Supabase by handleNewsletter() in js/backend-bridge.js. */if(window.FabluXAPI)return;document.querySelectorAll('.newsletter-form').forEach(f=>f.addEventListener('submit',e=>{e.preventDefault();const em=f.querySelector('input[type=email]')?.value.trim().toLowerCase();if(!em)return;let a=read(K.newsletter,[]);if(!a.includes(em))a.push(em);write(K.newsletter,a);f.reset();toast('✓ You are subscribed to FabluX.U.Design updates')}))}
function setupProductPage(){const id=new URLSearchParams(location.search).get('id');if(id)addRecent((window.FAB_PRODUCTS||[]).find(p=>String(p.id)===String(id))||{id,name:'Product',price:0});}
document.addEventListener('DOMContentLoaded',()=>{injectHeader();setupShop();setupProductLinks();setupAuth();setupAccount();setupCheckout();renderOrders();renderInvoice();setupOrderSuccess();setupNewsletter();renderWishlist();renderRecent();setupProductPage();});
})();

/* Extended frontend experience: local/demo only until the backend is connected. */
(function(){
'use strict';
const X={addresses:'fablux_addresses_v1',returns:'fablux_returns_v1',reviews:'fablux_reviews_v1',coupon:'fablux_coupon_v1'};
const rd=(k,d=[])=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}};
const wr=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const current=()=>rd('fablux_user_v1',null);
const money2=n=>'₦'+Number(n||0).toLocaleString('en-NG');
function track(status){const states=['Pending','Confirmed','Processing','Shipped','Out for delivery','Delivered'];const i=Math.max(0,states.indexOf(status));return `<div class="fablux-track">${states.map((s,n)=>`<span class="${n<=i?'active':''}">${n<=i?'✓ ':''}${s}</span>`).join('')}</div>`}
function productList(){return window.FAB_PRODUCTS||[]}
function saveAddressForm(form){if(window.FabluXAPI)return;/* Supabase address book */const u=current();if(!u)return;const all=rd(X.addresses,[]);const a=Object.fromEntries(new FormData(form).entries());a.id='ADDR-'+Date.now();a.userId=u.id;all.push(a);wr(X.addresses,all);renderAddresses();form.reset();window.FabluXStore?.toast('✓ Address saved');}
function renderAddresses(){if(window.FabluXAPI)return;/* legacy localStorage version removed */}
function enhanceAccount(){if(window.FabluXAPI)return;/* legacy localStorage version removed */}
function enhancePassword(){
 document.querySelectorAll('input[type="password"]').forEach(input=>{
  if(input.dataset.passwordEnhanced)return; input.dataset.passwordEnhanced='1';
  const wrap=input.parentElement||input.parentNode; const btn=document.createElement('button'); btn.type='button'; btn.className='password-toggle'; btn.setAttribute('aria-label','Show password'); btn.innerHTML='👁';
  wrap.style.position='relative'; wrap.appendChild(btn); btn.style.cssText='position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:0;cursor:pointer;font-size:1rem;';
  btn.addEventListener('click',()=>{const visible=input.type==='text';input.type=visible?'password':'text';btn.setAttribute('aria-label',visible?'Show password':'Hide password');});
 });
 const f=document.getElementById('registerForm'); if(!f)return; const input=f.querySelector('[name=password]'); if(!input||document.getElementById('passwordMeter'))return;
 const meter=document.createElement('div');meter.innerHTML='<div class="password-meter" id="passwordMeter"><span></span></div><small id="passwordHint">Password strength: —</small>';input.parentElement.appendChild(meter);
 input.addEventListener('input',()=>{let v=input.value,score=0;if(v.length>=8)score++;if(/[A-Z]/.test(v))score++;if(/[0-9]/.test(v))score++;if(/[^A-Za-z0-9]/.test(v))score++;const labels=['Weak','Fair','Good','Strong'];document.querySelector('#passwordMeter span').style.width=(score*25)+'%';document.querySelector('#passwordHint').textContent='Password strength: '+(labels[Math.max(0,score-1)]||'—');});
}

function enhanceCheckout(){const box=document.getElementById('checkoutPage');if(!box||box.dataset.enhanced)return;if(window.FabluXAPI)return;/* server-side totals + payment methods in backend-bridge */box.dataset.enhanced='1';const form=box.querySelector('form');if(!form)return;const payment=document.createElement('label');payment.innerHTML='Payment Method<select name="payment" required><option value="pay-on-delivery">Pay on Delivery</option><option value="bank-transfer">Bank Transfer</option><option value="card">Card (backend connection required)</option></select></label>';const delivery=form.querySelector('[name=delivery]');delivery?.parentElement.after(payment);const coupon=document.createElement('div');coupon.className='fablux-coupon';coupon.innerHTML='<input id="couponCode" placeholder="Coupon code"><button type="button" class="pro-card-link" id="applyCoupon">Apply</button><span id="couponMessage"></span>';const summary=form.querySelector('.pro-summary');summary?.prepend(coupon);const originalTotal=Number((box.querySelector('[data-total]')?.textContent||'').replace(/[^0-9.]/g,''));form.querySelector('#applyCoupon')?.addEventListener('click',()=>{const code=form.querySelector('#couponCode').value.trim().toUpperCase(),msg=form.querySelector('#couponMessage');let discount=0;if(code==='FABLUX10'){discount=originalTotal*.10;wr(X.coupon,{code,discount});msg.textContent=`10% discount applied: -${money2(discount)}`;msg.className='fablux-success';box.querySelector('[data-total]').textContent=money2(originalTotal-discount)}else{msg.textContent='Invalid or unavailable coupon';msg.className='fablux-error'}});}
function enhanceOrders(){const box=document.getElementById('ordersPage');if(!box||box.dataset.enhanced)return;if(window.FabluXAPI)return;box.dataset.enhanced='1';setTimeout(()=>box.querySelectorAll('.pro-order').forEach(card=>{const status=card.querySelector('.status')?.textContent||'Pending';const track=document.createElement('div');track.innerHTML=track(status);card.appendChild(track)}),0);}
function enhanceReturns(){if(window.FabluXAPI)return;/* legacy localStorage version removed */}
function enhanceProductReviews(){
 const page=document.querySelector('.product-summary');if(!page||document.getElementById('productReviews'))return;
 const id=new URLSearchParams(location.search).get('id')||'4';
 const section=document.createElement('section');section.id='productReviews';section.className='fablux-review';
 section.innerHTML='<span>CUSTOMER FEEDBACK</span><h3>Reviews &amp; Ratings</h3><form class="pro-form" id="reviewForm"><label>Rating<select name="rating" required><option value="5">★★★★★ 5</option><option value="4">★★★★ 4</option><option value="3">★★★ 3</option><option value="2">★★ 2</option><option value="1">★ 1</option></select></label><label>Your review<textarea name="text" rows="4" required></textarea></label><button class="btn">Submit Review</button></form><div class="fablux-review-list" id="reviewList"></div>';
 page.parentElement.appendChild(section);
 const list=section.querySelector('#reviewList');
 const draw=arr=>{list.innerHTML=arr&&arr.length?arr.map(r=>'<div class="fablux-review-item"><strong>'+'★'.repeat(Number(r.rating)||5)+'☆'.repeat(5-(Number(r.rating)||5))+'</strong><p>'+String(r.text||'')+'</p><small>'+(r.name||'Customer')+'</small></div>').join(''):'<p>No reviews yet. Be the first to review this product.</p>'};
 if(window.FabluXAPI){
   // Reviews live in Supabase; submissions are handled by handleReview() in js/backend-bridge.js.
   draw([]);
   window.FabluXAPI.product(id).then(d=>draw(d.reviews||[])).catch(()=>{});
   section.querySelector('form').addEventListener('submit',e=>e.preventDefault());
   return;
 }
 const render=()=>{const arr=rd(X.reviews,[]).filter(r=>String(r.productId)===String(id));draw(arr)};
 section.querySelector('form').onsubmit=e=>{e.preventDefault();const u=current();const d=Object.fromEntries(new FormData(e.target).entries());d.rating=Number(d.rating);d.productId=id;d.name=u?.name||'Customer';d.date=new Date().toISOString();const a=rd(X.reviews,[]);a.unshift(d);wr(X.reviews,a);e.target.reset();render();window.FabluXStore?.toast('✓ Review added')};
 render();
}
function enhanceRecommendations(){const page=document.querySelector('.product-detail-container');if(!page||document.getElementById('recommendations'))return;const id=new URLSearchParams(location.search).get('id');const rec=productList().filter(p=>String(p.id)!==String(id)).slice(0,4);const sec=document.createElement('section');sec.id='recommendations';sec.className='featured';sec.innerHTML=`<div class="container"><div class="section-title"><span>FABLUX PICKS</span><h2>You May Also Like</h2></div><div class="pro-card-grid">${rec.map(p=>`<article class="pro-card"><img src="${p.image}" alt="${p.name}"><div><h3>${p.name}</h3><strong>${money2(p.price)}</strong><a class="pro-card-link" href="product.html?id=${p.id}">View Product</a></div></article>`).join('')}</div></div>`;document.querySelector('footer')?.before(sec);}
function enhanceAdmin(){if(window.FabluXAPI)return;/* legacy localStorage version removed */}

document.addEventListener('DOMContentLoaded',()=>{if(!window.FabluXAPI){enhanceAccount();enhancePassword();enhanceCheckout();enhanceOrders();enhanceReturns();enhanceProductReviews();enhanceRecommendations();enhanceAdmin();}else{enhancePassword();enhanceProductReviews();enhanceRecommendations();}});
})();
