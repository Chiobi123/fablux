// FabluX Backend Server with Supabase Integration
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('./config');
const supabase = require('./db');
const auth = require('./auth');
const orderService = require('./order-service');
const payments = require('./payments');

const root = path.join(__dirname, '..', '..');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Rate limiting
function rateLimit(req, res) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const b = buckets.get(ip) || { start: now, count: 0 };
  if (now - b.start > 60000) { b.start = now; b.count = 0; }
  b.count++; buckets.set(ip, b);
  if (b.count > 120) { json(res, 429, { error: 'Too many requests. Please try again shortly.' }); return false; }
  return true;
}

function headers(res, type = 'application/json') {
  res.setHeader('Content-Type', type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; script-src 'self' https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
}

function json(res, status, data) {
  headers(res);
  res.statusCode = status;
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1024 * 1024) { reject(Object.assign(new Error('Request body too large.'), { status: 413 })); req.destroy(); } });
    req.on('end', () => { if (!raw) return resolve({}); try { resolve(JSON.parse(raw)) } catch { reject(Object.assign(new Error('Invalid JSON body.'), { status: 400 })) } });
    req.on('error', reject);
  });
}

function parseRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > 1024 * 1024) { reject(Object.assign(new Error('Request body too large.'), { status: 413 })); req.destroy(); return; } chunks.push(c) });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function bearer(req) { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7).trim() : null; }

function safeUser(u) { return auth.publicUser(u) }

// Product rows - fetch from Supabase
async function productRows(q) {
  const search = (q.get('search') || '').trim().toLowerCase();
  const category = (q.get('category') || '').trim();
  
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('active', 1);

  if (error) throw error;

  let rows = data || [];

  if (search) rows = rows.filter(p => `${p.name} ${p.category}`.toLowerCase().includes(search));
  if (category && category !== 'all') rows = rows.filter(p => p.category.toLowerCase() === category.toLowerCase());

  const sort = q.get('sort') || 'relevance';
  if (sort === 'low') rows.sort((a, b) => a.price - b.price);
  if (sort === 'high') rows.sort((a, b) => b.price - a.price);
  if (sort === 'new') rows.reverse();

  return rows;
}

