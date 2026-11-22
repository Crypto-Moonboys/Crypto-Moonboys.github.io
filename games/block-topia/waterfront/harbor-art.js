const muralPasses = [
  { color: "#56d9cf", strokes: [[[1,6],[5,1],[11,1],[8,6],[4,6],[2,10],[11,10]],[[13,10],[18,1],[22,1],[20,6],[15,6],[24,10]],[[26,10],[29,2],[34,1],[36,4],[30,9],[26,10]]] },
  { color: "#e66eaa", strokes: [[[1,10],[5,1],[8,7],[12,1],[16,2],[13,10]],[[19,1],[17,10],[23,9],[25,1]],[[29,1],[26,10],[35,10],[37,7],[30,5],[36,2]]] },
  { color: "#f4b46f", strokes: [[[1,2],[13,1]],[[8,1],[4,10]],[[13,10],[18,2],[24,1],[22,7],[14,7]],[[27,10],[31,2],[37,1],[35,6],[29,7],[37,10]]] }
];

const waterfrontSprites = {
  E: { file: "block-exchange", width: 32, maxHeight: 42 },
  V: { file: "cold-vault", width: 32, maxHeight: 42 },
  H: { file: "hash-house", width: 32, maxHeight: 42 },
  L: { file: "lucky-block-casino", width: 32, maxHeight: 42 },
  N: { file: "neon-ledger-casino", width: 32, maxHeight: 42 },
  A: { file: "afterblock-club", width: 32, maxHeight: 42 },
  h: { file: "lighthouse", width: 42, maxHeight: 52 },
  w: { file: "workshop", width: 32, maxHeight: 36 },
  c: { file: "apartments", width: 32, maxHeight: 51 },
  g: { file: "graffiti-wall", width: 32, maxHeight: 27 },
  s: { file: "record-shop", width: 32, maxHeight: 40 },
  b: { file: "warehouse", width: 32, maxHeight: 39 }
};

window.loadWaterfrontSprites = function loadWaterfrontSprites() {
  return Promise.all(Object.values(waterfrontSprites).map(sprite => new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      sprite.image = image;
      resolve();
    };
    image.onerror = resolve;
    image.src = "assets/hk-night/" + sprite.file + ".png";
  })));
};

