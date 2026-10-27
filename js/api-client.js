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
  const IMAGE_BUCKET='product-images';

  const token=()=>localStorage.getItem(TOKEN_KEY);
  const setToken=t=>{t?localStorage.setItem(TOKEN_KEY,t):localStorage.removeItem(TOKEN_KEY);};
  const authHeaders=(extra)=>Object.assign({'Content-Type':'application/json',apikey:KEY,
    Authorization:'Bearer '+(token()||KEY)},extra||{});

  function fail(data,status){
    const msg=(data&&(data.msg||data.message||data.error_description||data.error))||('Request failed ('+status+').');
    const e=new Error(msg); e.status=status; return e;
  }

  // ---- resilient network layer -------------------------------------------------
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  // Retries transient network failures ("Failed to fetch", timeouts, resets)
  async function netFetch(url,opts,tries){
    const max=tries||3; let err=null;
    for(let i=0;i<max;i++){
      try{ return await fetch(url,opts); }
      catch(e){ err=e; if(i<max-1) await sleep(350+i*650); }
    }
    throw err;
  }
  // Turns raw browser network errors into a message a human can act on
  function friendly(e){
    const m=String(e&&e.message||'');
    if(!e||e.status) return m||'Something went wrong.';
    if(/fetch|network|load failed|timeout|ECONN/i.test(m))
      return 'Network problem — please check your connection and tap again.';
    return m||'Something went wrong.';
  }
  /* The cached profile is only ever valid for the exact token it was stored
     with. This makes it impossible to see one person's name/email after a
     different person signs in (or after the session changes/expires). */
  function cachedUser(){
    try{
      const raw=JSON.parse(localStorage.getItem(USER_KEY)||'null');
      if(!raw||typeof raw!=='object'||!raw.u||!raw.u.id){ localStorage.removeItem(USER_KEY); return null; }
      if((raw.t||'')!==(token()||'')){ localStorage.removeItem(USER_KEY); return null; }
      return raw.u;
    }catch(e){ localStorage.removeItem(USER_KEY); return null; }
  }
  function cacheUser(u){
    if(!u) return null;
    try{ localStorage.setItem(USER_KEY,JSON.stringify({t:token()||'',u:u})); }catch(e){}
    return u;
  }
  function clearIdentity(){ setToken(null); try{ localStorage.removeItem(USER_KEY); }catch(e){} }

  async function rest(path,options){
    const opts=Object.assign({},options||{},{headers:authHeaders(options&&options.headers)});
    let res;
    try{ res=await netFetch(REST+path,opts); }
    catch(e){ const x=new Error(friendly(e)); x.network=true; throw x; }
    const text=await res.text();
    let data=null; try{data=text?JSON.parse(text):null;}catch(e){data=null;}
    if(!res.ok) throw fail(data,res.status);
    return data;
  }

  async function authCall(path,body){
    let res;
    try{
      res=await netFetch(AUTH+path,{method:'POST',
        headers:{'Content-Type':'application/json',apikey:KEY,Authorization:'Bearer '+KEY},
        body:JSON.stringify(body)});
    }catch(e){ const x=new Error(friendly(e)); x.network=true; throw x; }
    const text=await res.text();
    let data=null; try{data=text?JSON.parse(text):null;}catch(e){data=null;}
    if(!res.ok) throw fail(data,res.status);
    return data;
  }

  // Returns the Supabase user, or null when signed out.
  // Throws only on a genuine network failure (never on a 401).
  async function currentUser(){
    const t=token(); if(!t) return null;
    const res=await netFetch(AUTH+'/user',{headers:{'Content-Type':'application/json',apikey:KEY,Authorization:'Bearer '+t}});
    if(!res.ok){ if(res.status===401||res.status===403){setToken(null);localStorage.removeItem(USER_KEY);} return null; }
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
    let u;
    try{ u=await currentUser(); }
    catch(e){
      // Network hiccup while verifying the session: keep the cached profile
      const c=cachedUser();
      if(c) return c;
      const x=new Error(friendly(e)); x.network=true; throw x;
    }
    if(!u){localStorage.removeItem(USER_KEY);return null;}
    const c=cachedUser();
    let role=(c&&c.role)||'customer';
    try{
      const rows=await rest('/users?select=role&id=eq.'+encodeURIComponent(u.id));
      if(rows&&rows[0])role=rows[0].role;
    }catch(e){ role=(c&&c.role)||'customer'; }
    const mapped=mapUser(u,role);
    cacheUser(mapped);
    return mapped;
  }

  const uid=()=>{const u=cachedUser();return u&&u.id;};

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
      clearIdentity();
      const data=await authCall('/signup',{email:body.email,password:body.password,
        data:{name:body.name,phone:body.phone||''},redirect_to:location.origin+'/login.html'});
      if(data&&data.access_token){
        setToken(data.access_token);
        cacheUser(mapUser(data.user,'customer'));
        try{ await ensureUserRow(data.user); }catch(e){}
        try{ await sessionUser(); }catch(e){}
        return {token:data.access_token};
      }
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
      // Drop any previous person's identity BEFORE authenticating, so a failed
      // sign-in can never leave another account's name/email on screen.
      clearIdentity();
      const data=await authCall('/token?grant_type=password',{email:body.email,password:body.password});
      setToken(data.access_token);
      cacheUser(mapUser(data.user,'customer'));
      try{ await ensureUserRow(data.user); }catch(e){}
      try{ await sessionUser(); }catch(e){}
      return {token:data.access_token};
    },
    async logout(){
      const t=token(); setToken(null); localStorage.removeItem(USER_KEY);
      if(!t) return;
      try{await netFetch(AUTH+'/logout',{method:'POST',headers:{'Content-Type':'application/json',apikey:KEY,Authorization:'Bearer '+t}});}catch(e){}
    },
    async me(){
      try{ return {user:await sessionUser()}; }
      catch(e){ return {user:cachedUser()}; }
    },
    async account(){
      let u=null;
      try{ u=await sessionUser(); }
      catch(e){ u=cachedUser(); if(!u) throw e; }
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
    // Order creation happens in the database (PostgreSQL function `create_order`):
    // prices, stock, delivery charge and totals are computed server-side, never in the browser.
    async createOrder(body){
      const items=(body.items||[]).map(i=>({product_id:String(i.productId),quantity:Math.max(1,Number(i.quantity)||1)}));
      if(!items.length) throw new Error('Your cart is empty.');
      const out=await rest('/rpc/create_order',{method:'POST',body:JSON.stringify({
        p_items:items,
        p_name:body.name||'',p_phone:body.phone||'',p_address:body.address||'',
        p_city:body.city||'',p_state:body.state||'',
        p_delivery_method:body.deliveryMethod||'standard',
        p_payment_method:body.paymentMethod||'pay-on-delivery',
        p_guest_email:body.email||null,
        p_landmark:body.landmark||null,
        p_instructions:body.instructions||null,
        p_promo:body.promoCode?String(body.promoCode).trim():null,
        p_idempotency_key:body.idempotencyKey||null
      })});
      if(!out||!out.reference) throw new Error('The order could not be saved. Please try again.');
      localStorage.setItem('fablux_last_order_ref',out.reference);
      localStorage.setItem('fablux_last_order_token',out.tracking_token);
      localStorage.setItem('fablux_cart_v1','[]');
      return {order:{
        id:out.order_id,reference:out.reference,tracking_token:out.tracking_token,
        status:out.status,payment_status:out.payment_status,subtotal:out.subtotal,
        delivery_fee:out.delivery_fee,discount:out.discount||0,promo:out.promo_code||null,
        total:out.total,currency:out.currency,
        created_at:out.created_at,duplicate:!!out.duplicate
      }};
    },
    // Secure tracking: only the person holding the order's tracking token can open it.
    async track(ref,token){
      return rest('/rpc/track_order',{method:'POST',body:JSON.stringify({p_ref:ref,p_token:token})});
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
      const keys='delivery_fee_default,delivery_fee_express_surcharge,store_name,store_contact,store_email,store_address,email_enabled';
      const rows=await rest('/settings?select=key,value&key=in.("'+keys.split(',').join('","')+'")');
      const map={}; (rows||[]).forEach(r=>map[r.key]=r.value);
      const n=(k,d)=>{const v=parseInt(map[k],10);return isNaN(v)?d:v;};
      return {
        deliveryFee:n('delivery_fee_default',2500),
        expressSurcharge:n('delivery_fee_express_surcharge',0),
        store:{name:map.store_name||'FabluX.U.Design',contact:map.store_contact||'',
               email:map.store_email||'',address:map.store_address||''},
        emailConfigured:map.email_enabled==='true'
      };
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
    async requireAdmin(){
      const u=await sessionUser();
      if(!u||u.role!=='admin') throw new Error('Admin access required.');
      return u;
    },
    async adminDashboard(){
      await api.requireAdmin();
      const count=async(path)=>{try{const rows=await rest(path);return (rows||[]).length;}catch(e){return 0;}};
      const [products,customers,orders,reviews,pendingAlerts]=await Promise.all([
        count('/products?select=id&active=eq.1&limit=5000'),
        count('/users?select=id&role=eq.customer&limit=5000'),
        count('/orders?select=id&limit=5000'),
        count('/reviews?select=id&limit=5000'),
        count('/notifications?select=id&status=eq.pending&limit=5000')
      ]);
      /* this month's trading + anything running low, straight from the tables */
      let monthOrders=0,monthRevenue=0,lowStock=[];
      try{
        const m=new Date();m.setDate(1);m.setHours(0,0,0,0);
        const rows=await rest('/orders?select=total,status,created_at&created_at=gte.'+encodeURIComponent(m.toISOString())+'&limit=5000');
        monthOrders=(rows||[]).length;
        monthRevenue=(rows||[]).reduce((n,o)=>n+(o.status==='cancelled'?0:Number(o.total)||0),0);
      }catch(e){}
      try{
        const prods=await rest('/products?select=id,name,stock,reserved_stock&order=stock.asc&limit=1000');
        lowStock=(prods||[])
          .map(p=>({id:String(p.id),name:p.name,available:Math.max(0,Number(p.stock||0)-Number(p.reserved_stock||0))}))
          .filter(p=>p.available<=5).slice(0,8);
      }catch(e){}
      const s=await api.publicSettings();
      return {stats:{products,customers,orders,reviews,pendingAlerts,monthOrders,monthRevenue,lowStock},
        settings:s,emailConfigured:s.emailConfigured};
    },
    async adminUpdateSetting(key,value){
      await api.requireAdmin();
      return rest('/rpc/admin_update_setting',{method:'POST',
        body:JSON.stringify({p_key:key,p_value:String(value)})});
    },
    async adminOrders(params){
      await api.requireAdmin();
      params=params||{};
      let q='/orders?select=*,order_items(*)&order=created_at.desc&limit=500';
      if(params.status) q+='&status=eq.'+encodeURIComponent(params.status);
      if(params.payment) q+='&payment_status=eq.'+encodeURIComponent(params.payment);
      if(params.search) q+='&or=(reference.ilike.'+encodeURIComponent('%'+params.search+'%')+
        ',customer_name.ilike.'+encodeURIComponent('%'+params.search+'%')+
        ',email.ilike.'+encodeURIComponent('%'+params.search+'%')+')';
      const rows=await rest(q);
      const orders=(rows||[]).map(o=>{const items=o.order_items||[];delete o.order_items;o.items=items;return o;});
      return {orders};
    },
    async adminOrder(ref,status){
      await api.requireAdmin();
      const rows=await rest('/orders?select=*,order_items(*)&reference=eq.'+encodeURIComponent(ref));
      if(!rows||!rows.length) throw new Error('Order not found.');
      const o=rows[0]; o.items=o.order_items||[]; delete o.order_items;
      let events=[];
      try{events=await rest('/order_events?select=event,label,actor,created_at&order_id=eq.'+encodeURIComponent(o.id)+'&order=created_at.asc');}catch(e){}
      return {order:o,events:events||[]};
    },
    async adminOrderStatus(ref,status){
      await api.requireAdmin();
      return rest('/rpc/admin_set_order_status',{method:'POST',
        body:JSON.stringify({p_ref:ref,p_new_status:status})});
    },
    async adminPaymentStatus(ref,status){
      await api.requireAdmin();
      return rest('/rpc/admin_set_payment_status',{method:'POST',
        body:JSON.stringify({p_ref:ref,p_new_status:status})});
    },
    async adminSetCourier(ref,courier,tracking,dispatchedAt,notes){
      await api.requireAdmin();
      return rest('/rpc/admin_set_courier',{method:'POST',body:JSON.stringify({
        p_ref:ref,p_courier:courier||'',p_tracking:tracking||'',
        p_dispatched_at:dispatchedAt||null,p_notes:notes||null})});
    },
    async adminNotifications(limit){
      await api.requireAdmin();
      try{
        return await rest('/notifications?select=id,order_id,event,recipient,subject,status,error,created_at'+
          '&order=created_at.desc&limit='+(limit||50));
      }catch(e){ return []; }
    },
    async adminAudit(limit){
      await api.requireAdmin();
      try{
        return await rest('/audit_log?select=actor_email,action,entity,entity_id,detail,created_at'+
          '&order=created_at.desc&limit='+(limit||50));
      }catch(e){ return []; }
    },
    async adminReturns(){
      await api.requireAdmin();
      try{
        return await rest('/returns?select=id,order_id,reason,details,status,created_at,user_id,users(name,email)'+
          '&order=created_at.desc&limit=500');
      }catch(e){ return []; }
    },
    async adminReturnStatus(id,status){
      await api.requireAdmin();
      const s=String(status||'').trim().toLowerCase();
      if(!/^(requested|approved|rejected|received|refunded)$/.test(s)) throw new Error('Unknown return status.');
      await rest('/returns?id=eq.'+encodeURIComponent(id),
        {method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:s})});
      return {status:s};
    },
    async adminCustomers(){
      await api.requireAdmin();
      let users=[];
      try{ users=await rest('/users?select=id,name,email,phone,role,created_at&order=created_at.desc&limit=1000'); }catch(e){ return []; }
      const counts={};
      try{
        const os=await rest('/orders?select=user_id&limit=5000');
        (os||[]).forEach(function(o){ if(o.user_id) counts[o.user_id]=(counts[o.user_id]||0)+1; });
      }catch(e){}
      return (users||[]).map(function(u){ return Object.assign({},u,{orderCount:counts[u.id]||0}); });
    },
    async adminPromos(){
      await api.requireAdmin();
      try{ return await rest('/promo_codes?select=*&order=created_at.desc&limit=500'); }catch(e){ return []; }
    },
    async adminSavePromo(body){
      await api.requireAdmin();
      const code=String(body.code||'').trim().toUpperCase().replace(/\s+/g,'');
      if(!/^[A-Z0-9_-]{3,24}$/.test(code)) throw new Error('Code must be 3–24 letters or numbers.');
      const kind=body.kind==='amount'?'amount':'percent';
      const value=Math.round(Number(body.value));
      if(!(value>0)) throw new Error('Enter a value greater than zero.');
      if(kind==='percent'&&value>90) throw new Error('A percentage discount cannot exceed 90%.');
      const row={code:code,kind:kind,value:value,
        min_subtotal:Math.max(0,Math.round(Number(body.minSubtotal)||0)),
        max_uses:Math.max(0,Math.round(Number(body.maxUses)||0)),
        used_count:Math.max(0,Math.round(Number(body.usedCount)||0)),
        active:(body.active===false||body.active===0||body.active==='0')?0:1,
        created_at:body.createdAt||new Date().toISOString(),
        updated_at:new Date().toISOString()};
      await rest('/promo_codes',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});
      return {promo:row};
    },
    async adminDeletePromo(code){
      await api.requireAdmin();
      await rest('/promo_codes?code=eq.'+encodeURIComponent(code),
        {method:'DELETE',headers:{Prefer:'return=minimal'}});
      return {ok:true};
    },
    /* Customers never read the codes table: the database function decides. */
    async validatePromo(code,subtotal){
      return rest('/rpc/validate_promo',{method:'POST',
        body:JSON.stringify({p_code:String(code||''),p_subtotal:Math.max(0,Math.round(Number(subtotal)||0))})});
    },
    async adminProducts(){
      await api.requireAdmin();
      try{
        return await rest('/products?select=*&order=created_at.desc,id&limit=1000');
      }catch(e){ return []; }
    },
    /* Product pictures live in a public Supabase Storage bucket; only an
       approved administrator may put files there or remove them again. */
    async adminUploadImage(file){
      await api.requireAdmin();
      if(!file) throw new Error('Choose a picture first.');
      if(file.type && !/^image\//.test(file.type)) throw new Error('That file is not an image.');
      if(file.size>5*1024*1024) throw new Error('Picture must be smaller than 5 MB.');
      const ext=((file.name||'').split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
      const path='products/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'.'+ext;
      const res=await fetch(BASE+'/storage/v1/object/'+IMAGE_BUCKET+'/'+path,
        {method:'POST',headers:Object.assign({},authHeaders(),{'Content-Type':file.type||'image/jpeg','x-upsert':'true'}),body:file});
      if(!res.ok){
        const t=await res.text();
        let m='';try{m=(JSON.parse(t)||{}).message||''}catch(e){}
        throw new Error(m||('Picture upload failed ('+res.status+').'));
      }
      return {path:path, url:BASE+'/storage/v1/object/public/'+IMAGE_BUCKET+'/'+path};
    },
    async adminDeleteImage(path){
      await api.requireAdmin();
      if(!path||path.indexOf('/')<0||path.indexOf('..')>=0) return {ok:true};
      /* storage rejects a DELETE that declares an empty JSON body */
      const h=authHeaders(); delete h['Content-Type'];
      try{
        const res=await fetch(BASE+'/storage/v1/object/'+IMAGE_BUCKET+'/'+path,
          {method:'DELETE',headers:h});
        return {ok:res.ok,status:res.status};
      }catch(e){ return {ok:false,status:0}; }
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
