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
 *   - Offers one primary login action and keeps bot recovery under help.
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
  var GROUP_HREF     = 'https://t.me/gkniftyheads';
  var INCUBATOR_HREF = '/gkniftyheads-incubator.html';

  var TEMPLATE =
    '<div class="tg-sync-cta" role="note" aria-label="Log in with Telegram to sync Arcade XP">' +
      '<span class="tg-sync-cta-icon" aria-hidden="true">🔗</span>' +
      '<div class="tg-sync-cta-body">' +
        '<strong data-tg-login-heading>One Telegram account. Your saved progress.</strong>' +
        '<span>' +
          'Log in and approve Telegram’s request. Use the same Telegram account on the website and in the bot to restore your server-saved profile and progress.' +
        '</span>' +
      '</div>' +
      '<div class="tg-sync-cta-actions">' +
        '<a href="' + INCUBATOR_HREF + '" data-telegram-login class="swarmsy-action-card tg-sync-cta-btn"><strong>Log in with Telegram</strong><span>Restore your existing account.</span></a>' +
        '<a href="' + GROUP_HREF + '" data-telegram-group class="swarmsy-action-card" target="_blank" rel="noopener noreferrer"><strong>Join Telegram group</strong><span>Open the GKniftyHEADS community.</span></a>' +
      '</div>' +
      '<div class="tg-sync-cta-account"><span data-tg-login-status role="status"></span><button type="button" data-telegram-logout hidden>Log out</button></div>' +
      '<details class="tg-sync-cta-help"><summary>Need help signing in?</summary><p>If website login is unavailable, <a href="' + BOT_HREF + '" target="_blank" rel="noopener noreferrer">open @WIKICOMSBOT</a>, send <code>/gkstart</code>, then <code>/gklink</code> and open its signed link.</p></details>' +
    '</div>';

  function mount(el) {
    if (el.dataset.tgSyncCtaMounted) return;
    el.dataset.tgSyncCtaMounted = '1';
    el.innerHTML = TEMPLATE;
    update(el);
  }

  function update(el) {
    var gate = window.MOONBOYS_IDENTITY;
    var pending = Boolean(gate && gate.isSessionPending && gate.isSessionPending());
    var linked = !pending && Boolean(gate && gate.isTelegramLinked && gate.isTelegramLinked());
    el.querySelector('[data-telegram-login]').hidden = pending || linked;
    // A remembered website session can still be cleared after a login rollback.
    // This hint exposes logout only; it never claims authenticated access.
    var rememberedWebsite = !pending && Boolean(gate && gate.isWebsiteSession && gate.isWebsiteSession());
    el.querySelector('[data-telegram-logout]').hidden = !linked && !rememberedWebsite;
    el.querySelector('[data-tg-login-status]').textContent = pending ? 'Checking your Telegram session…' : linked ? 'Telegram connected.' : '';
    el.querySelector('[data-tg-login-heading]').textContent = linked ? 'You’re connected with Telegram' : 'One Telegram account. Your saved progress.';
  }

  function updateAll() {
    document.querySelectorAll('[data-tg-sync-cta][data-tg-sync-cta-mounted]').forEach(update);
    var gate = window.MOONBOYS_IDENTITY;
    var pending = Boolean(gate && gate.isSessionPending && gate.isSessionPending());
    var linked = !pending && Boolean(gate && gate.isTelegramLinked && gate.isTelegramLinked());
    document.querySelectorAll('[data-telegram-account]').forEach(function (link) {
      // Connected players open account information without rotating their session.
      if (pending || linked) link.removeAttribute('data-telegram-login');
      else link.setAttribute('data-telegram-login', '');
      link.querySelector('strong').textContent = linked ? 'Telegram account' : 'Log in with Telegram';
      link.querySelector('span').textContent = linked ? 'View your connection status and community group link.' : 'Approve Telegram’s login request to restore your existing account and server-saved progress.';
    });
  }

  function mountAll() {
    var nodes = document.querySelectorAll('[data-tg-sync-cta]');
    for (var i = 0; i < nodes.length; i++) {
      mount(nodes[i]);
    }
    updateAll();
  }

  ['moonboys:identity-change', 'moonboys:telegram-session', 'moonboys:sync-state', 'storage'].forEach(function (event) { window.addEventListener(event, updateAll); });
  if (window.MOONBOYS_IDENTITY) Promise.resolve(window.MOONBOYS_IDENTITY.ready).then(updateAll);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }
}());
