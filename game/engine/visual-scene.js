// NBG London Graffiti visual scene
// Connects loaded artwork layers with the Level 1 renderer.

export class VisualScene {
  constructor(renderer, assets) {
    this.renderer = renderer;
    this.assets = assets;
    this.layers = [];
  }

  addLayer(name, image, depth = 1) {
    this.layers.push({ name, image, depth });
  }

  draw(camera) {
    this.layers
      .sort((a, b) => a.depth - b.depth)
      .forEach(layer => {
        this.renderer.drawLayer(layer.image, camera.x * layer.depth, camera.y);
      });
  }
}