/* Original pixel art. Terrain draws first, then objects and actors by ground position. */
window.drawWaterfront = function drawWaterfront(ctx, rows, player, district, time = null) {
  const { tileSize: size, tiles } = district;
  const width = rows[0].length;
  const rect = (color, x, y, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  const polygon = (color, points) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fill();
  };
  const tileAt = (x, y) => rows[y]?.[x] ?? (y < 2 ? "~" : ".");
  const roadAt = (x, y) => Boolean(tiles[tileAt(x, y)].walkable);
  // The mural reserves the promenade between the middle and east docks.
  const wallStart = 13;
  const wallEnd = 24;
  const hasSeawall = rows[2]?.slice(wallStart, wallEnd) === ".".repeat(wallEnd - wallStart);
  const objects = [];
  const beacons = [];
  const queue = (depth, draw) => objects.push({ depth, draw });

  function glow(x, y, radius, color) {
    const light = ctx.createRadialGradient(x, y, 0, x, y, radius);
    light.addColorStop(0, color);
    light.addColorStop(1, "transparent");
    rect(light, x - radius, y - radius, radius * 2, radius * 2);
  }

  function beacon(x, y, foreground) {
    const swing = Math.sin((time ?? 0) * Math.PI / 7) * 1.26;
    const angle = foreground ? Math.PI / 2 + swing : -Math.PI / 2 + swing;
    const length = foreground ? 172 : 220;
    const beam = ctx.createRadialGradient(x, y, 0, x, y, length);
    beam.addColorStop(0, foreground ? "#aeffeb96" : "#b4ffed75");
    beam.addColorStop(0.4, foreground ? "#70f3ed60" : "#70f3ed42");
    beam.addColorStop(1, "transparent");
    polygon(beam, [[x, y], ...[-0.12, 0.12].map(spread => [
      x + Math.cos(angle + spread) * length,
      y + Math.sin(angle + spread) * length * 0.72
    ])]);
  }

  function paintMural(x, y, width, pass, fraction) {
    if (fraction <= 0) return;
    const { color, strokes } = muralPasses[pass % muralPasses.length];
    const offset = pass % 2 ? 5 : 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + (pass % 2 ? width * (1 - fraction) : 0), y, width * fraction, 16);
    ctx.clip();
    for (const [ink, weight] of [["#262239", 4], [color, 2]]) {
      ctx.lineWidth = weight;
      ctx.strokeStyle = ink;
      for (const stroke of strokes) {
        ctx.beginPath();
        stroke.forEach(([sx, sy], i) => {
          const px = x + offset + sx * (width - 14) / 38;
          const py = y + 2 + sy;
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        ctx.stroke();
      }
    }
    rect(color, x + 11, y + 13, 4, 1);
    rect(color, x + width - 12, y + 3, 3, 1);
    ctx.restore();
  }

  function graffitiSeawall() {
    if (!hasSeawall) return;
    const x = wallStart * size;
    const y = 2 * size;
    const width = (wallEnd - wallStart) * size;
    rect("#171826", x, y + 3, width, 23);
    rect("#575061", x, y + 1, width, 4);
    rect("#81717e", x, y + 1, width, 1);
    rect("#4a3545", x + 1, y + 5, width - 2, 17);
    for (let row = 0; row < 3; row++) {
      const top = y + 6 + row * 5;
      rect("#362936", x + 1, top + 3, width - 2, 1);
      for (let col = 6 + (row % 2) * 4; col < width - 2; col += 8) {
        rect("#382d3b", x + col, top, 1, 4);
        rect("#604354", x + col + 1, top, 3, 1);
      }
    }
    rect("#292735", x, y + 22, width, 3);

    const panelWidth = (width - 12) / 3;
    for (let panel = 0; panel < 3; panel++) {
      const left = x + 6 + panel * panelWidth;
      const elapsed = (time ?? 0) + panel * 4;
      const pass = Math.floor(elapsed / 16) + 2;
      const progress = time === null ? 1 : (elapsed % 16) / 16;
      paintMural(left, y + 6, panelWidth, pass - 2, 1);
      paintMural(left, y + 6, panelWidth, pass - 1, 1);
      paintMural(left, y + 6, panelWidth, pass, progress);
      if (time === null) continue;
      const direction = pass % 2 ? -1 : 1;
      const hand = Math.round(left + panelWidth * (direction === 1 ? progress : 1 - progress));
      const artist = hand - direction * 5;
      const feet = y + 32;
      const step = Math.floor(time * 6) % 2;
      queue(feet, () => {
        rect("#10121caa", artist - 4, feet, 9, 2);
        rect("#242235", artist - 3, feet - 5, 2, 4 + step);
        rect("#242235", artist + 1, feet - 5, 2, 5 - step);
        rect(panel % 2 ? "#596ab1" : "#9d527a", artist - 4, feet - 12, 8, 8);
        rect("#b88867", artist - 2, feet - 15, 4, 4);
        rect("#303048", artist - 3, feet - 17, 6, 4);
        rect("#b88867", hand, feet - 14, 2, 4);
        const color = muralPasses[pass % muralPasses.length].color;
        rect(color, hand, feet - 15, 2, 2);
        for (let speck = 0; speck < 3; speck++) {
          const drift = (Math.floor(time * 12) + speck * 2) % 5;
          rect(color, hand + direction * (speck - 1), feet - 16 - drift, 1, 1);
        }
      });
    }

    // Slim floodlights sit on the coping and wash the wall from above.
    for (const fraction of [1 / 6, 1 / 2, 5 / 6]) {
      const mount = Math.round(x + width * fraction);
      glow(mount, y + 7, 24, "#ffcb7a57");
      rect("#1a1723", mount - 1, y - 3, 2, 5);
      rect("#242331", mount - 5, y - 4, 10, 4);
      rect("#79717b", mount - 4, y - 4, 8, 1);
      rect("#ffdb9a", mount - 4, y - 1, 8, 1);
    }
  }

  function smoke(x, y, phase) {
    for (let i = 0; i < 4; i++) {
      const age = ((time / 3.6 + phase + i / 4) % 1);
      const drift = Math.round(age * 13 + Math.sin(age * 6 + phase) * 2);
      const rise = Math.round(age * 24);
      const size = 2 + Math.floor(age * 5);
      rect("rgba(164, 157, 175, " + (0.43 * (1 - age)) + ")", x + drift, y - rise, size, size);
      rect("rgba(208, 194, 203, " + (0.25 * (1 - age)) + ")", x + drift + 1, y - rise - 1, size - 1, 2);
    }
  }

  function resident(col, row, seed) {
    const points = [[col, row]];
    for (let i = 0; i < 3; i++) {
      const [x, y] = points.at(-1);
      const neighbors = i === 0 ? [[x, y + 1]] : [[x, y + 1], [x - 1, y], [x + 1, y], [x, y - 1]];
      const next = neighbors.find(([nx, ny]) => roadAt(nx, ny) &&
        !points.some(([px, py]) => px === nx && py === ny));
      if (!next) break;
      points.push(next);
    }
    const steps = points.length - 1;
    if (!steps) return;
    const age = (time + seed % 19) % 20;
    const trip = steps * 0.75;
    if (age >= 2 * trip + 2) return;
    const progress = Math.min(age, trip, 2 * trip + 2 - age) / 0.75;
    const index = Math.min(Math.floor(progress), steps - 1);
    const blend = progress - index;
    const [ax, ay] = points[index];
    const [bx, by] = points[index + 1];
    const x = Math.round((ax + (bx - ax) * blend) * size + 16);
    const y = Math.round((ay + (by - ay) * blend) * size + 24);
    const step = age < trip || age > trip + 2 ? Math.floor(time * 7) % 2 : 0;
    queue(y, () => {
      rect("#161827a0", x - 4, y + 1, 9, 2);
      rect("#20232e", x - 3, y - 3, 2, 4 + step);
      rect("#20232e", x + 1, y - 3, 2, 5 - step);
      rect(seed % 2 ? "#559b90" : "#a65a83", x - 4, y - 10, 8, 7);
      rect("#c49371", x - 2, y - 14, 4, 4);
      rect("#373049", x - 3, y - 16, 6, 3);
    });
  }
  const groundAt = (col, row) => district.groundZones.find(({ bounds: [left, top, right, bottom] }) =>
    col >= left && col <= right && row >= top && row <= bottom)?.material;

  function curb(x, y, horizontal, length = 32) {
    rect("#242632", x, y, horizontal ? length : 4, horizontal ? 4 : length);
    rect("#696779", x, y, horizontal ? length : 3, horizontal ? 2 : length);
    for (let at = 6; at < length; at += 7) {
      rect("#484552", x + (horizontal ? at : 0), y + (horizontal ? 0 : at),
        horizontal ? 1 : 3, horizontal ? 2 : 1);
    }
  }

  function pavedSurface(tile, col, row, x, y, seed) {
    const surface = tile === "r" ? "#353a4d" : "#5d5264";
    const north = roadAt(col, row - 1);
    const south = roadAt(col, row + 1);
    const west = roadAt(col - 1, row);
    const east = roadAt(col + 1, row);
    const entrance = Object.hasOwn(waterfrontSprites, tileAt(col, row - 1));
    rect(surface, x + 4, y + 4, 24, 24);
    if (north || entrance) rect(surface, x + 4, y, 24, 5);
    if (south) rect(surface, x + 4, y + 27, 24, 5);
    if (west) rect(surface, x, y + 4, 5, 24);
    if (east) rect(surface, x + 27, y + 4, 5, 24);
    if (!north && !entrance) curb(x, y + 1, true);
    if (!south) curb(x, y + 27, true);
    if (!west) curb(x + 1, y + 5, false, 22);
    if (!east) curb(x + 27, y + 5, false, 22);

    if (tile === "p") {
      for (let dy = 6; dy < 27; dy += 5) {
        rect("#534b57", x + 5, y + dy, 22, 1);
        for (let dx = 8 + dy % 3; dx < 26; dx += 8) rect("#534b57", x + dx, y + dy, 1, 4);
      }
    } else {
      for (let i = 0; i < 18; i++) {
        rect(i % 2 ? "#575b69" : "#373c4a", x + 5 + (seed + i * 13) % 21,
          y + 5 + ((seed >>> 8) + i * 9) % 21, 2, 1);
      }
      if (west && east && !north && !south && !entrance) rect("#ac9870", x + 11, y + 15, 10, 1);
      if (north && south && !west && !east) rect("#ac9870", x + 15, y + 11, 1, 10);
      if (!south && seed % 5 === 0) {
        rect("#242733", x + 20, y + 24, 7, 3);
        for (let i = 21; i < 27; i += 2) rect("#666a78", x + i, y + 24, 1, 2);
      }
    }
    if (entrance) {
      rect("#72646b", x + 2, y - 3, 28, 7);
      rect("#aaa09a", x + 3, y + 2, 26, 1);
    }
  }

  function terrain(tile, col, row) {
    const x = col * size;
    const y = row * size;
    const seed = (col * 73856093 ^ row * 19349663) >>> 0;
    const water = tile === "~";
    const dock = tile === "d";

    const ground = tile === "." ? groundAt(col, row) : undefined;
    const base = ground === "grass" ? "#283b39" : ground === "gravel" ? "#342f3c" : "#1b1d2a";
    rect(water || dock ? "#0b192d" : base, x, y, size, size);
    for (let i = 0; i < 8; i++) {
      const a = (seed + i * 7) % 27;
      const b = ((seed >>> 7) + i * 11) % 30;
      const shade = i % 2 ? "#ffffff16" : "#091d2740";
      if (water || dock) rect(i % 2 ? "#569fc157" : "#142b47", x + a, y + b, 3 + i % 3, 1);
      else if (ground === "grass") {
        rect(i % 2 ? "#44594b" : "#202f2f", x + a, y + b, 1, 2);
        rect("#354942", x + a + 1, y + b + 1, 2, 1);
      } else if (ground === "gravel") {
        rect(i % 2 ? "#514752" : "#312c35", x + a, y + b, 3, 1);
        rect("#53484a", x + a + 1, y + b + 1, 1, 1);
      } else rect(shade, x + a, y + b, 2 + i % 3, 2);
    }

    if (water) {
      // Short, horizontal glints stay in the water and drift in the night light.
      const glint = (seed + Math.floor((time ?? 0) * 2)) % 22;
      if (seed % 3 === 0) rect("#54888566", x + 2 + glint, y + 11, 6, 1);
      if (tileAt(col, row + 1) !== "~" && tileAt(col, row + 1) !== "d") {
        rect("#252334", x, y + 24, size, 8);
        rect("#6c667b", x, y + 24, size, 3);
        rect("#43787f", x, y + 21, size, 1);
        rect("#3a5157", x + (col % 2 ? 8 : 20), y + 27, 2, 5);
      }
      return;
    }

    if (dock) {
      rect("#392c2b", x + 3, y, 26, size);
      for (let i = 0; i < 8; i++) {
        rect(i % 2 ? "#a17552" : "#906244", x + 4, y + i * 4, 24, 3);
        rect("#c69864", x + 5, y + i * 4, 21, 1);
      }
      for (const post of [3, 25]) {
        rect("#3d2929", x + post, y + 5, 5, 9);
        rect("#e0b37b", x + post, y + 4, 5, 3);
      }
      return;
    }

    if (tile === "r" || tile === "p") {
      pavedSurface(tile, col, row, x, y, seed);
      return;
    }

    if (Object.hasOwn(waterfrontSprites, tile)) {
      queue(y + 29, () => building(tile, x, y));
      if (tile === "h") {
        const image = waterfrontSprites.h.image;
        const { width, maxHeight } = waterfrontSprites.h;
        const height = image ? Math.round(Math.min(maxHeight, image.naturalHeight * width / image.naturalWidth) * 2) / 2 : 64;
        beacons.push([x + 16, image ? y + 29 - height * 0.83 : y - 17]);
      }
      if (time !== null && "cswELNA".includes(tile) && seed % 3 !== 1) resident(col, row, seed);
    } else if (tile === "." && row === 2) {
      if (hasSeawall && col >= wallStart && col < wallEnd) return;
      if (roadAt(col - 1, row) || roadAt(col + 1, row)) queue(y + 28, () => lamp(x + 16, y + 21));
      else if (seed % 4 === 0) queue(y + 28, () => mooring(x, y));
    } else if (tile === "." && (roadAt(col - 1, row) || roadAt(col + 1, row))) {
      if (seed % 4 === 0) queue(y + 28, () => lamp(x + 22, y + 23));
      else if (seed % 5 === 1) queue(y + 28, () => crates(x, y));
    } else if (tile === "." && seed % 11 === 3) {
      queue(y + 28, () => tree(x, y));
    } else if (tile === "." && seed % 5 === 1) {
      rect("#34323e", x + 8, y + 8, 13, 12);
      rect("#2b303b", x + 10, y + 10, 9, 8);
    }
  }

  function building(tile, x, y) {
    rect("#0c252c83", x + 4, y + 24, 29, 7);
    const sprite = waterfrontSprites[tile];
    if (sprite?.image) {
      const { image, width, maxHeight } = sprite;
      const scale = Math.min(width / image.naturalWidth, maxHeight / image.naturalHeight);
      const drawWidth = Math.round(image.naturalWidth * scale * 2) / 2;
      const drawHeight = Math.round(image.naturalHeight * scale * 2) / 2;
      const left = Math.round((x + (size - drawWidth) / 2) * 2) / 2;
      const top = y + 29 - drawHeight;
      ctx.drawImage(image, left, top, drawWidth, drawHeight);
      if (tile === "h") {
        const pulse = time === null ? 0.5 : 0.5 + 0.5 * Math.cos(time * Math.PI / 7);
        glow(x + 16, top + drawHeight * 0.17, 18 + pulse * 5, "#55ffdf88");
      }
      if ("cswELNA".includes(tile)) {
        const intensity = time === null ? 0.32 : 0.3 + 0.13 * Math.sin(time * 0.7 + (x + y) / 17);
        const windowX = tile === "c" ? 0.22 : 0.72;
        glow(left + drawWidth * windowX, top + drawHeight * 0.74, 9,
          "rgba(255, 177, 79, " + intensity + ")");
      }
      if (time !== null && "wc".includes(tile)) {
        smoke(left + drawWidth * (tile === "w" ? 0.25 : 0.55), top + drawHeight * 0.12, (x + y) / 137);
      }
      return;
    }

    if (tile === "h") {
      rect("#2e4449", x + 5, y + 23, 22, 6);
      rect("#8b8580", x + 8, y - 13, 16, 38);
      rect(tiles.h.color, x + 10, y - 13, 10, 38);
      rect("#b96853", x + 8, y + 1, 16, 5);
      rect("#433942", x + 12, y + 17, 7, 8);
      rect("#45525c", x + 5, y - 23, 22, 13);
      rect("#ffe5a2", x + 8, y - 21, 16, 7);
      rect("#81979b", x + 13, y - 21, 2, 7);
      polygon("#943e36", [[x+3,y-23],[x+16,y-34],[x+29,y-23]]);
      rect("#efaa72", x + 12, y - 29, 8, 2);
      glow(x + 16, y - 17, 17, "#55ffdf66");
      return;
    }

    if (tile === "g") {
      rect("#15131e", x + 1, y + 5, 30, 23);
      rect("#684652", x + 1, y + 6, 28, 19);
      rect("#a17b77", x + 1, y + 5, 28, 2);
      for (let i = 0; i < 5; i++) rect("#442e3b", x + 1, y + 9 + i * 3, 28, 1);
      graffiti(x + 4, y + 11, Math.floor(x / size) % 2);
      return;
    }

    const roof = tiles[tile].color;
    rect("#141623", x + 1, y + 9, 30, 20);
    rect(tile === "c" ? "#504f5e" : "#554151", x + 2, y + 9, 27, 18);
    rect("#262336", x, y - 4, 31, 15);
    rect(roof, x + 2, y - 4, 27, 11);
    rect("#ffffff26", x + 2, y - 3, 27, 1);
    rect("#211e2f", x + 5, y - 1, 9, 5);
    rect("#666777", x + 5, y - 1, 8, 2);
    rect("#1d1d2a", x + 1, y + 7, 29, 4);

    if (tile === "s") {
      rect("#e15ca5", x + 2, y + 10, 26, 2);
      rect("#202131", x + 3, y + 13, 15, 11);
      rect("#633a67", x + 4, y + 14, 13, 8);
      rect("#f198c7", x + 6, y + 14, 7, 7);
      rect("#322539", x + 7, y + 15, 5, 5);
      rect("#ffc678", x + 9, y + 17, 1, 1);
      rect("#75e0d9", x + 20, y + 13, 6, 2);
      rect("#312338", x + 20, y + 16, 6, 11);
      return;
    }
    if (tile === "c") {
      for (const windowX of [5, 13, 21]) {
        rect("#292637", x + windowX, y + 13, 5, 6);
        rect("#ffc983", x + windowX + 1, y + 14, 3, 3);
      }
      rect("#272938", x + 12, y + 21, 8, 7);
      rect("#74c2b4", x + 10, y + 20, 12, 1);
      return;
    }

    rect("#292635", x + 4, y + 12, 23, 14);
    for (let i = 0; i < 5; i++) rect("#696274", x + 5, y + 13 + i * 2, 21, 1);
    if (tile === "b") graffiti(x + 5, y + 13, 1);
    else {
      rect("#db8f55", x + 5, y + 12, 5, 2);
      rect("#a48765", x + 23, y - 8, 4, 10);
      rect("#d9aa74", x + 22, y - 8, 6, 2);
    }
  }

  function graffiti(x, y, variant) {
    // Original angular letterforms that read at tile scale.
    const strokes = variant
      ? [[0,7],[4,0],[5,5],[9,1],[10,7],[14,1],[18,1],[16,4],[20,7]]
      : [[0,6],[4,1],[7,1],[5,4],[8,4],[5,8],[11,7],[14,1],[16,6],[20,1],[19,7]];
    for (const [dx, dy, color, thickness] of [[1, 1, "#231b2e", 4], [0, 0, variant ? "#74e7d0" : "#f57cad", 2]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.beginPath();
      strokes.forEach(([sx, sy], i) => i ? ctx.lineTo(x + sx + dx, y + sy + dy) : ctx.moveTo(x + sx + dx, y + sy + dy));
      ctx.stroke();
    }
    rect(variant ? "#f99e6e" : "#f8e098", x + 17, y, 2, 1);
  }

  function crates(x, y) {
    rect("#171923", x + 8, y + 23, 17, 5);
    for (const [dx, dy] of [[8, 18], [16, 21]]) {
      rect("#976a4f", x + dx, y + dy, 8, 7);
      rect("#cb9870", x + dx, y + dy, 8, 1);
      rect("#5b3e3f", x + dx + 3, y + dy + 1, 1, 6);
    }
  }

  function tree(x, y) {
    rect("#152e327a", x + 7, y + 25, 23, 5);
    rect("#85614a", x + 13, y + 15, 5, 13);
    x += time === null ? 0 : Math.round(Math.sin(time * 1.7 + (x + y) / 31) * 1.6);
    polygon("#24463f", [[x+3,y+18],[x+9,y+4],[x+18,y+1],[x+28,y+9],[x+28,y+21],[x+19,y+24],[x+6,y+22]]);
    polygon("#537a5d", [[x+5,y+16],[x+10,y+5],[x+19,y+4],[x+24,y+9],[x+21,y+16],[x+10,y+19]]);
    rect("#8d9c60", x + 10, y + 8, 7, 2);
  }

  function mooring(x, y) {
    rect("#263d40", x + 3, y + 3, 25, 9);
    rect("#8f8f75", x + 3, y + 3, 25, 3);
    for (const dx of [5, 23]) {
      rect("#685640", x + dx, y + 2, 4, 8);
      rect("#cfab6d", x + dx, y + 1, 4, 3);
    }
    rect("#372f30", x + 7, y + 16, 10, 9);
    rect("#a37d52", x + 8, y + 16, 8, 6);
    rect("#d4a46c", x + 9, y + 17, 6, 1);
  }

  function lamp(x, y) {
    glow(x + 1, y - 3, 20, "#ffba7160");
    rect("#231f2a", x, y - 8, 2, 10);
    rect("#6f6857", x - 2, y - 13, 6, 6);
    rect("#ffe19a", x - 1, y - 12, 4, 3);
  }

  function actor() {
    const x = player.x * size + 16;
    const y = player.y * size + 22;
    rect("#1026338c", x - 6, y + 1, 15, 4);
    rect("#152b39", x - 4, y - 4, 3, 6);
    rect("#152b39", x + 2, y - 4, 3, 6);
    rect("#c17362", x - 5, y - 11, 10, 8);
    rect("#eac69e", x - 3, y - 15, 6, 5);
    rect("#39778c", x - 5, y - 17, 10, 4);
    rect("#bbf9f3", x + 5, y - 9, 4, 5);
  }

  rows.forEach((_, y) => {
    for (let x = 0; x < width; x++) terrain(tileAt(x, y), x, y);
  });
  beacons.forEach(([x, y]) => beacon(x, y, false));
  graffitiSeawall();
  queue(player.y * size + 22, actor);
  objects.sort((a, b) => a.depth - b.depth).forEach(({ draw }) => draw());
  beacons.forEach(([x, y]) => beacon(x, y, true));

};
