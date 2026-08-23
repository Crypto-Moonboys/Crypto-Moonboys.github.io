// Level 1 London Graffiti scene
// Connects world entities to the render pipeline.

class LondonGraffitiScene {
  constructor(loader, renderer) {
    this.loader = loader;
    this.renderer = renderer;
    this.entities = [];
  }

  async load() {
    this.entities = await this.loader.load('level1-london.json');
    return this;
  }

  update(delta) {
    this.entities.forEach(entity => entity.update?.(delta));
  }

  render(context, assets) {
    if (this.renderer && this.renderer.render) {
      this.renderer.render(context, this.entities, assets);
      return;
    }

    this.entities.forEach(entity => entity.render?.(context, assets));
  }
}

window.LondonGraffitiScene = LondonGraffitiScene;
