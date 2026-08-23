// Level 1 Atlas Render Bridge
// Connects loaded atlas bundle data to the master render composer.

const Level1AtlasRenderBridge = {
  atlas: null,

  init(atlas) {
    this.atlas = atlas;
    return true;
  },

  getSprite(key) {
    if (!this.atlas) return null;
    return this.atlas[key] || null;
  },

  renderReady() {
    return !!this.atlas;
  }
};

export default Level1AtlasRenderBridge;
