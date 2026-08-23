// Level 1 Render Bridge
// Connects Level1Runtime to the render pipeline and loaded assets.

export class Level1RenderBridge {
  constructor(runtime, renderer, assets) {
    this.runtime = runtime;
    this.renderer = renderer;
    this.assets = assets;
    this.ready = false;
  }

  async init() {
    await this.assets.loadManifest('assets/asset-manifest.json');
    this.renderer.attachAssets(this.assets);
    this.runtime.attachRenderer(this.renderer);
    this.ready = true;
  }

  update(delta) {
    if (!this.ready) return;
    this.runtime.update(delta);
    this.renderer.render(this.runtime.scene);
  }
}
