/* Site tools: theme switch, language, reading progress.
   Language uses Google's website translator so every page (headings, copy,
   labels) is translated into the chosen language, not just the navigation. */
(function () {
  'use strict';
  var root = document.documentElement;
  var THEME_KEY = 'fablux_theme', LANG_KEY = 'fablux_lang';

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>';
  var SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/></svg>';

  /* Real languages, native names, Google Translate codes. */
  var LANGS = [
    ['en', 'English'], ['af', 'Afrikaans'], ['sq', 'Shqip'], ['am', 'አማርኛ'],
    ['ar', 'العربية'], ['hy', 'Հայերեն'], ['az', 'Azərbaycan'], ['eu', 'Euskara'],
    ['be', 'Беларуская'], ['bn', 'বাংলা'], ['bs', 'Bosanski'], ['bg', 'Български'],
    ['ca', 'Català'], ['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['hr', 'Hrvatski'],
    ['cs', 'Čeština'], ['da', 'Dansk'], ['nl', 'Nederlands'], ['et', 'Eesti'],
    ['fil', 'Filipino'], ['fi', 'Suomi'], ['fr', 'Français'], ['gl', 'Galego'],
    ['ka', 'ქართული'], ['de', 'Deutsch'], ['el', 'Ελληνικά'], ['gu', 'ગુજરાતી'],
    ['ht', 'Kreyòl ayisyen'], ['ha', 'Hausa'], ['he', 'עברית'], ['hi', 'हिन्दी'],
    ['hu', 'Magyar'], ['is', 'Íslenska'], ['ig', 'Igbo'], ['id', 'Indonesia'],
    ['ga', 'Gaeilge'], ['it', 'Italiano'], ['ja', '日本語'], ['kn', 'ಕನ್ನಡ'],
    ['kk', 'Қазақ'], ['km', 'ខ្មែរ'], ['ko', '한국어'], ['lo', 'ລາວ'],
    ['lv', 'Latviešu'], ['lt', 'Lietuvių'], ['mk', 'Македонски'], ['ms', 'Melayu'],
    ['ml', 'മലയാളം'], ['mt', 'Malti'], ['mr', 'मराठी'], ['mn', 'Монгол'],
    ['my', 'မြန်မာ'], ['ne', 'नेपाली'], ['no', 'Norsk'], ['fa', 'فارسی'],
    ['pl', 'Polski'], ['pt', 'Português'], ['pa', 'ਪੰਜਾਬੀ'], ['ro', 'Română'],
    ['ru', 'Русский'], ['sr', 'Српски'], ['sk', 'Slovenčina'], ['sl', 'Slovenščina'],
    ['es', 'Español'], ['sw', 'Kiswahili'], ['sv', 'Svenska'], ['ta', 'தமிழ்'],
    ['te', 'తెలుగు'], ['th', 'ไทย'], ['tr', 'Türkçe'], ['uk', 'Українська'],
    ['ur', 'اردو'], ['uz', 'O‘zbek'], ['vi', 'Tiếng Việt'], ['cy', 'Cymraeg'],
    ['yi', 'ייִדיש'], ['yo', 'Yorùbá'], ['zu', 'isiZulu']
  ];

  /* ---- theme ---- */
  function applyTheme(t) {
    if (t === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
  }
  function refreshTheme() {
    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    var light = root.getAttribute('data-theme') === 'light';
    var icon = btn.querySelector('.theme-icon');
    if (icon) icon.innerHTML = light ? SUN : MOON;
    var label = light ? 'Switch to dark mode' : 'Switch to light mode';
    btn.setAttribute('aria-pressed', String(light));
    btn.setAttribute('aria-label', label);
    btn.title = label;
  }
  applyTheme(get(THEME_KEY) === 'light' ? 'light' : 'dark');

  /* ---- language (Google website translator) ---- */
  function googleCookie(code) {
    var d = location.hostname;
    if (code === 'en') {
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.' + d;
    } else {
      document.cookie = 'googtrans=/en/' + code + '; path=/';
      document.cookie = 'googtrans=/en/' + code + '; path=/; domain=.' + d;
    }
  }
  /* Google translates on load from the googtrans cookie; driving its own
     hidden <select> afterwards is the reliable fallback when the cookie is
     ignored (private mode, blocked storage, host quirks). */
  function applyTranslator(code, attempt) {
    attempt = attempt || 0;
    var combo = document.querySelector('.goog-te-combo');
    if (combo) {
      if (combo.value !== code) {
        combo.value = code;
        combo.dispatchEvent(new Event('change'));
      }
      return;
    }
    if (attempt < 24) setTimeout(function () { applyTranslator(code, attempt + 1); }, 250);
  }

  function loadTranslator(code) {
    var existing = document.getElementById('gt-script');
    if (existing) { applyTranslator(code); return; }
    var host = document.getElementById('google_translate_element');
    if (!host) {
      host = document.createElement('div');
      host.id = 'google_translate_element';
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden';
      document.body.appendChild(host);
    }
    window.googleTranslateElementInit = function () {
      try {
        new window.google.translate.TranslateElement(
          { pageLanguage: 'en', autoDisplay: false },
          'google_translate_element'
        );
      } catch (e) {}
      if (code && code !== 'en') applyTranslator(code);
    };
    var s = document.createElement('script');
    s.id = 'gt-script';
    s.async = true;
    s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    document.body.appendChild(s);
  }

  /* ---- build controls ---- */
  function build() {
    var nav = document.querySelector('header nav') || document.querySelector('nav');
    if (!nav || nav.querySelector('.site-tools')) return;
    var wrap = document.createElement('div');
    wrap.className = 'site-tools notranslate';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Display and language');
    wrap.setAttribute('translate', 'no');

    var items = LANGS.map(function (l) {
      return '<button type="button" data-code="' + l[0] + '" lang="' + l[0] + '">' + l[1] + '</button>';
    }).join('');

    var savedCode = get(LANG_KEY) || 'en';

    wrap.innerHTML =
      '<button type="button" class="site-tool" id="themeToggle" aria-pressed="false" title="Switch to light mode">' +
        '<span class="theme-icon">' + MOON + '</span></button>' +
      '<details class="site-lang" id="langMenu">' +
        '<summary class="site-tool site-lang-btn" title="Language" aria-label="Language">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"/></svg>' +
          '<span class="lang-code">' + savedCode.toUpperCase() + '</span>' +
        '</summary>' +
        '<div class="lang-panel" role="group" aria-label="Choose a language">' + items + '</div>' +
      '</details>' +
      '<button type="button" class="site-tool site-progress" id="readProgress" title="Reading progress — activate to return to top">' +
        '<svg viewBox="0 0 20 20" aria-hidden="true">' +
          '<circle class="ring-track" cx="10" cy="10" r="8" fill="none" stroke-width="2.4"/>' +
          '<circle class="ring-fill" cx="10" cy="10" r="8" fill="none" stroke-width="2.4" stroke-linecap="round" transform="rotate(-90 10 10)"/>' +
        '</svg></button>';
    nav.insertBefore(wrap, nav.querySelector('.menu-toggle') || null);

    var btn = wrap.querySelector('#themeToggle');
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      applyTheme(next);
      set(THEME_KEY, next);
      refreshTheme();
    });

    var menu = wrap.querySelector('#langMenu');
    var panel = menu.querySelector('.lang-panel');
    var codeEl = menu.querySelector('.lang-code');
    [].forEach.call(panel.querySelectorAll('button'), function (b) {
      if (b.getAttribute('data-code') === savedCode) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', function () {
        var code = b.getAttribute('data-code');
        set(LANG_KEY, code);
        root.lang = code;
        codeEl.textContent = code.toUpperCase();
        googleCookie(code);
        location.reload();
      });
    });
    document.addEventListener('click', function (e) {
      if (menu.open && !menu.contains(e.target)) menu.open = false;
    });
    menu.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { menu.open = false; menu.querySelector('summary').focus(); }
    });
  }

  /* Keep page content clear of the fixed header, whose height changes when the
     navigation wraps onto a second row. */
  function syncHeader() {
    var h = document.querySelector('header');
    if (h) root.style.setProperty('--header-h', h.offsetHeight + 'px');
  }

  /* ---- reading progress ---- */
  function initProgress() {
    var btn = document.getElementById('readProgress');
    if (!btn) return;
    var fill = btn.querySelector('.ring-fill');
    var C = 2 * Math.PI * 8;
    var ticking = false;
    function update() {
      ticking = false;
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      var top = window.pageYOffset || h.scrollTop || 0;
      var pct = max > 4 ? Math.min(100, Math.max(0, top / max * 100)) : 0;
      if (fill) fill.style.strokeDashoffset = String(C * (1 - pct / 100));
      btn.setAttribute('aria-label', 'Reading progress: ' + Math.round(pct) + '%. Activate to return to top');
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    btn.addEventListener('click', function () {
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); }
      catch (e) { window.scrollTo(0, 0); }
    });
    update();
  }

  function init() {
    build();
    var saved = get(LANG_KEY) || 'en';
    root.lang = saved;
    if (saved !== 'en') loadTranslator(saved);
    else if (/(^|;\s*)googtrans=/.test(document.cookie)) googleCookie('en');
    refreshTheme();
    initProgress();
    syncHeader();
    window.addEventListener('resize', syncHeader, { passive: true });
    window.addEventListener('load', syncHeader);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
