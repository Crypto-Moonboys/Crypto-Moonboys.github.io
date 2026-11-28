// GK-approved baseline (games/block-topia/AGENTS.md). Keep these miner lots, rear tower scale, and overhead close-zoom artwork.
// Resolve atlas URLs from this script so it can render on the comparison route too.
// Moon foundation stone palette (see games/block-topia/AGENTS.md): #585858, shadows #242424, highlights #8E8E8E.
const harborMiningSites = [
  { id: "bitcoin-cash-tower", col: 42, row: 11, heightScale: 1.7, atlas: { file: "bitcoin-cash-tower-overhead.webp?v=2-detail" },
    profile: { name: "Bitcoin Cash Mining Tower", role: "Mining rigs online" } },
  { id: "zcash-fortress", col: 16, row: 21, atlas: { file: "zcash-fortress-overhead-runtime.webp?v=1" },
    profile: { name: "Zcash Mining Fortress", role: "Cooling fans and reactors online" } },
  { id: "wax-bee-node", col: 21, row: 22, atlas: { file: "wax-bee-overhead-runtime.webp?v=1" },
    profile: { name: "WAX Bee Node", role: "Honeycomb circuits online" } },
];
const waterfrontAtlasBase = new URL("assets/atlases/", document.currentScript?.src || document.baseURI);

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

// World coordinates beside the existing Southwest Park footpath.
const southwestParkDetails = new Map([
  ["15,26", { file: "furniture-5", height: 10 }],
  ["15,27", { file: "flowers-8", height: 10 }]
]);

const waterfrontCargoAtlas = { file: "cargo-frames" };
const waterfrontFactionAtlas = { file: "faction-frames" };
// Order matches the rows packed from the named source portraits.
const waterfrontCharacterNames = window.waterfrontCharacterNames;
const waterfrontBotAtlas = { file: "bot-frames" };
// Three models across. Each model has four directions and four animation frames.
const characterDetailCell = 192;
const waterfrontDetailedFactions = { file: "factions-detail-runtime.webp?v=1" };
const waterfrontDetailedBots = { file: "bots-detail-runtime.webp?v=1" };
const roamingAtlasCell = 112;
// Order within each atlas matches SPRITE-LIBRARY.md.
const waterfrontRoamers = [
  { file: "roamers-patrol.webp", cell: roamingAtlasCell, cast: [
    ["police-robot", "Police Robot", 34],
    ["police-car", "Police Car", 50, { pace: 0.58 }],
    ["police-bike", "Police Bike", 42, { pace: 0.64 }],
    ["electric-blue", "Blue Electric Bot", 30, { wikiSlug: "blue-electric-bot" }],
    ["electric-green", "Green Electric Bot", 30, { wikiSlug: "green-electric-bot" }],
    ["boombox", "Walking Boombox", 33, { wikiSlug: "walking-boombox" }],
    ["samurai", "Samurai", 36, { wikiSlug: "waterfront-samurai" }],
    ["burglar-bear", "Burglar Bear", 34],
    ["sailor-bear", "Sailor Bear", 34],
  ] },
  { file: "roamers-mechs.webp?v=2", cell: roamingAtlasCell, cast: [
    ["allcity-bulls-mech", "Allcity Bulls Mech", 53],
    ["blockstars-mech", "Blockstars Mech", 53],
    ["blockchain-furies-mech", "Blockchain Furies Mech", 53],
    ["graffpunks-mech", "GraffPunks Mech", 53],
    null, // Retired rounded mech atlas slot.
    ["hodl-mech", "HODL WARS Mech", 53, { wikiSlug: "hodl-wars-mech" }],
    ["hard-fork-rockers-mech", "Hard Fork Rockers Mech", 53],
    ["moongirls-mech", "Moongirls Mech", 53],
    ["nomad-bears-block-mech", "Nomad Bears Mech", 53, { wikiSlug: "nomad-bears-mech" }],
    ["no-ball-games-mech", "No Ball Games Mech", 53],
    ["graffiti-kings-mech", "Graffiti Kings Mech", 53],
  ] },
  { file: "roamers-bears.webp", cell: roamingAtlasCell, cast: [
    ["jamaican-bear", "Jamaican Bear", 34],
    ["camo-bear", "Camo Bear", 34],
    ["gentleman-bear", "Gentleman Bear", 34],
    ["graff-bear", "Graff Bear", 34],
    ["posh-bear", "Posh Bear", 34],
    ["st-patricks-bear", "St Patrick’s Day Bear", 34, { wikiSlug: "st-patricks-day-bear" }],
    ["straight-outta-ghetto-bear", "Straight Outta Ghetto Bear", 34],
  ] },
  { file: "roamers-guest-street.webp", cell: roamingAtlasCell, guest: true, cast: [
    ["captain", "Police Captain", 36],
    ["riot-cop", "Riot Cop", 36],
    ["shamrock-cat", "Shamrock Cat", 34],
    ["basketball-cat", "Basketball Cat", 34],
  ] },
  { file: "roamers-guest-night.webp", cell: roamingAtlasCell, guest: true, cast: [
    ["red-mask-cat", "Red Mask Cat", 34],
    ["gk-niftyhead", "GK Niftyhead", 38],
    ["joker", "Joker", 36],
    ["higher-purpose", "Higher Purpose", 40],
  ] },
  { file: "roamers-guest-artists.webp", cell: roamingAtlasCell, guest: true, cast: [
    ["charlie-buster", "Charlie Buster", 36],
    ["bone-idol-ink", "Bone Idol Ink", 36],
    ["delicious-again-peter", "Delicious Again Peter", 36],
    ["dude-got-game", "Dude Got Game", 35],
  ] },
  { file: "roamers-guest-mascots.webp?v=2", cell: roamingAtlasCell, guest: true, cast: [
    ["gregz-robot-chef", "GREGZ Robot Chef", 36],
    ["graffiti-kings-crowned-robot", "Graffiti Kings Crowned Robot", 38],
    ["mypetspace-mascot", "Mypetspace Mascot", 34],
    ["sticker-bot", "Sticker Bot", 36],
  ] },
  { file: "roamers-guest-pets.webp", cell: roamingAtlasCell, guest: true, cast: [
    ["wuffi", "Wuffi", 32],
    ["wuffi-companion", "Wuffi’s Companion", 32],
    ["laughing-rat", "Laughing Rat", 30],
    ["bratty", "Bratty", 30],
  ] },
  { file: "roamers-guest-curios.webp", cell: roamingAtlasCell, guest: true, cast: [
    ["wax-builder", "WAX Builder", 36],
    ["muscle-mascot", "Muscle Mascot", 36],
    ["gold-winged-eyeball", "Gold-Winged Eyeball", 35, { flying: true }],
    ["purple-winged-eyeball", "Purple-Winged Eyeball", 35, { flying: true }],
  ] },
].flatMap(({ cast, ...atlas }) =>
  cast.flatMap((entry, model) => {
    if (!entry) return [];
    const [id, name, size, { wikiSlug = id, pace, flying = false } = {}] = entry;
    const profile = atlas.guest ? { name } : { name, wiki: "/wiki/" + wikiSlug + ".html" };
    return [{ atlas, model, id: "roamer:" + id, profile, size, pace, flying }];
  })
);
const guestRoamers = waterfrontRoamers.filter(({ atlas }) => atlas.guest);
const residentRoamers = waterfrontRoamers.filter(({ atlas }) => !atlas.guest);
const factionSpriteSize = 34;
const botSpriteSize = 32;
const residentBots = [3, 4, 5, 6, 7];

