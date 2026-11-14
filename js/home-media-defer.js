/* Deferred embeds on the WAX creator page.
 * Third-party players load ONLY after the visitor activates that video.
 * This module does not import or modify the Moonboy Builder or game state.
 */
(() => {
  'use strict';
  const SAFE_EMBEDS = new Set(['www.youtube.com', 'rumble.com']);
  for (const button of document.querySelectorAll('button[data-media-activate]')) {
    button.addEventListener('click', () => {
      const frame = button.previousElementSibling;
      if (!frame || frame.tagName !== 'IFRAME' || !frame.hidden) return;
      const original = frame.dataset.src;
      if (!original) return;
      let url;
      try { url = new URL(original, window.location.href); }
      catch { return; }
      if (url.protocol !== 'https:' || !SAFE_EMBEDS.has(url.hostname) ||
          !url.pathname.startsWith('/embed/')) return;
      // Click is an explicit user gesture. Ask the provider to start playback;
      // the provider/browser may still require a second click due to autoplay policy.
      url.searchParams.set('autoplay', '1');
      frame.loading = 'eager';
      frame.src = url.href;
      frame.hidden = false;
      button.hidden = true;
    }, { once: true });
  }
})();
