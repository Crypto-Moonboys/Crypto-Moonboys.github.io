// NBG London Graffiti Run
// Auto-initialises the Phase 2 smoke status panel.

(function () {
  function init() {
    if (window.NBGPhase2StatusPanel && typeof window.NBGPhase2StatusPanel.init === 'function') {
      window.NBGPhase2StatusPanel.init();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
