import { createAnimatedRenderer } from './renderer-utils.js';

function skyline(context, width, height, offset, scale, color, windowColor) {
  const unit = Math.max(8, Math.round(width / 44));
  for (let index = -2; index < 48; index += 1) {
    const x = Math.round(((index * unit * 1.7 - offset) % (width + unit * 4)) - unit * 2);
    const buildingHeight = unit * (4 + ((index * 7) % 9));
    const y = Math.round(height - buildingHeight * scale);
    context.fillStyle = color; context.fillRect(x, y, unit * 1.4, height - y);
    context.fillStyle = windowColor;
    for (let floor = 1; floor < buildingHeight * scale / unit; floor += 2) context.fillRect(x + unit * .3, y + floor * unit, unit * .35, unit * .35);
  }
}

export function createBackgroundRenderer(canvas) {
  return createAnimatedRenderer(canvas, 'pixel-arcade-city', ({ context, width, height, time }) => {
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#05071a'; context.fillRect(0, 0, width, height);
    skyline(context, width, height * .78, time * .006, .55, '#15144a', '#704cff');
    skyline(context, width, height, time * .014, 1, '#070a20', '#31ddec');
    context.fillStyle = '#1a1740'; context.fillRect(0, height * .91, width, height * .09);
  }, { maxFps: 30 });
}
