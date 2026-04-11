// Deployed Cloudflare Worker URL for the shared arcade leaderboard.
// Update this constant when the worker is published.
const PRODUCTION_LEADERBOARD_URL = "https://moonboys-leaderboard.sercullen.workers.dev";

function getApiUrl() {
  if (typeof window !== "undefined" && window.LEADERBOARD_API_URL) {
    return String(window.LEADERBOARD_API_URL).replace(/\/$/, "");
  }
  return PRODUCTION_LEADERBOARD_URL;
}

export async function submitScore(player, score, game = "global") {
  const api = getApiUrl();
  try {
    await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player, score, game })
    });
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