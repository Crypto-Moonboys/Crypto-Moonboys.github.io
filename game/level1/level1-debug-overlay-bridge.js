// NBG London Graffiti Run
// Connects debug overlay to Level 1 preflight validation

(function () {
  window.NBGLevel1DebugOverlayBridge = {
    attach(report) {
      if (window.NBGDebugOverlay && typeof window.NBGDebugOverlay.show === 'function') {
        window.NBGDebugOverlay.show(report);
      }

      return report;
    }
  };
})();
