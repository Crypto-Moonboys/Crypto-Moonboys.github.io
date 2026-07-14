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
 *   - Primary "Open Telegram Bot" button opens the Telegram bot in the current tab.
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
    '<div class="tg-sync-cta" role="note" aria-label="Open the Telegram bot to sync Arcade XP">' +
      '<span class="tg-sync-cta-icon" aria-hidden="true">🔗</span>' +
      '<div class="tg-sync-cta-body">' +
        '<strong>Link Telegram — sync Arcade XP</strong>' +
        '<span>' +
          'Open the Telegram bot, press Start, then run <code>/gkstart</code> and <code>/gklink</code>. ' +
          'Use the signed link the bot sends you to connect your website identity and store Arcade XP server-side. ' +
          '<a href="' + INCUBATOR_HREF + '">Learn more</a>.' +
        '</span>' +
      '</div>' +
      '<a href="' + BOT_HREF + '" class="swarmsy-action-card tg-sync-cta-btn"><strong>Open Telegram Bot</strong><span>Press Start, then run /gkstart and /gklink.</span></a>' +
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