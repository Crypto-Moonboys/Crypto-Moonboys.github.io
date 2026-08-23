// Asset fallback bridge
// Connects runtime-fallbacks with the asset loading pipeline.

class AssetLoaderFallbackBridge {
  constructor(loader, fallback) {
    this.loader = loader;
    this.fallback = fallback;
  }

  loadAsset(name, path) {
    try {
      return this.loader.load(name, path);
    } catch (error) {
      return this.fallback.get(name);
    }
  }

  loadLevelAssets(manifest) {
    return Object.keys(manifest).map((asset) => {
      return this.loadAsset(asset, manifest[asset]);
    });
  }
}

export default AssetLoaderFallbackBridge;
