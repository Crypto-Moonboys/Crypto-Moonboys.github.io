// NBG Level 1 Render Runtime Bridge
// Connects Level 1 scene state with the render pipeline.

class Level1RenderRuntime {
  constructor(scene, renderer, assets) {
    this.scene = scene;
    this.renderer = renderer;
    this.assets = assets;
    this.running = false;
  }

  init() {
    this.running = true;
    return this;
  }

  update(delta) {
    if (!this.running) return;
    if (this.scene && this.scene.update) {
      this.scene.update(delta);
    }
  }

  render(context) {
    if (!this.running) return;
    if (this.renderer && this.renderer.render) {
      this.renderer.render(context, this.scene, this.assets);
    }
  }

  stop() {
    this.running = false;
  }
}

window.Level1RenderRuntime = Level1RenderRuntime;
