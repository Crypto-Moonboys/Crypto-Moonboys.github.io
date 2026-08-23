// XP Coin Renderer
// Connects collectible XP coins to the Level 1 render pipeline.

const XPCoinRenderer = {
  initialized: false,
  asset: null,

  init(asset) {
    this.asset = asset || null;
    this.initialized = true;
  },

  render(ctx, coins, camera) {
    if (!ctx || !coins) return;

    coins.forEach((coin) => {
      const x = coin.x - (camera?.x || 0);
      const y = coin.y - (camera?.y || 0);

      if (this.asset) {
        ctx.drawImage(this.asset, x, y);
      } else {
        ctx.fillText('XP', x, y);
      }
    });
  }
};

export default XPCoinRenderer;
