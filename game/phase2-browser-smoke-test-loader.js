// NBG London Graffiti Run - Phase 2 smoke test loader
// Starts the browser smoke test after page dependencies are available.

(function () {
  window.NBGPhase2 = window.NBGPhase2 || {};

  window.NBGPhase2.runSmokeTest = function () {
    if (window.NBGPhase2SmokeTest && typeof window.NBGPhase2SmokeTest.run === 'function') {
      return window.NBGPhase2SmokeTest.run();
    }

    return {
      ready: false,
      error: 'Smoke test module not loaded'
    };
  };
})();
