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
 * Usage (ES module):
 *   import { UNLINKED, API_UNAVAILABLE } from '/js/components/ui-status-copy.js';
 *
 * Usage (IIFE / classic script, loaded before the consumer):
 *   window.UI_STATUS_COPY.UNLINKED
 */

export const UNLINKED            = 'Telegram not linked \u2014 run /gklink';
export const FEATURE_UNAVAILABLE = 'Feature not yet available';
export const API_UNAVAILABLE     = 'Core API unavailable';
export const SYNC_IN_PROGRESS    = 'Sync in progress';
export const SYNC_READY          = 'Sync ready';

// Expose globally so IIFE consumers (engagement.js, comments.js, etc.)
// can reference window.UI_STATUS_COPY without needing module syntax.
if (typeof window !== 'undefined') {
  window.UI_STATUS_COPY = {
    UNLINKED,
    FEATURE_UNAVAILABLE,
    API_UNAVAILABLE,
    SYNC_IN_PROGRESS,
    SYNC_READY,
  };
}
