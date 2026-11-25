import { fortressSize } from '../../../zcash-fortress.mjs?v=5';
import { createMinerMechanics } from './miner-motion.mjs?v=4';

// Reserve blocked tiles or open ground away from the existing road network.
export const survivalMinerLots = [
  { name: 'DigiByte Industrial Tower', file: 'digibyte-tower', x: 3, y: 2, scale: 1.46 },
  { name: 'Bitcoin Cyber-Bull Tower', file: 'bitcoin-cyber-bull', x: 7, y: 2, scale: 1.38 },
  { name: 'Bitcoin Mining Fortress', file: 'bitcoin-fortress', x: 1, y: 18, scale: 1.05 },
  { name: 'DigiByte Mining Base', file: 'digibyte-base', x: 6, y: 13, scale: 1.1 },
  { name: 'Zcash Lunar Fortress', file: 'zcash-fortress', x: 16, y: 3, scale: 1.12 },
  { name: 'WAX Hornet Node', file: 'wax-hornet', x: 19, y: 8, scale: 1.04 },
  { name: 'Bitcoin Cash Bull Fortress', file: 'bitcoin-cash-bull', x: 16, y: 11, scale: 1.08 },
  { name: 'DigiByte Communications Spire', file: 'digibyte-spire', x: 1, y: 12, scale: 1.35 },
  { name: 'WAX Wasp Relay', file: 'wax-wasp-relay', x: 4, y: 18, scale: .91 },
  { name: 'Bitcoin Refinery', file: 'bitcoin-refinery', x: 9, y: 14, scale: .9 },
  { name: 'Bitcoin Cash Freight Terminal', file: 'bitcoin-cash-freight', x: 19, y: 12, scale: .9 },
  { name: 'Zcash Foundry', file: 'zcash-foundry', x: 17, y: 16, scale: .94 },
  { name: 'DigiByte Fabrication Plant', file: 'digibyte-fabrication', x: 14, y: 18, scale: .94 },
  { name: 'Bitcoin Cash Reactor', file: 'bitcoin-cash-reactor', x: 11, y: 2, scale: 1.34 },
  { name: 'WAX Server Depot', file: 'wax-server-depot', x: 8, y: 18, scale: .9 },
  { name: 'Bitcoin Signal Tower', file: 'bitcoin-signal-tower', x: 17, y: 1, scale: 1.38 },
  { name: 'Zcash Vault', file: 'zcash-vault', x: 6, y: 6, scale: .88 },
  { name: 'Zcash Mining Fortress', file: 'zcash-miner', x: 10, y: 7, scale: 1.15 },
];

export const survivalZcashTower = { x: 1, y: 9, scale: 1.35 };

export function loadSurvivalMiners() {
  return survivalMinerLots.map(({ file, ...lot }) => {
    const fortress = new Image();
    fortress.src = new URL(`./miners/${file}.webp?v=2-neon`, import.meta.url).href;
    const mechanics = createMinerMechanics(file);
    const phase = (lot.x + lot.y * 2) * .47;
    return { ...lot, fortress, drawMiner: (ctx, image, x, y, scale, time) =>
      drawSurvivalMiner(ctx, image, x, y, scale, time, mechanics, phase) };
  });
}

// The foundation and structure stay registered to the lot while the parts move.
function drawSurvivalMiner(ctx, image, x, y, scale, time, mechanics, phase) {
  const { width, height, anchorY } = fortressSize;
  const sw = image.naturalWidth;
  const sh = image.naturalHeight / 2;
  ctx.save();
  ctx.translate(x - width * scale / 2, y - anchorY * scale);
  ctx.scale(width * scale / sw, height * scale / sh);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.save();
  if (time !== null) mechanics.clipStatic(ctx, sw, sh);
  ctx.drawImage(image, 0, 0, sw, sh, 0, 0, sw, sh);
  const tick = time === null ? 0 : Math.floor(time * 12 + x / 80);
  const pulse = .5 - .5 * Math.cos(tick * Math.PI / 6);
  ctx.globalAlpha *= .12 + .65 * pulse;
  ctx.drawImage(image, 0, sh, sw, sh, 0, 0, sw, sh);
  ctx.restore();

  if (time !== null) mechanics.draw(ctx, image, time, phase);
  ctx.restore();
}
