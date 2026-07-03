/**
 * XP INIT v1
 * Auto-injects XP UI across ALL pages without shell modification
 */

(function () {
  function boot() {
    if (window.XP_UI && window.XP_UI.init) {
      window.XP_UI.init();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();