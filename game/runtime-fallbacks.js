// NBG London Graffiti Run runtime fallback handling
// Prevents missing art assets from stopping the prototype.

const RuntimeFallbacks = {
  missingAsset(name) {
    console.warn('Missing asset:', name);
    return {
      type: 'placeholder',
      name,
      visible: true
    };
  },

  validateAssets(assets = {}) {
    return Object.keys(assets).map(key => {
      if (!assets[key]) return this.missingAsset(key);
      return assets[key];
    });
  }
};

window.RuntimeFallbacks = RuntimeFallbacks;
