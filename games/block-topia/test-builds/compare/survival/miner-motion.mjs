// Rectangles and fan pivots are measured in the 672 × 840 artwork frame.
// Keep the moving patches disjoint. Their fixed edges join the stationary sprite.
const rigs = {
  'bitcoin-cash-bull': {
    fans: [[153, 602, 23, 29, -.29], [208, 625, 23, 29, -.29], [264, 645, 24, 29, -.29]],
    dish: [116, 316, 100, 104], jaw: [351, 451, 139, 119],
  },
  'bitcoin-cash-freight': {
    fans: [[581, 506, 16, 22], [582, 564, 16, 22]],
    dish: [128, 250, 109, 95], jaw: [385, 399, 100, 138],
  },
  'bitcoin-cash-reactor': {
    fans: [[553, 490, 16, 22], [553, 550, 17, 22], [554, 607, 17, 22]],
    dish: [112, 209, 104, 102], jaw: [292, 360, 125, 133],
  },
  'bitcoin-cyber-bull': {
    fans: [[150, 604, 20, 23, -.25], [197, 620, 20, 23, -.25], [245, 635, 20, 23, -.25]],
    dish: [159, 292, 73, 83], jaw: [203, 483, 108, 110],
  },
  'bitcoin-fortress': {
    fans: [[397, 537, 18, 21, .27], [440, 515, 18, 21, .27], [484, 492, 18, 21, .27]],
    dish: [395, 245, 89, 80], jaw: [170, 513, 124, 103],
  },
  'bitcoin-refinery': {
    dish: [100, 238, 111, 102], jaw: [375, 384, 126, 161],
    pistons: [[94, 573, 46, 108], [150, 556, 46, 111], [210, 549, 47, 111]],
  },
  'bitcoin-signal-tower': {
    fans: [[144, 610, 20, 29], [198, 606, 21, 29], [251, 606, 23, 30]],
    dish: [109, 269, 110, 104], jaw: [358, 393, 144, 158],
  },
  'digibyte-base': {
    fans: [[153, 611, 17, 23, -.35], [194, 632, 18, 23, -.35], [236, 651, 19, 23, -.35]],
    dish: [137, 355, 100, 108], jaw: [357, 404, 130, 114],
  },
  'digibyte-fabrication': {
    fans: [[546, 521, 15, 20, -.3], [580, 530, 15, 20, -.3], [547, 574, 15, 20, -.3], [582, 584, 15, 20, -.3]],
    dish: [104, 284, 99, 87], jaw: [316, 439, 153, 142],
  },
  'digibyte-spire': {
    fans: [[130, 633, 22, 30, .14], [188, 626, 23, 30, .14], [247, 616, 24, 30, .14]],
    dish: [163, 270, 109, 90], jaw: [375, 417, 145, 149],
  },
  'digibyte-tower': {
    fans: [[194, 424, 16, 21, -.22], [194, 476, 16, 21, -.22], [195, 530, 16, 21, -.22]],
    dish: [142, 169, 108, 126], jaw: [341, 308, 158, 111],
  },
  'wax-hornet': {
    dish: [113, 444, 83, 68], jaw: [397, 449, 141, 118],
    wings: [[86, 266, 237, 178]], antenna: [450, 381, 126, 68],
  },
  'wax-server-depot': {
    fans: [[530, 483, 16, 22], [530, 543, 16, 23], [530, 599, 17, 22]],
    dish: [103, 214, 84, 87], jaw: [258, 371, 169, 166],
    wings: [[52, 301, 206, 126], [427, 285, 177, 143]],
  },
  'wax-wasp-relay': {
    fans: [[106, 658, 22, 25], [162, 658, 22, 25], [215, 655, 22, 27]],
    dish: [107, 282, 111, 92], jaw: [323, 413, 170, 153],
    wings: [[124, 374, 199, 120], [493, 373, 153, 121]],
    antenna: [224, 310, 355, 63],
  },
  'zcash-fortress': {
    fans: [[215, 565, 21, 26, .25], [216, 631, 21, 26, .25], [534, 544, 21, 25, -.25], [533, 609, 22, 26, -.25]],
    dish: [513, 299, 66, 72], jaw: [283, 407, 181, 132],
  },
  'zcash-foundry': {
    fans: [[570, 478, 16, 21], [571, 537, 16, 22], [571, 595, 16, 22]],
    dish: [134, 256, 102, 97], jaw: [324, 405, 153, 178],
  },
  'zcash-vault': {
    fans: [[126, 623, 21, 28, .15], [180, 621, 22, 29, .15], [237, 614, 22, 29, .15]],
    dish: [111, 279, 113, 98], jaw: [318, 395, 152, 149],
  },
  'zcash-miner': {
    // Large cooling fans on building face (3 main + 2 side)
    fans: [
      [90, 577, 17, 19, 0], [245, 592, 17, 19, 0], [360, 577, 16, 18, 0],
      [44, 545, 12, 14, 0], [414, 545, 12, 14, 0],
    ],
    // Satellite dish – upper right
    dish: [413, 331, 81, 75],
    // Devil face jaw – the golden demon mask mouth
    jaw: [152, 414, 173, 128],
    // Steam rising from left and right vents
    steam: [[88, 241, 35, 76], [372, 284, 32, 76]],
    // Top glowing spires / coin
    topGlow: [214, 127, 152, 90],
  },
};

function drawFan(ctx, image, [x, y, rx, ry, tilt = 0], angle) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, tilt, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(rx, ry);
  ctx.rotate(angle);
  ctx.scale(1 / rx, 1 / ry);
  ctx.rotate(-tilt);
  const span = Math.ceil(Math.max(rx, ry)) + 2;
  ctx.drawImage(image, x - span, y - span, span * 2, span * 2, -span, -span, span * 2, span * 2);
  ctx.restore();
}

