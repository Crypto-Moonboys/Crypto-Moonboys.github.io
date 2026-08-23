// Level Render XP Bridge
// Connects XP entities to the Level 1 render pipeline.

export class LevelRenderXPBridge {
  constructor(renderer, xpRenderer) {
    this.renderer = renderer;
    this.xpRenderer = xpRenderer;
  }

  init(xpEntities = []) {
    this.xpEntities = xpEntities;
  }

  update(xpEntities = this.xpEntities || []) {
    this.xpEntities = xpEntities;
  }

  render(ctx, camera) {
    if (!this.xpRenderer || !this.xpRenderer.render) return;
    this.xpRenderer.render(ctx, this.xpEntities, camera);
  }
}
