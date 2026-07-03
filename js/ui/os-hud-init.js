/**
 * OS HUD INIT BRIDGE v1
 * Safe integration layer for unified HUD renderer
 * Does NOT modify site-shell.js (prevents breaking existing systems)
 */

(function () {

  function boot() {

    // Unified HUD (primary system)
    if (window.HUD_UNIFIED && typeof window.HUD_UNIFIED.init === 'function') {
      window.HUD_UNIFIED.init();
    }

    // Optional faction grid
    if (window.FACTION_GRID && typeof window.FACTION_GRID.init === 'function') {
      window.FACTION_GRID.init();
    }

    // Optional territory map (if exists later)
    if (window.TERRITORY_MAP && typeof window.TERRITORY_MAP.init === 'function') {
      window.TERRITORY_MAP.init();
    }

    // Ensure XP HUD sync is active
    if (window.XP_UI && typeof window.XP_UI.init === 'function') {
      window.XP_UI.init();
    }

    console.log('[GK] Unified HUD system initialised');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();