
// --- HUD CONSOLIDATION PATCH (v1) ---
// Prevent duplicate HUD / XP / faction render loops across systems

window.__HUD_CONSOLIDATED__ = true;

(function () {
  function bootHUD() {
    if (window.__HUD_BOOTED__) return;
    window.__HUD_BOOTED__ = true;

    // Unified HUD renderer (if present)
    if (window.HUD_UNIFIED && typeof window.HUD_UNIFIED.init === 'function') {
      window.HUD_UNIFIED.init();
    }

    // OS HUD bridge (safe initializer)
    if (window.OS_HUD && typeof window.OS_HUD.init === 'function') {
      window.OS_HUD.init();
    }

    // XP UI safety init (avoid duplicate intervals)
    if (window.XP_UI && typeof window.XP_UI.init === 'function') {
      window.XP_UI.init();
    }

    console.log('[GK] HUD consolidation pass active');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootHUD);
  } else {
    bootHUD();
  }
})();
