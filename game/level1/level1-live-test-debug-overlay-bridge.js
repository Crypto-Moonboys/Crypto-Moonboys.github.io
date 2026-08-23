// NBG London Graffiti Run
// Live test report -> debug overlay bridge

(function () {
  window.NBGLevel1LiveDebugOverlayBridge = {
    connect(report) {
      window.dispatchEvent(new CustomEvent('nbg-level1-debug-update', {
        detail: report
      }));

      return {
        connected: true,
        report
      };
    }
  };
})();
