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
 *   - Uses Telegram Web as the primary browser-safe route.
 *   - Provides a direct Telegram app deep link as an alternative.
 *   - Secondary info link leads to /gkniftyheads-incubator.html for more details.
 *   - Fits within the viewport on desktop and mobile (no horizontal overflow).
 *
 * Terminology (canonical):
 *   Score          = leaderboard ranking only
 *   Arcade XP      = server-stored shared progression for Telegram-linked users
 *   Block Topia XP = in-game progression only
 */
(function () {
  'use strict';

  var BOT_WEB_HREF   = 'https://web.telegram.org/k/#@WIKICOMSBOT';
  var BOT_APP_HREF   = 'tg://resolve?domain=WIKICOMSBOT';
  var INCUBATOR_HREF = '/gkniftyheads-incubator.html';

  var TEMPLATE =
    '<div class="tg-sync-cta" role="note" aria-label="Open the Telegram bot to sync Arcade XP">' +
      '<span class="tg-sync-cta-icon" aria-hidden="true">🔗</span>' +
      '<div class="tg-sync-cta-body">' +
        '<strong>Link Telegram — sync Arcade XP</strong>' +
        '<span>' +
          'Open @WIKICOMSBOT, press Start, then run <code>/gkstart</code> and <code>/gklink</code>. ' +
          'Use the signed link the bot sends you to connect your website identity and store Arcade XP server-side. ' +
          '<a href="' + INCUBATOR_HREF + '">Learn more</a>.' +
        '</span>' +
      '</div>' +
      '<div class="tg-sync-cta-actions">' +
        '<a href="' + BOT_WEB_HREF + '" class="swarmsy-action-card tg-sync-cta-btn" target="_blank" rel="noopener noreferrer"><strong>Open Telegram Web</strong><span>Browser-safe route to @WIKICOMSBOT.</span></a>' +
        '<a href="' + BOT_APP_HREF + '" class="swarmsy-action-card tg-sync-cta-btn"><strong>Open Telegram App</strong><span>Use this when Telegram is installed.</span></a>' +
      '</div>' +
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
