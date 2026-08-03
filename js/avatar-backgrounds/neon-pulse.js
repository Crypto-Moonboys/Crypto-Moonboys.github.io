import { createAnimatedRenderer } from './renderer-utils.js';

export function createBackgroundRenderer(canvas) {
  return createAnimatedRenderer(canvas, 'neon-pulse', ({ context, width, height, time }) => {
    const phase = time * .00022;
    context.fillStyle = '#030515';
    context.fillRect(0, 0, width, height);
    const colors = ['rgba(0, 229, 255, .48)', 'rgba(76, 66, 255, .4)', 'rgba(214, 29, 255, .42)'];
    colors.forEach((color, index) => {
      const x = width * (.5 + Math.sin(phase * (index + 1) + index * 2) * .34);
      const y = height * (.5 + Math.cos(phase * .8 + index * 2.4) * .3);
      const radius = width * (.46 + Math.sin(phase * 2 + index) * .05);
      const glow = context.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, color);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);
    });
  }, { maxFps: 60 });
}
