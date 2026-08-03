import { createAnimatedRenderer } from './renderer-utils.js';

const TOKENS = ['0', '1', 'NBG', 'WAX', 'BTC', 'MOONBOY'];

export function createBackgroundRenderer(canvas) {
  const columns = [];
  let firstFrame = true;
  return createAnimatedRenderer(canvas, 'matrix-rain', ({ context, width, height, time }) => {
    const fontSize = Math.max(12, Math.round(width / 52));
    const count = Math.ceil(width / fontSize);
    while (columns.length < count) columns.push((columns.length * 37) % Math.ceil(height / fontSize));
    context.fillStyle = firstFrame ? '#010704' : 'rgba(1, 7, 4, .18)';
    context.fillRect(0, 0, width, height);
    firstFrame = false;
    context.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Consolas, monospace`;
    context.textBaseline = 'top';
    for (let index = 0; index < count; index += 1) {
      const step = Math.floor(time / 74) + index * 11;
      const y = (columns[index] * fontSize + time * (.035 + (index % 5) * .004)) % (height + fontSize * 4) - fontSize * 2;
      for (let trail = 0; trail < 5; trail += 1) {
        const alpha = Math.max(.08, .62 - trail * .12);
        context.fillStyle = trail === 0 && index % 7 === 0
          ? 'rgba(175, 255, 196, .76)'
          : `rgba(31, 238, 95, ${alpha})`;
        context.fillText(TOKENS[(step + trail) % TOKENS.length], index * fontSize, y - trail * fontSize * 1.55);
      }
    }
  }, { maxFps: 45 });
}
