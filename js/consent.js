/* FabluX.U.Design — cookie / consent banner.
   Analytics and any non-essential third party stay OFF until the visitor
   explicitly accepts. The choice is stored locally and can be changed from
   cookies.html at any time. */
(function () {
  'use strict';
  var KEY = 'fablux_consent_v1';

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function save(analytics) {
    var v = { analytics: !!analytics, ts: new Date().toISOString(), version: 1 };
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {}
    apply(v);
    return v;
  }
  window.FabluXConsent = { get: read, set: save };

  function injectStyle() {
    if (document.getElementById('fxConsentStyle')) return;
    var s = document.createElement('style');
    s.id = 'fxConsentStyle';
    s.textContent =
      '.fx-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:99999;max-width:760px;margin:0 auto;' +
      'background:#141018;color:#f3eefb;border:1px solid rgba(212,175,55,.45);border-radius:14px;' +
      'box-shadow:0 18px 50px rgba(0,0,0,.5);padding:18px 20px;font-family:Poppins,Arial,sans-serif;font-size:14px;line-height:1.5}' +
      '.fx-consent p{margin:0 0 12px}' +
      '.fx-consent a{color:#e7c766;text-decoration:underline}' +
      '.fx-consent .fx-consent-actions{display:flex;gap:10px;flex-wrap:wrap}' +
      '.fx-consent button{cursor:pointer;border-radius:999px;padding:9px 18px;font:inherit;font-weight:600;border:1px solid transparent}' +
      '.fx-consent .fx-accept{background:#7B2CBF;color:#fff}' +
      '.fx-consent .fx-decline{background:transparent;color:#f3eefb;border-color:rgba(255,255,255,.4)}' +
      '.fx-consent button:focus-visible,.skip-link:focus{outline:3px solid #e7c766;outline-offset:3px}' +
      '.skip-link{position:absolute;left:-9999px;top:8px;z-index:100000;background:#fff;color:#111;padding:10px 16px;border-radius:8px}' +
      '.skip-link:focus{left:8px}' +
      '.consent-row{display:flex;gap:8px;align-items:flex-start;font-size:.85rem;margin-top:8px;line-height:1.4}' +
      '.consent-row input{margin-top:3px}';
    (document.head || document.documentElement).appendChild(s);
  }

  function apply(v) {
    var granted = !!(v && v.analytics);
    document.documentElement.setAttribute('data-consent', granted ? 'granted' : 'denied');
    if (granted) loadAnalytics();
    var banner = document.getElementById('fxConsent');
    if (banner) banner.remove();
  }

  function loadAnalytics() {
    if (window.__fxAnalyticsLoaded) return;
    window.__fxAnalyticsLoaded = true;
    /* No third-party analytics ship by default. To enable a provider, set
       window.FABLUX_ANALYTICS_SRC below (e.g. a privacy-friendly script) and
       it is only ever injected after consent. */
    if (window.FABLUX_ANALYTICS_SRC) {
      var s = document.createElement('script');
      s.src = window.FABLUX_ANALYTICS_SRC;
      s.defer = true;
      document.head.appendChild(s);
    }
  }

  function show() {
    injectStyle();
    if (document.getElementById('fxConsent')) return;
    var box = document.createElement('div');
    box.id = 'fxConsent';
    box.className = 'fx-consent';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Cookie and privacy choices');
    box.innerHTML =
      '<p><strong>Your privacy.</strong> We use essential storage to run the shop (cart and sign-in). ' +
      'Analytics stay off unless you accept. Read our <a href="cookies.html">cookie policy</a> and ' +
      '<a href="privacy.html">privacy policy</a>.</p>' +
      '<div class="fx-consent-actions">' +
      '<button type="button" class="fx-accept">Accept analytics</button>' +
      '<button type="button" class="fx-decline">Essential only</button>' +
      '</div>';
    document.body.appendChild(box);
    box.querySelector('.fx-accept').addEventListener('click', function () { save(true); });
    box.querySelector('.fx-decline').addEventListener('click', function () { save(false); });
    box.querySelector('.fx-accept').focus();
  }

  function boot() {
    var v = read();
    if (v) apply(v);
    else if (document.body) show();
    else document.addEventListener('DOMContentLoaded', show, { once: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
