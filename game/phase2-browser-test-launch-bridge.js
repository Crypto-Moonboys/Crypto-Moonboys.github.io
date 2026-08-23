// NBG London Graffiti Run
// Phase 2 browser test launch bridge

(function () {
  window.NBGPhase2BrowserTest = {
    start() {
      const assetReady = window.NBGAssetValidation
        ? window.NBGAssetValidation.run()
        : false;

      const runtimeReady = window.Level1PreflightRunner
        ? window.Level1PreflightRunner.run({})
        : false;

      return {
        ready: Boolean(assetReady && runtimeReady),
        assetReady,
        runtimeReady
      };
    }
  };
})();
