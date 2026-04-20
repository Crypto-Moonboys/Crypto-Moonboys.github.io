import { ArcadeMeta } from '/js/arcade-meta-system.js';
import { ArcadeSync } from '/js/arcade-sync.js';
import '/js/arcade-meta-ui.js';
import '/js/arcade-retention-engine.js';

// Deployed Cloudflare Worker URL for the shared arcade leaderboard.
// Update this constant when the worker is published.
const PRODUCTION_LEADERBOARD_URL = "https://moonboys-leaderboard.sercullen.workers.dev";

// localStorage key shared with identity-gate.js
const TG_ID_KEY = "moonboys_tg_id";

function emitTron(type, data = {}) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent(`tron:${type}`, { detail: data }));
  window.dispatchEvent(new CustomEvent("tron:event", { detail: { type, data } }));
}

function emitArcadeSubmissionStatus(detail = {}) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent("arcade:submission-status", { detail }));
}

function getApiUrl() {
  if (typeof window !== "undefined" && window.LEADERBOARD_API_URL) {
    return String(window.LEADERBOARD_API_URL).replace(/\/$/, "");
  }
  return PRODUCTION_LEADERBOARD_URL;
}

/** Read the stored Telegram ID, preferring window.MOONBOYS_IDENTITY if loaded. */
function getTelegramId() {
  if (typeof window === "undefined") return null;
  if (window.MOONBOYS_IDENTITY && typeof window.MOONBOYS_IDENTITY.getTelegramId === "function") {
    return window.MOONBOYS_IDENTITY.getTelegramId();
  }
  try { return localStorage.getItem(TG_ID_KEY) || null; } catch { return null; }
}

function getTelegramName() {
  if (typeof window === "undefined") return null;
  if (window.MOONBOYS_IDENTITY && typeof window.MOONBOYS_IDENTITY.getTelegramName === "function") {
    return window.MOONBOYS_IDENTITY.getTelegramName();
  }
  try { return localStorage.getItem("moonboys_tg_name") || null; } catch { return null; }
}

/**
 * Returns true only when both Telegram auth (Step 1) AND /gklink (Step 2) are complete.
 * Competitive leaderboard submission requires the fully linked state.
 */
function isTelegramLinked() {
  if (typeof window === "undefined") return false;
  if (window.MOONBOYS_IDENTITY && typeof window.MOONBOYS_IDENTITY.isTelegramLinked === "function") {
    return window.MOONBOYS_IDENTITY.isTelegramLinked();
  }
  // Fallback: check both localStorage keys directly
  try {
    return !!(localStorage.getItem(TG_ID_KEY) && localStorage.getItem("moonboys_tg_linked"));
  } catch { return false; }
}

/**
 * Submit a score to the arcade leaderboard.
 *
 * Requires a Telegram-synced identity (identity-gate.js or localStorage key
 * `moonboys_tg_id`).  If no Telegram ID is found the submission is skipped
 * and the sync gate modal is shown if available — the game itself is unaffected.
 */
