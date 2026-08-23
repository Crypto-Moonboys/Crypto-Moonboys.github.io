// NBG London Graffiti Run - Phase 2 smoke report overlay bridge
// Connects browser smoke test results to the debug event stream.

(function () {
  window.addEventListener('nbg-phase2-smoke-report', function (event) {
    window.dispatchEvent(new CustomEvent('nbg-debug-update', {
      detail: {
        source: 'phase2-smoke-test',
        report: event.detail || null
      }
    }));
  });
})();
