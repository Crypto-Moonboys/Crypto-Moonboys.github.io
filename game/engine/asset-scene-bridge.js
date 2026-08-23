// Asset Scene Bridge
// Connects approved Level 1 artwork assets with the London renderer.

export class AssetSceneBridge {
  constructor(assetLoader, renderer) {
    this.assetLoader = assetLoader;
    this.renderer = renderer;
  }

  async loadLondonPack(manifest) {
    const assets = await this.assetLoader.loadManifest(manifest);
    this.renderer.setAssets(assets);
    return assets;
  }
}
