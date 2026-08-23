// Level 1 London Graffiti scene

export class LondonGraffitiScene {
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
}
