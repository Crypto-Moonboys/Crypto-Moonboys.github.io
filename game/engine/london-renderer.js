// NBG London Graffiti renderer
// Handles Level 1 world layers and tile rendering.

export class LondonRenderer {
  constructor(ctx, assets = {}) {
    this.ctx = ctx;
    this.assets = assets;
    this.layers = [
      'sky',
      'clouds',
      'london-far',
      'graffiti-wall',
      'foreground'
    ];
  }

  draw(camera) {
    this.layers.forEach((layer, index) => {
      const image = this.assets[layer];
      if (!image) return;

      const speed = 0.15 + index * 0.15;
      this.ctx.drawImage(
        image,
        -camera.x * speed,
        0
      );
    });
  }
}
