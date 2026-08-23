// Level 1 London Graffiti scene
// Connects world entities, player and sprite renderer to the render pipeline.

class LondonGraffitiScene {
  constructor(loader, renderer, player = null, playerRenderer = null) {
    this.loader = loader;
    this.renderer = renderer;
    this.player = player;
    this.playerRenderer = playerRenderer;
    this.entities = [];
  }

  async load() {
    this.entities = await this.loader.load('level1-london.json');
    return this;
  }

  update(delta) {
    this.player?.update?.(delta);
    this.entities.forEach(entity => entity.update?.(delta));
  }

  render(context, assets) {
    if (this.renderer && this.renderer.render) {
      this.renderer.render(context, this.entities, assets);
    }

    if (this.playerRenderer && this.player) {
      this.playerRenderer.draw(context, this.player);
      return;
    }

    this.player?.render?.(context, assets);
  }
}

window.LondonGraffitiScene = LondonGraffitiScene;
