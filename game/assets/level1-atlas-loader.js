// Level 1 atlas loader
// Loads the unified sprite atlas package and exposes assets to runtime systems.

const Level1AtlasLoader = {
  package: null,
  loaded: false,

  async load(configPath = './assets/level1-sprite-atlas-package.json') {
    const response = await fetch(configPath);
    this.package = await response.json();
    this.loaded = true;
    return this.package;
  },

  getPackage() {
    return this.package;
  }
};

window.Level1AtlasLoader = Level1AtlasLoader;
