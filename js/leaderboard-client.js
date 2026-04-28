import { ArcadeMeta } from '/js/arcade-meta-system.js';
import { ArcadeSync } from '/js/arcade-sync.js';
import '/js/arcade-meta-ui.js';
import '/js/arcade-retention-engine.js';

// Deployed Cloudflare Worker URL for the shared arcade leaderboard.
// Update this constant when the worker is published.
const PRODUCTION_LEADERBOARD_URL = "https://moonboys-leaderboard.sercullen.workers.dev";

// localStorage key shared with identity-gate.js
const TG_ID_KEY = "moonboys_tg_id";
const LEADERBOARD_DEBUG_BUILD = "leaderboard-client-debug-v2";


function dispatchUiState(name, detail = {}) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function emitMicroNotification(message, tone = "info") {
  if (!message) return;
  dispatchUiState("moonboys:micro-notify", { message: String(message), tone, ts: Date.now() });
}

function emitTron(type, data = {}) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent(`tron:${type}`, { detail: data }));
  window.dispatchEvent(new CustomEvent("tron:event", { detail: { type, data } }));
}

function emitArcadeSubmissionStatus(detail = {}) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent("arcade:submission-status", { detail }));
}

function emitArcadeDebug(stage, detail = {}) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  const payload = { stage, ...detail, build: LEADERBOARD_DEBUG_BUILD, ts: Date.now() };
  console.info("[arcade-debug]", payload);
  window.dispatchEvent(new CustomEvent("arcade:debug", { detail: payload }));
}

