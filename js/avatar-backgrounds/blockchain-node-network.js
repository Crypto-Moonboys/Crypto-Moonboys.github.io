import { createAnimatedRenderer } from './renderer-utils.js';

function makeNodes(count) {
  let seed = 0x4e4f4445;
  return Array.from({ length: count }, (_, index) => { seed = (seed * 1664525 + 1013904223) >>> 0; return { x: (seed % 1000) / 1000, y: ((seed >>> 10) % 1000) / 1000, phase: index * .71 }; });
}

export function createBackgroundRenderer(canvas) {
  const nodes = makeNodes(window.matchMedia('(max-width: 768px), (pointer: coarse)').matches ? 22 : 38);
  const positions = nodes.map(() => ({ x: 0, y: 0 }));
  return createAnimatedRenderer(canvas, 'blockchain-node-network', ({ context, width, height, time }) => {
    context.fillStyle = '#030811'; context.fillRect(0, 0, width, height);
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      positions[index].x = (node.x + Math.sin(time * .00015 + node.phase) * .025) * width;
      positions[index].y = (node.y + Math.cos(time * .00012 + node.phase) * .025) * height;
    }
    context.lineWidth = Math.max(1, width / 900);
    for (let a = 0; a < positions.length; a += 1) for (let b = a + 1; b < positions.length; b += 1) {
      const dx = positions[a].x - positions[b].x, dy = positions[a].y - positions[b].y, distance = Math.hypot(dx, dy);
      if (distance > width * .18) continue;
      context.strokeStyle = `rgba(46,218,235,${(1 - distance / (width * .18)) * .32})`;
      context.beginPath(); context.moveTo(positions[a].x, positions[a].y); context.lineTo(positions[b].x, positions[b].y); context.stroke();
    }
    positions.forEach((point, index) => { context.fillStyle = index % 5 ? '#d9f7f7' : '#e5aa2b'; context.beginPath(); context.arc(point.x, point.y, width * (index % 5 ? .004 : .007), 0, Math.PI * 2); context.fill(); });
  }, { maxFps: 30 });
}
