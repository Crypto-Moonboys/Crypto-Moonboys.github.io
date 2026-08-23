// NBG London Graffiti Run
// Phase 2 browser runtime test integration

window.NBGPhase2BrowserTest = {
  run(assetReport = {}, runtime = {}) {
    return {
      ready: Boolean(assetReport.ready && runtime.ready),
      assets: assetReport,
      runtime
    };
  }
};
