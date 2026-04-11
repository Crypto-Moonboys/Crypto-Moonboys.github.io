
// Moonboys Arcade - AI Agent Hack Mode
let hackActive = false;

async function checkAgentStatus() {
  try {
    const res = await fetch('/js/agent-status.json?cache=' + Date.now());
    const data = await res.json();

    if (data.status === 'updating' && !hackActive) {
      activateHackMode();
    } else if (data.status === 'idle' && hackActive) {
      deactivateHackMode();
    }
  } catch (err) {
    console.warn("Agent status check failed:", err);
  }
}

function activateHackMode() {
  hackActive = true;
  const overlay = document.createElement("div");
  overlay.id = "hack-overlay";
  overlay.innerHTML = `
    <div class="hack-content">
      <h1>SYSTEM BREACH DETECTED</h1>
      <p>AI Agents are updating the universe...</p>
    </div>
  `;
  document.body.appendChild(overlay);

  if (window.pauseGame) window.pauseGame();
}

function deactivateHackMode() {
  hackActive = false;
  const overlay = document.getElementById("hack-overlay");
  if (overlay) overlay.remove();

  if (window.resumeGame) window.resumeGame();
}

setInterval(checkAgentStatus, 10000);
