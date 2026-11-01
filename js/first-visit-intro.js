/* Optional first-visit Bad Days entrance. Never redirects or replaces the real homepage. */
(function () {
  'use strict';

  var KEY = 'cm-bad-days-intro-seen-v1';
  var MESSAGE = 'cm:bad-days-intro:enter';

  // Only the canonical homepage gets the automatic entrance.
  // Deep links, /index.html, embeds and returning visitors are unaffected.
  if (window.top !== window.self || window.location.pathname !== '/') return;
  try {
    if (window.localStorage.getItem(KEY) === '1') return;
  } catch (_) {
    // If storage is unavailable, leave the homepage accessible.
    return;
  }

  function init() {
    if (document.getElementById('cm-bad-days-intro')) return;

    var dialog = document.createElement('dialog');
    dialog.id = 'cm-bad-days-intro';
    dialog.setAttribute('aria-label', 'Crypto Moonboys Bad Days first-visit introduction');

    var frame = document.createElement('iframe');
    frame.title = 'Crypto Moonboys Bad Days — Enter the Multiverse';
    frame.src = '/enter.html?embedded=1';
    dialog.appendChild(frame);
    document.body.appendChild(dialog);

    function markSeen() {
      try { window.localStorage.setItem(KEY, '1'); } catch (_) {}
    }

    function cleanup() {
      window.removeEventListener('message', onEnter);
      if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
    }

    function onEnter(event) {
      // Require a message from this exact same-origin splash frame.
      if (event.origin !== window.location.origin ||
          event.source !== frame.contentWindow ||
          event.data !== MESSAGE) return;
      markSeen();
      if (dialog.open) dialog.close();
      cleanup();
    }

    window.addEventListener('message', onEnter);
    dialog.addEventListener('cancel', markSeen); // Esc is another safe Skip route.
    dialog.addEventListener('close', cleanup);

    try {
      dialog.showModal();
    } catch (_) {
      // Unsupported dialogs or unusual embedded contexts fail open to the site.
      cleanup();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
}());
