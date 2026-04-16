// Multiplayer networking for Block Topia
export let room = null;
export let client = null;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function connectMultiplayer(showSignal, onPlayersUpdate, onConnectionUpdate = () => {}) {
  const endpoint = window.BLOCK_TOPIA_SERVER || "wss://game.cryptomoonboys.com";
  const maxAttempts = 2;
  let lastError = null;

  if (!window.Colyseus) {
    console.error("Colyseus not loaded");
    lastError = new Error("Colyseus not loaded");
    onConnectionUpdate({
      wsStatus: "failed",
      roomJoined: false,
      sessionId: "",
      lastError: String(lastError?.message || lastError)
    });
    return false;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      onConnectionUpdate({
        wsStatus: "connecting",
        roomJoined: false,
        sessionId: "",
        lastError: lastError ? String(lastError?.message || lastError) : ""
      });

      console.log("CONNECTING TO:", endpoint);
      client = new window.Colyseus.Client(endpoint);
      room = await client.joinOrCreate("city", {
        name: `Rebel_${Math.floor(Math.random() * 9999)}`
      });

      onConnectionUpdate({
        wsStatus: "connected",
        roomJoined: true,
        sessionId: room.sessionId || "",
        lastError: ""
      });

      showSignal("Connected to Block Topia server");

      room.onStateChange((state) => {
        onPlayersUpdate(state.players);
      });

      room.onMessage("districtChanged", (data) => {
        showSignal(`🏙️ ${data.playerId} entered ${data.districtName}`);
      });

      room.onMessage("questCompleted", (data) => {
        showSignal(`✅ ${data.title} (+${data.rewardXp} XP)`);
      });

      room.onMessage("system", (data) => {
        showSignal(`📢 ${data.message}`);
      });

      return true;
    } catch (err) {
      lastError = err;
      console.error("COLYSEUS ERROR:", err);
      onConnectionUpdate({
        wsStatus: "failed",
        roomJoined: false,
        sessionId: "",
        lastError: String(err?.message || err)
      });

      if (attempt < maxAttempts) {
        await delay(3000);
      }
    }
  }

  showSignal("⚠️ Multiplayer server unavailable");
  return false;
}

export function sendMovement(x, y) {
  if (room) {
    room.send('move', { x, y });
  }
}