function markSyncHealth(state, reason = "") {
  if (typeof window === "undefined") return;
  const gate = window.MOONBOYS_IDENTITY;
  if (!gate || typeof gate.setSyncHealth !== "function") return;
  gate.setSyncHealth(state, reason);
  dispatchUiState("moonboys:sync-state", { state, reason });
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

function getTelegramUsername() {
  if (typeof window === "undefined") return null;
  if (window.MOONBOYS_IDENTITY && typeof window.MOONBOYS_IDENTITY.getTelegramAuth === "function") {
    const auth = window.MOONBOYS_IDENTITY.getTelegramAuth();
    const maybeUsername = auth && (auth.username || auth.user?.username);
    if (maybeUsername) return String(maybeUsername);
  }
  return null;
}

function getLinkedIdentityLabel() {
  const tgName = getTelegramName();
  const tgUser = getTelegramUsername();
  if (tgName && tgUser) return `${tgName} (@${tgUser.replace(/^@/, "")})`;
  if (tgName) return tgName;
  if (tgUser) return `@${tgUser.replace(/^@/, "")}`;
  return "Linked Telegram account";
}

function getCurrentFactionKey() {
  if (typeof window === "undefined") return "unaligned";
  const api = window.MOONBOYS_FACTION;
  if (!api || typeof api.getCachedStatus !== "function") return "unaligned";
  const status = api.getCachedStatus();
  return (status && status.faction) ? String(status.faction) : "unaligned";
}

async function callFactionEarn(source, baseXp) {
  if (typeof window === "undefined") return null;
  const cfg = window.MOONBOYS_API || {};
  const gate = window.MOONBOYS_IDENTITY;
  if (!cfg.BASE_URL || !gate || typeof gate.getTelegramAuth !== "function") return null;
  const telegramAuth = gate.getTelegramAuth();
  if (!telegramAuth || !telegramAuth.hash || !telegramAuth.auth_date) return null;
  const res = await fetch(String(cfg.BASE_URL).replace(/\/$/, "") + "/faction/earn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      telegram_auth: telegramAuth,
      source: source || "score_accept",
      base_xp: Math.max(0, Math.floor(Number(baseXp) || 0)),
    }),
  });
  if (!res.ok) throw new Error("Faction earn sync failed");
  return res.json().catch(() => null);
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
    identityLabel: null,
  };

  const linked = isTelegramLinked();
  result.linked = linked;
  emitArcadeDebug("leaderboard_submit_start", {
    game: gameKey,
    score,
    linked,
    pendingBefore: ArcadeSync.getPendingCount(),
  });
  if (!linked) {
    markSyncHealth("bad", "not_linked");
    // Not competition-active: score stays local only.  Show gate modal if available.
    emitArcadeSubmissionStatus({
      ...result,
      state: "local_only",
      message: "Unsynced play stays local to this browser. To store XP and Block Topia progression server-side, run /gklink in Telegram.",
    });
    emitMicroNotification("Sync required: run /gklink to store progression.", "warning");
    if (typeof window !== "undefined" && window.MOONBOYS_IDENTITY &&
        typeof window.MOONBOYS_IDENTITY.showSyncGateModal === "function") {
      window.MOONBOYS_IDENTITY.showSyncGateModal(true); // true = show /link instructions (Step 2 required)
    }
  }

  const telegramId = getTelegramId();
  const linkedName = getTelegramName();
  result.identityLabel = linked ? getLinkedIdentityLabel() : null;
  const resolvedPlayer = (linkedName && linkedName.trim()) ? linkedName.trim() : String(player || "Guest");
  let shouldSyncMeta = false;

  if (linked) {
    emitArcadeDebug("auth_restore_result", {
      linked,
      hasTelegramId: !!telegramId,
      hasSignedAuth: !!ArcadeSync.getTelegramAuth(),
    });
    markSyncHealth("good", "linked_ready");
    emitArcadeSubmissionStatus({
      ...result,
      state: "auto_submitting",
      message: "Auto-submitting score...",
    });
    const api = getApiUrl();
    try {
      const res = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player: resolvedPlayer, score, game, telegram_id: telegramId, faction: getCurrentFactionKey() })
      });
      const data = await res.json().catch(() => ({}));
      emitArcadeDebug("leaderboard_result", {
        game: gameKey,
        score,
        httpStatus: res.status,
        accepted: data && data.accepted === true,
        bodyState: data && (data.state || data.error || data.message || null),
      });
      if (!res.ok) {
        result.state = "sync_error";
        const errText = String(data.error || data.message || "").toLowerCase();
        const authExpired = res.status === 401 || res.status === 403 || errText.includes("expired") || errText.includes("auth");
        if (data.error === "telegram_sync_required" &&
            typeof window !== "undefined" && window.MOONBOYS_IDENTITY &&
            typeof window.MOONBOYS_IDENTITY.showSyncGateModal === "function") {
          window.MOONBOYS_IDENTITY.showSyncGateModal();
          emitArcadeSubmissionStatus({
            ...result,
            state: "relink_required",
            message: "Re-link required. Run /gklink again to restore Telegram sync and server-side progression.",
          });
          markSyncHealth("bad", "relink_required");
        } else if (authExpired) {
          emitArcadeSubmissionStatus({
            ...result,
            state: "auth_expired",
            message: "Sync expired. Run /gklink again to refresh your Telegram link.",
          });
          emitMicroNotification("Sync expired. Re-link required.", "warning");
          markSyncHealth("bad", "auth_expired");
        } else {
          emitArcadeSubmissionStatus({
            ...result,
            state: "sync_error",
            message: data.error || data.message || "Sync failed before acceptance confirmation.",
          });
        }
      } else if (data && data.accepted === true) {
        markSyncHealth("good", "accepted_score");
        shouldSyncMeta = true;
        result.accepted = true;
        result.state = "accepted_score";
        emitTron("score", { game, score, player: resolvedPlayer, source: "leaderboard-client" });
        dispatchUiState("moonboys:score-updated", { game: gameKey, player: resolvedPlayer, score, ts: Date.now() });
        emitMicroNotification(`${resolvedPlayer} score accepted (${score}).`, "success");
        emitArcadeSubmissionStatus({
          ...result,
          state: "score_accepted",
          message: "Score accepted for ranking.",
        });
        try {
          const factionEarn = await callFactionEarn("score_accept", score);
          dispatchUiState("moonboys:faction-boost", {
            source: "score_accept",
            faction: factionEarn && factionEarn.faction ? String(factionEarn.faction) : getCurrentFactionKey(),
            amount: Number(factionEarn && (factionEarn.faction_xp_awarded ?? factionEarn.faction_xp_delta ?? factionEarn.base_xp) || 0),
            ts: Date.now(),
          });
          emitMicroNotification("Faction influence increased.", "success");
          if (typeof window !== "undefined" && window.MOONBOYS_FACTION && typeof window.MOONBOYS_FACTION.loadStatus === "function") {
            window.MOONBOYS_FACTION.loadStatus().catch(() => null);
          }
        } catch (error) {
          console.warn("[leaderboard-client] Faction earn sync failed:", error);
        }
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
                : "Accepted score recorded, but no XP was awarded.",
            });
            if (result.awardedXp > 0) {
              dispatchUiState("moonboys:xp-gain", { amount: result.awardedXp, total: result.totalXp, game: gameKey, ts: Date.now() });
              emitMicroNotification(`XP gained +${result.awardedXp}.`, "success");
            }
            markSyncHealth("good", result.awardedXp > 0 ? "xp_awarded" : "accepted_no_xp");
          } catch (err) {
            console.error("[leaderboard-client] Block Topia progression sync failed:", err);
            var errText = String((err && err.message) || err || "").toLowerCase();
            var authRequired = errText.includes("auth") || errText.includes("telegram");
            emitArcadeSubmissionStatus({
              ...result,
              state: authRequired ? "auth_expired" : "accepted_no_xp",
              message: authRequired
                ? "Sync expired. Run /gklink again to refresh your Telegram link."
                : "Score accepted for ranking, but Block Topia XP sync did not complete.",
            });
            if (authRequired) markSyncHealth("bad", "auth_expired");
          }
        } else {
          emitArcadeSubmissionStatus({
            ...result,
            state: "score_accepted",
            message: "Score accepted for ranking.",
          });
          markSyncHealth("good", "accepted_score");
        }
      } else {
        emitArcadeDebug("leaderboard_not_accepted", {
          game: gameKey,
          score,
          reason: data?.reason || data?.error || data?.message || "accepted_false",
        });
        result.state = "rejected_no_xp";
        emitArcadeSubmissionStatus({
          ...result,
          state: "rejected_no_xp",
          message: "Score not accepted for XP conversion.",
        });
      }
    } catch (err) {
      console.error("[leaderboard-client] Score submission failed:", err);
      const errText = String((err && err.message) || err || "").toLowerCase();
      const authExpired = errText.includes("auth") || errText.includes("expired");
      if (authExpired) markSyncHealth("bad", "auth_expired");
      emitArcadeSubmissionStatus({
        ...result,
        state: authExpired ? "auth_expired" : "sync_error",
        message: authExpired
          ? "Sync expired. Run /gklink again to refresh your Telegram link."
          : "Sync failed. Retry sync to submit this run.",
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

  const shouldQueuePending =
    (!linked) || (linked && result.accepted === true);
  emitArcadeDebug("pending_queue_decision", {
    game: gameKey,
    score,
    linked,
    accepted: result.accepted,
    shouldQueuePending,
  });
  if (shouldQueuePending) {
    try {
      // Unsynced users always queue locally for later Telegram sync.
      // Linked users queue only when leaderboard accepted the run.
      ArcadeSync.queuePendingProgress({
        game: gameKey,
        raw_score: score,
        meta_points: Number(metaResult?.meta_points) || 0,
        timestamp: Number(metaResult?.timestamp) || Date.now(),
        source: "score_submit",
      });
      emitArcadeDebug("pending_queue_write", {
        game: gameKey,
        score,
        pendingAfter: ArcadeSync.getPendingCount(),
      });
    } catch (err) {
      console.warn("[leaderboard-client] Pending progress queue failed:", err);
      emitArcadeDebug("pending_queue_write_error", {
        game: gameKey,
        score,
        error: String((err && err.message) || err || "unknown_error"),
      });
    }
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

  const pendingBeforeSync = ArcadeSync.getPendingCount();
  const shouldSyncPending = linked && pendingBeforeSync > 0;
  emitArcadeDebug("pending_sync_decision", {
    game: gameKey,
    score,
    linked,
    accepted: result.accepted,
    pendingBeforeSync,
    shouldSyncPending,
    reason: shouldSyncPending ? "linked_with_pending_queue" : (!linked ? "not_linked" : "empty_queue"),
  });
  if (shouldSyncPending) {
    try {
      emitArcadeDebug("pending_sync_start", {
        game: gameKey,
        score,
        pendingBeforeSync,
      });
      const syncSummary = await ArcadeSync.syncPendingArcadeProgress();
      emitArcadeDebug("pending_sync_response", {
        game: gameKey,
        score,
        synced: Number(syncSummary?.synced) || 0,
        rejected: Number(syncSummary?.rejected) || 0,
        remaining: Number(syncSummary?.remaining) || 0,
        skipped: !!syncSummary?.skipped,
        reason: syncSummary?.reason || null,
      });
      emitArcadeSubmissionStatus({
        ...result,
        state: "progression_synced",
        syncedRuns: Number(syncSummary?.synced) || 0,
        pendingRuns: Number(syncSummary?.remaining) || 0,
        message: "Accepted run synced to shared arcade progression.",
      });
      if ((Number(syncSummary?.synced) || 0) > 0) {
        emitMicroNotification(`Progress synced (${syncSummary.synced} run${syncSummary.synced === 1 ? "" : "s"}).`, "success");
      }
    } catch (syncErr) {
      console.error("[leaderboard-client] Pending progression sync failed:", syncErr);
      emitArcadeDebug("pending_sync_error", {
        game: gameKey,
        score,
        error: String((syncErr && syncErr.message) || syncErr || "unknown_error"),
      });
    }
  } else {
    emitArcadeDebug("pending_sync_skipped", {
      game: gameKey,
      score,
      linked,
      accepted: result.accepted,
      pendingBeforeSync,
      reason: !linked ? "not_linked" : "empty_queue",
    });
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
