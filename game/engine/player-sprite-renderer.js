// NBG Runner sprite renderer
// Draws the current animation frame selected by player animation runtime.
// Uses the runtime asset registry key: nbg-runner.

export class PlayerSpriteRenderer {
  constructor(assetLoader) {
    this.assetLoader = assetLoader;
    this.spriteKey = 'nbg-runner';
  }

  init() {
    this.ready = true;
  }

  draw(ctx, player) {
    if (!this.ready || !player) return;

    const sprite = this.assetLoader.get(this.spriteKey);

    if (!sprite) {
      ctx.fillRect(player.x, player.y, 16, 24);
      return;
    }

    const frameWidth = player.frameWidth || 32;
    const frameHeight = player.frameHeight || 48;
    const frameX = (player.frameX || 0) * frameWidth;
    const frameY = (player.frameY || 0) * frameHeight;

    ctx.drawImage(
      sprite,
      frameX,
      frameY,
      frameWidth,
      frameHeight,
      player.x,
      player.y,
      32,
      48
    );
  }
}
