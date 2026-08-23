// NBG Game Asset Loader
// Loads approved SNES-upscaled London graffiti assets.

export class AssetLoader {
  constructor() {
    this.assets = {};
  }

  loadImage(name, src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.assets[name] = img;
        resolve(img);
      };
      img.src = src;
    });
  }

  get(name) {
    return this.assets[name];
  }
}
