import { createAnimatedRenderer } from './renderer-utils.js';

export function createBackgroundRenderer(canvas) {
  return createAnimatedRenderer(canvas, 'pixel-fire', ({ context, width, height, time }) => {
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#050509'; context.fillRect(0, 0, width, height);
    const cell = Math.max(7, Math.round(width / 72));
    const rows = Math.ceil(height * .42 / cell), columns = Math.ceil(width / cell);
    for (let row = 0; row < rows; row += 1) {
      const strength = 1 - row / rows;
      for (let column = 0; column < columns; column += 1) {
        const wave = Math.sin(column * .78 + time * .0032) + Math.sin(column * .21 - time * .0018 + row);
        if (strength * 2.2 + wave * .26 < .72) continue;
        context.fillStyle = row < rows * .22 ? '#ffd04a' : row < rows * .52 ? '#f77822' : (column + row) % 17 === 0 ? '#22dbe5' : '#a61d26';
        context.fillRect(column * cell, height - (row + 1) * cell, cell + 1, cell + 1);
      }
    }
  }, { maxFps: 24 });
}
