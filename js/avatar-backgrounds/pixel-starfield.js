import { createAnimatedRenderer } from './renderer-utils.js';

function makeStars(count = 90) {
  let seed = 0x4d4f4f4e;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  return Array.from({ length: count }, () => ({
    x: random() * 2 - 1,
    y: random() * 2 - 1,
    depth: .08 + random() * .92,
    speed: .00005 + random() * .00008,
    color: ['#ffffff', '#6cf7ff', '#79a8ff', '#ffd166'][Math.floor(random() * 4)],
  }));
}

export function createBackgroundRenderer(canvas) {
  const stars = makeStars();
  return createAnimatedRenderer(canvas, 'pixel-starfield', ({ context, width, height, time }) => {
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#01040f';
    context.fillRect(0, 0, width, height);
    const center = width / 2;
    for (const star of stars) {
      const depth = ((star.depth - time * star.speed) % 1 + 1) % 1;
      const scale = 1 / Math.max(.06, depth);
      const x = Math.round(center + star.x * center * scale * .82);
      const y = Math.round(center + star.y * center * scale * .82);
      const size = Math.max(1, Math.min(9, Math.round((1 - depth) * 7)));
      if (x < -size || y < -size || x > width + size || y > height + size) continue;
      context.fillStyle = star.color;
      context.fillRect(x, y, size, size);
    }
  }, { maxFps: 45 });
}
