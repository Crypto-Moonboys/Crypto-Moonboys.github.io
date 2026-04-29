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
  });
}());