const waterfrontAtlases = {
  "cargo": { "cargo-frames": [0, 0, 256, 96] },
  "factions": { "faction-frames": [0, 0, 144, 1296] },
  "bots": { "bot-frames": [0, 0, 128, 1024] },
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

// Preserve the PNG atlases as editable masters. The lossless WebP copies have
// identical dimensions and pixels, but cut the blocking compact-art transfer.
const waterfrontRuntimeAtlases = Object.fromEntries(
  Object.keys(waterfrontAtlases).map(group => [group, group + "-runtime.webp?v=1"])
);

const waterfrontDetails = Object.fromEntries(
  Object.keys(waterfrontAtlases["street-detail"]).map(file => [file, { file }])
);

const harborKaijuAtlas = { file: "harbor-kaiju.webp?v=1" };
// Open water west of the southern crossing. The padding keeps the sprite
// and its wake off land, including when a player edits nearby tiles.
const kaijuWater = { left: 22, top: 30, right: 33, bottom: 40 };
const kaijuLegs = [[24, 34, 30, 34, 4], [30, 34, 30, 38, 2],
  [30, 38, 24, 38, 3], [24, 38, 24, 34, 5]];

let kaijuSummoned = false;
let kaijuRequestedAt;
const kaijuDuration = 32;

function hasKaijuWater(rows) {
  const { left, top, right, bottom } = kaijuWater;
  for (let row = top; row < bottom; row++) {
    if (rows[row]?.slice(left, right) !== "~".repeat(right - left)) return false;
  }
  return true;
}

window.summonHarborKaiju = function summonHarborKaiju(rows) {
  kaijuSummoned = hasKaijuWater(rows);
  if (kaijuSummoned) landfallSummoned = false;
  harborKaijuAtlas.started = undefined;
  kaijuRequestedAt = undefined;
  if (!kaijuSummoned) return null;
  const [x, y] = kaijuLegs[0];
  return { x: x + 0.5, y: y - 1 };
};

const harborKaijuProfile = { name: "Harbor Kaiju", wiki: "/wiki/harbor-kaiju.html" };
const harborNessieProfiles = [
  { name: "Nessie", role: "Open-water sighting", wiki: "/wiki/harbor-nessie.html" },
  { name: "Angry Nessie", role: "Open-water sighting", wiki: "/wiki/harbor-nessie.html" },
];

function drawHarborCreature(ctx, atlas, column, row, frameWidth, frameHeight,
  left, top, scale, inspection, id, profile) {
  const width = frameWidth * scale;
  const height = frameHeight * scale;
  ctx.drawImage(atlas.image, column * frameWidth, row * frameHeight, frameWidth, frameHeight,
    left, top, width, height);
  inspection?.hit({ id, bounds: { left, top, right: left + width, bottom: top + height },
    profile, pausable: false });
}

function drawHarborKaiju(ctx, rows, size, time, visible, repaint, inspection) {
  if (!kaijuSummoned) return;
  // Expire even when the patrol is offscreen or the atlas never decoded.
  if (time !== null) {
    kaijuRequestedAt ??= time;
    if (time - (harborKaijuAtlas.started ?? kaijuRequestedAt) >= kaijuDuration) {
      kaijuSummoned = false;
      return;
    }
  }
  const { left, top, right, bottom } = kaijuWater;
  if (visible && (visible.right <= left || visible.left >= right ||
      visible.bottom <= top || visible.top >= bottom)) return;
  if (!hasKaijuWater(rows)) return;
  loadDetailedAtlas(harborKaijuAtlas, "low", repaint);
  if (!harborKaijuAtlas.image) return;

  // Stay at the final emergence pose when motion is reduced.
  let [x, y] = kaijuLegs[0];
  let column = 3, row = 1;
  if (time !== null) {
    harborKaijuAtlas.started ??= time;
    const elapsed = Math.max(0, time - harborKaijuAtlas.started);
    if (elapsed < 2 || elapsed >= 29) {
      const frame = Math.min(7, Math.floor((elapsed < 2 ? elapsed : kaijuDuration - elapsed) * 4));
      row = Math.floor(frame / 4);
      column = frame % 4;
    } else if (elapsed < 29) {
      const progress = Math.min(3.999999, (elapsed - 2) / 6.75);
      const leg = Math.floor(progress);
      const fraction = progress - leg;
      const [startX, startY, endX, endY, facing] = kaijuLegs[leg];
      x = startX + (endX - startX) * fraction;
      y = startY + (endY - startY) * fraction;
      row = facing;
      column = Math.floor((elapsed - 2) * 6) % 4;
    }
  }

  // Every registered frame has its water anchor at (72, 110).
  const scale = size / 32;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  drawHarborCreature(ctx, harborKaijuAtlas, column, row, 144, 128,
    (x + 0.5) * size - 72 * scale, (y + 0.5) * size - 110 * scale, scale,
    inspection, "harbor-kaiju", { ...harborKaijuProfile, role: "Offshore patrol" });
  ctx.restore();
}

const landfallAtlas = { file: "harbor-kaiju-landfall.webp?v=1" };
const landfallFireAtlas = { file: "harbor-kaiju-fire.webp?v=1" };
// Mouth offsets from the body frame's waterline anchor for each side pose.
const landfallMouth = {
  1: [[-42, -70], [-41, -69], [-41, -70], [-43, -69]],
  2: [[43, -69], [42, -68], [42, -68], [43, -69]],
};

function drawLandfallFire(ctx, x, y, scale, facing, gait, frame) {
  const [mouthX, mouthY] = landfallMouth[facing][gait];
  ctx.translate(x + mouthX * scale, y + mouthY * scale);
  if (facing === 2) ctx.scale(-1, 1);
  // The sheet points left, with its nozzle at (122, 36).
  ctx.drawImage(landfallFireAtlas.image, frame * 128, 0, 128, 72,
    -122 * scale, -36 * scale, 128 * scale, 72 * scale);
}

const landfallX = 43;
const landfallRoute = [
  // Duration, destination x/y, atlas row, walking on land.
  [3, 43, 8, 2, false],
  [2, 43, 10.5, 0, true],
  [3, 45.5, 10.5, 2, true],
  [3, 43, 10.5, 1, true],
  [3, 43, 8.5, 3, true],
  [3, 43, 6, 5, false],
];
let landfallSummoned = false;
let landfallStarted;
let landfallRequestedAt;
const landfallDuration = 21;
let naturalLandfallDue;
let naturalLandfallUsed = false;

function hasLandfallRoute(rows) {
  return [6, 7, 8].every(y => rows[y]?.[landfallX] === "~") &&
    rows[9]?.[landfallX] === "." && [10, 11].every(y => rows[y]?.slice(43, 47) === "....");
}

window.summonHarborLandfall = function summonHarborLandfall(rows) {
  if (!hasLandfallRoute(rows)) return null;
  kaijuSummoned = false;
  landfallSummoned = true;
  landfallStarted = undefined;
  landfallRequestedAt = undefined;
  return { x: landfallX + 0.5, y: 6.5 };
};

window.harborKaijuActive = rows =>
  (kaijuSummoned && hasKaijuWater(rows)) || (landfallSummoned && hasLandfallRoute(rows));

function drawHarborLandfall(ctx, rows, size, time, visible, repaint, queue, inspection) {
  if (time !== null) {
    naturalLandfallDue ??= time + 1200 + Math.random() * 1200;
    if (landfallSummoned) {
      landfallRequestedAt ??= time;
      if (time - (landfallStarted ?? landfallRequestedAt) >= landfallDuration) landfallSummoned = false;
    }
  }
  if (visible && (visible.right <= 41 || visible.left >= 48 ||
      visible.bottom <= 3 || visible.top >= 12)) return;
  if (!hasLandfallRoute(rows)) return;
  if (!landfallSummoned && !kaijuSummoned && !naturalLandfallUsed &&
      time !== null && time >= naturalLandfallDue) {
    window.summonHarborLandfall(rows);
    naturalLandfallUsed = true;
  }
  if (!landfallSummoned) return;
  loadDetailedAtlas(harborKaijuAtlas, "low", repaint);
  loadDetailedAtlas(landfallAtlas, "low", repaint);
  loadDetailedAtlas(landfallFireAtlas, "low", repaint);
  if (!harborKaijuAtlas.image || !landfallAtlas.image) return;

  let x = landfallX, y = 6, column = 3, row = 1, atlas = harborKaijuAtlas;
  let flameFrame = null;
  if (time !== null) {
    landfallStarted ??= time;
    const elapsed = Math.max(0, time - landfallStarted);
    let walkTime = elapsed - 2;
    if (walkTime < 0 || elapsed >= 19) {
      const frame = Math.min(7, Math.floor((walkTime < 0 ? elapsed : landfallDuration - elapsed) * 4));
      row = Math.floor(frame / 4);
      column = frame % 4;
    } else {
      for (const [duration, endX, endY, facing, onLand] of landfallRoute) {
        if (walkTime < duration) {
          const fraction = walkTime / duration;
          x += (endX - x) * fraction;
          y += (endY - y) * fraction;
          row = facing;
          atlas = onLand ? landfallAtlas : harborKaijuAtlas;
          column = facing === 0 && onLand ? Math.floor(fraction * 4) : Math.floor(walkTime * 6) % 4;
          if (onLand && Object.hasOwn(landfallMouth, facing) && walkTime >= 0.75 && walkTime < 1.55) {
            flameFrame = Math.min(3, Math.floor((walkTime - 0.75) * 5));
          }
          break;
        }
        walkTime -= duration;
        x = endX;
        y = endY;
      }
    }
  }
  const anchorX = (x + 0.5) * size;
  const anchorY = (y + 0.5) * size;
  const scale = size / 32;
  queue(anchorY, () => {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    drawHarborCreature(ctx, atlas, column, row, 144, 128,
      anchorX - 72 * scale, anchorY - 110 * scale, scale,
      inspection, "harbor-kaiju-landfall", { ...harborKaijuProfile, role: "North-shore landfall" });
    if (flameFrame !== null && landfallFireAtlas.image) {
      drawLandfallFire(ctx, anchorX, anchorY, scale, row, column, flameFrame);
    }
    ctx.restore();
  });
}

const nessieVariants = [
  { atlas: { file: "harbor-nessie.webp?v=1" }, profile: harborNessieProfiles[0], minDelay: 45, delayRange: 55, nextWave: null },
  { atlas: { file: "harbor-nessie-angry.webp?v=1" }, profile: harborNessieProfiles[1], minDelay: 110, delayRange: 75, nextWave: null },
];
const nessieSites = [[21, 3], [61, 9], [76, 18], [76, 25], [21, 33],
  [13, 51], [26, 55], [72, 55], [49, 56]];
const nessieSightings = new Map();
const nessieDuration = 9;
let nextNessieSite = 0;
let nextNessieVariant = 0;

function hasNessieWater(rows, [x, y]) {
  return [y - 1, y, y + 1].every(row => rows[row]?.slice(x - 4, x + 5) === "~~~~~~~~~");
}

window.summonHarborNessie = function summonHarborNessie(rows, time) {
  for (let attempt = 0; attempt < nessieSites.length; attempt++) {
    const index = nextNessieSite;
    nextNessieSite = (index + 1) % nessieSites.length;
    const site = nessieSites[index];
    if (!hasNessieWater(rows, site)) continue;
    nessieSightings.clear();
    nessieSightings.set(index, { started: time, variant: nessieVariants[nextNessieVariant] });
    nextNessieVariant = (nextNessieVariant + 1) % nessieVariants.length;
    return { x: site[0] + 0.5, y: site[1] - 0.25 };
  }
  return null;
};

function drawHarborNessies(ctx, rows, size, time, visible, repaint, inspection) {
  if (time !== null) {
    for (const [index, { started }] of nessieSightings) {
      if (time - started >= nessieDuration) nessieSightings.delete(index);
    }
    for (const variant of nessieVariants) {
      variant.nextWave ??= time + variant.minDelay + Math.random() * variant.delayRange;
      // Finish the current sighting before allowing another variant's wave.
      if (time < variant.nextWave || nessieSightings.size) continue;
      variant.nextWave = time + variant.minDelay + Math.random() * variant.delayRange;
      const available = nessieSites.map((site, index) => ({ site, index }))
        .filter(({ site }) => hasNessieWater(rows, site));
      const roll = Math.random();
      const count = Math.min(available.length, roll < 0.60 ? 1 : roll < 0.90 ? 2 : 3);
      for (let i = 0; i < count; i++) {
        const [pick] = available.splice(Math.floor(Math.random() * available.length), 1);
        nessieSightings.set(pick.index, { started: time, variant });
      }
    }
  }

  for (const [index, { started, variant: { atlas, profile } }] of nessieSightings) {
    const site = nessieSites[index];
    const [col, row] = site;
    if (!hasNessieWater(rows, site)) {
      nessieSightings.delete(index);
      continue;
    }
    if (visible && (visible.right <= col - 4 || visible.left >= col + 5 ||
        visible.bottom <= row - 2 || visible.top >= row + 2)) continue;
    loadDetailedAtlas(atlas, "low", repaint);
    if (!atlas.image) continue;
    const elapsed = time === null ? 4.5 : Math.max(0, time - started);
    // Surface, undulate through the middle two frames, then dive.
    const frame = elapsed < 1.5 ? Math.floor(elapsed * 2)
      : elapsed < 6.5 ? 3 + Math.floor((elapsed - 1.5) * 2) % 2
      : Math.min(7, 5 + Math.floor((elapsed - 6.5) * 1.2));
    const x = (col + 0.5 + 1.5 - elapsed / 3) * size;
    const y = (row + 0.5) * size;
    const scale = size / 32;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    drawHarborCreature(ctx, atlas, frame % 4, Math.floor(frame / 4), 128, 72,
      x - 52 * scale, y - 42 * scale, scale * 104 / 128,
      inspection, "harbor-nessie-" + index, profile);
    ctx.restore();
  }
}

const harborBotFish = [
  ["rivets", "Rivets", 17, 7],
  ["glint", "Glint", 45, 7],
  ["drillbit", "Drillbit", 72, 10],
  ["boiler", "Boiler", 79, 23],
  ["nightlight", "Nightlight", 79, 54],
  ["coppercoil", "Coppercoil", 70, 56],
  ["redline", "Redline", 58, 56],
  ["zipfin", "Zipfin", 38, 55],
  ["chaincurl", "Chaincurl", 22, 49],
  ["buckletail", "Buckletail", 7, 32],
].map(([slug, name, col, row]) => ({
  id: "bot-fish-" + slug, profile: { name }, col, row,
  atlas: { file: "bot-fish-" + slug + ".webp?v=1" },
}));
const botFishSurfaceSeconds = 4.8;
const botFishCycleSeconds = 7.5;

function drawHarborBotFish(ctx, rows, size, time, visible, repaint, inspection) {
  const scale = size / 64;
  for (const [index, { id, profile, col, row, atlas }] of harborBotFish.entries()) {
    if (visible && (visible.right <= col - 3 || visible.left >= col + 4 ||
        visible.bottom <= row - 2 || visible.top >= row + 2)) continue;
    // Keep the full path and sprite in open water, even after a local map edit.
    if (![row - 2, row - 1, row, row + 1].every(y =>
      rows[y]?.slice(col - 3, col + 4) === "~~~~~~~")) continue;
    loadDetailedAtlas(atlas, "low", repaint);
    if (!atlas.image) continue;
    const elapsed = time === null ? 2.75 : (time + index * 1.37) % botFishCycleSeconds;
    if (elapsed >= botFishSurfaceSeconds) continue;
    const progress = elapsed / botFishSurfaceSeconds;
    const frame = Math.floor(progress * 8);
    const x = (col - 1 + 3 * progress) * size;
    const y = (row + 0.5) * size;
    drawHarborCreature(ctx, atlas, frame % 4, Math.floor(frame / 4), 96, 112,
      x - 48 * scale, y - 86 * scale, scale, frame < 7 ? inspection : null, id, profile);
  }
}

function loadDetailedAtlas(atlas, priority, repaint) {
  if (!repaint || atlas.requested) return;
  atlas.requested = true;
  const image = new Image();
  image.decoding = "async";
  image.fetchPriority = priority;
  image.src = new URL(atlas.file, waterfrontAtlasBase).href;
  image.decode().then(() => {
    atlas.image = image;
    repaint();
  }, () => {
    // Keep compact sprites or skip unavailable guest art for this visit.
  });
}

window.loadWaterfrontSprites = function loadWaterfrontSprites() {
  const sprites = Object.fromEntries(
    [...Object.values(waterfrontSprites), ...Object.values(waterfrontTerrain), ...waterfrontTrees, ...Object.values(waterfrontDetails), waterfrontBotAtlas, waterfrontCargoAtlas, waterfrontFactionAtlas]
      .map(sprite => [sprite.file, sprite])
  );
  const loadAtlases = Object.entries(waterfrontAtlases).map(([group, frames]) => new Promise(resolve => {
    const atlas = new Image();
    atlas.onload = () => {
      for (const [file, [x, y, width, height]] of Object.entries(frames)) {
        // Existing drawing and repeating patterns use an isolated sprite surface.
        const sprite = document.createElement("canvas");
        sprite.width = width;
        sprite.height = height;
        const context = sprite.getContext("2d");
        context.drawImage(atlas, x, y, width, height, 0, 0, width, height);
        if (["hk-night", "trees", "cargo", "street-detail"].includes(group)) {
          context.globalCompositeOperation = "source-atop";
          context.fillStyle = file.startsWith("furniture-") ? "#0b102525" : "#0b102548";
          context.fillRect(0, 0, width, height);
        }
        sprites[file].image = sprite;
      }
      resolve();
    };
    atlas.onerror = resolve;
    atlas.decoding = "async";
    atlas.fetchPriority = group === "factions" ? "high" : "auto";
    atlas.src = new URL(waterfrontRuntimeAtlases[group], waterfrontAtlasBase).href;
  }));
  return Promise.all(loadAtlases);
};

/* Original pixel art. Terrain draws first, then objects and actors by ground position. */
const cargoDesigns = [
  ["#b76d44", "#f2b274", "#583b3d"], ["#3a8f90", "#8be2c6", "#24454e"],
  ["#65588c", "#bb9bd6", "#38334e"], ["#a18746", "#f6d16e", "#51473b"],
  ["#576a85", "#a8cae1", "#303948"], ["#966278", "#efa9af", "#4d3449"]
];

let harborFreight;
function freightFor(rows, district) {
  const harborRows = district.harborWidth
    ? rows.slice(0, district.harborHeight).map(row => row.slice(0, district.harborWidth)) : rows;
  const layout = harborRows.join("\n");
  if (harborFreight?.layout === layout) return harborFreight;
  const canWalk = (x, y) => Boolean(district.tiles[harborRows[y]?.[x]]?.walkable);
  const stores = [];
  const yards = [];
  harborRows.forEach((row, y) => [...row].forEach((tile, x) => {
    if (!canWalk(x, y)) return;
    if ("bwHEVcLsNA".includes(harborRows[y - 1]?.[x] ?? "~")) stores.push({ x, y });
    else if (tile !== "p" && (x * 7 + y * 13) % 5 === 0) yards.push({ x, y });
  }));
  const reachable = point => findRoute(district.spawn, point, canWalk) !== null;
  const stops = yards.filter(reachable);
  const doors = stores.filter(reachable);
  const cargo = stops.slice(0, Math.min(18, Math.max(0, stops.length - 5))).map((point, kind) => ({ point, kind }));
  doors.slice(0, 6).forEach((point, index) => cargo.push({ point, kind: 18 + index, indoors: true }));
  const bots = [0, 4, 3, 7].map((model, index) => ({
    model, point: stops[index] ?? district.spawn, dx: 0, dy: 1, due: 0
  }));
  harborFreight = { layout, canWalk, stops, cargo, bots };
  return harborFreight;
}

let factionPatrol;
function factionRoutes(rows, district) {
  const layout = rows.join("\n");
  if (factionPatrol?.layout === layout) return factionPatrol.routes;
  const points = [district.spawn];
  const visited = new Set([district.spawn.x + "," + district.spawn.y]);
  const canWalk = (x, y) => Boolean(district.tiles[rows[y]?.[x]]?.walkable);
  for (const point of points) {
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const x = point.x + dx;
      const y = point.y + dy;
      const key = x + "," + y;
      if (!visited.has(key) && canWalk(x, y)) {
        visited.add(key);
        points.push({ x, y });
      }
    }
  }
  const routes = waterfrontCharacterNames.map((_, index) => {
    const stops = Array.from({ length: 9 }, (_, leg) =>
      points[(index * 37 + leg * 53 + leg * leg * 7) % points.length]);
    return stops.flatMap((stop, leg) => [
      stop, ...findRoute(stop, stops[(leg + 1) % stops.length], canWalk).slice(0, -1)
    ]);
  });
  factionPatrol = { layout, routes };
  return routes;
}

