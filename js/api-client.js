/* FabluX API client — talks directly to Supabase (Auth + PostgREST).
   No Node server required: every call goes to the Supabase project. */
(function(){
  'use strict';
  const TOKEN_KEY='fablux_api_token_v1';
  const USER_KEY='fablux_api_user_v1';
  const BASE='https://msisbmcowtggbvasubla.supabase.co';
  const KEY='sb_publishable_E0_BuUK9piwZfNdvlwpbAA_-CM03cNs';
  const REST=BASE+'/rest/v1';
  const AUTH=BASE+'/auth/v1';

  const token=()=>localStorage.getItem(TOKEN_KEY);
  const setToken=t=>{t?localStorage.setItem(TOKEN_KEY,t):localStorage.removeItem(TOKEN_KEY);};
  const authHeaders=(extra)=>Object.assign({'Content-Type':'application/json',apikey:KEY,
    Authorization:'Bearer '+(token()||KEY)},extra||{});

  function fail(data,status){
    const msg=(data&&(data.msg||data.message||data.error_description||data.error))||('Request failed ('+status+').');
    const e=new Error(msg); e.status=status; return e;
  }

  async function rest(path,options){
    const opts=Object.assign({},options||{},{headers:authHeaders(options&&options.headers)});
    const res=await fetch(REST+path,opts);
    const text=await res.text();
    let data=null; try{data=text?JSON.parse(text):null;}catch(e){data=null;}
    if(!res.ok) throw fail(data,res.status);
    return data;
  }

  async function authCall(path,body){
    const res=await fetch(AUTH+path,{method:'POST',
      headers:{'Content-Type':'application/json',apikey:KEY,Authorization:'Bearer '+KEY},
      body:JSON.stringify(body)});
    const text=await res.text();
    let data=null; try{data=text?JSON.parse(text):null;}catch(e){data=null;}
    if(!res.ok) throw fail(data,res.status);
    return data;
  }

  async function currentUser(){
    const t=token(); if(!t) return null;
    const res=await fetch(AUTH+'/user',{headers:{'Content-Type':'application/json',apikey:KEY,Authorization:'Bearer '+t}});
    if(!res.ok){ if(res.status===401||res.status===403){setToken(null);} return null; }
    return res.json();
  }

  function mapUser(u,role){
    if(!u) return null;
    const m=u.user_metadata||{};
    return {id:u.id,name:m.name||'',email:u.email||'',phone:m.phone||'',role:role||m.role||'customer'};
  }

  // Ensure a public.users row exists (used for role lookups / admin checks)
  async function ensureUserRow(u){
    if(!u||!u.id) return;
    try{
      const existing=await rest('/users?select=id&id=eq.'+encodeURIComponent(u.id));
      if(existing&&existing.length) return;
      await rest('/users',{method:'POST',headers:{Prefer:'return=minimal'},
        body:JSON.stringify({id:u.id,email:u.email,password_hash:'managed-by-supabase-auth',
          name:(u.user_metadata&&u.user_metadata.name)||u.email,
          phone:(u.user_metadata&&u.user_metadata.phone)||null,role:'customer',
          created_at:u.created_at||new Date().toISOString(),updated_at:new Date().toISOString()})});
    }catch(e){}
  }

  async function sessionUser(){
    const u=await currentUser();
    if(!u){localStorage.removeItem(USER_KEY);return null;}
    let role='customer';
    try{const rows=await rest('/users?select=role&id=eq.'+encodeURIComponent(u.id));if(rows&&rows[0])role=rows[0].role;}catch(e){}
    const mapped=mapUser(u,role);
    localStorage.setItem(USER_KEY,JSON.stringify(mapped));
    return mapped;
  }

  const uid=()=>{const u=JSON.parse(localStorage.getItem(USER_KEY)||'null');return u&&u.id;};

  // Accept tokens handed back by Supabase email links (confirm / recovery)
  (function captureHashToken(){
    const h=location.hash.replace(/^#/,''); if(!h) return;
    const p=new URLSearchParams(h);
    if(p.get('access_token')){setToken(p.get('access_token'));}
    try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}
  })();

  function newId(prefix){
    return prefix+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  }

  const api={
    async register(body){
      const data=await authCall('/signup',{email:body.email,password:body.password,
        data:{name:body.name,phone:body.phone||''},redirect_to:location.origin+'/login.html'});
      if(data&&data.access_token){setToken(data.access_token);await ensureUserRow(data.user);return {token:data.access_token};}
      // Confirmation email required
      try{ return await api.login({email:body.email,password:body.password}); }
      catch(err){
        if(err.status===400&&/not confirmed|confirm/i.test(err.message)){
          throw new Error('Your account was created. Check your inbox for the confirmation link, then sign in.');
        }
        throw err;
      }
    },
    async login(body){
      const data=await authCall('/token?grant_type=password',{email:body.email,password:body.password});
      setToken(data.access_token);
      const u=data.user; await ensureUserRow(u);
      await sessionUser();
      return {token:data.access_token};
    },
    async logout(){
      const t=token(); setToken(null); localStorage.removeItem(USER_KEY);
      if(!t) return;
      try{await fetch(AUTH+'/logout',{method:'POST',headers:{'Content-Type':'application/json',apikey:KEY,Authorization:'Bearer '+t}});}catch(e){}
    },
    me(){return sessionUser().then(u=>({user:u})).catch(()=>({user:null}));},
    async account(){
      const u=await sessionUser();
      if(!u) return {user:null,addresses:[]};
      let addresses=[];
      try{addresses=await rest('/addresses?select=id,label,address,city,state,created_at&user_id=eq.'+encodeURIComponent(u.id)+'&order=created_at.desc');}catch(e){}
      return {user:u,addresses:addresses||[]};
    },
    async products(params){
      let rows=await rest('/products?select=*&active=eq.1&order=id');
      const q=new URLSearchParams(params||'');
      const search=(q.get('search')||'').trim().toLowerCase();
      const category=(q.get('category')||'').trim();
      const sort=q.get('sort')||'relevance';
      if(search) rows=rows.filter(p=>(p.name+' '+p.category).toLowerCase().includes(search));
      if(category&&category!=='all') rows=rows.filter(p=>(p.category||'').toLowerCase()===category.toLowerCase());
      if(sort==='low') rows.sort((a,b)=>a.price-b.price);
      if(sort==='high') rows.sort((a,b)=>b.price-a.price);
      if(sort==='new') rows.reverse();
      return {products:rows};
    },
    async product(id){
      const rows=await rest('/products?select=*&id=eq.'+encodeURIComponent(id)+'&active=eq.1');
      if(!rows||!rows.length) throw new Error('Product not found.');
      let reviews=[];
      try{reviews=await rest('/reviews?select=id,rating,text,created_at&product_id=eq.'+encodeURIComponent(id)+'&status=eq.published&order=created_at.desc');}catch(e){}
      return {product:rows[0],reviews:reviews||[]};
    },
    async createAddress(body){
      const u=await sessionUser(); if(!u) throw new Error('Please sign in first.');
      const row={id:newId('addr'),user_id:u.id,label:body.label,address:body.address,city:body.city,state:body.state,created_at:new Date().toISOString()};
      await rest('/addresses',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(row)});
      return {address:row};
    },
    async deleteAddress(id){
      await rest('/addresses?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{Prefer:'return=minimal'}});
      return {ok:true};
    },
    async createOrder(body){
      const u=await sessionUser(); if(!u) throw new Error('Please sign in to place an order.');
      const ids=(body.items||[]).map(i=>String(i.productId));
      if(!ids.length) throw new Error('Your cart is empty.');
      const products=await rest('/products?select=id,name,price,stock&active=eq.1&id=in.("'+ids.map(encodeURIComponent).join('","')+'")');
      const byId={}; (products||[]).forEach(p=>byId[String(p.id)]=p);
      let subtotal=0; const lines=[];
      for(const it of body.items){
        const p=byId[String(it.productId)];
        if(!p) throw new Error('An item in your cart is no longer available.');
        const qty=Math.max(1,Number(it.quantity)||1);
        subtotal+=p.price*qty;
        lines.push({product_id:String(p.id),name:p.name,price:p.price,quantity:qty});
      }
      const deliveryFee=2500;
      const now=new Date().toISOString();
      const order={id:'FX'+Date.now().toString(36).toUpperCase(),user_id:u.id,status:'pending',
        subtotal,delivery_fee:deliveryFee,discount:0,total:subtotal+deliveryFee,
        payment_method:body.paymentMethod||'pay-on-delivery',delivery_method:body.deliveryMethod||'standard',
        customer_name:body.name||u.name,email:body.email||u.email,phone:body.phone||u.phone||'',
        address:body.address||'',city:body.city||'',state:body.state||'',created_at:now,updated_at:now};
      await rest('/orders',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(order)});
      await rest('/order_items',{method:'POST',headers:{Prefer:'return=minimal'},
        body:JSON.stringify(lines.map(l=>Object.assign({order_id:order.id},l)))});
      localStorage.setItem('fablux_cart_v1','[]');
      return {order};
    },
    async verifyPaystack(){return {paid:false};},
    async orders(){
      const u=await sessionUser(); if(!u) throw new Error('Please sign in first.');
      const rows=await rest('/orders?select=*,order_items(*)&user_id=eq.'+encodeURIComponent(u.id)+'&order=created_at.desc');
      const orders=(rows||[]).map(o=>{const items=o.order_items||[];delete o.order_items;o.items=items;return o;});
      return {orders};
    },
    async order(id){
      const u=await sessionUser(); if(!u) throw new Error('Please sign in first.');
      const rows=await rest('/orders?select=*,order_items(*)&id=eq.'+encodeURIComponent(id)+'&user_id=eq.'+encodeURIComponent(u.id));
      if(!rows||!rows.length) throw new Error('Order not found.');
      const o=rows[0]; o.items=o.order_items||[]; delete o.order_items;
      return {order:o};
    },
    async review(body){
      const u=await sessionUser(); if(!u) throw new Error('Please sign in to leave a review.');
      if(!body.text||body.text.trim().length<3) throw new Error('Please write a short review.');
      const rating=Math.min(5,Math.max(1,Number(body.rating)||5));
      await rest('/reviews',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({
        id:newId('rev'),user_id:u.id,product_id:String(body.productId),rating,
        text:body.text.trim(),status:'published',created_at:new Date().toISOString()})});
      return {review:{rating,productId:body.productId}};
    },
    async returnRequest(body){
      const u=await sessionUser(); if(!u) throw new Error('Please sign in first.');
      await rest('/returns',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({
        id:newId('ret'),user_id:u.id,order_id:String(body.orderId||''),reason:body.reason||'',
        details:body.details||'',status:'requested',created_at:new Date().toISOString()})});
      return {returnRequest:{status:'requested'}};
    },
    async contact(body){
      if(!body.email||!body.message) throw new Error('Please complete the contact form.');
      await rest('/contacts',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({
        id:newId('msg'),name:body.name||'Guest',email:body.email,subject:body.subject||'Enquiry',
        message:body.message,created_at:new Date().toISOString()})});
      return {ok:true};
    },
    async newsletter(body){
      if(!body||!body.email) throw new Error('Please enter your email address.');
      await rest('/newsletter_subscribers',{method:'POST',headers:{Prefer:'return=minimal'},
        body:JSON.stringify({id:newId('sub'),email:body.email,created_at:new Date().toISOString()})});
      return {ok:true};
    },
    async publicSettings(){
      let enabled=false;
      try{const rows=await rest('/settings?select=value&key=eq.marketplace_enabled');enabled=!!(rows&&rows[0]&&rows[0].value==='1');}catch(e){}
      return {marketplaceEnabled:enabled};
    },
    async forgotPassword(email){
      await authCall('/recover',{email,redirect_to:location.origin+'/reset-password.html'});
      return {ok:true};
    },
    async resetPassword(_token,password){
      const t=token(); if(!t) throw new Error('This reset link has expired. Please request a new one.');
      const res=await fetch(AUTH+'/user',{method:'PUT',headers:{'Content-Type':'application/json',apikey:KEY,Authorization:'Bearer '+t},
        body:JSON.stringify({password})});
      if(!res.ok) throw fail(await res.json().catch(()=>null),res.status);
      return {ok:true};
    },
    async adminDashboard(){
      const u=await sessionUser(); if(!u||u.role!=='admin') throw new Error('Admin access required.');
      const count=async(path)=>{try{const rows=await rest(path);return (rows||[]).length;}catch(e){return 0;}};
      const [products,customers,orders,reviews]=await Promise.all([
        count('/products?select=id&active=eq.1&limit=5000'),
        count('/users?select=id&role=eq.customer&limit=5000'),
        count('/orders?select=id&limit=5000'),
        count('/reviews?select=id&limit=5000')
      ]);
      const s=await api.publicSettings();
      return {stats:{products,customers,orders,reviews},marketplaceEnabled:s.marketplaceEnabled};
    },
    async adminMarketplace(enabled){
      const u=await sessionUser(); if(!u||u.role!=='admin') throw new Error('Admin access required.');
      await rest('/settings?key=eq.marketplace_enabled',{method:'PATCH',headers:{Prefer:'return=minimal'},
        body:JSON.stringify({value:enabled?'1':'0',updated_at:new Date().toISOString()})});
      return {marketplaceEnabled:!!enabled};
    },
    async adminOrders(){
      const u=await sessionUser(); if(!u||u.role!=='admin') throw new Error('Admin access required.');
      const orders=await rest('/orders?select=id,status,total,customer_name,email,created_at&order=created_at.desc&limit=200');
      return {orders:orders||[]};
    },
    async adminOrderStatus(id,status){
      const u=await sessionUser(); if(!u||u.role!=='admin') throw new Error('Admin access required.');
      const allowed=['pending','confirmed','processing','shipped','out_for_delivery','delivered','cancelled'];
      if(!allowed.includes(status)) throw new Error('Invalid order status.');
      await rest('/orders?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},
        body:JSON.stringify({status,updated_at:new Date().toISOString()})});
      return {ok:true};
    },
    async adminCreateProduct(body){
      const u=await sessionUser(); if(!u||u.role!=='admin') throw new Error('Admin access required.');
      const now=new Date().toISOString();
      const row={id:String(body.id||newId('prod')),name:body.name,price:Number(body.price)||0,
        category:body.category||'General',image:String(body.image||''),
        active:body.active===false?0:1,stock:Number(body.stock)||0,reserved_stock:0,
        created_at:now,updated_at:now};
      await rest('/products',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});
      return {product:row};
    },
    async adminUpdateProduct(id,body){
      const u=await sessionUser(); if(!u||u.role!=='admin') throw new Error('Admin access required.');
      const row={name:body.name,price:Number(body.price)||0,category:body.category||'General',
        image:String(body.image||''),active:body.active===false?0:1,stock:Number(body.stock)||0,
        updated_at:new Date().toISOString()};
      await rest('/products?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(row)});
      return {product:Object.assign({id},row)};
    },
    async adminDeleteProduct(id){
      const u=await sessionUser(); if(!u||u.role!=='admin') throw new Error('Admin access required.');
      await rest('/products?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{Prefer:'return=minimal'}});
      return {ok:true};
    }
  };

  window.FabluXAPI=api;
  window.FabluXAuthTokenKey=TOKEN_KEY;
})();
