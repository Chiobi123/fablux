(function(){
  const TOKEN_KEY='fablux_api_token_v1';
  const API_BASE=window.FABLUX_API_BASE||'/api';
  async function request(path, options={}){
    const headers=Object.assign({'Content-Type':'application/json'},options.headers||{});
    const token=localStorage.getItem(TOKEN_KEY); if(token) headers.Authorization=`Bearer ${token}`;
    const res=await fetch(API_BASE+path,{...options,headers});
    const data=await res.json().catch(()=>({error:'Unexpected server response.'}));
    if(!res.ok){const e=new Error(data.error||'Request failed.');e.status=res.status;e.requestId=data.requestId;throw e;}
    return data;
  }
  const api={
    async register(body){const d=await request('/auth/register',{method:'POST',body:JSON.stringify(body)});localStorage.setItem(TOKEN_KEY,d.token);return d;},
    async login(body){const d=await request('/auth/login',{method:'POST',body:JSON.stringify(body)});localStorage.setItem(TOKEN_KEY,d.token);return d;},
    async logout(){try{await request('/auth/logout',{method:'POST'})}finally{localStorage.removeItem(TOKEN_KEY);}},
    me(){return request('/auth/me')},
    account(){return request('/account')},
    products(params=''){return request('/products'+params)},
    product(id){return request('/products/'+encodeURIComponent(id))},
    createAddress(body){return request('/account/addresses',{method:'POST',body:JSON.stringify(body)})},
    deleteAddress(id){return request('/account/addresses/'+encodeURIComponent(id),{method:'DELETE'})},
    createOrder(body){return request('/orders',{method:'POST',body:JSON.stringify(body)})},
    verifyPaystack(reference){return request('/payments/paystack/verify?reference='+encodeURIComponent(reference))},
    orders(){return request('/orders')},
    order(id){return request('/orders/'+encodeURIComponent(id))},
    review(body){return request('/reviews',{method:'POST',body:JSON.stringify(body)})},
    returnRequest(body){return request('/returns',{method:'POST',body:JSON.stringify(body)})},
    contact(body){return request('/contact',{method:'POST',body:JSON.stringify(body)})},
    newsletter(body){return request('/newsletter',{method:'POST',body:JSON.stringify(body)})},
    publicSettings(){return request('/settings/public')},
    adminDashboard(){return request('/admin/dashboard')},
    adminMarketplace(enabled){return request('/admin/settings/marketplace',{method:'PATCH',body:JSON.stringify({enabled})})},
    adminOrders(){return request('/admin/orders')},
    adminOrderStatus(id,status){return request('/admin/orders/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({status})})},
    adminCreateProduct(body){return request('/admin/products',{method:'POST',body:JSON.stringify(body)})},
    adminUpdateProduct(id,body){return request('/admin/products/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(body)})},
    adminDeleteProduct(id){return request('/admin/products/'+encodeURIComponent(id),{method:'DELETE'})}
  };
  window.FabluXAPI=api;
  window.FabluXAuthTokenKey=TOKEN_KEY;
})();
