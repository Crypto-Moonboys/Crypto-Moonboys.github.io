// NBG London Graffiti Run
// Phase 2 runtime error overlay integration

(function () {
  window.NBGPhase2RuntimeOverlay = {
    connect(panel) {
      this.panel = panel || null;
      return this;
    },

    show(errorReport) {
      if (!this.panel || !errorReport) return;
      this.panel.textContent = JSON.stringify(errorReport, null, 2);
    }
  };
})();
