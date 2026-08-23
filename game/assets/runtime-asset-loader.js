// NBG Game runtime asset loader
// Loads sprite manifest entries for Level 1 London Graffiti Run.

export class RuntimeAssetLoader {
  constructor() {
    this.assets = {};
  }

  async loadManifest(path = './assets/sprite-manifest.json') {
    const response = await fetch(path);
    this.manifest = await response.json();
    return this.manifest;
  }

  loadImage(name, src) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        this.assets[name] = image;
        resolve(image);
      };
      image.src = src;
    });
  }

  get(name) {
    return this.assets[name];
  }
}
