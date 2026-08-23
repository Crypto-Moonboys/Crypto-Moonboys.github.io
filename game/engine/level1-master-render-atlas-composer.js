// Level 1 Master Render Atlas Composer
// Combines atlas assets with the Level 1 render pipeline.

export class Level1MasterRenderAtlasComposer {
  constructor(atlasBridge, renderComposer) {
    this.atlasBridge = atlasBridge;
    this.renderComposer = renderComposer;
    this.ready = false;
  }

  init() {
    this.ready = true;
    return this.ready;
  }

  render(frame) {
    if (!this.ready) return;

    this.renderComposer.renderLayer('world', this.atlasBridge.get('world'), frame);
    this.renderComposer.renderLayer('player', this.atlasBridge.get('player'), frame);
    this.renderComposer.renderLayer('objects', this.atlasBridge.get('objects'), frame);
    this.renderComposer.renderLayer('enemies', this.atlasBridge.get('enemies'), frame);
    this.renderComposer.renderLayer('ui', this.atlasBridge.get('ui'), frame);
  }

  stop() {
    this.ready = false;
  }
}
