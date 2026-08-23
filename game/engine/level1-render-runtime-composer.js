// Level 1 Render Runtime Composer
// Combines the master render composer with the active Level 1 runtime.

export class Level1RenderRuntimeComposer {
  constructor(composer) {
    this.composer = composer;
    this.active = false;
  }

  init() {
    this.active = true;
    if (this.composer && this.composer.init) {
      this.composer.init();
    }
  }

  render(state) {
    if (!this.active) return;

    if (this.composer && this.composer.render) {
      this.composer.render(state);
    }
  }

  stop() {
    this.active = false;
  }
}