let naturePatrol;
function natureRoute(rows, district) {
  const layout = rows.join("\n");
  if (naturePatrol?.layout !== layout) {
    naturePatrol = { layout, route: window.waterfrontIslandPatrol(rows, district, findRoute) };
  }
  return naturePatrol.route;
}

function patrolPosition(route, distance, start, reverse) {
  const step = Math.floor(distance);
  const direction = reverse ? -1 : 1;
  const length = route.length;
  const index = (start + direction * (step % length) + length) % length;
  const from = route[index];
  const to = route[(index + direction + length) % length];
  const blend = distance - step;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return { x: from.x + dx * blend, y: from.y + dy * blend, dx, dy };
}

function waterTileSeed(col, row) {
  return (col * 73856093 ^ row * 19349663) >>> 0;
}

function paintWaterBase(rect, x, y, size, seed) {
  rect("#0b192d", x, y, size, size);
  for (let i = 0; i < 8; i++) {
    rect(i % 2 ? "#569fc157" : "#142b47", x + (seed + i * 7) % 27,
      y + ((seed >>> 7) + i * 11) % 30, 3 + i % 3, 1);
  }
}

const waterPatterns = new Map();
function waterPattern(ctx, size) {
  if (waterPatterns.has(size)) return waterPatterns.get(size);
  const texture = document.createElement("canvas");
  const tiles = 8;
  texture.width = texture.height = tiles * size;
  const source = texture.getContext("2d");
  const rect = (color, x, y, width, height) => {
    source.fillStyle = color;
    source.fillRect(x, y, width, height);
  };
  for (let row = 0; row < tiles; row++) {
    for (let col = 0; col < tiles; col++) {
      const x = col * size;
      const y = row * size;
      const seed = waterTileSeed(col, row);
      paintWaterBase(rect, x, y, size, seed);
      if (seed % 3 === 0) rect("#54888566", x + 2 + seed % 22, y + 11, 6, 1);
    }
  }
  const pattern = ctx.createPattern(texture, "repeat");
  waterPatterns.set(size, pattern);
  return pattern;
}

