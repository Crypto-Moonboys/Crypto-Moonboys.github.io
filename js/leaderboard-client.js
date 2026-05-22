// Runtime authority truth (May 2026): submitScore() is the shared browser
// gateway for all active arcade runs. The leaderboard worker is authoritative for
// accepted/rejected competitive scores; the moonboys API is authoritative for
// server-side Arcade XP and faction earn. ArcadeMeta updates here are local
// presentation/cache state, and ArcadeSync queues are synced when auth allows.
import { ArcadeMeta } from '/js/arcade-meta-system.js';
import { ArcadeSync } from '/js/arcade-sync.js';
import '/js/arcade-meta-ui.js';
import '/js/arcade-retention-engine.js';

// Fallback leaderboard URL — used only when window.MOONBOYS_API.LEADERBOARD_URL is not set.
// The primary source of truth is window.MOONBOYS_API.LEADERBOARD_URL (set in js/api-config.js).
// Update this constant only if the worker is permanently renamed.
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
  if (typeof window !== "undefined") {
    // Primary: use the centralised MOONBOYS_API config (set by js/api-config.js)
    const cfg = window.MOONBOYS_API;
    if (cfg && cfg.LEADERBOARD_URL) return String(cfg.LEADERBOARD_URL).replace(/\/$/, "");
    // Legacy override: direct window.LEADERBOARD_API_URL
    if (window.LEADERBOARD_API_URL) return String(window.LEADERBOARD_API_URL).replace(/\/$/, "");
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

function resolvePublicPlayerName(player, linkedName = null) {
  const preferred = (linkedName && String(linkedName).trim())
    ? String(linkedName).trim()
    : String(player || "").trim();
  if (preferred) return preferred.slice(0, 40);
  const fallback = (() => {
    try {
      return ArcadeSync.getPlayer();
    } catch {
      return null;
    }
  })();
  const resolved = String(fallback || `Guest-${Math.floor(Math.random() * 1000000)}`).trim();
  return (resolved || "Guest").slice(0, 40);
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
  if (!cfg.BASE_URL || !gate || typeof gate.isTelegramLinked !== "function" || !gate.isTelegramLinked()) return null;
  const telegramAuth = await ArcadeSync.getTelegramAuth();
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
    state: "pending_submit",
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
  if (!linked) markSyncHealth("bad", "not_linked");

  const telegramId = getTelegramId();
  const linkedName = getTelegramName();
  result.identityLabel = linked ? getLinkedIdentityLabel() : null;
  const resolvedPlayer = resolvePublicPlayerName(player, linked ? linkedName : null);
  let shouldSyncMeta = false;
  let telegramAuth = null;
  let hasSignedAuth = false;
  const api = getApiUrl();

  if (linked) {
    try {
      telegramAuth = await ArcadeSync.getTelegramAuth();
    } catch (authErr) {
      console.warn("[leaderboard-client] Telegram auth restore failed; using public fallback:", authErr);
      telegramAuth = null;
    }
    hasSignedAuth = !!(telegramAuth && telegramAuth.hash && telegramAuth.auth_date);
    emitArcadeDebug("auth_restore_result", {
      linked,
      hasTelegramId: !!telegramId,
      hasSignedAuth,
    });

    if (!hasSignedAuth) {
      result.state = "public_submit_unsigned";
      result.message = "Public score submitted. XP sync pending — Telegram auth refresh needed.";
      markSyncHealth("bad", "auth_expired");
      emitArcadeSubmissionStatus({
        ...result,
        state: "public_submit_unsigned",
        message: result.message,
      });
      emitMicroNotification("Public score submitted. Telegram auth refresh needed for XP sync.", "warning");
    }
  }

  // When signed auth is available, derive the effective Telegram ID from the
  // auth payload if the local cached value is missing (e.g. cache cleared).
  // This ensures the meta/XP sync path can run and the correct identity is
  // attached to the request body.  For unsigned submissions the value is null.
  const effectiveTelegramId = hasSignedAuth
    ? (telegramId || (telegramAuth && String(telegramAuth.id || "").trim()) || null)
    : null;

  emitArcadeSubmissionStatus({
    ...result,
    state: "auto_submitting",
    message: "Auto-submitting score...",
  });
  const requestBody = {
    player: resolvedPlayer,
    score,
    game,
    faction: getCurrentFactionKey(),
  };
  if (hasSignedAuth) {
    requestBody.telegram_auth = telegramAuth;
    if (effectiveTelegramId) requestBody.telegram_id = effectiveTelegramId;
  }

  try {
    const res = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    const data = await res.json().catch(() => ({}));
    emitArcadeDebug("leaderboard_result", {
      game: gameKey,
      score,
      httpStatus: res.status,
      accepted: data && data.accepted === true,
      bodyState: data && (data.state || data.error || data.message || null),
      linked,
      hasSignedAuth,
    });
    if (!res.ok) {
      result.state = "sync_error";
      const errText = String(data.error || data.message || "").toLowerCase();
      const authExpired = (res.status === 401 || res.status === 403 || errText.includes("expired") || errText.includes("auth"));
      if (authExpired && linked) markSyncHealth("bad", "auth_expired");
      emitArcadeSubmissionStatus({
        ...result,
        state: authExpired && linked ? "auth_expired" : "sync_error",
        message: authExpired && linked
          ? "Telegram sync expired. Score submission failed; relink or refresh auth."
          : data.error || data.message || "Sync failed before acceptance confirmation.",
      });
    } else if (data && data.accepted === true) {
      if (linked && hasSignedAuth) markSyncHealth("good", "accepted_score");
      shouldSyncMeta = linked && hasSignedAuth;
      result.accepted = true;
      result.state = "accepted_score";
      dispatchUiState("moonboys:score-updated", { game: gameKey, player: resolvedPlayer, score, ts: Date.now() });
      emitMicroNotification(`${resolvedPlayer} score accepted (${score}).`, "success");
      emitArcadeSubmissionStatus({
        ...result,
        state: linked && !hasSignedAuth ? "public_score_submitted" : "score_accepted",
        message: linked && !hasSignedAuth
          ? "Public score submitted. XP sync pending — Telegram auth refresh needed."
          : "Score accepted for ranking.",
      });
      if (linked && hasSignedAuth) {
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
      }
      if (linked && hasSignedAuth && gameKey === "blocktopia") {
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
      }
      // No second emit for non-blocktopia games: the score_accepted status was
      // already emitted above when the accepted response was first processed.
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
    const authExpired = linked && (errText.includes("auth") || errText.includes("expired"));
    if (authExpired) markSyncHealth("bad", "auth_expired");
    emitArcadeSubmissionStatus({
      ...result,
      state: authExpired ? "auth_expired" : "sync_error",
      message: authExpired
        ? "Sync expired. Run /gklink again to refresh your Telegram link."
        : "Sync failed. Retry sync to submit this run.",
    });
  }

  let metaResult = null;
  try {
    // Meta is engagement-only and local-first: always track locally even when
    // Telegram linking is missing; sync to worker remains linked-only below.
    metaResult = ArcadeMeta.trackGameResult({
      player: resolvedPlayer,
      game: gameKey,
      raw_score: score,
      timestamp: Date.now(),
      linked,
      accepted: result.accepted,
      faction: getCurrentFactionKey(),
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
        telegram_id: effectiveTelegramId,
        game: metaResult.game,
        score: metaResult.meta_points,
        timestamp: metaResult.timestamp,
        telegram_auth: telegramAuth,
      });
    } catch (err) {
      console.error("[leaderboard-client] Meta sync failed:", err);
    }
  }

  const pendingBeforeSync = ArcadeSync.getPendingCount();
  const shouldSyncPending = linked && hasSignedAuth && pendingBeforeSync > 0;
  emitArcadeDebug("pending_sync_decision", {
    game: gameKey,
    score,
    linked,
    accepted: result.accepted,
    pendingBeforeSync,
    shouldSyncPending,
    reason: shouldSyncPending ? "linked_with_signed_auth_and_pending_queue" : (!linked ? "not_linked" : (!hasSignedAuth ? "missing_signed_auth" : "empty_queue")),
  });
  emitArcadeDebug("sync_trigger_check", {
    game: gameKey,
    score,
    linked,
    accepted: result.accepted,
    pending: pendingBeforeSync,
    shouldSyncPending,
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
      if (!syncSummary?.skipped) {
        emitArcadeSubmissionStatus({
          ...result,
          state: "progression_synced",
          syncedRuns: Number(syncSummary?.synced) || 0,
          pendingRuns: Number(syncSummary?.remaining) || 0,
          message: "Accepted run synced to shared arcade progression.",
        });
      }
      if (!syncSummary?.skipped && (Number(syncSummary?.synced) || 0) > 0) {
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
      reason: !linked ? "not_linked" : (!hasSignedAuth ? "missing_signed_auth" : "empty_queue"),
    });
  }

  return result;
}

async function submitMetaScore({ player, telegram_id, game, score, timestamp, telegram_auth }) {
  if (!telegram_id || !isTelegramLinked()) return;
  if (!Number.isFinite(Number(score)) || Number(score) < 0) return;
  if (!telegram_auth || !telegram_auth.hash || !telegram_auth.auth_date) return;
  const api = getApiUrl();
  await fetch(api, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player: String(player || "Guest"),
      score: Math.floor(Number(score)),
      game: String(game || "global"),
      telegram_id: String(telegram_id),
      telegram_auth,
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
    return data;
  } catch (err) {
    console.error("[leaderboard-client] Leaderboard fetch failed:", err);
    // Return a structured error so callers can distinguish a fetch failure from
    // a genuinely empty leaderboard.  An empty array [] would be ambiguous.
    return { error: true, message: (err instanceof Error ? err.message : "fetch_failed"), entries: null };
  }
}
