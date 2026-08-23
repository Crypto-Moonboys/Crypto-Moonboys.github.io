// Enemy Sprite Renderer
// Handles Level 1 enemy visuals: rat, pigeon, graffiti bot.

export class EnemySpriteRenderer {
  constructor(assetLoader) {
    this.assetLoader = assetLoader;
  }

  init() {
    return true;
  }

  render(enemy, ctx, camera) {
    if (!enemy || !ctx) return;

    const x = enemy.x - (camera?.x || 0);
    const y = enemy.y - (camera?.y || 0);

    const sprite = this.assetLoader?.get?.(enemy.sprite);

    if (sprite) {
      ctx.drawImage(sprite, x, y);
      return;
    }

    // Placeholder fallback while final artwork is imported.
    ctx.fillRect(x, y, enemy.width || 16, enemy.height || 16);
  }
}
