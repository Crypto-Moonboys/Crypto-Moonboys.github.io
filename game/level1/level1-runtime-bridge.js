// Level 1 Runtime Bridge
// Connects the Level 1 runtime with render runtime systems.

export class Level1RuntimeBridge {
  constructor(runtime, renderer) {
    this.runtime = runtime;
    this.renderer = renderer;
    this.active = false;
  }

  init() {
    this.active = true;

    if (this.runtime?.init) {
      this.runtime.init();
    }

    if (this.renderer?.init) {
      this.renderer.init();
    }
  }

  update(deltaTime) {
    if (!this.active) return;

    if (this.runtime?.update) {
      this.runtime.update(deltaTime);
    }

    if (this.renderer?.update) {
      this.renderer.update(deltaTime);
    }
  }

  render(context) {
    if (!this.active) return;

    if (this.renderer?.render) {
      this.renderer.render(context);
    }
  }

  stop() {
    this.active = false;
  }
}