export async function submitScore(player, score, game = "global") {
  // Reject scores that are not finite non-negative numbers to prevent garbage data
  // (e.g. NaN, Infinity, negative values) from reaching the leaderboard.
  if (typeof score !== "number" || !isFinite(score) || score < 0) {
    console.warn("[leaderboard-client] Invalid score; submission skipped:", score);
    return;
  }
  // Normalise to a safe integer (floor to drop any floating-point noise).
  score = Math.floor(score);
  const gameKey = String(game || "global").toLowerCase();
  const result = {
    game: gameKey,
    score,
    linked: false,
    state: "local_only",
    accepted: false,
    projectedXp: ArcadeSync.getProjectedXpFromScore(score),
    awardedXp: 0,
    totalXp: null,
  };

  const linked = isTelegramLinked();
  result.linked = linked;
  if (!linked) {
    // Not competition-active: score stays local only.  Show gate modal if available.
    emitArcadeSubmissionStatus({
      ...result,
      state: "local_only",
      message: "Arcade score saved locally. Telegram sync is required to store Block Topia XP on the server.",
    });
    if (typeof window !== "undefined" && window.MOONBOYS_IDENTITY &&
        typeof window.MOONBOYS_IDENTITY.showSyncGateModal === "function") {
      window.MOONBOYS_IDENTITY.showSyncGateModal(true); // true = show /link instructions (Step 2 required)
    }
  }

  const telegramId = getTelegramId();
  const linkedName = getTelegramName();
  const resolvedPlayer = (linkedName && linkedName.trim()) ? linkedName.trim() : String(player || "Guest");
  let shouldSyncMeta = false;

  if (linked) {
    emitArcadeSubmissionStatus({
      ...result,
      state: "syncing",
      message: "Syncing score for acceptance check and potential XP conversion…",
    });
    const api = getApiUrl();
    try {
      const res = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player: resolvedPlayer, score, game, telegram_id: telegramId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        result.state = "sync_error";
        if (data.error === "telegram_sync_required" &&
            typeof window !== "undefined" && window.MOONBOYS_IDENTITY &&
            typeof window.MOONBOYS_IDENTITY.showSyncGateModal === "function") {
          window.MOONBOYS_IDENTITY.showSyncGateModal();
          emitArcadeSubmissionStatus({
            ...result,
            state: "telegram_sync_required",
            message: "Telegram sync is required to store Block Topia XP and progression.",
          });
        } else {
          emitArcadeSubmissionStatus({
            ...result,
            state: "sync_error",
            message: data.error || data.message || "Score sync failed before acceptance confirmation.",
          });
        }
      } else if (data && data.accepted === true) {
        shouldSyncMeta = true;
        result.accepted = true;
        result.state = "accepted_score";
        emitTron("score", { game, score, player: resolvedPlayer, source: "leaderboard-client" });
        emitArcadeSubmissionStatus({
          ...result,
          state: "accepted_score",
          message: "Accepted score. Processing Block Topia XP conversion…",
        });
        if (gameKey === "blocktopia") {
          try {
            const progression = await ArcadeSync.syncBlockTopiaProgressionOnAcceptedScore(score, gameKey);
            const serverProgress = progression && progression.progression ? progression.progression : {};
            const awardedXp = Number(progression && (progression.xp_awarded ?? progression.awarded_xp ?? serverProgress.xp_awarded)) || 0;
            const totalXp = Number(serverProgress.xp ?? progression?.xp_total ?? progression?.total_xp);
            result.awardedXp = Math.max(0, Math.floor(awardedXp));
            result.totalXp = Number.isFinite(totalXp) ? Math.floor(totalXp) : null;
            emitArcadeSubmissionStatus({
              ...result,
              state: "xp_awarded",
              message: result.awardedXp > 0
                ? "Accepted score converted to Block Topia XP."
                : "Accepted score synced, but no extra XP was awarded.",
            });
          } catch (err) {
            console.error("[leaderboard-client] Block Topia progression sync failed:", err);
            emitArcadeSubmissionStatus({
              ...result,
              state: "accepted_no_xp",
              message: "Score accepted, but Block Topia XP sync did not complete.",
            });
          }
        } else {
          emitArcadeSubmissionStatus({
            ...result,
            state: "accepted_score",
            message: "Accepted score synced to leaderboard.",
          });
        }
      } else {
        result.state = "rejected_no_xp";
        emitArcadeSubmissionStatus({
          ...result,
          state: "rejected_no_xp",
          message: "Score was not accepted, so no Block Topia XP was awarded.",
        });
      }
    } catch (err) {
      console.error("[leaderboard-client] Score submission failed:", err);
      emitArcadeSubmissionStatus({
        ...result,
        state: "sync_error",
        message: "Network error while submitting score. Competitive acceptance not confirmed.",
      });
    }
  }

  let metaResult = null;
  try {
    // Meta is engagement-only and local-first: always track locally even when
    // Telegram linking is missing; sync to worker remains linked-only below.
    metaResult = ArcadeMeta.trackGameResult({
      player: resolvedPlayer,
      game,
      raw_score: score,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error("[leaderboard-client] Meta tracking failed:", err);
  }

  if (shouldSyncMeta && metaResult && metaResult.tracked) {
    try {
      await submitMetaScore({
        player: resolvedPlayer,
        telegram_id: telegramId,
        game: metaResult.game,
        score: metaResult.meta_points,
        timestamp: metaResult.timestamp
      });
    } catch (err) {
      console.error("[leaderboard-client] Meta sync failed:", err);
    }
  }

  return result;
}

async function submitMetaScore({ player, telegram_id, game, score, timestamp }) {
  if (!telegram_id || !isTelegramLinked()) return;
  if (!Number.isFinite(Number(score)) || Number(score) < 0) return;
  const api = getApiUrl();
  await fetch(api, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player: String(player || "Guest"),
      score: Math.floor(Number(score)),
      game: String(game || "global"),
      telegram_id: String(telegram_id),
      score_type: "meta",
      timestamp: Number(timestamp) || Date.now()
    })
  });
}

export async function fetchLeaderboard(game = "global", options = {}) {
  const mode = options && options.mode ? String(options.mode).toLowerCase() : "raw";
  const api = getApiUrl();
  try {
    const res = await fetch(`${api}?game=${encodeURIComponent(game)}&mode=${encodeURIComponent(mode)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length) {
      emitTron("leaderboard", { game, mode, count: data.length, source: "leaderboard-client" });
    }
    return data;
  } catch (err) {
    console.error("[leaderboard-client] Leaderboard fetch failed:", err);
    return [];
  }
}
