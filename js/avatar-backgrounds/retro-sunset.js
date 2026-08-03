import { createAnimatedRenderer } from './renderer-utils.js';

export function createBackgroundRenderer(canvas) {
  return createAnimatedRenderer(canvas, 'retro-sunset', ({ context, width, height, time }) => {
    context.imageSmoothingEnabled = false;
    const sky = context.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#101044'); sky.addColorStop(.5, '#8d176d'); sky.addColorStop(1, '#ff5a26');
    context.fillStyle = sky; context.fillRect(0, 0, width, height);
    const cx = width * (.5 + Math.sin(time * .00008) * .025), cy = height * .48, radius = width * .22;
    context.fillStyle = '#ffbd45'; context.beginPath(); context.arc(cx, cy, radius, Math.PI, 0); context.fill();
    context.fillStyle = '#9e236f';
    for (let band = 0; band < 7; band += 1) context.fillRect(cx - radius, cy - radius + band * radius * .27, radius * 2, Math.max(3, radius * .06));
    context.fillStyle = '#17102f'; context.beginPath(); context.moveTo(0, height * .72); context.lineTo(width * .2, height * .48); context.lineTo(width * .4, height * .73); context.lineTo(width * .66, height * .5); context.lineTo(width, height * .75); context.lineTo(width, height); context.lineTo(0, height); context.fill();
  }, { maxFps: 24 });
}
