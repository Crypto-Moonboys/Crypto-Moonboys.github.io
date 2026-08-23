// Level 1 Master Render Composer
// Combines all visual layers into one frame.

class Level1MasterRenderComposer {
  constructor(renderer) {
    this.renderer = renderer;
    this.layers = [];
  }

  addLayer(layer) {
    this.layers.push(layer);
  }

  init() {
    return this.layers.length;
  }

  render(state) {
    for (const layer of this.layers) {
      if (layer && typeof layer.render === 'function') {
        layer.render(state);
      }
    }
  }
}

window.Level1MasterRenderComposer = Level1MasterRenderComposer;
