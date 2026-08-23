// London environment loader
// Connects Level 1 world manifest to the render pipeline.

export class LondonEnvironmentLoader {
  constructor(assetLoader, renderer) {
    this.assetLoader = assetLoader;
    this.renderer = renderer;
    this.environment = null;
  }

  async load(manifest) {
    this.environment = await this.assetLoader.loadManifest(manifest);
    return this.environment;
  }

  attach() {
    if (!this.environment) return;
    this.renderer.setEnvironment(this.environment);
  }
}
