const LEADERBOARD_API = "https://your-worker-url.workers.dev";

export async function submitScore(player, score, game = "global") {
  try {
    await fetch(LEADERBOARD_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player, score, game })
    });
  } catch (error) {
    console.error("Score submission failed:", error);
  }
}

export async function fetchLeaderboard(game = "global") {
  try {
    const response = await fetch(`${LEADERBOARD_API}?game=${game}`);
    return await response.json();
  } catch (error) {
    console.error("Leaderboard fetch failed:", error);
    return [];
  }
}