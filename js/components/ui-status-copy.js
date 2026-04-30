/**
 * Crypto Moonboys — Shared UI Status Copy
 * =========================================
 * Authoritative text constants for sync / connection / feature status.
 * No fetching. No backend logic. Pure string helpers only.
 *
 * Rules:
 *   UNLINKED             — user has not completed /gklink
 *   FEATURE_UNAVAILABLE  — feature flag off or BASE_URL absent
 *   API_UNAVAILABLE      — live request failed (BASE_URL present but no response)
 *   SYNC_IN_PROGRESS     — linked but auth not yet resolved
 *   SYNC_READY           — linked + valid auth
 *
 * XP label conventions:
 *   Score        = leaderboard ranking only
 *   Arcade XP    = multiplayer gate progress
 *   Block Topia XP = in-game progression only
 *   Faction XP   = faction alignment only
 *   Community XP = Telegram / community activity only
 *
 * Usage (classic script, loaded before the consumer):
 *   window.UI_STATUS_COPY.UNLINKED
 *   window.UI_STATUS_COPY.panels.leaderboardUnavailable()
 */
(function () {
  'use strict';

  if (typeof window === 'undefined') return;

  window.UI_STATUS_COPY = Object.freeze({
    UNLINKED:            'Telegram not linked \u2014 run /gklink',
    FEATURE_UNAVAILABLE: 'Feature not yet available',
    API_UNAVAILABLE:     'Core API unavailable',
    SYNC_IN_PROGRESS:    'Sync in progress',
    SYNC_READY:          'Sync ready',

    /**
     * Panel-level HTML helpers.
     * Each returns a controlled HTML string for rendering in a widget body.
     * Helpers return controlled HTML strings. Dynamic values are coerced
     * before interpolation — no raw caller input is ever inserted directly.
     */
    panels: Object.freeze({

      /** Leaderboard endpoint not yet live or fetch failed. */
      leaderboardUnavailable: function () {
        return '<div class="widget-unavailable">'
          + '<p>Arcade leaderboard temporarily unavailable.</p>'
          + '<a href="/games/leaderboard.html" class="btn btn-secondary">Open full leaderboard \u2192</a>'
          + '</div>';
      },

      /** No faction chosen yet. */
      noFactionSelected: function () {
        return '<p class="status-hint">No faction selected yet \u2014 choose a crew to activate faction identity.</p>';
      },

      /** Activity feed empty — no server or no local events yet. */
      noActivityYet: function () {
        return '<p class="status-hint">No visible activity yet. Play an arcade run, link Telegram, or join a faction to create movement.</p>';
      },

      /** Mission is local-only (localStorage, not server-backed). */
      localMissionOnly: function () {
        return '<span class="mission-scope-badge">Local mission \u2014 server sync coming later.</span>';
      },

      /** Faction war standings are pre-season / localStorage only. */
      preSeasonFactionSignal: function () {
        return '<p class="lb-fw-preseason">Faction signal is currently based on local arcade activity in this browser. '
          + 'Full server-backed seasonal war standings are a future layer.</p>';
      },

      /** Prompt user to link Telegram. */
      telegramRequired: function () {
        return '<p class="status-hint">Link Telegram via <a href="/gkniftyheads-incubator.html">/gklink</a> to persist Arcade XP and unlock server-backed features.</p>';
      },

      /** Block Topia gate is unlocked. */
      blockTopiaUnlocked: function () {
        return '<p class="status-success">\u2705 Block Topia Multiplayer unlocked. <a href="/games/block-topia/">Enter Block Topia \u2192</a></p>';
      },

      /** Block Topia gate is locked. */
      blockTopiaLocked: function (requiredXp) {
        // Coerce to a safe positive integer; fall back to the default threshold.
        var n = Number(requiredXp);
        var req = (Number.isFinite(n) && n > 0) ? Math.floor(n) : 50;
        return '<p class="status-hint">Reach ' + req + ' Arcade XP and link Telegram to unlock Block Topia Multiplayer.</p>';
      },
    }),
  });
}());
