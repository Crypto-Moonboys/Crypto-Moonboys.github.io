// Deployed Cloudflare Worker URL for the shared arcade leaderboard.
// Update this constant when the worker is published.
const PRODUCTION_LEADERBOARD_URL = "https://moonboys-leaderboard.sercullen.workers.dev";

// localStorage key shared with identity-gate.js
const TG_ID_KEY = "moonboys_tg_id";

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
  // Competitive leaderboard submission requires /gklink (telegram_linked tier).
  // Telegram auth alone (Step 1) is not sufficient — /gklink must be completed first.
  if (!isTelegramLinked()) {
    // Not competition-active: score stays local only.  Show gate modal if available.
    if (typeof window !== "undefined" && window.MOONBOYS_IDENTITY &&
        typeof window.MOONBOYS_IDENTITY.showSyncGateModal === "function") {
      window.MOONBOYS_IDENTITY.showSyncGateModal(true);
    }
    return;
  }

  const telegramId = getTelegramId();

  const api = getApiUrl();
  try {
    const res = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player, score, game, telegram_id: telegramId })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.error === "telegram_sync_required" &&
          typeof window !== "undefined" && window.MOONBOYS_IDENTITY &&
          typeof window.MOONBOYS_IDENTITY.showSyncGateModal === "function") {
        window.MOONBOYS_IDENTITY.showSyncGateModal();
      }
    }
  } catch (err) {
    console.error("[leaderboard-client] Score submission failed:", err);
  }
}

export async function fetchLeaderboard(game = "global") {
  const api = getApiUrl();
  try {
    const res = await fetch(`${api}?game=${encodeURIComponent(game)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("[leaderboard-client] Leaderboard fetch failed:", err);
    return [];
  }
}