// NBG Runner sprite renderer
// Draws the current animation frame selected by player animation runtime.

export class PlayerSpriteRenderer {
  constructor(assetLoader) {
    this.assetLoader = assetLoader;
  }

  init() {
    this.ready = true;
  }

  draw(ctx, player) {
    if (!this.ready || !player) return;

    const sprite = this.assetLoader.get('nbg-runner');

    if (!sprite) {
      ctx.fillRect(player.x, player.y, 16, 24);
      return;
    }

    ctx.drawImage(
      sprite,
      player.frameX || 0,
      player.frameY || 0,
      player.frameWidth || 32,
      player.frameHeight || 48,
      player.x,
      player.y,
      32,
      48
    );
  }
}
