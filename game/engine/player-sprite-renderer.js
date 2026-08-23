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

  render(ctx, player, camera = { x: 0, y: 0 }) {
    if (!this.ready || !player) return;

    const spriteKey = player.sprite || this.spriteKey;
    const sprite = this.assetLoader?.get(spriteKey);
    const drawX = Math.round(player.x - (camera.x || 0));
    const drawY = Math.round(player.y - (camera.y || 0));

    if (!sprite || !sprite.complete) {
      ctx.fillRect(drawX, drawY, player.w || 16, player.h || 24);
      return;
    }

    const animation = this.animationController?.getCurrentAnimation?.();
    const frame = this.animationController?.getFrame?.() ?? player.frameX ?? 0;
    const frameWidth = animation?.frameWidth ?? this.animationController?.frameWidth ?? player.frameWidth ?? 32;
    const frameHeight = animation?.frameHeight ?? this.animationController?.frameHeight ?? player.frameHeight ?? 48;
    const row = animation?.row ?? player.frameY ?? 0;

    ctx.save();
    if ((player.facing || 1) < 0) {
      ctx.translate(drawX + frameWidth, drawY);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, frame * frameWidth, row * frameHeight, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
      ctx.restore();
      return;
    }

    ctx.drawImage(
      sprite,
      frame * frameWidth,
      row * frameHeight,
      frameWidth,
      frameHeight,
      drawX,
      drawY,
      frameWidth,
      frameHeight
    );
    ctx.restore();
  }
}

window.PlayerSpriteRenderer = PlayerSpriteRenderer;
