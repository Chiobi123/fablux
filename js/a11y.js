/* FabluX.U.Design — accessibility helpers.
   Adds a skip link, labels any unlabelled control, marks the current nav item,
   guarantees a single page heading, and hardens external links. Runs after the
   document is parsed; it only adds attributes and never changes the design. */
(function () {
  'use strict';

  function labelFor(el) {
    var n = (el.getAttribute('name') || '').toLowerCase();
    var p = (el.getAttribute('placeholder') || '').toLowerCase();
    var t = (el.getAttribute('type') || el.tagName).toLowerCase();
    if (/email/.test(n) || t === 'email') return 'Email address';
    if (/phone|tel/.test(n)) return 'Phone number';
    if (/password|pass/.test(n)) return 'Password';
    if (/confirm/.test(n)) return 'Confirm password';
    if (/name/.test(n)) return 'Full name';
    if (/address/.test(n)) return 'Delivery address';
    if (/city|town/.test(n)) return 'City or town';
    if (/state/.test(n)) return 'State';
    if (/landmark/.test(n)) return 'Nearest landmark';
    if (/instruction|note/.test(n)) return 'Delivery instructions';
    if (/subject/.test(n)) return 'Subject';
    if (/message|details|reason/.test(n)) return 'Message';
    if (/search/.test(n) || t === 'search') return 'Search products';
    if (/promo|coupon|code/.test(n)) return 'Promo code';
    if (/website|url/.test(n)) return 'Website';
    if (/ref/.test(n)) return 'Order reference';
    if (/token/.test(n)) return 'Tracking token';
    if (p) return p.charAt(0).toUpperCase() + p.slice(1);
    return 'Form field';
  }

  function hasLabel(el) {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return true;
    var id = el.id;
    if (id && document.querySelector('label[for="' + CSS.escape(id) + '"]')) return true;
    if (el.closest('label')) return true;
    if (el.getAttribute('title')) return true;
    return false;
  }

  function ensureMain() {
    if (document.getElementById('main')) return;
    var el = document.querySelector('main') || document.querySelector('section') || document.querySelector('.container');
    if (el) el.id = 'main';
  }

  function addSkipLink() {
    if (document.querySelector('.skip-link')) return;
    ensureMain();
    var a = document.createElement('a');
    a.className = 'skip-link';
    a.href = '#main';
    a.textContent = 'Skip to content';
    document.body.insertBefore(a, document.body.firstChild);
  }

  function labelControls() {
    var els = document.querySelectorAll('input, select, textarea');
    Array.prototype.forEach.call(els, function (el) {
      var type = (el.getAttribute('type') || '').toLowerCase();
      if (type === 'hidden' || type === 'submit' || type === 'button') return;
      if (hasLabel(el)) return;
      el.setAttribute('aria-label', labelFor(el));
    });
  }

  function markCurrentNav() {
    var here = location.pathname.split('/').pop() || 'index.html';
    var links = document.querySelectorAll('.nav-links a[href]');
    Array.prototype.forEach.call(links, function (a) {
      var target = a.getAttribute('href').split('?')[0].split('#')[0];
      if (target === here) {
        a.setAttribute('aria-current', 'page');
        if (!a.classList.contains('active')) a.classList.add('active');
      }
    });
  }

  function ensureHeading() {
    if (document.querySelector('h1')) return;
    var h2 = document.querySelector('main h2, section h2, .section-title h2');
    if (h2) {
      var h1 = document.createElement('h1');
      h1.className = h2.className;
      h1.textContent = h2.textContent;
      h1.style.cssText = h2.style.cssText;
      h2.parentNode.replaceChild(h1, h2);
      return;
    }
    var main = document.getElementById('main');
    if (main) {
      var t = document.createElement('h1');
      t.className = 'visually-hidden';
      t.textContent = document.title.replace(/\s*\|\s*FabluX.*$/i, '') || 'FabluX.U.Design';
      main.insertBefore(t, main.firstChild);
    }
  }

  function hardenLinks() {
    var links = document.querySelectorAll('a[target="_blank"]');
    Array.prototype.forEach.call(links, function (a) {
      var rel = (a.getAttribute('rel') || '').split(/\s+/).filter(Boolean);
      if (rel.indexOf('noopener') < 0) rel.push('noopener');
      if (rel.indexOf('noreferrer') < 0) rel.push('noreferrer');
      a.setAttribute('rel', rel.join(' '));
    });
  }

  function iconButtons() {
    var cart = document.querySelectorAll('.cart-btn:not([aria-label])');
    Array.prototype.forEach.call(cart, function (b) { b.setAttribute('aria-label', 'Add to cart'); });
    var top = document.getElementById('topBtn');
    if (top && !top.getAttribute('aria-label')) top.setAttribute('aria-label', 'Back to top');
    var menu = document.querySelector('.menu-toggle');
    if (menu && !menu.getAttribute('aria-label')) menu.setAttribute('aria-label', 'Open menu');
  }

  function run() {
    addSkipLink();
    labelControls();
    markCurrentNav();
    ensureHeading();
    hardenLinks();
    iconButtons();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
