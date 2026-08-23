// Level 1 atlas runtime bridge
// Connects the atlas loader to the active asset runtime.

const Level1AtlasRuntimeBridge = {
  atlas: null,
  loaded: false,

  init(atlasLoader) {
    this.atlas = atlasLoader || null;
    this.loaded = !!this.atlas;
    return this.loaded;
  },

  getAtlas() {
    return this.atlas;
  },

  isReady() {
    return this.loaded;
  }
};

export default Level1AtlasRuntimeBridge;
