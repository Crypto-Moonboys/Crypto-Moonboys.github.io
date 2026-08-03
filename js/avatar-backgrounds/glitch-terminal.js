import { createAnimatedRenderer } from './renderer-utils.js';

const LINES = ['NBG BUILD 0xA17F', 'MOONBOY // BLOCK', 'WAX NODE READY', '0x09EF > BUILD', 'BLOCK 001101', 'NBG NETWORK OK'];

export function createBackgroundRenderer(canvas) {
  return createAnimatedRenderer(canvas, 'glitch-terminal', ({ context, width, height, time }) => {
    context.fillStyle = '#020806'; context.fillRect(0, 0, width, height);
    const font = Math.max(12, Math.round(width / 38));
    context.font = `${font}px ui-monospace, Consolas, monospace`; context.textBaseline = 'top';
    const scroll = (time * .012) % (font * 2);
    for (let row = -1; row < height / (font * 2) + 2; row += 1) {
      const y = row * font * 2 + scroll;
      const glitch = (Math.floor(time / 800) + row) % 11 === 0 ? font * .7 : 0;
      context.fillStyle = row % 4 ? 'rgba(53,235,150,.58)' : 'rgba(44,221,239,.68)';
      context.fillText(LINES[(row + LINES.length) % LINES.length], font + glitch, y);
    }
    context.fillStyle = 'rgba(100,255,190,.035)';
    for (let y = 0; y < height; y += 5) context.fillRect(0, y, width, 1);
  }, { maxFps: 24 });
}
