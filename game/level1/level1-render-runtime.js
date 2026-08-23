// NBG Level 1 Render Runtime Bridge
// Connects Level 1 scene state with the render pipeline.

class Level1RenderRuntime {
  constructor(scene, renderer, assets) {
    this.scene = scene;
    this.renderer = renderer;
    this.assets = assets;
    this.composer = null;
    this.running = false;
  }

  init(composer = null) {
    this.composer = composer;
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

    if (this.composer && this.composer.render) {
      this.composer.render(this.scene, this.assets, context);
      return;
    }

    if (this.renderer && this.renderer.render) {
      this.renderer.render(context, this.scene, this.assets);
    }
  }

  stop() {
    this.running = false;
  }
}

window.Level1RenderRuntime = Level1RenderRuntime;
