// NBG Game runtime asset loader
// Loads registered assets for Level 1 London Graffiti Run.

import { NBGAssetRegistry } from './asset-registry.js';
import { NBGRunnerAssetBinding } from './player/nbg-runner-asset-binding.js';

export class RuntimeAssetLoader {
  constructor(registry = NBGAssetRegistry) {
    this.assets = {};
    this.registry = registry || {};
  }

  async loadManifest(path = NBGRunnerAssetBinding.manifest) {
    const response = await fetch(path);
    this.manifest = await response.json();
    this.registry = this.createRegistryFromManifest(this.manifest);
    return this.manifest;
  }

  createRegistryFromManifest(manifest) {
    if (!manifest?.player) return {};

    return {
      'nbg-runner': `./assets/${manifest.player.spriteSheet}`,
      coin: `./assets/${manifest.objects.xpCoin}`,
      checkpoint: `./assets/${manifest.objects.checkpoint}`,
      finish: `./assets/${manifest.objects.finishFlag}`,
      sky: `./assets/${manifest.world.layers[0]}`,
      skyline: `./assets/${manifest.world.layers[1]}`,
      wall: `./assets/${manifest.world.layers[2]}`,
      street: `./assets/${manifest.world.layers[3]}`,
      rat: `./assets/${manifest.enemies.londonRat}`,
      pigeon: `./assets/${manifest.enemies.pigeon}`,
      bot: `./assets/${manifest.enemies.graffitiBot}`
    };
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
      if (typeof src !== 'string') {
        resolve(null);
        return;
      }

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
