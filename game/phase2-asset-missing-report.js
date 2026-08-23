// NBG London Graffiti Run
// Reports missing Phase 2 assets during browser testing.

(function () {
  window.NBGPhase2MissingAssetReport = {
    run(report = {}) {
      const missing = (report.results || [])
        .filter(asset => !asset.loaded)
        .map(asset => asset.name);

      const result = {
        missing,
        ready: missing.length === 0
      };

      window.dispatchEvent(new CustomEvent('nbg-phase2-missing-assets', {
        detail: result
      }));

      return result;
    }
  };
})();
