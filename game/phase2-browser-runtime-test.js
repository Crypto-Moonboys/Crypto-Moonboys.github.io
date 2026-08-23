// NBG London Graffiti Run
// Phase 2 browser runtime test integration

window.NBGPhase2BrowserTest = {
  lastReport: null,

  run(assetReport = {}, runtime = {}) {
    const report = {
      ready: Boolean(assetReport.ready && runtime.ready),
      assets: assetReport,
      runtime
    };

    this.lastReport = report;

    window.dispatchEvent(new CustomEvent('nbg-phase2-runtime-report', {
      detail: report
    }));

    return report;
  }
};
