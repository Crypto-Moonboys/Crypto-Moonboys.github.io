const DEFAULT_NPC_BRAIN_URL = process.env.NPC_BRAIN_URL || "http://127.0.0.1:8899";

async function askNpcBrain({
  playerId = "unknown_player",
  npcId = "default_npc",
  playerMessage = "",
  useOpenAI = false,
  timeoutMs = 5000
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${DEFAULT_NPC_BRAIN_URL}/npc/respond`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        playerId,
        npcId,
        playerMessage,
        useOpenAI
      })
    });

    if (!response.ok) {
      return {
        ok: false,
        mode: "npc-brain-http-error",
        error: `NPC Brain returned ${response.status}`,
        fallbackReply: "The city signal is weak. Try again in a moment."
      };
    }

    const data = await response.json();

    return {
      ok: true,
      ...data
    };
  } catch (error) {
    return {
      ok: false,
      mode: "npc-brain-unreachable",
      error: String(error.message || error),
      fallbackReply: "The city signal is offline. Local movement still works."
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  askNpcBrain
};
