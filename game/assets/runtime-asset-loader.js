// NBG Game runtime asset loader
// Loads registered assets for Level 1 London Graffiti Run.

import { NBGAssetRegistry } from './asset-registry.js';
import { NBGRunnerAssetBinding } from './player/nbg-runner-asset-binding.js';

export class RuntimeAssetLoader {
  constructor(registry = NBGAssetRegistry) {
    this.assets = {};
    this.registry = registry || {};
    this.playerBinding = NBGRunnerAssetBinding;
  }

  async loadManifest(path = './assets/asset-manifest.json') {
    const response = await fetch(path);
    this.manifest = await response.json();
    this.registry = this.createRegistryFromManifest(this.manifest);
    return this.manifest;
  }

  createRegistryFromManifest(manifest) {
    if (!manifest?.world) return {};
    const layerNames = manifest.world.layerNames || ['sky', 'london-skyline', 'graffiti-wall', 'street'];
    const worldEntries = {};
    layerNames.forEach((name, index) => {
      const layer = manifest.world.layers[index];
      if (Array.isArray(layer)) {
        const sources = layer.map((entry) => `./assets/${entry}`);
        worldEntries[name] = sources;
        sources.forEach((src, layerIndex) => {
          worldEntries[`${name}:${layerIndex + 1}`] = src;
        });
        return;
      }
      worldEntries[name] = `./assets/${layer}`;
    });

    return {
      coin: `./assets/${manifest.objects.xpCoin}`,
      checkpoint: `./assets/${manifest.objects.checkpoint}`,
      finish: `./assets/${manifest.objects.finishFlag}`,
      ...worldEntries,
      rat: `./assets/${manifest.enemies.londonRat}`,
      pigeon: `./assets/${manifest.enemies.pigeon}`,
      bot: `./assets/${manifest.enemies.graffitiBot}`
    };
  }

  async loadRegistryAssets() {
    const entries = Object.entries(this.registry).filter(([, src]) => typeof src === 'string');

    await Promise.all(
      entries.map(([name, src]) => this.loadImage(name, src))
    );

    return this.assets;
  }

  async loadPlayerAnimations(path = this.playerBinding.manifest) {
    const response = await fetch(path);
    const manifest = await response.json();
    const animations = manifest.animations || {};

    await Promise.all(
      Object.entries(animations).map(async ([key, animation]) => {
        const src = this.resolveAssetPath(animation.spriteSheet);
        await this.loadImage(`nbg-runner:${key}`, src);
      })
    );

    this.playerManifest = manifest;
    return manifest;
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

  resolveAssetPath(src) {
    if (!src || src.startsWith('./') || src.startsWith('/') || /^(?:https?:)?\/\//.test(src)) return src;
    return src.startsWith('assets/') ? `./${src}` : `./assets/${src}`;
  }

  get(name) {
    return this.assets[name];
  }
}
