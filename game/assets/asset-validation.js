// NBG Game asset validation
// Checks required Phase 2 assets before runtime launch.

(function () {
  function validateAssets(assetRegistry, loader) {
    const results = [];

    Object.entries(assetRegistry || {}).forEach(([group, assets]) => {
      Object.entries(assets || {}).forEach(([name, path]) => {
        const loaded = loader && typeof loader.get === 'function'
          ? loader.get(name)
          : false;

        results.push({
          group,
          name,
          path,
          loaded: Boolean(loaded)
        });
      });
    });

    return {
      ready: results.every((asset) => asset.loaded),
      results
    };
  }

  window.NBGAssetValidation = {
    validateAssets
  };
})();