// API handler
async function api(req, res, method, pathname, q) {
  if (method === 'GET' && pathname === '/api/health') return json(res, 200, { ok: true, service: 'fablux-api', time: new Date().toISOString() });

  if (method === 'GET' && pathname === '/api/products') return json(res, 200, { products: await productRows(q) });

  if (method === 'GET' && /^\/api\/products\/[^/]+$/.test(pathname)) {
    const id = decodeURIComponent(pathname.split('/').pop());
    const { data: p, error: pError } = await supabase.from('products').select('*').eq('id', id).eq('active', 1).single();
    if (pError) throw Object.assign(new Error('Product not found.'), { status: 404 });
    const { data: reviews, error: rError } = await supabase
      .from('reviews')
      .select('id, rating, text, created_at, user:name')
      .eq('product_id', id)
      .eq('status', 'published')
      .order('created_at', { ascending: false });
    if (rError) throw rError;
    return json(res, 200, { product: p, reviews });
  }

  if (method === 'POST' && pathname === '/api/auth/register') {
    const b = await parseBody(req);
    const out = await auth.register(b);
    return json(res, 201, out);
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    const b = await parseBody(req);
    return json(res, 200, await auth.login(b));
  }

  if (method === 'POST' && pathname === '/api/auth/forgot-password') {
    const b = await parseBody(req);
    return json(res, 200, await auth.requestPasswordReset(b.email));
  }

  if (method === 'POST' && pathname === '/api/auth/reset-password') {
    const b = await parseBody(req);
    return json(res, 200, await auth.resetPassword(b.token, b.password));
  }

  if (method === 'POST' && pathname === '/api/auth/logout') { auth.logout(bearer(req)); return json(res, 200, { ok: true }); }

  if (method === 'GET' && pathname === '/api/auth/me') { const u = auth.authFromRequest(req); if (!u) return json(res, 200, { user: null }); return json(res, 200, { user: safeUser(u) }); }

  if (method === 'GET' && pathname === '/api/settings/public') {
  const { data: s, error: sError } = await supabase.from('settings').select('value').eq('key', 'marketplace_enabled').single();
    return json(res, 200, { marketplaceEnabled: s && s.value === '1' });
  }

  if (method === 'GET' && pathname === '/api/account') {
    const u = auth.requireUser(req);
    if (!u) return json(res, 200, { user: null, addresses: [] });
    const { data: addrs, error: aError } = await supabase.from('addresses').select('id,label,address,city,state,created_at').eq('user_id', u.id).order('created_at', { ascending: false });
    if (aError) throw aError;
    return json(res, 200, { user: safeUser(u), addresses: addrs || [] });
  }

  if (method === 'POST' && pathname === '/api/account/addresses') {
    const u = auth.requireUser(req);
    const b = await parseBody(req);
    const row = { id: randomId('addr'), label: v.string(b.label, 'Label', { max: 80 }), address: v.string(b.address, 'Address', { max: 500 }), city: v.string(b.city, 'City', { max: 80 }), state: v.string(b.state, 'State', { max: 80 }) };
    const { error } = await supabase.from('addresses').insert([{ id: row.id, user_id: u.id, label: row.label, address: row.address, city: row.city, state: row.state, created_at: new Date().toISOString() }]);
    if (error) throw Object.assign(new Error(error.message), { status: 400 });
    return json(res, 201, { address: row });
  }

  if (method === 'DELETE' && /^\/api\/account\/addresses\/[^/]+$/.test(pathname)) {
    const u = auth.requireUser(req);
    const id = decodeURIComponent(pathname.split('/').pop());
    const { error } = await supabase.from('addresses').delete().eq('id', id).eq('user_id', u.id);
    if (error) throw Object.assign(new Error(error.message), { status: 400 });
    return json(res, 200, { ok: true });
  }

  if (method === 'POST' && pathname === '/api/orders') {
    const u = auth.requireUser(req);
    orderService.releaseExpiredReservations();
    const order = orderService.createOrder({ user: u, name: b.name, email: b.email, phone: b.phone, address: b.address, city: b.city, state: b.state, deliveryMethod: b.deliveryMethod, paymentMethod: b.paymentMethod, items: b.items });
    if (order.status === 'pending_payment') {
      const payment = await payments.initializePaystack({ user: u, order });
      return json(res, 201, { order, payment });
    }
    return json(res, 201, { order });
  }

  if (method === 'GET' && pathname === '/api/payments/paystack/verify') {
    const u = auth.requireUser(req);
    const reference = q.get('reference');
    if (!reference) throw Object.assign(new Error('Payment reference is required.'), { status: 400 });
    return json(res, 200, await payments.verifyPaystack(reference, u));
  }

  if (method === 'POST' && pathname === '/api/payments/paystack/webhook') {
    const raw = await parseRawBody(req);
    return json(res, 200, await payments.handleWebhook(raw, req.headers['x-paystack-signature']));
  }

  if (method === 'GET' && pathname === '/api/orders') {
    const u = auth.requireUser(req);
    const { data: orders, error: oError } = await supabase.from('orders').select('*').eq('user_id', u.id).order('created_at', { ascending: false });
    if (oError) throw oError;
    // Fetch order items for each order
    for (const o of orders) {
      const { data: items, error: iError } = await supabase.from('order_items').select('product_id, name, price, quantity').eq('order_id', o.id);
      if (iError) throw iError;
      o.items = items || [];
    }
    return json(res, 200, { orders });
  }

  if (method === 'GET' && /^\/api\/orders\/[^/]+$/.test(pathname)) {
    const u = auth.requireUser(req);
    const id = decodeURIComponent(pathname.split('/').pop());
    const { data: o, error: oError } = await supabase.from('orders').select('*').eq('id', id).eq('user_id', u.id).single();
    if (oError) throw Object.assign(new Error('Order not found.'), { status: 404 });
    const { data: items, error: iError } = await supabase.from('order_items').select('product_id, name, price, quantity').eq('order_id', id);
    if (iError) throw iError;
    o.items = items || [];
    return json(res, 200, { order: o });
  }

  if (method === 'POST' && pathname === '/api/reviews') {
    const u = auth.requireUser(req);
    const b = await parseBody(req);
    const rating = v.int(b.rating, 'Rating', { min: 1, max: 5 });
    const productId = v.string(b.productId, 'Product ID', { max: 80 });
    // Verify product exists and is active
    const { data: product, error: pError } = await supabase.from('products').select('id').eq('id', productId).eq('active', 1).single();
    if (pError) throw Object.assign(new Error('Product not found.'), { status: 404 });
    const id = randomId('rev');
    const { error } = await supabase.from('reviews').insert([{ id, user_id: u.id, product_id: productId, rating, text: v.string(b.text, 'Review', { min: 3, max: 2000 }), status: 'published', created_at: new Date().toISOString() }]);
    if (error) throw Object.assign(new Error(error.message), { status: 400 });
    return json(res, 201, { review: { id, rating, productId } });
  }

  if (method === 'POST' && pathname === '/api/returns') {
    const u = auth.requireUser(req);
    const b = await parseBody(req);
    const orderId = v.string(b.orderId, 'Order number', { max: 80 });
    const { data: order, error: oError } = await supabase.from('orders').select('*').eq('id', orderId).eq('user_id', u.id).single();
    if (oError) throw Object.assign(new Error('Order not found.'), { status: 404 });
    const id = randomId('ret');
    const { error } = await supabase.from('returns').insert([{ id, user_id: u.id, order_id: orderId, reason: v.string(b.reason, 'Reason', { max: 100 }), details: v.string(b.details, 'Details', { max: 2000 }), status: 'requested', created_at: new Date().toISOString() }]);
    if (error) throw Object.assign(new Error(error.message), { status: 400 });
    return json(res, 201, { returnRequest: { id, status: 'requested' } });
  }

  if (method === 'POST' && pathname === '/api/contact') {
    const b = await parseBody(req);
    const id = randomId('msg');
    const { error } = await supabase.from('contacts').insert([{ id, name: v.string(b.name, 'Name', { max: 120 }), email: v.email(b.email), subject: v.string(b.subject, 'Subject', { max: 180 }), message: v.string(b.message, 'Message', { max: 5000 }), created_at: new Date().toISOString() }]);
    if (error) throw Object.assign(new Error(error.message), { status: 400 });
    return json(res, 201, { ok: true });
  }

  if (method === 'POST' && pathname === '/api/newsletter') {
    const b = await parseBody(req);
    const email = v.email(b.email);
    const { error } = await supabase.from('newsletter_subscribers').insert([{ id: randomId('sub'), email, created_at: new Date().toISOString() }]);
    if (error) throw Object.assign(new Error(error.message), { status: 400 });
    return json(res, 201, { ok: true });
  }

  if (pathname.startsWith('/api/admin/')) {
    const u = auth.requireAdmin(req);
    if (method === 'GET' && pathname === '/api/admin/dashboard') {
      const { count: products } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('active', 1);
      const { count: customers } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'customer');
      const { count: orders } = await supabase.from('orders').select('*', { count: 'exact', head: true });
      const { count: reviews } = await supabase.from('reviews').select('*', { count: 'exact', head: true });
      const { data: setting, error: sError } = await supabase.from('settings').select('value').eq('key', 'marketplace_enabled').single();
      return json(res, 200, { stats: { products: Number(count), customers: Number(customers), orders: Number(orders), reviews: Number(reviews) }, marketplaceEnabled: sError ? false : setting.value === '1' });
    }

    if (method === 'PATCH' && pathname === '/api/admin/settings/marketplace') {
      const b = await parseBody(req);
      await supabase.from('settings').upsert([{ key: 'marketplace_enabled', value: b.enabled ? '1' : '0', updated_at: new Date().toISOString() }]);
      const { data: setting } = await supabase.from('settings').select('value').eq('key', 'marketplace_enabled').single();
      return json(res, 200, { marketplaceEnabled: setting.value === '1' });
    }

    if (method === 'GET' && pathname === '/api/admin/orders') {
      const { data: orders, error: oError } = await supabase.from('orders').select('id, status, total, customer_name, email, created_at').order('created_at', { ascending: false }).limit(200);
      if (oError) throw oError;
      return json(res, 200, { orders });
    }

    if (method === 'PATCH' && /^\/api\/admin\/orders\/[^/]+$/.test(pathname)) {
      const id = decodeURIComponent(pathname.split('/').pop());
      const b = await parseBody(req);
      const allowed = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];
      if (!allowed.includes(b.status)) throw Object.assign(new Error('Invalid order status.'), { status: 400 });
      const { error } = await supabase.from('orders').update({ status: b.status, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw Object.assign(new Error(error.message), { status: 400 });
      return json(res, 200, { ok: true });
    }

    if (method === 'POST' && pathname === '/api/admin/products') {
      const b = await parseBody(req);
      const id = String(b.id || randomId('prod'));
      const t = new Date().toISOString();
      const { error } = await supabase.from('products').upsert([{ id, name: v.string(b.name, 'Name', { max: 180 }), price: v.int(b.price, 'Price'), category: v.string(b.category, 'Category', { max: 120 }), image: String(b.image || ''), active: b.active === false ? 0 : 1, stock: v.int(b.stock ?? 0, 'Stock'), created_at: t, updated_at: t }]);
      if (error) throw Object.assign(new Error(error.message), { status: 400 });
      const { data: product } = await supabase.from('products').select('*').eq('id', id).single();
      return json(res, 201, { product });
    }

    if (method === 'PATCH' && /^\/api\/admin\/products\/[^/]+$/.test(pathname)) {
      const id = decodeURIComponent(pathname.split('/').pop());
      const b = await parseBody(req);
      const t = new Date().toISOString();
      const { error } = await supabase.from('products').update({ name: v.string(b.name, 'Name', { max: 180 }), price: v.int(b.price, 'Price'), category: v.string(b.category, 'Category', { max: 120 }), image: String(b.image || ''), active: b.active === false ? 0 : 1, stock: v.int(b.stock ?? 0, 'Stock'), updated_at: t }).eq('id', id);
      if (error) throw Object.assign(new Error(error.message), { status: 400 });
      const { data: product } = await supabase.from('products').select('*').eq('id', id).single();
      return json(res, 200, { product });
    }
  }

  throw Object.assign(new Error('Route not found.'), { status: 404 });
}

