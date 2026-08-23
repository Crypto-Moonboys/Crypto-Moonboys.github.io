// NBG London Graffiti Run
// Asset validation reporting for Level 1 preflight

(function () {
  window.Level1PreflightAssetReport = {
    run(validation = {}) {
      const assets = validation.assets || [];

      return {
        ready: assets.every(asset => asset.loaded),
        assets: assets.map(asset => ({
          name: asset.name,
          loaded: Boolean(asset.loaded)
        }))
      };
    }
  };
})();
