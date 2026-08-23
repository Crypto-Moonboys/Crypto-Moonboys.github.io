// NBG London Graffiti Run
// Displays missing asset report in the debug stream.

(function () {
  window.NBGPhase2MissingAssetOverlay = {
    lastReport: null,

    attach() {
      window.addEventListener('nbg-phase2-missing-assets', (event) => {
        this.lastReport = event.detail || {};
        window.dispatchEvent(new CustomEvent('nbg-debug-update', {
          detail: {
            type: 'missing-assets',
            report: this.lastReport
          }
        }));
      });
    }
  };

  window.NBGPhase2MissingAssetOverlay.attach();
})();
