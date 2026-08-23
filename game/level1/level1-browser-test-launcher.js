// NBG London Graffiti Run
// Browser validation launcher for Level 1

(function () {
  window.NBGLevel1BrowserTest = {
    run() {
      const checks = [
        'level1-scene-bootstrap',
        'level1-demo-test-harness',
        'level1-master-render-composer',
        'level1-preflight-browser-bridge'
      ];

      const preflight = window.NBGLevel1PreflightBridge
        ? window.NBGLevel1PreflightBridge.run()
        : { ready: false, missing: ['level1-preflight-browser-bridge'] };

      return {
        ready: checks.every(Boolean) && preflight.ready,
        checks,
        preflight
      };
    }
  };
})();
