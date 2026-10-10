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
 *   - Offers verified website login and the compatible bot-link fallback.
 *   - Opens the canonical public Telegram bot link.
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

  var BOT_HREF       = 'https://t.me/WIKICOMSBOT';
  var INCUBATOR_HREF = '/gkniftyheads-incubator.html';

  var TEMPLATE =
    '<div class="tg-sync-cta" role="note" aria-label="Log in with Telegram to sync Arcade XP">' +
      '<span class="tg-sync-cta-icon" aria-hidden="true">🔗</span>' +
      '<div class="tg-sync-cta-body">' +
        '<strong>Log in with Telegram — restore your profile</strong>' +
        '<span>' +
          'Telegram website login restores your existing identity and server-backed XP without a bot command. ' +
          'Bot fallback: open @WIKICOMSBOT, run <code>/gkstart</code> and <code>/gklink</code>, then use its signed link. ' +
          '<a href="' + INCUBATOR_HREF + '">Learn more</a>.' +
        '</span>' +
      '</div>' +
      '<a href="' + INCUBATOR_HREF + '" data-telegram-login class="swarmsy-action-card tg-sync-cta-btn"><strong>Log in with Telegram</strong><span>Restore your existing account.</span></a>' +
      '<button type="button" data-telegram-logout>Log out</button>' +
      '<a href="' + BOT_HREF + '" target="_blank" rel="noopener noreferrer">Bot fallback</a>' +
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
