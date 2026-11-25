/* Presentation-only Telegram host fullscreen for game destinations. */
(function () {
  'use strict';
  if (window.__moonboysGameFullscreenInstalled) return;
  window.__moonboysGameFullscreenInstalled = true;
  var screen = window.screen;
  if (!screen || Number(screen.width) < 1024 || Number(screen.height) < 600) return;
  var attempted = false;
  function apply(app) {
    if (!app || !/^(web|weba|webk)$/i.test(String(app.platform || ''))) return;
    if (attempted || app.isFullscreen) return;
    attempted = true;
    try {
      if (typeof app.expand === 'function') app.expand();
      if (typeof app.isVersionAtLeast === 'function' && app.isVersionAtLeast('8.0') &&
          typeof app.requestFullscreen === 'function') app.requestFullscreen();
    } catch (_) { /* Keep the expanded panel if the host declines. */ }
  }
  function start() {
    // Telegram Web runs the Mini App in a frame, not a normal top-level tab.
    if (window.parent === window) return;
    var app = window.Telegram && window.Telegram.WebApp;
    if (app && app.platform && app.platform !== 'unknown') { apply(app); return; }
    var hint = false;
    try {
      var hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      hint = /^(web|weba|webk)$/i.test(hash.get('tgWebAppPlatform') || '') ||
        window.sessionStorage.getItem('moonboys.telegram.largeWeb') === '1';
    } catch (_) {}
    if (!hint) return;
    // The launcher stores Telegram's original SDK launch metadata in this
    // browsing session. Load the SDK only for a likely Web Mini App.
    var existing = document.querySelector('script[src*="telegram.org/js/telegram-web-app.js"]');
    if (existing) {
      existing.addEventListener('load', function () { apply(window.Telegram && window.Telegram.WebApp); }, { once: true });
      return;
    }
    var sdk = document.createElement('script');
    sdk.src = 'https://telegram.org/js/telegram-web-app.js?63';
    sdk.setAttribute('data-cfasync', 'false');
    sdk.onload = function () { apply(window.Telegram && window.Telegram.WebApp); };
    document.head.appendChild(sdk);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}());
