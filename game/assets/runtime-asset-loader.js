// NBG Game runtime asset loader
// Loads registered assets for Level 1 London Graffiti Run.

import { NBGAssetRegistry } from './asset-registry.js';

export class RuntimeAssetLoader {
  constructor(registry = NBGAssetRegistry) {
    this.assets = {};
    this.registry = registry;
  }

  async loadManifest(path = './assets/sprite-manifest.json') {
    const response = await fetch(path);
    this.manifest = await response.json();
    return this.manifest;
  }

  async loadRegistryAssets() {
    const entries = Object.entries(this.registry);

    await Promise.all(
      entries.map(([name, src]) => this.loadImage(name, src))
    );

    return this.assets;
  }

  loadImage(name, src) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        this.assets[name] = image;
        resolve(image);
      };
      image.onerror = () => {
        console.warn(`Missing asset: ${src}`);
        resolve(null);
      };
      image.src = src;
    });
  }

  get(name) {
    return this.assets[name];
  }
}
