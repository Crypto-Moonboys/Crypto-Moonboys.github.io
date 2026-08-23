// NBG London Graffiti Run
// Phase 2 asset report debug panel

(function () {
  window.NBGPhase2AssetDebug = {
    lastReport: null,

    show(report) {
      this.lastReport = report;

      window.dispatchEvent(new CustomEvent('nbg-debug-update', {
        detail: {
          type: 'asset-report',
          report
        }
      }));
    }
  };

  window.addEventListener('nbg-phase2-asset-report', function (event) {
    window.NBGPhase2AssetDebug.show(event.detail || {});
  });
})();
