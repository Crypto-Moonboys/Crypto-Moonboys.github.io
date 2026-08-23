// Level Render Object Bridge
// Connects object sprite rendering into the Level 1 render pipeline.

const LevelRenderObjectBridge = {
  renderer: null,
  objects: [],

  init(renderer, objects = []) {
    this.renderer = renderer;
    this.objects = objects;
  },

  update(objects = this.objects) {
    this.objects = objects;
  },

  render(context, camera) {
    if (!this.renderer) return;
    this.renderer.render(context, this.objects, camera);
  }
};

export default LevelRenderObjectBridge;
