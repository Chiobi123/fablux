/* FabluX.U.Design — administration dashboard (js/admin.js)
   All privileged writes go through the database functions in setup-fulfilment.sql
   (admin_set_order_status / admin_set_payment_status / admin_set_courier /
   admin_update_setting). Nothing privileged happens in the browser. */
(function () {
  'use strict';

  var STATUS_LABEL = {
    pending_payment: 'Order received',
    payment_confirmed: 'Payment confirmed',
    confirmed: 'Order confirmed',
    processing: 'Preparing parcel',
    ready_for_dispatch: 'Ready for dispatch',
    shipped: 'Collected by courier',
    delivered: 'Delivered',
    cancelled: 'Cancelled'
  };
  var NEXT_STATUS = {
    pending_payment: [['payment_confirmed', 'Confirm payment'], ['confirmed', 'Confirm order'], ['cancelled', 'Cancel']],
    payment_confirmed: [['confirmed', 'Confirm order'], ['cancelled', 'Cancel']],
    confirmed: [['processing', 'Start preparing'], ['cancelled', 'Cancel']],
    processing: [['ready_for_dispatch', 'Ready for dispatch'], ['cancelled', 'Cancel']],
    ready_for_dispatch: [['shipped', 'Mark collected by courier'], ['cancelled', 'Cancel']],
    shipped: [['delivered', 'Mark delivered']]
  };
  var PAY_LABEL = { pending: 'Pending', successful: 'Successful', failed: 'Failed', refunded: 'Refunded' };

  var state = { tab: 'orders', search: '', status: '', payment: '', order: null,
    productEdit: null, products: [], promoEdit: null, promos: [] };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(m) {
    if (window.FabluXStore && window.FabluXStore.toast) return window.FabluXStore.toast(m);
    var t = document.getElementById('fabluxToast');
    if (!t) { t = document.createElement('div'); t.id = 'fabluxToast'; t.className = 'fablux-toast'; document.body.appendChild(t); }
    t.textContent = m; t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2400);
  }
  function money(n) { return '₦' + Number(n || 0).toLocaleString('en-NG'); }
  function when(s) { return s ? new Date(s).toLocaleString('en-NG') : '—'; }

  async function loadOrders() {
    var d = await window.FabluXAPI.adminOrders({
      search: state.search || undefined,
      status: state.status || undefined,
      payment: state.payment || undefined
    });
    return d.orders || [];
  }

  function tabsHtml() {
    var tabs = [['orders', 'Orders'], ['products', 'Products'], ['returns', 'Returns'],
                ['promos', 'Promo codes'], ['customers', 'Customers'],
                ['settings', 'Store settings'], ['notifications', 'Notifications'], ['audit', 'Audit trail']];
    return '<div class="pro-admin-nav">' +
      tabs.map(function (t) {
        var on = state.tab === t[0];
        return '<button type="button" class="pro-tab' + (on ? ' is-active' : '') + '"' +
          (on ? ' aria-current="page"' : '') + ' data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') +
      '<a class="pro-tab" href="waybill.html">Print waybill</a></div>';
  }

  function stat(label, value) {
    return '<div class="fablux-admin-stat">' + label + '<strong>' + value + '</strong></div>';
  }

  function lowStockHtml(list) {
    if (!list || !list.length) return '';
    return '<div class="pro-admin-alert"><strong>Low stock</strong> — ' +
      list.map(function (p) { return esc(p.name) + ' (' + p.available + ' left)'; }).join(' · ') +
      '</div>';
  }

  /* Console header: title + live numbers, shown on every tab. */
  function headHtml(dash) {
    var s = dash.stats || {};
    return '<div class="section-title"><span>FABLUX ADMIN</span><h2>Store Control Center</h2>' +
      '<p>Catalogue, orders, payment confirmation, dispatch and delivery.</p></div>' +
      '<div class="fablux-admin-grid">' +
      stat('Products', s.products || 0) +
      stat('Customers', s.customers || 0) +
      stat('Orders', s.orders || 0) +
      stat('Sales this month', money(s.monthRevenue || 0)) +
      stat('Orders this month', s.monthOrders || 0) +
      stat('Low stock', (s.lowStock || []).length) +
      '</div>' + lowStockHtml(s.lowStock) + tabsHtml();
  }

  async function renderOrders(box, dash) {
    var orders = await loadOrders();
    var rows = orders.map(function (o) {
      return '<tr data-ref="' + esc(o.reference) + '" style="cursor:pointer">' +
        '<td><strong>' + esc(o.reference) + '</strong></td>' +
        '<td>' + esc(o.customer_name) + '<br><small>' + esc(o.email || o.guest_email || '') + '</small></td>' +
        '<td>' + money(o.total) + '</td>' +
        '<td>' + esc(o.payment_method === 'bank-transfer' ? 'Bank transfer' : 'Pay on delivery') + ' / ' + esc(PAY_LABEL[o.payment_status] || o.payment_status) + '</td>' +
        '<td>' + esc(STATUS_LABEL[o.status] || o.status) + '</td>' +
        '<td>' + when(o.created_at) + '</td></tr>';
    }).join('');
    box.innerHTML = headHtml(dash) +
      '<div class="pro-admin-section"><h3>Orders</h3>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">' +
      '<input id="admSearch" placeholder="Search reference, name, email" value="' + esc(state.search) + '" style="flex:1;min-width:200px;padding:8px">' +
      '<select id="admStatus" style="padding:8px"><option value="">All statuses</option>' +
      Object.keys(STATUS_LABEL).map(function (k) { return '<option value="' + k + '"' + (state.status === k ? ' selected' : '') + '>' + STATUS_LABEL[k] + '</option>'; }).join('') +
      '</select><select id="admPayment" style="padding:8px"><option value="">All payments</option>' +
      Object.keys(PAY_LABEL).map(function (k) { return '<option value="' + k + '"' + (state.payment === k ? ' selected' : '') + '>' + PAY_LABEL[k] + '</option>'; }).join('') +
      '</select></div>' +
      (orders.length ? '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px">' +
        '<thead><tr>' + ['Reference', 'Customer', 'Total', 'Payment', 'Status', 'Placed'].map(function (h) { return '<th style="text-align:left;padding:8px;border-bottom:1px solid rgba(0,0,0,.15)">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<p>No orders match this filter.</p>') +
      '</div>';

    var s = box.querySelector('#admSearch');
    var timer;
    s.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { state.search = s.value.trim(); render(box, dash); }, 400); });
    box.querySelector('#admStatus').addEventListener('change', function (e) { state.status = e.target.value; render(box, dash); });
    box.querySelector('#admPayment').addEventListener('change', function (e) { state.payment = e.target.value; render(box, dash); });
    Array.prototype.forEach.call(box.querySelectorAll('tr[data-ref]'), function (tr) {
      tr.addEventListener('click', function () { openOrder(box, dash, tr.dataset.ref); });
    });
  }

  async function openOrder(box, dash, ref) {
    box.innerHTML = '<p>Loading order ' + esc(ref) + '…</p>';
    var d = await window.FabluXAPI.adminOrder(ref);
    state.order = d.order;
    var o = d.order;
    var nexts = NEXT_STATUS[o.status] || [];
    box.innerHTML = tabsHtml() +
      '<div class="pro-admin-section"><h3>' + esc(o.reference) + ' — ' + esc(STATUS_LABEL[o.status] || o.status) + '</h3>' +
      '<div class="pro-summary-row"><span>Payment</span><strong>' + esc(PAY_LABEL[o.payment_status] || o.payment_status) + ' (' + esc(o.payment_method) + ')</strong></div>' +
      '<div class="pro-summary-row"><span>Placed</span><strong>' + when(o.created_at) + '</strong></div>' +
      '<div class="pro-summary-row"><span>Customer</span><strong>' + esc(o.customer_name) + ' — ' + esc(o.email || o.guest_email || '') + ' — ' + esc(o.phone || '') + '</strong></div>' +
      '<div class="pro-summary-row"><span>Address</span><strong>' + esc(o.address) + ', ' + esc(o.landmark || '') + ', ' + esc(o.city) + ', ' + esc(o.state) + '</strong></div>' +
      (o.instructions ? '<div class="pro-summary-row"><span>Instructions</span><strong>' + esc(o.instructions) + '</strong></div>' : '') +
      '</div>' +
      '<div class="pro-admin-section"><h3>Items</h3>' +
      (o.items || []).map(function (i) { return '<div class="pro-summary-row"><span>' + esc(i.name) + ' × ' + i.quantity + '</span><strong>' + money(i.price * i.quantity) + '</strong></div>'; }).join('') +
      '<div class="pro-summary-row"><span>Subtotal</span><strong>' + money(o.subtotal) + '</strong></div>' +
      '<div class="pro-summary-row"><span>Delivery</span><strong>' + money(o.delivery_fee) + '</strong></div>' +
      '<div class="pro-summary-row"><strong>Total</strong><strong>' + money(o.total) + '</strong></div></div>' +
      '<div class="pro-admin-section"><h3>Actions</h3>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">' +
      nexts.map(function (n) { return '<button class="btn" data-status="' + n[0] + '" style="cursor:pointer">' + n[1] + '</button>'; }).join('') +
      '</div>' +
      (o.payment_status === 'pending' ? '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px"><button class="btn" data-pay="successful" style="cursor:pointer">Confirm payment received</button><button class="btn" data-pay="failed" style="cursor:pointer">Mark payment failed</button></div>' : '') +
      (o.payment_status === 'successful' && o.payment_method !== 'card' ? '<div style="margin-bottom:14px"><button class="btn" data-pay="refunded" style="cursor:pointer">Mark refunded</button></div>' : '') +
      '<form id="courierForm" style="display:grid;gap:10px;max-width:560px">' +
      '<label>Courier / collection service<input name="courier" value="' + esc(o.courier || '') + '" placeholder="e.g. GIG Logistics, in-house dispatch"></label>' +
      '<label>Courier tracking number<input name="tracking" value="' + esc(o.courier_tracking || '') + '"></label>' +
      '<label>Dispatch date<input name="dispatched" type="date" value="' + esc((o.dispatched_at || '').slice(0, 10)) + '"></label>' +
      '<label>Dispatch notes<textarea name="notes" rows="2">' + esc(o.notes || '') + '</textarea></label>' +
      '<button class="btn" type="submit" style="cursor:pointer">Save courier details</button></form>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">' +
      '<a class="btn" target="_blank" href="waybill.html?ref=' + encodeURIComponent(o.reference) + '">Print waybill</a>' +
      '<a class="btn" target="_blank" href="track.html?ref=' + encodeURIComponent(o.reference) + '&token=' + encodeURIComponent(o.tracking_token || '') + '">Customer tracking view</a>' +
      '<button class="btn" data-back style="cursor:pointer">Back to orders</button></div></div>' +
      '<div class="pro-admin-section"><h3>Timeline</h3><ul class="fablux-events">' +
      (d.events || []).map(function (e) { return '<li><strong>' + esc(e.label) + '</strong><span>' + when(e.created_at) + (e.actor ? ' — ' + esc(e.actor) : '') + '</span></li>'; }).join('') +
      '</ul></div>';

    Array.prototype.forEach.call(box.querySelectorAll('[data-status]'), function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true;
        try { await window.FabluXAPI.adminOrderStatus(o.reference, b.dataset.status); toast('Status updated'); await openOrder(box, dash, o.reference); }
        catch (e) { b.disabled = false; toast(e.message); }
      });
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-pay]'), function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true;
        try { await window.FabluXAPI.adminPaymentStatus(o.reference, b.dataset.pay); toast('Payment status updated'); await openOrder(box, dash, o.reference); }
        catch (e) { b.disabled = false; toast(e.message); }
      });
    });
    box.querySelector('[data-back]').addEventListener('click', function () { state.order = null; render(box, dash); });
    box.querySelector('#courierForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var f = ev.target;
      try {
        await window.FabluXAPI.adminSetCourier(o.reference, f.courier.value, f.tracking.value, f.dispatched.value || null, f.notes.value);
        toast('Courier details saved'); await openOrder(box, dash, o.reference);
      } catch (e) { toast(e.message); }
    });
  }

  async function renderSettings(box, dash) {
    var s = dash.settings || {};
    box.innerHTML = headHtml(dash) +
      '<div class="pro-admin-section"><h3>Delivery charges</h3>' +
      '<form id="feeForm" style="display:grid;gap:10px;max-width:520px">' +
      '<label>Standard delivery charge (₦)<input name="delivery_fee_default" type="number" min="0" value="' + esc(s.deliveryFee || 2500) + '"></label>' +
      '<label>Express surcharge (₦)<input name="delivery_fee_express_surcharge" type="number" min="0" value="' + esc(s.expressSurcharge || 0) + '"></label>' +
      '<button class="btn" type="submit">Save delivery charges</button></form></div>' +
      '<div class="pro-admin-section"><h3>Store details</h3>' +
      '<form id="storeForm" style="display:grid;gap:10px;max-width:520px">' +
      '<label>Store name<input name="store_name" value="' + esc((s.store || {}).name || '') + '"></label>' +
      '<label>Contact phone<input name="store_contact" value="' + esc((s.store || {}).contact || '') + '"></label>' +
      '<label>Contact email<input name="store_email" value="' + esc((s.store || {}).email || '') + '"></label>' +
      '<label>Address<input name="store_address" value="' + esc((s.store || {}).address || '') + '"></label>' +
      '<button class="btn" type="submit">Save store details</button></form></div>' +
      '<div class="pro-admin-section"><h3>Email alerts</h3>' +
      '<p>' + (s.emailConfigured
        ? 'Email delivery is enabled. Order alerts are queued for sending.'
        : '<strong>Email is not configured yet.</strong> Order alerts are saved in the outbox as <em>pending</em> and are NOT sent. Configure SMTP/Resend credentials in Supabase to start sending — this system will never claim an email was sent when it was not.') + '</p>' +
      '<label class="switch"><input id="emailToggle" type="checkbox" ' + (s.emailConfigured ? 'checked' : '') + '> Email sending enabled</label></div>';

    box.querySelector('#feeForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      try {
        await window.FabluXAPI.adminUpdateSetting('delivery_fee_default', ev.target.delivery_fee_default.value);
        await window.FabluXAPI.adminUpdateSetting('delivery_fee_express_surcharge', ev.target.delivery_fee_express_surcharge.value);
        toast('Delivery charges saved');
      } catch (e) { toast(e.message); }
    });
    box.querySelector('#storeForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      try {
        var f = ev.target;
        for (var k of ['store_name', 'store_contact', 'store_email', 'store_address']) {
          await window.FabluXAPI.adminUpdateSetting(k, f[k].value);
        }
        toast('Store details saved');
      } catch (e) { toast(e.message); }
    });
    box.querySelector('#emailToggle').addEventListener('change', async function (e) {
      try {
        await window.FabluXAPI.adminUpdateSetting('email_enabled', e.target.checked ? 'true' : 'false');
        toast(e.target.checked ? 'Email sending enabled — alerts will queue for delivery' : 'Email sending disabled — alerts stay pending');
      } catch (err) { e.target.checked = !e.target.checked; toast(err.message); }
    });
  }

  async function renderNotifications(box, dash) {
    var rows = await window.FabluXAPI.adminNotifications(100);
    box.innerHTML = headHtml(dash) + '<div class="pro-admin-section"><h3>Notification outbox</h3>' +
      '<p style="opacity:.8">Every order alert is stored here. <strong>pending</strong> means not yet sent (no SMTP configured); <strong>queued</strong> means waiting to be delivered; <strong>sent</strong> means delivered.</p>' +
      (rows.length ? '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr>' +
        ['Order', 'Recipient', 'Subject', 'Status', 'Created'].map(function (h) { return '<th style="text-align:left;padding:8px;border-bottom:1px solid rgba(0,0,0,.15)">' + h + '</th>'; }).join('') +
        '</tr></thead><tbody>' + rows.map(function (n) {
          return '<tr><td>' + esc(n.order_id || '—') + '</td><td>' + esc(n.recipient) + '</td><td>' + esc(n.subject || '') + '</td><td>' + esc(n.status) +
            (n.error ? '<br><small>' + esc(n.error) + '</small>' : '') + '</td><td>' + when(n.created_at) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p>No notifications yet.</p>') + '</div>';
  }

  async function renderAudit(box, dash) {
    var rows = await window.FabluXAPI.adminAudit(100);
    box.innerHTML = headHtml(dash) + '<div class="pro-admin-section"><h3>Audit trail</h3>' +
      (rows.length ? '<ul class="fablux-events">' + rows.map(function (a) {
        return '<li><strong>' + esc(a.action) + ' — ' + esc(a.entity || '') + ' ' + esc(a.entity_id || '') + '</strong><span>' +
          esc(a.actor_email || 'system') + ' · ' + when(a.created_at) + (a.detail ? ' · ' + esc(JSON.stringify(a.detail)) : '') + '</span></li>';
      }).join('') + '</ul>' : '<p>No audit entries yet.</p>') + '</div>';
  }

  var RETURN_LABEL = { requested: 'Requested', approved: 'Approved', rejected: 'Rejected', received: 'Received', refunded: 'Refunded' };
  var RETURN_OPTIONS = ['requested', 'approved', 'rejected', 'received', 'refunded'];

  async function renderReturns(box, dash) {
    var rows = await window.FabluXAPI.adminReturns();
    box.innerHTML = headHtml(dash) + '<div class="pro-admin-section"><h3>Returns &amp; Refunds</h3>' +
      '<p style="opacity:.8">Requests submitted on the Returns page. Change a status to move a request along; the customer sees it under their orders.</p>' +
      (rows.length ? '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr>' +
        ['Order', 'Customer', 'Reason', 'Status', 'Action'].map(function (h) { return '<th style="text-align:left;padding:8px;border-bottom:1px solid rgba(0,0,0,.15)">' + h + '</th>'; }).join('') +
        '</tr></thead><tbody>' + rows.map(function (r) {
          var who = (r.users && (r.users.name || r.users.email)) || 'Signed-in customer';
          return '<tr><td><strong>' + esc(r.order_id || '—') + '</strong><br><small>' + when(r.created_at) + '</small></td>' +
            '<td>' + esc(who) + '</td>' +
            '<td>' + esc(r.reason || '') + (r.details ? '<br><small>' + esc(String(r.details).slice(0, 140)) + '</small>' : '') + '</td>' +
            '<td><span class="status">' + esc(RETURN_LABEL[r.status] || r.status) + '</span></td>' +
            '<td><select data-return="' + esc(r.id) + '" style="padding:8px 10px;border:1px solid rgba(0,0,0,.2);border-radius:6px;background:#fff;font:inherit">' +
            RETURN_OPTIONS.map(function (s) {
              return '<option value="' + s + '"' + (r.status === s ? ' selected' : '') + '>' + RETURN_LABEL[s] + '</option>';
            }).join('') + '</select></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p>No return requests yet.</p>') + '</div>';
  }

  /* ---------------- product manager ---------------- */
  function prodCardHtml(p) {
    var available = Math.max(0, Number(p.stock || 0) - Number(p.reserved_stock || 0));
    var pic = p.image
      ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy">'
      : '<div style="height:150px;display:flex;align-items:center;justify-content:center;opacity:.5;font-size:.85rem">No picture</div>';
    return '<article class="pro-prod-card' + (Number(p.active) ? '' : ' is-off') + '">' + pic +
      '<div class="pro-prod-body"><h4>' + esc(p.name) + '</h4><p>' + esc(p.category || '') + '</p>' +
      '<div class="pro-prod-num"><span>Price</span><strong>' + money(p.price) + '</strong></div>' +
      '<div class="pro-prod-num"><span>Available</span><strong>' + available + '</strong></div>' +
      '<div class="pro-prod-flags">' +
      '<span class="tag ' + (Number(p.active) ? 'tag-on' : 'tag-off') + '">' + (Number(p.active) ? 'Live' : 'Hidden') + '</span>' +
      (available > 0 ? '' : '<span class="tag tag-out">Sold out</span>') +
      (Number(p.reserved_stock || 0) > 0 ? '<span class="tag">' + Number(p.reserved_stock) + ' reserved</span>' : '') +
      '</div></div>' +
      '<div class="pro-prod-actions-row">' +
      '<button type="button" class="btn btn-sm" data-prod-edit="' + esc(p.id) + '">Edit</button>' +
      '<button type="button" class="btn btn-sm btn-danger" data-prod-del="' + esc(p.id) + '">Delete</button>' +
      '</div></article>';
  }

  function featuresText(v) {
    if (Array.isArray(v)) return v.join('\n');
    if (typeof v === 'string') {
      try { var a = JSON.parse(v); if (Array.isArray(a)) return a.join('\n'); } catch (e) {}
      return v;
    }
    return '';
  }

  function prodFormHtml(p) {
    var isNew = !p || !p.id;
    p = p || {};
    var active = (p.active === undefined || p.active === 1 || p.active === true || p.active === '1');
    return '<form id="productForm" class="pro-form pro-prod-form" style="margin:0 0 18px;padding:16px;border:1px solid rgba(0,0,0,.12);border-radius:14px">' +
      '<h4 class="pro-prod-wide" style="margin:0">' + (isNew ? 'Add a product' : 'Edit product') + '</h4>' +
      '<label>Name<input name="name" required maxlength="120" value="' + esc(p.name || '') + '" placeholder="Tailored Suit"></label>' +
      '<label>Price (₦)<input name="price" type="number" min="0" step="1" required value="' + esc(p.price === undefined ? '' : p.price) + '"></label>' +
      '<label>Category<input name="category" required maxlength="60" value="' + esc(p.category || '') + '" placeholder="Statement Menwear"></label>' +
      '<label>Stock available<input name="stock" type="number" min="0" step="1" required value="' + esc(p.stock === undefined ? '' : p.stock) + '"></label>' +
      '<label class="pro-prod-wide">Description<textarea name="description" rows="3" maxlength="900" placeholder="What the piece is, the fit, how to style it…">' + esc(p.description || '') + '</textarea></label>' +
      '<label>Material<input name="material" maxlength="120" value="' + esc(p.material || '') + '" placeholder="e.g. 100% cotton"></label>' +
      '<label class="pro-prod-wide">Features (one per line)<textarea name="features" rows="3" maxlength="600" placeholder="Premium packaging&#10;Secure checkout">' + esc(featuresText(p.features)) + '</textarea></label>' +
      '<label>Visibility<select name="active">' +
      '<option value="1"' + (active ? ' selected' : '') + '>Live — shown in the shop</option>' +
      '<option value="0"' + (active ? '' : ' selected') + '>Hidden — not shown</option></select></label>' +
      '<label class="pro-prod-wide">Picture<div class="pro-prod-img">' +
      '<img id="prodPreview" alt="Preview"' + (p.image ? ' src="' + esc(p.image) + '"' : ' style="display:none"') + '>' +
      '<div style="display:grid;gap:8px;flex:1 1 260px">' +
      '<input type="file" name="picture" accept="image/*">' +
      '<input name="image" value="' + esc(p.image || '') + '" placeholder="…or paste an image link">' +
      '</div></div></label>' +
      '<div class="pro-prod-actions">' +
      '<button class="btn" type="submit">' + (isNew ? 'Add product' : 'Save changes') + '</button>' +
      '<button class="btn btn-outline" type="button" data-prod-cancel>Cancel</button>' +
      '</div></form>';
  }

  function wireProductForm(box, dash) {
    var form = box.querySelector('#productForm');
    if (!form) return;
    var file = form.picture;
    var preview = box.querySelector('#prodPreview');
    file.addEventListener('change', function () {
      if (file.files && file.files[0]) {
        preview.src = URL.createObjectURL(file.files[0]);
        preview.style.display = '';
      }
    });
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      btn.classList.add('is-busy'); btn.disabled = true;
      var editing = state.productEdit;
      try {
        var payload = {
          name: form.name.value.trim(),
          price: Number(form.price.value),
          category: form.category.value.trim(),
          stock: Math.max(0, Math.round(Number(form.stock.value))),
          active: form.active.value === '1',
          image: form.image.value.trim(),
          description: form.description.value.trim(),
          material: form.material.value.trim(),
          features: form.features.value.split(/\r?\n|,/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 8)
        };
        if (file.files && file.files[0]) {
          var up = await window.FabluXAPI.adminUploadImage(file.files[0]);
          payload.image = up.url;
          var oldImg = (editing && editing.image) || '';
          var marker = '/storage/v1/object/public/product-images/';
          if (oldImg.indexOf(marker) >= 0 && oldImg !== up.url) {
            await window.FabluXAPI.adminDeleteImage(oldImg.split(marker)[1]);
          }
        }
        if (editing && editing.id) {
          await window.FabluXAPI.adminUpdateProduct(editing.id, payload);
          toast('Product updated');
        } else {
          await window.FabluXAPI.adminCreateProduct(payload);
          toast('Product added to the shop');
        }
        state.productEdit = null;
        var fresh = await refreshDash();
        return renderProducts(box, fresh || dash);
      } catch (e) {
        btn.classList.remove('is-busy'); btn.disabled = false;
        toast(e.message || 'Could not save the product');
      }
    });
  }

  async function refreshDash() {
    try { state.dash = await window.FabluXAPI.adminDashboard(); } catch (e) {}
    return state.dash;
  }

  async function renderProducts(box, dash) {
    var rows = await window.FabluXAPI.adminProducts();
    state.products = rows;
    var editing = state.productEdit;
    var form = editing === 'new' ? prodFormHtml(null)
      : (editing && editing.id ? prodFormHtml(editing) : '');

    box.innerHTML = headHtml(dash) +
      '<div class="pro-admin-section"><h3>Product manager</h3>' +
      '<p style="opacity:.8">Add products, upload their pictures, set the price and choose how many are available. Changes show in the shop straight away.</p>' +
      (form || '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:14px">' +
        '<button class="btn" type="button" data-prod-new>Add product</button>' +
        '<span style="opacity:.7">' + rows.length + ' product(s) in the catalogue</span></div>') +
      (rows.length ? '<div class="pro-prod-grid">' + rows.map(prodCardHtml).join('') + '</div>'
        : (form ? '' : '<div class="pro-empty"><p>No products yet — use “Add product” to create the first one.</p></div>')) +
      '</div>';

    wireProductForm(box, dash);
    Array.prototype.forEach.call(box.querySelectorAll('[data-prod-new]'), function (b) {
      b.addEventListener('click', function () { state.productEdit = 'new'; renderProducts(box, dash); });
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-prod-cancel]'), function (b) {
      b.addEventListener('click', function () { state.productEdit = null; renderProducts(box, dash); });
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-prod-edit]'), function (b) {
      b.addEventListener('click', function () {
        var row = rows.filter(function (p) { return String(p.id) === String(b.dataset.prodEdit); })[0];
        if (row) { state.productEdit = row; renderProducts(box, dash); }
      });
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-prod-del]'), function (b) {
      b.addEventListener('click', async function () {
        var row = rows.filter(function (p) { return String(p.id) === String(b.dataset.prodDel); })[0];
        if (!row) return;
        if (!window.confirm('Delete “' + row.name + '” from the shop?')) return;
        b.disabled = true;
        try {
          await window.FabluXAPI.adminDeleteProduct(row.id);
          var marker = '/storage/v1/object/public/product-images/';
          if (row.image && row.image.indexOf(marker) >= 0) {
            await window.FabluXAPI.adminDeleteImage(row.image.split(marker)[1]);
          }
          toast('Product deleted');
          state.productEdit = null;
          var fresh = await refreshDash();
          renderProducts(box, fresh || dash);
        } catch (e) { b.disabled = false; toast(e.message || 'Could not delete'); }
      });
    });
  }

  /* ---------------- promo codes ---------------- */
  function promoFormHtml(p) {
    var isNew = !p || !p.code;
    p = p || {};
    var active = (p.active === undefined || p.active === 1 || p.active === '1');
    return '<form id="promoForm" class="pro-form pro-prod-form" style="margin:0 0 18px;padding:16px;border:1px solid rgba(0,0,0,.12);border-radius:14px">' +
      '<h4 class="pro-prod-wide" style="margin:0">' + (isNew ? 'Create a promo code' : 'Edit promo code') + '</h4>' +
      '<label>Code<input name="code" required maxlength="24" value="' + esc(p.code || '') + '" placeholder="WELCOME10"' + (isNew ? '' : ' readonly') + '></label>' +
      '<label>Type<select name="kind">' +
      '<option value="percent"' + (p.kind !== 'amount' ? ' selected' : '') + '>Percentage off (%)</option>' +
      '<option value="amount"' + (p.kind === 'amount' ? ' selected' : '') + '>Amount off (₦)</option></select></label>' +
      '<label>Value<input name="value" type="number" min="1" step="1" required value="' + esc(p.value === undefined ? '' : p.value) + '"></label>' +
      '<label>Minimum order (₦)<input name="min_subtotal" type="number" min="0" step="1" value="' + esc(p.min_subtotal || 0) + '"></label>' +
      '<label>Uses allowed (0 = unlimited)<input name="max_uses" type="number" min="0" step="1" value="' + esc(p.max_uses || 0) + '"></label>' +
      '<label>Status<select name="active">' +
      '<option value="1"' + (active ? ' selected' : '') + '>Active — customers can use it</option>' +
      '<option value="0"' + (active ? '' : ' selected') + '>Off — rejected at checkout</option></select></label>' +
      '<div class="pro-prod-actions">' +
      '<button class="btn" type="submit">' + (isNew ? 'Create code' : 'Save changes') + '</button>' +
      '<button class="btn btn-outline" type="button" data-promo-cancel>Cancel</button>' +
      '</div></form>';
  }

  async function renderPromos(box, dash) {
    var rows = await window.FabluXAPI.adminPromos();
    state.promos = rows;
    var editing = state.promoEdit;
    var form = editing === 'new' ? promoFormHtml(null)
      : (editing && editing.code ? promoFormHtml(editing) : '');
    var body = rows.map(function (r) {
      var off = !Number(r.active);
      var used = Number(r.used_count || 0), max = Number(r.max_uses || 0);
      var val = r.kind === 'amount' ? money(r.value) : r.value + '%';
      return '<tr><td><strong>' + esc(r.code) + '</strong></td>' +
        '<td>' + val + '</td>' +
        '<td>' + (Number(r.min_subtotal) ? money(r.min_subtotal) : 'Any') + '</td>' +
        '<td>' + used + (max ? ' / ' + max : ' / ∞') + '</td>' +
        '<td><span class="tag ' + (off ? 'tag-off' : 'tag-on') + '">' + (off ? 'Off' : 'Active') + '</span></td>' +
        '<td style="display:flex;gap:8px"><button type="button" class="btn btn-sm" data-promo-edit="' + esc(r.code) + '">Edit</button>' +
        '<button type="button" class="btn btn-sm btn-danger" data-promo-del="' + esc(r.code) + '">Delete</button></td></tr>';
    }).join('');

    box.innerHTML = headHtml(dash) +
      '<div class="pro-admin-section"><h3>Promo codes</h3>' +
      '<p style="opacity:.8">Discounts are checked by the database at checkout — a code the store does not know can never reduce a total.</p>' +
      (form || '<div style="margin-bottom:14px"><button class="btn" type="button" data-promo-new>Create promo code</button></div>') +
      (rows.length ? '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr>' +
        ['Code', 'Discount', 'Min order', 'Used', 'Status', 'Action'].map(function (h) {
          return '<th style="text-align:left;padding:8px;border-bottom:1px solid rgba(0,0,0,.15)">' + h + '</th>';
        }).join('') + '</tr></thead><tbody>' + body + '</tbody></table></div>'
        : (form ? '' : '<div class="pro-empty"><p>No promo codes yet.</p></div>')) +
      '</div>';

    var formEl = box.querySelector('#promoForm');
    if (formEl) {
      formEl.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var btn = formEl.querySelector('button[type="submit"]');
        btn.classList.add('is-busy'); btn.disabled = true;
        var editing2 = state.promoEdit;
        try {
          await window.FabluXAPI.adminSavePromo({
            code: formEl.code.value,
            kind: formEl.kind.value,
            value: formEl.value.value,
            minSubtotal: formEl.min_subtotal.value,
            maxUses: formEl.max_uses.value,
            active: formEl.active.value === '1',
            usedCount: editing2 && editing2.code ? editing2.used_count : 0,
            createdAt: editing2 && editing2.code ? editing2.created_at : null
          });
          toast('Promo code saved');
          state.promoEdit = null;
          renderPromos(box, dash);
        } catch (e) {
          btn.classList.remove('is-busy'); btn.disabled = false;
          toast(e.message || 'Could not save the code');
        }
      });
    }
    Array.prototype.forEach.call(box.querySelectorAll('[data-promo-new]'), function (b) {
      b.addEventListener('click', function () { state.promoEdit = 'new'; renderPromos(box, dash); });
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-promo-cancel]'), function (b) {
      b.addEventListener('click', function () { state.promoEdit = null; renderPromos(box, dash); });
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-promo-edit]'), function (b) {
      b.addEventListener('click', function () {
        var row = rows.filter(function (r) { return r.code === b.dataset.promoEdit; })[0];
        if (row) { state.promoEdit = row; renderPromos(box, dash); }
      });
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-promo-del]'), function (b) {
      b.addEventListener('click', async function () {
        if (!window.confirm('Delete promo code ' + b.dataset.promoDel + '?')) return;
        b.disabled = true;
        try {
          await window.FabluXAPI.adminDeletePromo(b.dataset.promoDel);
          toast('Promo code deleted');
          state.promoEdit = null;
          renderPromos(box, dash);
        } catch (e) { b.disabled = false; toast(e.message || 'Could not delete'); }
      });
    });
  }

  /* ---------------- customers ---------------- */
  async function renderCustomers(box, dash) {
    var rows = await window.FabluXAPI.adminCustomers();
    var body = rows.map(function (u) {
      return '<tr><td><strong>' + esc(u.name || '—') + '</strong><br><small>' + esc(u.role === 'admin' ? 'Administrator' : 'Customer') + '</small></td>' +
        '<td>' + esc(u.email || '') + '<br><small>' + esc(u.phone || '') + '</small></td>' +
        '<td>' + (u.orderCount || 0) + '</td>' +
        '<td>' + when(u.created_at) + '</td></tr>';
    }).join('');
    box.innerHTML = headHtml(dash) +
      '<div class="pro-admin-section"><h3>Customers</h3>' +
      (rows.length ? '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr>' +
        ['Name', 'Contact', 'Orders', 'Joined'].map(function (h) {
          return '<th style="text-align:left;padding:8px;border-bottom:1px solid rgba(0,0,0,.15)">' + h + '</th>';
        }).join('') + '</tr></thead><tbody>' + body + '</tbody></table></div>'
        : '<div class="pro-empty"><p>No registered customers yet.</p></div>') +
      '</div>';
  }

  async function render(box, dash) {
    state.dash = dash;
    if (state.order) return openOrder(box, dash, state.order.reference);
    if (state.tab === 'orders') return renderOrders(box, dash);
    if (state.tab === 'products') return renderProducts(box, dash);
    if (state.tab === 'returns') return renderReturns(box, dash);
    if (state.tab === 'promos') return renderPromos(box, dash);
    if (state.tab === 'customers') return renderCustomers(box, dash);
    if (state.tab === 'settings') return renderSettings(box, dash);
    if (state.tab === 'notifications') return renderNotifications(box, dash);
    if (state.tab === 'audit') return renderAudit(box, dash);
  }

  window.FabluXAdmin = {
    render: async function (box) {
      var dash = await window.FabluXAPI.adminDashboard();
      box.addEventListener('click', function (ev) {
        var b = ev.target.closest && ev.target.closest('[data-tab]');
        if (!b) return;
        state.tab = b.dataset.tab; state.order = null;
        state.productEdit = null; state.promoEdit = null;
        render(box, dash);
      });
      box.addEventListener('change', function (ev) {
        var s = ev.target.closest && ev.target.closest('[data-return]');
        if (!s) return;
        window.FabluXAPI.adminReturnStatus(s.dataset.return, s.value)
          .then(function () { toast('Return status updated'); return render(box, dash); })
          .catch(function (e) { toast(e && e.message ? e.message : 'Could not update the return'); });
      });
      return render(box, dash);
    }
  };
})();
