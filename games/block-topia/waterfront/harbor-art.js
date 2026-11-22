const muralPasses = [
  { color: "#56d9cf", strokes: [[[1,6],[5,1],[11,1],[8,6],[4,6],[2,10],[11,10]],[[13,10],[18,1],[22,1],[20,6],[15,6],[24,10]],[[26,10],[29,2],[34,1],[36,4],[30,9],[26,10]]] },
  { color: "#e66eaa", strokes: [[[1,10],[5,1],[8,7],[12,1],[16,2],[13,10]],[[19,1],[17,10],[23,9],[25,1]],[[29,1],[26,10],[35,10],[37,7],[30,5],[36,2]]] },
  { color: "#f4b46f", strokes: [[[1,2],[13,1]],[[8,1],[4,10]],[[13,10],[18,2],[24,1],[22,7],[14,7]],[[27,10],[31,2],[37,1],[35,6],[29,7],[37,10]]] }
];

const waterfrontSprites = {
  E: { file: "block-exchange", width: 54, maxHeight: 67 },
  V: { file: "cold-vault", width: 48, maxHeight: 51 },
  H: { file: "hash-house", width: 56, maxHeight: 65 },
  L: { file: "lucky-block-casino", width: 58, maxHeight: 62 },
  N: { file: "neon-ledger-casino", width: 54, maxHeight: 63 },
  A: { file: "afterblock-club", width: 55, maxHeight: 64 },
  h: { file: "lighthouse", width: 52, maxHeight: 78 },
  w: { file: "workshop", width: 46, maxHeight: 54 },
  c: { file: "apartments", width: 55, maxHeight: 72 },
  g: { file: "graffiti-wall", width: 32, maxHeight: 27 },
  s: { file: "record-shop", width: 46, maxHeight: 56 },
  b: { file: "warehouse", width: 49, maxHeight: 55 }
};

const waterfrontTerrain = Object.fromEntries(
  ["curb-straight", "curb-corner", "footpath-pavers"].map(file => [file, { file }])
);

const waterfrontTrees = [
  { file: "tree-banyan", height: 31 },
  { file: "tree-camphor", height: 36 },
  { file: "tree-palm", height: 39 },
  { file: "tree-ornamental", height: 25 },
  { file: "tree-casuarina", height: 38 },
  { file: "tree-frangipani", height: 28 },
  { file: "tree-mangrove", height: 23 },
  { file: "tree-paperbark", height: 35 }
];

// Groves sit inside grass lots. Each entry lists the tree variants from back to front.
const waterfrontGroves = new Map([
  ["8,3", [1, 0, 5]],
  ["10,4", [7, 3]],
  ["15,4", [4, 6, 5]],
  ["18,7", [2, 5]],
  ["11,11", [4, 0, 7]],
  ["20,11", [7, 2, 3]]
]);

const waterfrontAtlases = {
  "hk-night": {
    "afterblock-club": [2, 2, 111, 115],
    "apartments": [128, 2, 100, 118],
    "block-exchange": [254, 2, 108, 116],
    "cold-vault": [380, 2, 122, 113],
    "graffiti-wall": [2, 124, 105, 35],
    "hash-house": [128, 124, 108, 109],
    "lighthouse": [254, 124, 107, 117],
    "lucky-block-casino": [380, 124, 113, 108],
    "neon-ledger-casino": [2, 246, 103, 108],
    "record-shop": [128, 246, 105, 105],
    "warehouse": [254, 246, 106, 100],
    "workshop": [380, 246, 107, 108]
  },
  "trees": {
    "tree-banyan": [2, 2, 123, 115],
    "tree-camphor": [129, 2, 80, 122],
    "tree-casuarina": [256, 2, 68, 120],
    "tree-frangipani": [383, 2, 114, 117],
    "tree-mangrove": [2, 129, 120, 92],
    "tree-ornamental": [129, 129, 88, 112],
    "tree-palm": [256, 129, 79, 122],
    "tree-paperbark": [383, 129, 46, 123]
  },
  "street-detail": {
    "flowers-0": [2, 2, 30, 23],
    "flowers-1": [34, 2, 30, 21],
    "flowers-2": [66, 2, 30, 22],
    "flowers-3": [98, 2, 30, 21],
    "flowers-4": [130, 2, 30, 27],
    "flowers-5": [162, 2, 30, 25],
    "flowers-6": [194, 2, 30, 26],
    "flowers-7": [226, 2, 30, 25],
    "flowers-8": [2, 34, 30, 27],
    "flowers-9": [34, 34, 28, 30],
    "flowers-10": [66, 34, 30, 21],
    "flowers-11": [98, 34, 30, 28],
    "furniture-0": [2, 66, 20, 30],
    "furniture-1": [34, 66, 22, 30],
    "furniture-2": [66, 66, 28, 30],
    "furniture-3": [98, 66, 22, 30],
    "furniture-4": [130, 66, 30, 20],
    "furniture-5": [162, 66, 30, 20],
    "furniture-6": [194, 66, 30, 19],
    "furniture-7": [226, 66, 30, 14],
    "furniture-8": [2, 98, 16, 30],
    "furniture-9": [34, 98, 24, 30],
    "furniture-10": [66, 98, 9, 30],
    "furniture-11": [98, 98, 15, 30],
    "grass": [0, 128, 64, 64]
  },
  "terrain": {
    "curb-corner": [2, 2, 11, 11],
    "curb-straight": [30, 2, 24, 4],
    "footpath-pavers": [58, 2, 20, 20]
  }
};

