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

    const animation = this.animationController?.getCurrentAnimation?.();
    const animationKey = animation?.key || this.animationController?.state || null;
    const sprite = animationKey
      ? this.assetLoader?.get(`${this.spriteKey}:${animationKey}`) || animation?.image
      : null;
    const drawX = Math.round(player.x - (camera.x || 0));
    const drawY = Math.round(player.y - (camera.y || 0));

    if (!sprite || !sprite.complete) {
      ctx.fillRect(drawX, drawY, player.w || 16, player.h || 24);
      return;
    }

    const frame = this.animationController?.getFrame?.() ?? player.frameX ?? 0;
    const sourceFrameWidth = animation?.sourceFrameWidth || animation?.frameWidth || player.sourceFrameWidth || player.frameWidth || 32;
    const sourceFrameHeight = animation?.sourceFrameHeight || animation?.frameHeight || player.sourceFrameHeight || player.frameHeight || 48;
    const renderWidth = animation?.renderWidth || player.renderWidth || player.frameWidth || 40;
    const renderHeight = animation?.renderHeight || player.renderHeight || player.frameHeight || 48;
    const columns = animation?.columns || Math.max(1, Math.floor((sprite.naturalWidth || sourceFrameWidth) / sourceFrameWidth));
    const sourceX = (frame % columns) * sourceFrameWidth;
    const sourceY = Math.floor(frame / columns) * sourceFrameHeight;
    const frameDrawX = drawX - Math.round((renderWidth - (player.w || renderWidth)) / 2);
    const frameDrawY = drawY - Math.max(0, renderHeight - (player.h || renderHeight));

    ctx.save();
    if ((player.facing || 1) < 0) {
      ctx.translate(frameDrawX + renderWidth, frameDrawY);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, sourceX, sourceY, sourceFrameWidth, sourceFrameHeight, 0, 0, renderWidth, renderHeight);
      ctx.restore();
      return;
    }

    ctx.drawImage(
      sprite,
      sourceX,
      sourceY,
      sourceFrameWidth,
      sourceFrameHeight,
      frameDrawX,
      frameDrawY,
      renderWidth,
      renderHeight
    );
    ctx.restore();
  }
}

window.PlayerSpriteRenderer = PlayerSpriteRenderer;
