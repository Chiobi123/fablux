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

  var state = { tab: 'orders', search: '', status: '', payment: '', order: null };

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
    var tabs = [['orders', 'Orders'], ['settings', 'Store settings'], ['notifications', 'Notifications'], ['audit', 'Audit trail']];
    return '<div class="pro-admin-nav" style="margin-bottom:18px;flex-wrap:wrap;display:flex;gap:10px">' +
      tabs.map(function (t) {
        return '<button class="btn' + (state.tab === t[0] ? '' : ' pro-card-link') + '" data-tab="' + t[0] + '" style="cursor:pointer">' + t[1] + '</button>';
      }).join('') + '<a class="btn" href="waybill.html">Print waybill</a></div>';
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
    box.innerHTML = '<div class="section-title"><span>FABLUX ADMIN</span><h2>Store Control Center</h2><p>Orders, payment confirmation, dispatch and delivery.</p></div>' +
      '<div class="fablux-admin-grid">' +
      '<div class="fablux-admin-stat">Products<strong>' + dash.stats.products + '</strong></div>' +
      '<div class="fablux-admin-stat">Customers<strong>' + dash.stats.customers + '</strong></div>' +
      '<div class="fablux-admin-stat">Orders<strong>' + dash.stats.orders + '</strong></div>' +
      '<div class="fablux-admin-stat">Reviews<strong>' + dash.stats.reviews + '</strong></div>' +
      '<div class="fablux-admin-stat">Pending emails<strong>' + dash.stats.pendingAlerts + '</strong></div>' +
      '</div>' + tabsHtml() +
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
    box.innerHTML = tabsHtml() +
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
      '<label class="switch"><input id="emailToggle" type="checkbox" ' + (s.emailConfigured ? 'checked' : '') + '> Email sending enabled</label></div>' +
      '<div class="pro-admin-section"><h3>Marketplace</h3>' +
      '<label class="switch"><input id="mktToggle" type="checkbox" ' + (dash.marketplaceEnabled ? 'checked' : '') + '> Enable Marketplace</label></div>';

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
    box.querySelector('#mktToggle').addEventListener('change', async function (e) {
      try { await window.FabluXAPI.adminMarketplace(e.target.checked); toast(e.target.checked ? 'Marketplace enabled' : 'Marketplace disabled'); }
      catch (err) { e.target.checked = !e.target.checked; toast(err.message); }
    });
  }

  async function renderNotifications(box, dash) {
    var rows = await window.FabluXAPI.adminNotifications(100);
    box.innerHTML = tabsHtml() + '<div class="pro-admin-section"><h3>Notification outbox</h3>' +
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
    box.innerHTML = tabsHtml() + '<div class="pro-admin-section"><h3>Audit trail</h3>' +
      (rows.length ? '<ul class="fablux-events">' + rows.map(function (a) {
        return '<li><strong>' + esc(a.action) + ' — ' + esc(a.entity || '') + ' ' + esc(a.entity_id || '') + '</strong><span>' +
          esc(a.actor_email || 'system') + ' · ' + when(a.created_at) + (a.detail ? ' · ' + esc(JSON.stringify(a.detail)) : '') + '</span></li>';
      }).join('') + '</ul>' : '<p>No audit entries yet.</p>') + '</div>';
  }

  async function render(box, dash) {
    if (state.order) return openOrder(box, dash, state.order.reference);
    if (state.tab === 'orders') return renderOrders(box, dash);
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
        render(box, dash);
      });
      return render(box, dash);
    }
  };
})();