const factionMotion = [];
const roamerMotion = new Map();
window.drawWaterfront = function drawWaterfront(ctx, rows, player, district, time = null, discussionElapsed = null, leaderStates = [], selectedAvatar = null, conversations = null, visible = null, inspection = null, repaintArt = null) {
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
  const harbor = district.harborOffset ?? { x: 0, y: 0 };
  const quayRow = harbor.y + 2;
  const wallStart = harbor.x + 13;
  const wallEnd = harbor.x + 24;
  const hasSeawall = rows[quayRow]?.slice(wallStart, wallEnd) === ".".repeat(wallEnd - wallStart);
  // Keep doors and people readable without widening the walkable grid.
  const personScale = 0.55;
  const objects = [];
  const buildingShadows = [];
  const beacons = [];
  const queue = (depth, draw) => objects.push({ depth, draw });
  function markNpc(id, x, y, spriteSize, details) {
    if (!inspection) return;
    inspection.hit({ id, x, y, spriteSize, ...details });
    if (!inspection.held(id)) return;
    rect("#97e7d4", x - spriteSize / 3, y + 3, spriteSize * 2 / 3, 1.5);
  }


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
      const id = "artist:" + panel;
      const clock = inspection?.time(id, time) ?? time;
      const elapsed = (clock ?? 0) + panel * 4;
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
      const step = Math.floor(clock * 6) % 2;
      queue(feet, () => {
        bot(2, artist, feet, direction, 0, step + 1, id);
        const color = muralPasses[pass % muralPasses.length].color;
        rect(color, hand, feet - 8, 1, 2);
        for (let speck = 0; speck < 3; speck++) {
          const drift = (Math.floor(clock * 12) + speck * 2) % 5;
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
    const id = "resident:" + col + ":" + row;
    const clock = inspection?.time(id, time) ?? time;
    const age = (clock + seed % 19) % 20;
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
    const moving = age < trip || age > trip + 2;
    const direction = age > trip + 2 ? -1 : 1;
    const frame = moving ? 1 + Math.floor(clock * 7) % 3 : 0;
    queue(y, () => bot(residentBots[seed % residentBots.length], x, y,
      (bx - ax) * direction, (by - ay) * direction, frame, id));
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
  function parkTerrain(tile, col, row) {
    const x = col * size;
    const y = row * size;
    const seed = window.waterfrontIslandSeed(col, row);
    const coast = [tileAt(col - 1, row), tileAt(col + 1, row), tileAt(col, row - 1), tileAt(col, row + 1)];
    rect("#827257", x, y, size, size);
    const [left, right, top, bottom] = coast.map(neighbor => neighbor === "~" ? 3 : 0);
    rect(tile === "p" ? "#71634d" : grassPattern || "#244337", x + left, y + top,
      size - left - right, size - top - bottom);
    if (tile === "p") {
      rect("#8b795d", x + 6 + seed % 19, y + 5 + (seed >>> 8) % 19, 3, 1);
    } else if (tile === "t") {
      const variant = (seed >>> 8) % waterfrontTrees.length;
      queue(y + 28, () => tree(x + seed % 8 - 4, y, variant, 0.78 + (seed % 5) * 0.07));
    } else if (tile === "f") {
      const variant = (seed >>> 8) % 12;
      queue(y + 24, () => detail("flowers-" + variant, x + 9 + seed % 15, y + 22, 8 + seed % 6));
    }
  }

  let treeIndex = 0;
  function terrain(tile, col, row) {
    const x = col * size;
    const y = row * size;
    if (tile === "~") {
      // The natural coastline draws its own banks on the adjoining land tiles.
      const south = tileAt(col, row + 1);
      if ((!district.natureIsland || (col < district.harborWidth && row < district.harborHeight)) &&
          south !== "~" && south !== "d") {
        rect("#252334", x, y + 24, size, 8);
        rect("#6c667b", x, y + 24, size, 3);
        rect("#43787f", x, y + 21, size, 1);
        rect("#3a5157", x + (col % 2 ? 8 : 20), y + 27, 2, 5);
      }
      return;
    }

    const seed = waterTileSeed(col, row);
    if (tile === "d") {
      paintWaterBase(rect, x, y, size, seed);
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

    const ground = tile === "." ? (row === quayRow ? "concrete" : groundAt(col, row)) : undefined;
    const base = ground === "grass" ? grassPattern || "#283b39" : ground === "gravel" ? "#342f3c" : ground === "concrete" ? "#30323e" : "#1b1d2a";
    rect(base, x, y, size, size);
    for (let i = 0; i < 8; i++) {
      const a = (seed + i * 7) % 27;
      const b = ((seed >>> 7) + i * 11) % 30;
      const shade = i % 2 ? "#ffffff16" : "#091d2740";
      if (ground === "concrete") {
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

    if (tile === "r" || tile === "p") {
      pavedSurface(tile, col, row, x, y, seed);
      return;
    }

    const location = (col - harbor.x) + "," + (row - harbor.y);
    const planter = planterLots.get(location);
    const furniture = furnitureLots.get(location);
    const grove = ground === "grass" && waterfrontGroves.get(location);
    const parkDetail = ground === "grass" && southwestParkDetails.get(col + "," + row);
    if (parkDetail && tileAt(col + 1, row) === "p") {
      queue(y + 24, () => detail(parkDetail.file, x + 22, y + 24, parkDetail.height));
    } else if (grove) {
      const positions = [[-6, -10, 0.72], [5, -5, 0.9], [-6, 0, 0.63]];
      grove.forEach((variant, index) => {
        const [dx, dy, scale] = positions[index];
        queue(y + dy + 28, () => tree(x + dx, y + dy, variant, scale));
      });
    } else if (tile === "." && planter !== undefined) {
      queue(y + 24, () => detail("flowers-" + planter, x + 16, y + 24, planter < 4 ? 7 : 10));
    } else if (tile === "." && furniture !== undefined) {
      queue(y + 24, () => detail("furniture-" + furniture, x + 16, y + 24, furniture < 4 ? 7 : 9));
    } else if (tile === "." && col === 37 && row === 26 && "p" === rows[26]?.[36]) {
      queue(y + 24, () => detail("flowers-2", x + 16, y + 24, 9));
    } else if (tile === "." && col === 16 && row === 28 && "p" === rows[27]?.[16]) {
      queue(y + 17, () => detail("flowers-6", x + 16, y + 17, 10));
    } else if (tile === "." && col === 45 && row === 14 && "r" === rows[14]?.[44]) {
      queue(y + 24, () => detail("flowers-0", x + 16, y + 24, 9));
    } else if (tile === "." && col === 43 && row === 15 && "r" === rows[14]?.[43]) {
      queue(y + 24, () => detail("flowers-0", x + 16, y + 24, 9));
    } else if (tile === "." && col === 13 && row === 23 && "r" === rows[24]?.[13]) {
      queue(y + 26, () => detail("furniture-4", x + 16, y + 26, 10));
    } else if (Object.hasOwn(waterfrontSprites, tile)) {
      const bounds = buildingBounds(tile, col, row);
      const left = bounds?.left ?? x + 3;
      const right = left + (bounds?.drawWidth ?? 26);
      buildingShadows.push([left, right, y + 28]);
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
    rect("#080d19b8", x + 4, y + 24, 29, 7);
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
      rect("#080e1ab0", x + 6, y + 25, 24, 5);
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

  function drawDetailedCharacter(atlas, model, facing, frame, x, feet, size) {
    const cell = atlas.cell ?? characterDetailCell;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(atlas.image, (model % 3 * 4 + frame) * cell, (Math.floor(model / 3) * 4 + facing) * cell,
      cell, cell, x - size / 2, feet - size, size, size);
    ctx.restore();
  }

  function bot(model, x, y, dx, dy, frame, id) {
    markNpc(id, x, y, botSpriteSize);
    const image = waterfrontBotAtlas.image;
    if (inspection?.held(id)) frame = 0;
    const facing = dx < 0 ? 1 : dx > 0 ? 2 : dy < 0 ? 3 : 0;
    rect("#080f1cad", x - 8, y - 1, 16, 4);
    if (waterfrontDetailedBots.image) {
      drawDetailedCharacter(waterfrontDetailedBots, model, facing, frame, x, y, botSpriteSize);
    } else if (image) {
      ctx.drawImage(image, frame * 32, (model * 4 + facing) * 32, 32, 32,
        x - botSpriteSize / 2, y - botSpriteSize, botSpriteSize, botSpriteSize);
    } else {
      rect("#384a58", x - 4, y - 9, 8, 8);
      rect("#7de8df", x - 2, y - 7, 4, 2);
    }
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

  function freightObject(kind, x, y) {
    const image = waterfrontCargoAtlas.image;
    if (image) {
      rect("#161b27a8", x - 7, y - 1, 14, 3);
      ctx.drawImage(image, kind % 8 * 32, Math.floor(kind / 8) * 32, 32, 32,
        x - 10, y - 19, 20, 20);
      return;
    }
    const [body, light, dark] = cargoDesigns[kind % cargoDesigns.length];
    const wide = kind % 3 === 0;
    const w = wide ? 17 : 12;
    const h = kind % 3 === 1 ? 12 : 9;
    const left = x - Math.floor(w / 2);
    rect("#161b27a8", left - 1, y - 1, w + 3, 3);
    rect(dark, left, y - h, w, h);
    rect(body, left + 1, y - h + 2, w - 3, h - 3);
    rect(light, left + 1, y - h + 1, w - 3, 2);
    if (kind % 2) {
      rect(dark, left + 3, y - h + 4, w - 6, 1);
      rect(light, left + 4, y - 4, w - 8, 1);
    } else {
      rect(light, left + 3, y - h + 3, 1, h - 4);
      rect(light, left + w - 5, y - h + 3, 1, h - 4);
    }
  }

  function drawFreight() {
    const { canWalk, stops, cargo, bots } = freightFor(rows, district);
    const go = (worker, point, now) => {
      worker.route = findRoute(worker.point, point, canWalk) ?? [];
      const start = worker.point;
      worker.route = [start, ...worker.route];
      worker.started = now;
      worker.due = now + (worker.route.length - 1) * 0.6 + 0.6;
    };
    for (const worker of bots) {
      const id = "freight:" + worker.model;
      const now = inspection?.time(id, time) ?? time ?? 0;
      if (time !== null && !inspection?.held(id) && now >= worker.due) {
        if (worker.route) worker.point = worker.route.at(-1);
        worker.route = null;
        if (worker.carrying) {
          worker.load.point = worker.point;
          worker.load.reserved = false;
          worker.load = null;
          worker.carrying = false;
        } else if (worker.load) {
          if (worker.load.indoors && !worker.inside) {
            worker.inside = true;
            worker.due = now + 2;
          } else {
            worker.exiting = worker.inside;
            worker.inside = false;
            worker.load.indoors = false;
            worker.load.point = null;
            worker.carrying = true;
            go(worker, worker.destination, now);
          }
        } else {
          const open = cargo.filter(item => !item.reserved);
          const load = open[Math.floor(Math.random() * open.length)];
          const destinations = stops.filter(point =>
            !cargo.some(item => item.point?.x === point.x && item.point?.y === point.y) &&
            !bots.some(other => other.load && other.destination === point));
          if (load && destinations.length) {
            worker.load = load;
            load.reserved = true;
            worker.destination = destinations[Math.floor(Math.random() * destinations.length)];
            go(worker, load.point, now);
          } else worker.due = now + 3;
        }
      }
      if (worker.inside) continue;
      const progress = time === null ? 0 : (now - worker.started) / 0.6;
      const index = Math.floor(progress);
      const from = worker.route?.[index] ?? worker.route?.at(-1) ?? worker.point;
      const to = worker.route?.[index + 1] ?? from;
      const moving = from !== to;
      if (moving) {
        worker.dx = to.x - from.x;
        worker.dy = to.y - from.y;
      }
      const fraction = moving ? progress - index : 0;
      const x = Math.round((from.x + worker.dx * fraction) * size + 16);
      const entering = worker.load?.indoors && !moving ? Math.max(0, 1 - (worker.due - now) / 0.6) : 0;
      const exiting = worker.carrying && worker.exiting ? Math.max(0, 1 - progress) : 0;
      const y = Math.round((from.y + worker.dy * fraction) * size + 23 - 25 * (entering + exiting));
      const load = worker.carrying && worker.load;
      queue(y, () => {
        const atDoor = entering > 0 || exiting > 0;
        bot(worker.model, x, y, atDoor ? 0 : worker.dx, entering > 0 ? -1 : exiting > 0 ? 1 : worker.dy,
          moving || atDoor ? 1 + Math.floor(now * 7) % 3 : 0, id);
        if (load) freightObject(load.kind, x + worker.dx * 6, y - 9);
      });
    }
    for (const item of cargo) {
      if (!item.point || item.indoors) continue;
      const { x, y } = item.point;
      queue(y * size + 20, () => freightObject(item.kind, x * size + 16, y * size + 20));
    }
  }

  function factionCharacter(faction, x, y, facing = 0, frame = 0) {
    rect("#080f1cad", x - factionSpriteSize / 3.6, y - 1, factionSpriteSize / 1.8, 3);
    if (waterfrontDetailedFactions.image) {
      drawDetailedCharacter(waterfrontDetailedFactions, faction, facing, frame, x, y + 1, factionSpriteSize);
      return;
    }
    ctx.drawImage(waterfrontFactionAtlas.image, frame * 36, (faction * 4 + facing) * 36, 36, 36,
      x - factionSpriteSize / 2, y + 1 - factionSpriteSize, factionSpriteSize, factionSpriteSize);
  }

  function actor() {
    const x = player.x * size + 16;
    const y = player.y * size + 22;
    if ((waterfrontDetailedFactions.image || waterfrontFactionAtlas.image) && Number.isInteger(player.faction) && waterfrontCharacterNames[player.faction]) {
      factionCharacter(player.faction, x, y, player.facing, player.frame);
    } else {
      person(x, y, "#c17362", "#39778c", 0, true);
    }
  }

  const islandLoop = district.natureIsland ? natureRoute(rows, district) : null;
  let nearestFaction;
  const factionHits = [];
  const streetHits = [];
  const street = conversations?.street;
  function drawFactionWalkers() {
    if (!waterfrontDetailedFactions.image && !waterfrontFactionAtlas.image) return;
    const routes = islandLoop ? null : factionRoutes(rows, district);
    const now = Date.now();
    waterfrontCharacterNames.forEach((name, index) => {
      const state = leaderStates[index];
      if (index === selectedAvatar || state?.playingUntil > now) return;
      const route = islandLoop ?? routes[index];
      const paused = state?.pausedUntil > now;
      const motion = factionMotion[index] ??= { previous: time, elapsed: time ?? 0 };
      const id = "leader:" + index;
      const holding = inspection?.held(id) || conversations?.holds(index) || street?.holds(id);
      if (!paused && !holding && time !== null && motion.previous !== null) {
        motion.elapsed += Math.min(0.2, Math.max(0, time - motion.previous));
      }
      motion.previous = time;
      const elapsed = time === null ? 0 : motion.elapsed;
      const startingPoint = islandLoop ? Math.floor(index * route.length / waterfrontCharacterNames.length) : 0;
      const position = patrolPosition(route, elapsed / (1.05 + index * 0.045), startingPoint,
        Boolean(islandLoop && index % 2));
      const { dx, dy } = position;
      const x = Math.round(position.x * size + 16);
      const y = Math.round(position.y * size + 22);
      const facing = dx < 0 ? 1 : dx > 0 ? 2 : dy < 0 ? 3 : 0;
      const frame = paused || holding || time === null || !(dx || dy) ? 0 : 1 + Math.floor(time * 7 + index) % 3;
      queue(y, () => {
        markNpc(id, x, y, factionSpriteSize, { index });
        factionCharacter(index, x, y, facing, frame);
      });
      factionHits.push({ index, x, y, paused, talking: state?.talking });
      const separation = Math.hypot(x - (player.x * size + 16), y - (player.y * size + 22));
      if (separation < size && (!nearestFaction || separation < nearestFaction.separation)) {
        nearestFaction = { name, x, y, separation };
      }
    });
  }

  function drawFactionLabel() {
    if (!nearestFaction) return;
    const { name, x, y } = nearestFaction;
    ctx.save();
    ctx.font = "7px system-ui";
    const width = Math.ceil(ctx.measureText(name).width) + 8;
    rect("#131926ed", x - width / 2, y - factionSpriteSize - 14, width, 11);
    ctx.fillStyle = "#eaf2e5";
    ctx.textAlign = "center";
    ctx.fillText(name, x, y - factionSpriteSize - 6);
    ctx.restore();
  }

  const turn = conversations?.crewSpeech?.(discussionElapsed);
  function drawIslandBots() {
    if (!islandLoop) return;
    residentBots.forEach((model, index) => {
      const start = Math.floor(islandLoop.length * (index + 1) / (residentBots.length + 1));
      const pace = 0.78 + index * 0.051;
      const id = "patrol:" + index;
      const clock = inspection?.time(id, time) ?? time ?? 0;
      const { x, y, dx, dy } = patrolPosition(islandLoop, clock / pace, start, index % 2 === 0);
      const px = Math.round(x * size + 16);
      const py = Math.round(y * size + 22);
      const frame = time === null || (!dx && !dy) ? 0 : 1 + Math.floor(time * 7) % 3;
      queue(py, () => bot(model, px, py, dx, dy, frame, id));
    });
  }

  function drawIslandRoamers(roamers) {
    roamers.forEach(({ atlas, model, id, profile, size: height, pace, flying }, index) => {
      const start = Math.floor(islandLoop.length * (index + 0.5) / roamers.length);
      const clock = inspection?.time(id, time) ?? time ?? 0;
      let patrolClock = clock;
      if (street && time !== null) {
        const motion = roamerMotion.get(id) ?? { previous: clock, stopped: 0 };
        if (street.holds(id)) motion.stopped += Math.max(0, clock - motion.previous);
        motion.previous = clock;
        roamerMotion.set(id, motion);
        patrolClock = clock - motion.stopped;
      }
      const { x, y, dx, dy } = patrolPosition(islandLoop, patrolClock / (pace ?? 1.05 + index % 5 * 0.09),
        start, index % 2 === 0);
      const inView = x >= left && x < right && y >= top && y < bottom;
      if (!atlas.image) {
        if (inView) loadDetailedAtlas(atlas, "auto", repaintArt);
        return;
      }
      const px = Math.round(x * size + 16);
      const py = Math.round(y * size + 22);
      if (!atlas.guest) streetHits.push({ id, x: px, y: py, spriteSize: height });
      if (!inView) return;
      const facing = dx < 0 ? 1 : dx > 0 ? 2 : dy < 0 ? 3 : 0;
      const moving = time !== null && (dx || dy) && !inspection?.held(id) && !street?.holds(id);
      const phase = Math.floor(clock * 7 + index);
      const frame = moving ? (atlas.guest ? phase % 4 : 1 + phase % 3) : 0;
      const lift = flying ? 12 + (moving ? Math.round(Math.sin(clock * 6) * 2) : 0) : 0;
      queue(py, () => {
        markNpc(id, px, py - lift, height, { profile });
        rect("#080f1cad", px - height / 4, py - 1, height / 2, 3);
        drawDetailedCharacter(atlas, model, facing, frame, px, py + 1 - lift, height);
      });
    });
  }

  let crewBubble;

  function drawCrew() {
    const speakers = [
      { col: district.spawn.x - 2 },
      { col: district.spawn.x + 2 }
    ];
    const row = district.spawn.y;
    speakers.forEach(({ col }, index) => {
      if (!roadAt(col, row)) return;
      const id = "crew:" + index;
      const clock = inspection?.time(id, time) ?? time;
      const pace = clock === null ? 0 : Math.sin(clock * 0.9 + index * Math.PI);
      const x = col * size + 16 + Math.round(pace * 5);
      const y = row * size + 13;
      const facing = clock === null ? 0 : Math.cos(clock * 0.9 + index * Math.PI);
      bot(index, x, y, facing, 0, clock === null ? 0 : 1 + Math.floor(clock * 6) % 3, id);
      if (!turn || turn.speaker !== index) return;
      crewBubble = { text: turn.text, speaker: { x, y, spriteSize: botSpriteSize } };
    });
  }

  const { left, top, right, bottom } = visible ?? { left: 0, top: 0, right: width, bottom: rows.length };
  const {a: scaleX, d: scaleY, e: offsetX, f: offsetY} = ctx.getTransform();
  const waterBounds = [-offsetX / scaleX, -offsetY / scaleY, ctx.canvas.width / scaleX, ctx.canvas.height / scaleY];
  rect(waterPattern(ctx, size), ...waterBounds);
  if (district.natureIsland) {
    drawHarborKaiju(ctx, rows, size, time, visible, repaintArt, inspection);
    drawHarborNessies(ctx, rows, size, time, visible, repaintArt, inspection);
    drawHarborBotFish(ctx, rows, size, time, visible, repaintArt, inspection);
  }
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const tile = tileAt(x, y);
      if (islandLoop && tile !== "~" && tile !== "d" && (x >= district.harborWidth || y >= district.harborHeight || "mtf".includes(tile))) {
        parkTerrain(tile, x, y);
      } else terrain(tile, x, y);
    }
  }
  rect("#080a1c32", ...waterBounds);
  ctx.save();
  // Clip tall sprites at the edge of the repainted area, so offscreen sprites
  // cannot leave stale pixels when the player pans back.
  ctx.beginPath();
  ctx.rect(left * size, top * size, (right - left) * size, (bottom - top) * size);
  ctx.clip();
  for (const [left, right, base] of buildingShadows) {
    polygon("#080b1890", [[left, base - 8], [right, base - 8], [right + 14, base + 5], [left + 12, base + 5]]);
    polygon("#080b184d", [[left + 12, base + 5], [right + 14, base + 5], [right + 20, base + 9], [left + 19, base + 9]]);
  }
  beacons.forEach(([x, y]) => beacon(x, y, false));
  graffitiSeawall();
  drawFreight();
  if (islandLoop) {
    drawIslandBots();
    drawIslandRoamers(residentRoamers);
    drawIslandRoamers(guestRoamers);
  }
  // Let nearby roamers request their art before upgrading compact characters.
  loadDetailedAtlas(waterfrontDetailedFactions, "low", repaintArt);
  loadDetailedAtlas(waterfrontDetailedBots, "low", repaintArt);
  drawFactionWalkers();
  if (district.natureIsland) drawHarborLandfall(ctx, rows, size, time, visible, repaintArt, queue, inspection);
  // Open lots keep the mining buildings off streets and paths.
  if (district.natureIsland) for (const { id, col, row, atlas, profile, heightScale = 1 } of harborMiningSites) {
    if (rows[row]?.[col] !== ".") continue;
    const x = (col + .5) * size, y = (row + .75) * size;
    const scale = size / 64 * heightScale;
    const left = x - 112 * scale, top = y - 233 * scale;
    if (visible && (left + 224 * scale < visible.left * size || left >= visible.right * size ||
        top + 280 * scale < visible.top * size || top >= visible.bottom * size)) continue;
    loadDetailedAtlas(atlas, "low", repaintArt);
    if (!atlas.image) continue;
    const frame = time === null ? 0 : Math.floor(time * 12) % 12;
    const resolution = atlas.image.naturalWidth / (4 * 224);
    queue(y, () => {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      drawHarborCreature(ctx, atlas, frame % 4, Math.floor(frame / 4),
        224 * resolution, 280 * resolution, left, top, scale / resolution, inspection, id, profile);
      ctx.restore();
    });
  }
  queue(player.y * size + 22, actor);
  objects.sort((a, b) => a.depth - b.depth).forEach(({ draw }) => draw());
  beacons.forEach(([x, y]) => beacon(x, y, true));
  drawCrew();
  drawFactionLabel();
  for (const { x, y, paused, talking } of factionHits) {
    if (!paused) continue;
    ctx.save();
    ctx.fillStyle = '#eaf2e5';
    ctx.font = '7px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(talking ? 'Talking' : 'Paused', x, y - factionSpriteSize - 17);
    ctx.restore();
  }
  const bubbles = [];
  if (crewBubble) bubbles.push(crewBubble);
  if (conversations && time !== null) {
    const leaders = factionHits.filter(hit => !hit.talking);
    const participants = leaders.filter(hit => !street?.holds("leader:" + hit.index));
    if (selectedAvatar !== null && !player.frame) participants.push({
      index: selectedAvatar, x: player.x * size + 16, y: player.y * size + 22,
    });
    const now = Date.now();
    for (const line of conversations.tick(participants, now)) {
      bubbles.push({ text: line.text, speaker: participants.find(actor => actor.index === line.actor) });
    }
    if (street) {
      const leaderIds = new Map(leaders.map(hit => ["leader:" + hit.index, hit.index]));
      const cast = [...streetHits, ...leaders.map(hit => ({ ...hit, id: "leader:" + hit.index, spriteSize: factionSpriteSize }))];
      const byId = new Map(cast.map(hit => [hit.id, hit]));
      for (const line of street.tick(cast, now, id => conversations.holds(leaderIds.get(id)))) {
        bubbles.push({ text: line.text, speaker: byId.get(line.id) });
      }
    }
  }
  for (const { speaker, text } of bubbles) {
    if (!speaker) continue;
    ctx.save();
    ctx.font = '8px system-ui';
    ctx.textAlign = 'left';
    const lines = [];
    let next = '';
    for (const word of text.split(' ')) {
      if (next && ctx.measureText(next + ' ' + word).width > 170) {
        lines.push(next);
        next = '';
      }
      next += (next ? ' ' : '') + word;
    }
    lines.push(next);
    const boxWidth = Math.ceil(Math.max(...lines.map(text => ctx.measureText(text).width))) + 12;
    const left = Math.max(2, Math.min(speaker.x - boxWidth / 2, width * size - boxWidth - 2));
    const boxHeight = lines.length * 11 + 6;
    const top = Math.max(2, speaker.y - (speaker.spriteSize ?? factionSpriteSize) - 8 - boxHeight);
    rect('#0e151f', left - 1, top - 1, boxWidth + 2, boxHeight + 2);
    rect('#d9efea', left, top, boxWidth, boxHeight);
    const tail = Math.max(left + 4, Math.min(speaker.x, left + boxWidth - 4));
    polygon('#d9efea', [[tail - 3, top + boxHeight], [tail + 3, top + boxHeight], [tail, top + boxHeight + 5]]);
    ctx.fillStyle = '#131926';
    lines.forEach((segment, index) => ctx.fillText(segment, left + 6, top + 10 + index * 11));
    ctx.restore();
  }
  ctx.restore();
  return factionHits;
};
