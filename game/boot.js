import { GAME_CONFIG } from './game-config.js';

export function bootNBGGame(canvas) {
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
