// Level 1 London Graffiti scene
// Browser-compatible scene runtime.

class LondonGraffitiScene {
  constructor(loader, renderer) {
    this.loader = loader;
    this.renderer = renderer;
    this.entities = [];
    this.loaded = false;
  }

  async load() {
    this.entities = await this.loader.load('level1-london.json');
    this.loaded = true;
    return this;
  }

  update(delta) {
    this.entities.forEach(entity => entity.update?.(delta));
  }

  render(context, assets) {
    this.renderer?.render?.(context, this.entities, assets);
  }
}

window.LondonGraffitiScene = LondonGraffitiScene;
