/**
 * telegram-sync-cta.js
 *
 * Reusable Telegram sync / link CTA component.
 * Mounts on every element with a [data-tg-sync-cta] attribute.
 *
 * Usage:
 *   1. Add <div data-tg-sync-cta></div> anywhere in a page.
 *   2. Load this script (regular non-module script, data-cfasync="false").
 *
 * The rendered banner:
 *   - Explains that /gklink syncs Arcade XP server-side for Telegram-linked users.
 *   - Primary "Link Telegram" button opens the Telegram bot (https://t.me/WIKICOMSBOT).
 *   - Secondary info link leads to /gkniftyheads-incubator.html for more details.
 *   - Fits within the viewport on desktop and mobile (no horizontal overflow).
 *
 * Terminology (canonical):
 *   Score        = leaderboard ranking only
 *   Arcade XP    = server-stored shared progression for Telegram-linked users
 *   Block Topia XP = in-game progression only
 */
(function () {
  'use strict';

  var BOT_HREF        = 'https://t.me/WIKICOMSBOT';
  var INCUBATOR_HREF  = '/gkniftyheads-incubator.html';

  var TEMPLATE =
    '<div class="tg-sync-cta" role="note" aria-label="Link Telegram to sync Arcade XP">' +
      '<span class="tg-sync-cta-icon" aria-hidden="true">🔗</span>' +
      '<div class="tg-sync-cta-body">' +
        '<strong>Link Telegram — sync Arcade XP</strong>' +
        '<span>' +
          'Use <code>/gklink</code> in the Telegram bot to store Arcade XP server-side. ' +
          'Telegram-linked users earn persistent Arcade XP across sessions. ' +
          'Unlinked users have local/browser-only progress. ' +
          '<a href="' + INCUBATOR_HREF + '">Learn more</a>.' +
        '</span>' +
      '</div>' +
      '<a href="' + BOT_HREF + '" class="btn btn-primary tg-sync-cta-btn" target="_blank" rel="noopener noreferrer">Link Telegram</a>' +
    '</div>';

  function mount(el) {
    if (el.dataset.tgSyncCtaMounted) return;
    el.dataset.tgSyncCtaMounted = '1';
    el.innerHTML = TEMPLATE;
  }

  function mountAll() {
    var nodes = document.querySelectorAll('[data-tg-sync-cta]');
    for (var i = 0; i < nodes.length; i++) {
      mount(nodes[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }
}());
