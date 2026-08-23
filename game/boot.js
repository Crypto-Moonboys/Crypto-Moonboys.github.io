// NBG London Graffiti Run browser boot
// Exposes the game boot function for the demo launcher.

(function () {
  async function bootNBGGame(canvas) {
    const configModule = await import('./game-config.js');
    const GAME_CONFIG = configModule.GAME_CONFIG;

    const ctx = canvas.getContext('2d');
    canvas.width = GAME_CONFIG.width;
    canvas.height = GAME_CONFIG.height;
    ctx.imageSmoothingEnabled = false;

    return {
      canvas,
      ctx,
      config: GAME_CONFIG,
      state: 'running',
      level: GAME_CONFIG.level
    };
  }

  window.bootNBGGame = bootNBGGame;
})();
