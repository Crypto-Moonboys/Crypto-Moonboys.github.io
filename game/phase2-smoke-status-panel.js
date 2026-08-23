// NBG London Graffiti Run - Phase 2 smoke status panel
// Displays latest smoke test status for browser validation.

(function () {
  window.NBGPhase2StatusPanel = {
    render(report) {
      const panel = document.getElementById('nbg-debug-panel');
      if (!panel || !report) return;

      panel.textContent = JSON.stringify(report, null, 2);
    }
  };

  window.addEventListener('nbg-phase2-smoke-report', function (event) {
    window.NBGPhase2StatusPanel.render(event.detail);
  });
})();
