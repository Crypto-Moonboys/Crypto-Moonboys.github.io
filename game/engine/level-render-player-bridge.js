// Level Render Player Bridge
// Connects NBG Runner sprite renderer into the Level 1 render pipeline.

const LevelRenderPlayerBridge = {
  playerRenderer: null,
  initialized: false,

  init(renderer) {
    this.playerRenderer = renderer;
    this.initialized = true;
  },

  render(ctx, player, camera) {
    if (!this.initialized || !this.playerRenderer) return;

    this.playerRenderer.render(ctx, player, camera);
  }
};

if (typeof window !== 'undefined') {
  window.LevelRenderPlayerBridge = LevelRenderPlayerBridge;
}
