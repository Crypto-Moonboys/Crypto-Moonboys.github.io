// NBG Runner sprite renderer
// Browser runtime sprite renderer for NBG Runner.

class PlayerSpriteRenderer {
  constructor(assetLoader, animationController = null) {
    this.assetLoader = assetLoader;
    this.animationController = animationController;
    this.spriteKey = 'nbg-runner';
    this.ready = false;
  }

  init() {
    this.ready = true;
  }

  draw(ctx, player) {
    if (!this.ready || !player) return;

    const sprite = this.assetLoader?.get(this.spriteKey);

    if (!sprite || !sprite.complete) {
      ctx.fillRect(player.x, player.y, 16, 24);
      return;
    }

    const animation = this.animationController?.getCurrentAnimation?.();
    const frame = this.animationController?.getFrame?.() || 0;

    const frameWidth = animation?.frameWidth || player.frameWidth || 32;
    const frameHeight = animation?.frameHeight || player.frameHeight || 48;
    const row = animation?.row || player.frameY || 0;

    ctx.drawImage(
      sprite,
      frame * frameWidth,
      row * frameHeight,
      frameWidth,
      frameHeight,
      player.x,
      player.y,
      32,
      48
    );
  }
}

window.PlayerSpriteRenderer = PlayerSpriteRenderer;
