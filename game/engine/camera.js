export class Camera {
  constructor(width, height) {
    this.x = 0;
    this.y = 0;
    this.width = width;
    this.height = height;
  }

  follow(target, worldWidth, worldHeight) {
    this.x = target.x - this.width / 2;
    this.y = target.y - this.height / 2;

    this.x = Math.max(0, Math.min(this.x, worldWidth - this.width));
    this.y = Math.max(0, Math.min(this.y, worldHeight - this.height));
  }

  apply(ctx) {
    ctx.translate(-Math.floor(this.x), -Math.floor(this.y));
  }
}
