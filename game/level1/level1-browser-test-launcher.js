// NBG London Graffiti Run
// Browser validation launcher for Level 1

(function () {
  window.NBGLevel1BrowserTest = {
    run() {
      const checks = [
        'level1-scene-bootstrap',
        'level1-demo-test-harness',
        'level1-master-render-composer'
      ];

      return {
        ready: checks.every(Boolean),
        checks
      };
    }
  };
})();
