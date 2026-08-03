import { createAnimatedRenderer } from './renderer-utils.js';

const TOKENS = ['BTC', '₿', '0', '1', 'BLOCK', 'A3F', '7C1', 'E09'];

export function createBackgroundRenderer(canvas) {
  return createAnimatedRenderer(canvas, 'bitcoin-code-rain', ({ context, width, height, time }) => {
    const fontSize = Math.max(11, Math.round(width / 48));
    const columns = Math.ceil(width / (fontSize * 1.5));
    context.fillStyle = '#020611';
    context.fillRect(0, 0, width, height);
    context.font = `700 ${fontSize}px ui-monospace, Consolas, monospace`;
    context.textBaseline = 'top';
    for (let column = 0; column < columns; column += 1) {
      const speed = .018 + (column % 5) * .004;
      const lead = (time * speed + column * 83) % (height + fontSize * 8);
      for (let trail = 0; trail < 7; trail += 1) {
        const y = lead - trail * fontSize * 1.55;
        if (y < -fontSize || y > height) continue;
        context.fillStyle = trail === 0 ? '#ffd76a' : `rgba(232, 153, 24, ${.64 - trail * .075})`;
        context.fillText(TOKENS[(column * 3 + trail + Math.floor(time / 900)) % TOKENS.length], column * fontSize * 1.5, y);
      }
    }
  }, { maxFps: 36 });
}