// Each warp moves the middle of a patch and pins its edges to the frame.
// Squeezing a dish changes its visible aspect. Stretching the jaw and wings
// moves the actual metal silhouette and features, including transparent pixels.
const wave = phase => .5 - .5 * Math.cos(phase);
const motions = {
  dish: t => [Math.sin(t * 1.6) * .13, Math.cos(t * 1.6) * .042, -.32 * wave(t * 1.6), 0],
  jaw: t => [Math.sin(t * 1.7) * .041, .14 * wave(t * 2.45), -.09 * wave(t * 2.45), .16 * wave(t * 2.45)],
  wing: t => [Math.sin(t * 5) * .035, Math.sin(t * 5) * .12, 0, -.28 * wave(t * 5)],
  antenna: t => [Math.sin(t * 3.7) * .11, Math.sin(t * 3.7) * .045, -.15 * wave(t * 3.7), 0],
  piston: t => [0, Math.sin(t * 3.8) * .17, 0, -.25 * wave(t * 3.8)],
};

const split = size => [0, Math.round(size * .23), Math.round(size * .77), size];

function remap([start, near, far, end], offset, stretch) {
  const halfStretch = (far - near) * stretch / 2;
  return [
    start,
    Math.round(near + end * offset - halfStretch),
    Math.round(far + end * offset + halfStretch),
    end,
  ];
}

function createPatch(rect, motion) {
  const [x, y, width, height] = rect;
  const sourceX = split(width);
  const isJaw = motion === motions.jaw;
  // Hold the upper brow while the lower jaw opens around the hinge.
  const sourceY = isJaw ? [0, Math.round(height * .38), Math.round(height * .76), height] : split(height);
  let surface;
  let patchCtx;
  let lastTick;
  return {
    rect,
    draw(ctx, image, tick, phase) {
      if (!surface) {
        surface = document.createElement('canvas');
        surface.width = width;
        surface.height = height;
        patchCtx = surface.getContext('2d');
      }
      if (tick !== lastTick) {
        lastTick = tick;
        const [dx, dy, sx, sy] = motion(tick / 16 + phase);
        const destX = remap(sourceX, dx, sx);
        const destY = remap(sourceY, dy, sy);
        if (isJaw) destY[1] = sourceY[1];
        patchCtx.clearRect(0, 0, width, height);
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 3; col++) {
            patchCtx.drawImage(image,
              x + sourceX[col], y + sourceY[row], sourceX[col + 1] - sourceX[col], sourceY[row + 1] - sourceY[row],
              destX[col], destY[row], destX[col + 1] - destX[col], destY[row + 1] - destY[row]);
          }
        }
      }
      ctx.drawImage(surface, x, y);
    },
  };
}

// Draw rising steam puff from a vent region using canvas drawing (no image patch needed).
function drawSteam(ctx, [x, y, w, h], time, phase) {
  const puffs = 4;
  ctx.save();
  for (let i = 0; i < puffs; i++) {
    const t = ((time * 0.6 + phase + i / puffs) % 1);
    const rise = t * h * 1.4;
    const fade = t < 0.2 ? t / 0.2 : t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
    const r = (w * 0.35) * (0.5 + t * 0.8);
    const cx = x + w * 0.5 + Math.sin(t * Math.PI * 3 + phase + i) * w * 0.25;
    const cy = y + h - rise;
    ctx.globalAlpha = fade * 0.28;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#cdd8dc';
    ctx.fill();
  }
  ctx.restore();
}

// Draw top-glow pulse over the spire/coin region using the sprite's glow overlay frame.
function drawTopGlow(ctx, image, [x, y, w, h], time, phase, sw, sh) {
  const pulse = 0.5 - 0.5 * Math.cos((time * 2.1 + phase) * Math.PI);
  ctx.save();
  ctx.globalAlpha = 0.18 + 0.55 * pulse;
  // Sample same region from the glow (bottom) half of the sprite sheet
  ctx.drawImage(image, x, sh + y, w, h, x, y, w, h);
  ctx.restore();
}

export function createMinerMechanics(file) {
  const { fans = [], dish, jaw, wings = [], antenna, pistons = [], steam = [], topGlow } = rigs[file];
  const patches = [];
  if (dish) patches.push(createPatch(dish, motions.dish));
  if (jaw) patches.push(createPatch(jaw, motions.jaw));
  patches.push(...wings.map(rect => createPatch(rect, motions.wing)));
  patches.push(...pistons.map(rect => createPatch(rect, motions.piston)));
  if (antenna) patches.push(createPatch(antenna, motions.antenna));
  return {
    clipStatic(ctx, width, height) {
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      for (const { rect } of patches) ctx.rect(...rect);
      ctx.clip('evenodd');
    },
    draw(ctx, image, time, phase) {
      const tick = Math.floor(time * 16);
      patches.forEach((patch, index) => patch.draw(ctx, image, tick, phase + index * .34));
      fans.forEach((fan, index) => {
        const speed = 5.6 + (index % 3) * .53;
        drawFan(ctx, image, fan, (time * speed + phase + index) * (index % 2 ? -1 : 1));
      });
      // Steam puffs drawn over static frame (zcash-miner and future miners)
      steam.forEach((vent, index) => drawSteam(ctx, vent, time, phase + index * 0.61));
      // Top glow pulse using the sprite's glow overlay half
      if (topGlow) {
        const sw = image.naturalWidth;
        const sh = image.naturalHeight / 2;
        drawTopGlow(ctx, image, topGlow, time, phase, sw, sh);
      }
    },
  };
}
