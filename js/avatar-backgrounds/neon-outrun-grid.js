import { createAnimatedRenderer } from './renderer-utils.js';

export function createBackgroundRenderer(canvas) {
  return createAnimatedRenderer(canvas, 'neon-outrun-grid', ({ context, width, height, time }) => {
    const horizon = height * .44;
    const phase = (time * .00016) % 1;
    const sky = context.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#020515'); sky.addColorStop(.55, '#10103b'); sky.addColorStop(1, '#03020e');
    context.fillStyle = sky; context.fillRect(0, 0, width, height);
    const sun = context.createRadialGradient(width / 2, horizon, 0, width / 2, horizon, width * .2);
    sun.addColorStop(0, 'rgba(255,70,190,.32)'); sun.addColorStop(1, 'rgba(255,70,190,0)');
    context.fillStyle = sun; context.fillRect(0, 0, width, height);
    context.lineWidth = Math.max(1, width / 700);
    for (let line = -8; line <= 8; line += 1) {
      context.strokeStyle = line % 2 ? 'rgba(0,230,255,.42)' : 'rgba(234,42,255,.4)';
      context.beginPath(); context.moveTo(width / 2 + line * width * .012, horizon); context.lineTo(width / 2 + line * width * .18, height); context.stroke();
    }
    for (let row = 0; row < 18; row += 1) {
      const depth = ((row + phase) / 18) ** 2;
      const y = horizon + depth * (height - horizon);
      context.strokeStyle = `rgba(108,80,255,${.18 + depth * .48})`;
      context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
    }
  }, { maxFps: 45 });
}
