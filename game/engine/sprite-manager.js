// NBG Sprite Manager
// Placeholder integration for final approved sprite sheets.

const NBGSpriteManager = {
  sheets: {},

  load(name, path) {
    const image = new Image();
    image.src = path;
    this.sheets[name] = image;
    return image;
  },

  draw(ctx, name, frame, x, y, width, height) {
    const sprite = this.sheets[name];
    if (!sprite || !sprite.complete) return;

    ctx.drawImage(
      sprite,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      x,
      y,
      width,
      height
    );
  }
};

window.NBGSpriteManager = NBGSpriteManager;
