// NBG Game Level 1 London Scene Renderer

export class SceneRenderer {
  constructor(ctx, assets = {}) {
    this.ctx = ctx;
    this.assets = assets;
    this.layers = [];
  }

  setLayers(layers) {
    this.layers = layers;
  }

  render(camera) {
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

    for (const layer of this.layers) {
      if (!layer.image) continue;
      this.ctx.drawImage(
        layer.image,
        -camera.x * (layer.depth || 1),
        -camera.y * (layer.depth || 1)
      );
    }
  }
}
