import { fortressSize } from '../../../zcash-fortress.mjs?v=5';

// Use established blocked lots so the surrounding Survival routes stay open.
export const survivalMinerLots = [
  { name: 'DigiByte Industrial Tower', file: 'digibyte-tower', x: 3, y: 2, scale: 1.46 },
  { name: 'Bitcoin Cyber-Bull Tower', file: 'bitcoin-cyber-bull', x: 7, y: 2, scale: 1.38 },
  { name: 'Bitcoin Mining Fortress', file: 'bitcoin-fortress', x: 1, y: 18, scale: 1.05 },
  { name: 'DigiByte Mining Base', file: 'digibyte-base', x: 6, y: 13, scale: 1.1 },
  { name: 'Zcash Lunar Fortress', file: 'zcash-fortress', x: 16, y: 3, scale: 1.12 },
  { name: 'WAX Hornet Node', file: 'wax-hornet', x: 19, y: 8, scale: 1.04 },
  { name: 'Bitcoin Cash Bull Fortress', file: 'bitcoin-cash-bull', x: 16, y: 11, scale: 1.08 },
];

export const survivalZcashTower = { x: 1, y: 9, scale: 1.35 };

export function loadSurvivalMiners() {
  return survivalMinerLots.map(({ file, ...lot }) => {
    const fortress = new Image();
    fortress.src = new URL(`./miners/${file}.webp?v=1`, import.meta.url).href;
    return { ...lot, fortress, drawMiner: drawSurvivalMiner };
  });
}

// Each atlas stacks full-detail artwork above a transparent light layer.
// Twelve sampled phases pulse the lights while the rock footprint stays still.
export function drawSurvivalMiner(ctx, image, x, y, scale, time) {
  const { width, height, anchorY } = fortressSize;
  const sw = image.naturalWidth;
  const sh = image.naturalHeight / 2;
  const dw = width * scale;
  const dh = height * scale;
  const left = x - dw / 2;
  const top = y - anchorY * scale;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, sw, sh, left, top, dw, dh);
  const tick = time === null ? 0 : Math.floor(time * 12 + x / 80);
  const pulse = .5 - .5 * Math.cos(tick * Math.PI / 6);
  ctx.globalAlpha *= .12 + .88 * pulse;
  ctx.drawImage(image, 0, sh, sw, sh, left, top, dw, dh);
  ctx.restore();
}
