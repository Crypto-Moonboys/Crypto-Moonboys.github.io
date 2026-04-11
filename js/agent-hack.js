export function triggerAgentHack() {
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.top = 0;
  overlay.style.left = 0;
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.background = "rgba(0, 255, 255, 0.1)";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = 9999;
  overlay.style.animation = "flicker 0.3s infinite";

  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 2000);
}

const style = document.createElement("style");
style.textContent = `
@keyframes flicker {
  0% { opacity: 0.2; }
  50% { opacity: 0.05; }
  100% { opacity: 0.2; }
}`;
document.head.appendChild(style);