function serveStatic(req, res, pathname) {
  let file = pathname === '/' ? '/index.html' : pathname;
  try { file = decodeURIComponent(file) } catch {}
  if (file.includes('..')) return json(res, 400, { error: 'Invalid path.' });
  if (file === '/admin-access') file = '/admin-login.html';
  const target = path.join(root, file);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return json(res, 404, { error: 'Not found' });
  headers(res, mime[path.extname(target)] || 'application/octet-stream');
  res.statusCode = 200;
  fs.createReadStream(target).pipe(res);
}

// Initialize buckets map
const buckets = new Map();

// Start server
setInterval(() => { try { orderService.releaseExpiredReservations() } catch (err) { console.error('Reservation cleanup error:', err.message) } }, 60000).unref();

const server = http.createServer(async (req, res) => {
  const requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);
  try {
    if (!rateLimit(req, res)) return;
    if (!cors(req, res)) { json(res, 403, { error: 'Origin not allowed.' }); return; }
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
    const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (parsed.pathname.startsWith('/api/')) await api(req, res, req.method, parsed.pathname, parsed.searchParams);
    else serveStatic(req, res, parsed.pathname);
  } catch (err) {
    console.error(`[${requestId}]`, err.stack || err);
    json(res, Number(err.status) || 500, { error: Number(err.status) ? err.message : 'Internal server error.', requestId });
  }
});

module.exports = server;