const waterfrontDetails = Object.fromEntries(
  Object.keys(waterfrontAtlases["street-detail"]).map(file => [file, { file }])
);

window.loadWaterfrontSprites = function loadWaterfrontSprites() {
  const sprites = Object.fromEntries(
    [...Object.values(waterfrontSprites), ...Object.values(waterfrontTerrain), ...waterfrontTrees, ...Object.values(waterfrontDetails)]
      .map(sprite => [sprite.file, sprite])
  );
  return Promise.all(Object.entries(waterfrontAtlases).map(([group, frames]) => new Promise(resolve => {
    const atlas = new Image();
    atlas.onload = () => {
      for (const [file, [x, y, width, height]] of Object.entries(frames)) {
        // Existing drawing and repeating patterns use an isolated sprite surface.
        const sprite = document.createElement("canvas");
        sprite.width = width;
        sprite.height = height;
        sprite.getContext("2d").drawImage(atlas, x, y, width, height, 0, 0, width, height);
        sprites[file].image = sprite;
      }
      resolve();
    };
    atlas.onerror = resolve;
    atlas.src = "assets/atlases/" + group + ".png";
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
  const harbor = district.harborOffset;
  const quayRow = harbor.y + 2;
  const wallStart = harbor.x + 13;
  const wallEnd = harbor.x + 24;
  const hasSeawall = rows[quayRow]?.slice(wallStart, wallEnd) === ".".repeat(wallEnd - wallStart);
  // Keep doors and people readable without widening the walkable grid.
  const personScale = 0.55;
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
    const y = quayRow * size;
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
      const artist = hand - direction * 3;
      const feet = y + 26;
      const step = Math.floor(time * 6) % 2;
      queue(feet, () => {
        person(artist, feet, panel % 2 ? "#596ab1" : "#9d527a", "#303048", step);
        rect("#b88867", hand, feet - 7, 1, 2);
        const color = muralPasses[pass % muralPasses.length].color;
        rect(color, hand, feet - 8, 1, 2);
        for (let speck = 0; speck < 3; speck++) {
          const drift = (Math.floor(time * 12) + speck * 2) % 5;
          rect(color, hand + direction * (speck - 1), feet - 9 - drift, 1, 1);
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

  function resident(col, row, seed, door) {
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
    const center = (ax + (bx - ax) * blend) * size + 16;
    const x = Math.round(index === 0 ? center + (door - (col * size + 16)) * (1 - blend) : center);
    const y = Math.round((ay + (by - ay) * blend) * size + 24);
    const step = age < trip || age > trip + 2 ? Math.floor(time * 7) % 2 : 0;
    queue(y, () => person(x, y, seed % 2 ? "#559b90" : "#a65a83", "#373049", step));
  }
  const groundAt = (col, row) => district.groundZones.find(({ bounds: [left, top, right, bottom] }) =>
    col >= left && col <= right && row >= top && row <= bottom)?.material;

  const grass = waterfrontDetails.grass.image;
  const grassPattern = grass && ctx.createPattern(grass, "repeat");
  const paving = waterfrontTerrain["footpath-pavers"].image;
  const pavingPattern = paving && ctx.createPattern(paving, "repeat");

  function curbCorner(x, y, flipX, flipY) {
    const image = waterfrontTerrain["curb-corner"].image;
    if (!image) return;
    ctx.save();
    ctx.translate(x + (flipX ? 11 : 0), y + (flipY ? 11 : 0));
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(image, 0, 0);
    ctx.restore();
  }

  function curb(x, y, horizontal, length) {
    const image = waterfrontTerrain["curb-straight"].image;
    if (image) {
      ctx.save();
      ctx.translate(x + (horizontal ? 0 : 4), y);
      if (!horizontal) ctx.rotate(Math.PI / 2);
      ctx.drawImage(image, 0, 0, length, 4);
      ctx.restore();
      return;
    }
    rect("#242632", x, y, horizontal ? length : 4, horizontal ? 4 : length);
    rect("#696779", x, y, horizontal ? length : 3, horizontal ? 2 : length);
    for (let at = 6; at < length; at += 7) {
      rect("#484552", x + (horizontal ? at : 0), y + (horizontal ? 0 : at),
        horizontal ? 1 : 3, horizontal ? 2 : 1);
    }
  }

  function pavedSurface(tile, col, row, x, y, seed) {
    const street = tile === "r";
    const surface = street ? "#353a4d" : pavingPattern || "#5d5264";
    const northTile = tileAt(col, row - 1);
    const north = roadAt(col, row - 1);
    const south = roadAt(col, row + 1);
    const west = roadAt(col - 1, row);
    const east = roadAt(col + 1, row);
    const entrance = Object.hasOwn(waterfrontSprites, northTile);
    const inset = street ? 7 : 9;
    const lane = size - 2 * inset;
    const edge = size - inset;
    rect(surface, x + inset, y + inset, lane, lane);
    if (north) rect(surface, x + inset, y, lane, inset + 1);
    if (south) rect(surface, x + inset, y + edge - 1, lane, inset + 1);
    if (west) rect(surface, x, y + inset, inset + 1, lane);
    if (east) rect(surface, x + edge - 1, y + inset, inset + 1, lane);

    if (!north && !entrance) curb(x + (west ? 0 : inset), y + inset - 2, true,
      lane + (west ? inset : 0) + (east ? inset : 0));
    if (!south) curb(x + (west ? 0 : inset), y + edge, true,
      lane + (west ? inset : 0) + (east ? inset : 0));
    if (!west) curb(x + inset - 3, y + (north ? 0 : inset), false,
      lane + (north ? inset : 0) + (south ? inset : 0));
    if (!east) curb(x + edge, y + (north ? 0 : inset), false,
      lane + (north ? inset : 0) + (south ? inset : 0));

    if (!north && !entrance && !west) curbCorner(x + inset - 3, y + inset - 2, false, false);
    if (!north && !entrance && !east) curbCorner(x + edge - 7, y + inset - 2, true, false);
    if (!south && !west) curbCorner(x + inset - 3, y + edge - 7, false, true);
    if (!south && !east) curbCorner(x + edge - 7, y + edge - 7, true, true);

    if (street) {
      for (let i = 0; i < 12; i++) {
        rect(i % 2 ? "#575b69" : "#373c4a", x + inset + (seed + i * 13) % (lane - 2),
          y + inset + ((seed >>> 8) + i * 9) % lane, 2, 1);
      }
      if (seed % 4 === 0) {
        rect("#292d3c", x + inset + 2, y + inset + 3, 5, 1);
        rect("#292d3c", x + inset + 6, y + inset + 4, 1, 2);
        rect("#4d646b", x + inset + 3, y + inset + 3, 2, 1);
      }
      if (west && east && !north && !south && !entrance) rect("#ac9870", x + 12, y + 15, 8, 1);
      if (north && south && !west && !east) rect("#ac9870", x + 15, y + 12, 1, 8);
      if (!south && seed % 5 === 0) {
        rect("#242733", x + 18, y + edge - 3, 6, 2);
        for (let i = 19; i < 24; i += 2) rect("#666a78", x + i, y + edge - 3, 1, 1);
      }
    } else if (!pavingPattern) {
      for (let dy = inset + 2; dy < edge - 1; dy += 4) {
        rect("#534b57", x + inset, y + dy, lane, 1);
        rect("#534b57", x + inset + (dy % 3) * 3 + 3, y + dy, 1, 3);
      }
    }
    if (entrance) {
      const door = entranceCenter(northTile, col, buildingBounds(northTile, col, row - 1));
      // A landing joins the facade to the narrow street even on an offset lot.
      const left = Math.min(door - 5, x + inset + 2);
      const right = Math.max(door + 5, x + edge - 2);
      rect("#72646b", left, y - 3, right - left, inset + 4);
      rect("#aaa09a", door - 5, y - 1, 10, 1);
    }
  }

  const planterLots = new Map([
    ["7,3", 0], ["9,3", 1], ["8,4", 2], ["9,4", 3],
    ["14,4", 4], ["16,4", 5], ["17,4", 6], ["19,4", 7],
    ["12,8", 8], ["15,8", 9], ["19,8", 10], ["21,10", 11]
  ]);
  const furnitureLots = new Map([
    ["0,2", 0], ["5,2", 4], ["7,2", 5], ["10,2", 1],
    ["25,2", 2], ["27,2", 6], ["4,10", 3], ["19,10", 7]
  ]);
  let treeIndex = 0;
  function terrain(tile, col, row) {
    const x = col * size;
    const y = row * size;
    const seed = (col * 73856093 ^ row * 19349663) >>> 0;
    const water = tile === "~";
    const dock = tile === "d";

    const ground = tile === "." ? (row === quayRow ? "concrete" : groundAt(col, row)) : undefined;
    const base = ground === "grass" ? grassPattern || "#283b39" : ground === "gravel" ? "#342f3c" : ground === "concrete" ? "#30323e" : "#1b1d2a";
    rect(water || dock ? "#0b192d" : base, x, y, size, size);
    for (let i = 0; i < 8; i++) {
      const a = (seed + i * 7) % 27;
      const b = ((seed >>> 7) + i * 11) % 30;
      const shade = i % 2 ? "#ffffff16" : "#091d2740";
      if (water || dock) rect(i % 2 ? "#569fc157" : "#142b47", x + a, y + b, 3 + i % 3, 1);
      else if (ground === "concrete") {
        rect(i % 2 ? "#454655" : "#252833", x + a, y + b, 2, 1);
        if (i % 3 === 0) rect("#596366", x + a + 1, y + b + 1, 1, 1);
      } else if (ground === "grass") {
        if (grassPattern) continue;
        rect(i % 2 ? "#44594b" : "#202f2f", x + a, y + b, 1, 2);
        rect("#354942", x + a + 1, y + b + 1, 2, 1);
        if (i % 3 === 0) rect("#607451", x + a + 2, y + b, 1, 1);
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

    const location = (col - harbor.x) + "," + (row - harbor.y);
    const planter = planterLots.get(location);
    const furniture = furnitureLots.get(location);
    const grove = ground === "grass" && waterfrontGroves.get(location);
    if (grove) {
      const positions = [[-6, -10, 0.72], [5, -5, 0.9], [-6, 0, 0.63]];
      grove.forEach((variant, index) => {
        const [dx, dy, scale] = positions[index];
        queue(y + dy + 28, () => tree(x + dx, y + dy, variant, scale));
      });
    } else if (tile === "." && planter !== undefined) {
      queue(y + 24, () => detail("flowers-" + planter, x + 16, y + 24, planter < 4 ? 7 : 10));
    } else if (tile === "." && furniture !== undefined) {
      queue(y + 24, () => detail("furniture-" + furniture, x + 16, y + 24, furniture < 4 ? 7 : 9));
    } else if (Object.hasOwn(waterfrontSprites, tile)) {
      const bounds = buildingBounds(tile, col, row);
      queue(y + 29, () => building(tile, x, y, bounds));
      if (tile === "h") {
        beacons.push(bounds
          ? [bounds.left + bounds.drawWidth / 2, bounds.top + bounds.drawHeight * 0.17]
          : [x + 16, y - 17]);
      }
      if (time !== null && "cswELNA".includes(tile) && seed % 3 !== 1) resident(col, row, seed, entranceCenter(tile, col, bounds));
    } else if (tile === "." && row === quayRow) {
      if (hasSeawall && col >= wallStart && col < wallEnd) return;
      if (roadAt(col - 1, row) || roadAt(col + 1, row)) queue(y + 28, () => lamp(x + 16, y + 21));
      else if (seed % 4 === 0) queue(y + 28, () => mooring(x, y));
    } else if (tile === "." && (roadAt(col - 1, row) || roadAt(col + 1, row))) {
      if (seed % 4 === 0) queue(y + 28, () => lamp(x + 22, y + 23));
      else if (seed % 5 === 1) queue(y + 28, () => crates(x, y));
    } else if (tile === "." && seed % 11 === 3) {
      const variant = treeIndex++ % waterfrontTrees.length;
      queue(y + 28, () => tree(x, y, variant));
    } else if (tile === "." && seed % 5 === 1) {
      rect("#34323e", x + 8, y + 8, 13, 12);
      rect("#2b303b", x + 10, y + 10, 9, 8);
    }
  }

  function buildingBounds(tile, col, row) {
    const { image, width, maxHeight } = waterfrontSprites[tile];
    if (!image) return null;
    const x = col * size;
    const y = row * size;
    // Reserve half of each adjoining open lot so two facades never claim the same ground.
    const lotLeft = x - (col > 0 && tileAt(col - 1, row) === "." ? 15 : 0);
    const lotRight = x + size + (col < rows[0].length - 1 && tileAt(col + 1, row) === "." ? 15 : 0);
    const scale = Math.min(width / image.width, maxHeight / image.height,
      (lotRight - lotLeft) / image.width);
    const drawWidth = Math.floor(image.width * scale * 2) / 2;
    const drawHeight = Math.floor(image.height * scale * 2) / 2;
    const centered = Math.round((x + (size - drawWidth) / 2) * 2) / 2;
    const left = Math.max(lotLeft, Math.min(centered, lotRight - drawWidth));
    return { image, left, top: y + 29 - drawHeight, drawWidth, drawHeight };
  }

  function entranceCenter(tile, col, bounds) {
    const doorPosition = tile === "s" ? 0.72 : 0.5;
    return bounds ? Math.round(bounds.left + bounds.drawWidth * doorPosition) : col * size + 16;
  }

  function building(tile, x, y, bounds) {
    rect("#0c252c83", x + 4, y + 24, 29, 7);
    if (bounds) {
      const { image, left, top, drawWidth, drawHeight } = bounds;
      ctx.drawImage(image, left, top, drawWidth, drawHeight);
      if (tile === "c") {
        // The source apartment door is only a few pixels tall at street scale.
        const door = entranceCenter(tile, x / size, bounds);
        rect("#121922", door - 3.5, y + 17, 7, 12);
        rect("#1d5159", door - 2.5, y + 18, 5, 11);
        rect("#65c2b7", door - 1.5, y + 19, 3, 3);
        rect("#e1ae6e", door + 1.5, y + 24, 1, 1);
      }
      if (tile === "h") {
        const pulse = time === null ? 0.5 : 0.5 + 0.5 * Math.cos(time * Math.PI / 7);
        glow(left + drawWidth / 2, top + drawHeight * 0.17, 18 + pulse * 5, "#55ffdf88");
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

  function tree(x, y, variant, scale = 1) {
    const sprite = waterfrontTrees[variant];
    const { image } = sprite;
    const height = Math.round(sprite.height * scale);
    if (image) {
      const width = Math.round(height * image.width / image.height);
      const sway = time === null ? 0 : Math.sin(time * 1.7 + (x + y) / 31) * 0.045;
      rect("#152e327a", x + 7, y + 25, 22, 4);
      ctx.save();
      ctx.transform(1, 0, sway, 1, x + 16, y + 28);
      ctx.drawImage(image, -Math.floor(width / 2), -height, width, height);
      ctx.restore();
      return;
    }
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

  function detail(name, x, base, height) {
    const { image } = waterfrontDetails[name];
    if (!image) return;
    const width = Math.round(height * image.width / image.height);
    ctx.drawImage(image, x - Math.floor(width / 2), base - height, width, height);
  }

  function lamp(x, y) {
    const variant = (Math.floor(x / size) + Math.floor(y / size)) % 4;
    const name = "furniture-" + (8 + variant);
    if (waterfrontDetails[name].image) {
      const colors = ["#ffba7160", "#59e8dd50", "#ffba7160", "#ee61c64d"];
      glow(x + (variant === 0 ? 3 : 0), y - 12, 17, colors[variant]);
      detail(name, x, y + 3, 18);
      return;
    }
    glow(x + 1, y - 3, 20, "#ffba7160");
    rect("#231f2a", x, y - 8, 2, 10);
    rect("#6f6857", x - 2, y - 13, 6, 6);
    rect("#ffe19a", x - 1, y - 12, 4, 3);
  }

  function person(x, y, jacket, hat, step = 0, carriesLight = false) {
    const pixel = (ink, dx, dy, w, h) =>
      rect(ink, x + Math.round(dx * personScale * 2) / 2, y + Math.round(dy * personScale * 2) / 2,
        Math.round(w * personScale * 2) / 2, Math.round(h * personScale * 2) / 2);
    pixel("#1026338c", -6, 1, 15, 4);
    pixel("#152b39", -4, -4, 3, 5 + step);
    pixel("#152b39", 2, -4, 3, 6 - step);
    pixel(jacket, -5, -11, 10, 8);
    pixel("#eac69e", -3, -15, 6, 5);
    pixel(hat, -5, -17, 10, 4);
    if (carriesLight) pixel("#bbf9f3", 5, -9, 4, 5);
  }

  function actor() {
    person(player.x * size + 16, player.y * size + 22, "#c17362", "#39778c", 0, true);
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
