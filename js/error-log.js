/* FabluX.U.Design — lightweight client error logging.
   Keeps the last 20 errors in localStorage (so support can ask a customer to
   export them) and, if window.FABLUX_LOG_ENDPOINT is configured, sends a
   best-effort beacon. No personal data is collected. */
(function () {
  'use strict';
  var KEY = 'fablux_error_log_v1';
  var MAX = 20;

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }
  function push(entry) {
    try {
      var list = read();
      list.unshift(entry);
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    } catch (e) {}
    try { console.error('[FabluX]', entry.message); } catch (e) {}
    if (window.FABLUX_LOG_ENDPOINT && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(window.FABLUX_LOG_ENDPOINT,
          new Blob([JSON.stringify(entry)], { type: 'application/json' }));
      } catch (e) {}
    }
  }

  window.addEventListener('error', function (e) {
    push({
      type: 'error', message: String((e && e.message) || 'Unknown error'),
      source: (e && e.filename) || '', line: (e && e.lineno) || 0,
      column: (e && e.colno) || 0, page: location.pathname, ts: new Date().toISOString()
    });
  });

  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    push({
      type: 'rejection', message: String((r && r.message) || r || 'Unhandled rejection'),
      page: location.pathname, ts: new Date().toISOString()
    });
  });

  window.FabluXErrors = {
    list: read,
    clear: function () { try { localStorage.removeItem(KEY); } catch (e) {} }
  };
})();
