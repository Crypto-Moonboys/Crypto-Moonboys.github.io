// NBG London Graffiti Run
// Connects asset runtime reports into the Phase 2 smoke test flow.

(function () {
  window.NBGPhase2AssetSmokeBridge = {
    latest: null,

    connect() {
      window.addEventListener('nbg-phase2-asset-report', (event) => {
        this.latest = event.detail || null;

        window.dispatchEvent(new CustomEvent('nbg-phase2-smoke-report', {
          detail: {
            assets: this.latest,
            timestamp: Date.now()
          }
        }));
      });
    }
  };

  window.NBGPhase2AssetSmokeBridge.connect();
})();
