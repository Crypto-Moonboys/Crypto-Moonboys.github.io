// NBG London Graffiti Run - Phase 2 smoke report overlay listener
// Displays smoke test results for browser debugging.

(function () {
  window.addEventListener('nbg-phase2-smoke-report', function (event) {
    const report = event.detail || {};

    const panel = document.getElementById('nbg-debug-panel');
    if (!panel) return;

    panel.textContent = JSON.stringify({
      phase: 'phase2-smoke-test',
      report
    }, null, 2);
  });
})();
