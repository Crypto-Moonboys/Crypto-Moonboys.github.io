// Level 1 World Runtime
// Connects London environment loader with Level 1 runtime state.

export class Level1WorldRuntime {
  constructor(environmentLoader, renderPipeline) {
    this.environmentLoader = environmentLoader;
    this.renderPipeline = renderPipeline;
    this.world = null;
  }

  async init() {
    this.world = await this.environmentLoader.load();
    this.renderPipeline.setWorld(this.world);
    return this.world;
  }

  update(deltaTime) {
    if (!this.world) return;
    this.renderPipeline.update(deltaTime);
  }

  render(context, camera) {
    if (!this.world) return;
    this.renderPipeline.render(context, camera);
  }
}
