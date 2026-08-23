// NBG London Graffiti Run
// Connects loaded assets to the Level 1 renderer.

export class LevelRenderPipeline {
  constructor(assetLoader, renderer) {
    this.assetLoader = assetLoader;
    this.renderer = renderer;
    this.entities = [];
    this.layers = [];
  }

  async loadScene(manifest) {
    await this.assetLoader.loadManifest(manifest);

    this.layers = [
      'sky',
      'moon',
      'london-skyline',
      'graffiti-wall',
      'street',
      'foreground'
    ];

    return true;
  }

  addEntity(entity) {
    this.entities.push(entity);
  }

  render(context, camera) {
    this.layers.forEach(layer => {
      const image = this.assetLoader.get(layer);
      if (image) {
        this.renderer.drawLayer(context, image, camera);
      }
    });

    this.entities.forEach(entity => {
      if (entity.draw) entity.draw(context, camera);
    });
  }
}
