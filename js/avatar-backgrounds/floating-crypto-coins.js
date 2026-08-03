import { createAnimatedRenderer } from './renderer-utils.js';

function makeCoins(count) {
  let seed = 0x434f494e;
  return Array.from({ length: count }, (_, index) => { seed = (seed * 1103515245 + 12345) >>> 0; return { x: (seed % 1000) / 1000, y: ((seed >>> 10) % 1000) / 1000, depth: .45 + ((seed >>> 20) % 50) / 100, speed: .000012 + (index % 5) * .000004 }; });
}

export function createBackgroundRenderer(canvas) {
  const coins = makeCoins(window.matchMedia('(max-width: 768px), (pointer: coarse)').matches ? 12 : 22);
  return createAnimatedRenderer(canvas, 'floating-crypto-coins', ({ context, width, height, time }) => {
    context.fillStyle = '#050711'; context.fillRect(0, 0, width, height);
    for (let index = 0; index < coins.length; index += 1) {
      const coin = coins[index], y = ((coin.y - time * coin.speed + 1) % 1) * height;
      const radius = width * .018 * coin.depth;
      const squash = .28 + Math.abs(Math.cos(time * .0007 + index)) * .72;
      context.fillStyle = squash > .75 ? '#f6c84a' : squash > .48 ? '#d99a25' : '#8d5511';
      context.beginPath(); context.ellipse(coin.x * width, y, radius * squash, radius, 0, 0, Math.PI * 2); context.fill();
      context.strokeStyle = '#ffe27a'; context.lineWidth = Math.max(1, radius * .12); context.stroke();
      if (squash > .65) { context.fillStyle = '#70400b'; context.font = `700 ${radius * 1.25}px sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText('₿', coin.x * width, y); }
    }
    context.textAlign = 'start';
  }, { maxFps: 36 });
}
