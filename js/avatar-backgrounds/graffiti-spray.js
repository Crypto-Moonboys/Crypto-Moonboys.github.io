import { createAnimatedRenderer } from './renderer-utils.js';

function particles(count) {
  let seed = 0x53505259;
  return Array.from({ length: count }, () => {
    seed = (seed * 1664525 + 1013904223) >>> 0; const x = seed / 0x100000000;
    seed = (seed * 1664525 + 1013904223) >>> 0; const y = seed / 0x100000000;
    return { x, y, size: 1 + (seed % 6), drift: .00001 + (seed % 9) * .000003, color: ['#18e9f0', '#f4b52c', '#fff', '#ec35bb', '#e23a3a'][seed % 5] };
  });
}

export function createBackgroundRenderer(canvas) {
  const dots = particles(window.matchMedia('(max-width: 768px), (pointer: coarse)').matches ? 46 : 82);
  return createAnimatedRenderer(canvas, 'graffiti-spray', ({ context, width, height, time }) => {
    context.fillStyle = '#090a0d'; context.fillRect(0, 0, width, height);
    for (const dot of dots) {
      const x = ((dot.x + time * dot.drift) % 1) * width;
      const y = ((dot.y + Math.sin(time * .0002 + dot.x * 8) * .035 + 1) % 1) * height;
      context.globalAlpha = .24 + (dot.size % 4) * .1; context.fillStyle = dot.color;
      context.beginPath(); context.arc(x, y, dot.size * width / 500, 0, Math.PI * 2); context.fill();
    }
    context.globalAlpha = 1;
  }, { maxFps: 30 });
}
