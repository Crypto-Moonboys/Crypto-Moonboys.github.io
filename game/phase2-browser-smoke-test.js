// NBG London Graffiti Run - Phase 2 browser smoke test
// First runtime check after launch wiring.

(function () {
  window.NBGPhase2SmokeTest = {
    run() {
      const checks = {
        startHandler: typeof window.startNBGGame === 'function',
        launchRuntime: !!window.Level1LaunchRuntime,
        levelBoot: !!window.NBGLevel1Boot,
        canvas: !!document.getElementById('game')
      };

      const report = {
        ready: Object.values(checks).every(Boolean),
        checks
      };

      window.dispatchEvent(new CustomEvent('nbg-phase2-smoke-report', {
        detail: report
      }));

      return report;
    }
  };

  window.addEventListener('load', function () {
    window.NBGPhase2SmokeTest.run();
  });
})();
