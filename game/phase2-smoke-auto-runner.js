// NBG London Graffiti Run
// Automatically runs Phase 2 smoke validation after browser startup.

(function () {
  function runSmoke() {
    if (!window.NBGPhase2SmokeTest) {
      console.warn('Phase 2 smoke test unavailable');
      return;
    }

    const report = window.NBGPhase2SmokeTest.run();
    window.dispatchEvent(new CustomEvent('nbg-phase2-smoke-report', {
      detail: report
    }));

    return report;
  }

  window.NBGPhase2AutoSmoke = {
    run: runSmoke
  };

  window.addEventListener('load', runSmoke);
})();
