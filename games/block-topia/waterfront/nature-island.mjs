const bridge = { row: 19, west: 46, east: 56 };
const neighbors = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export function islandSeed(x, y) {
  return Math.imul((Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0, 2654435761) >>> 0;
}

function natureRows(harbor, extended = false, compact = false) {
  const width = harbor.rows[0].length * (compact ? 1.5 : 2);
  const height = compact ? harbor.rows.length + 26 : harbor.rows.length * 5 / 2;
  const formerLand = harbor.rows.reduce((count, row) => count + row.replaceAll("~", "").length, 0);
  const rows = Array.from({ length: height }, () => Array(width).fill("~"));
  const harborWidth = harbor.rows[0].length;
  const harborHeight = harbor.rows.length;
  const spawn = extended ? (compact ? { x: 60, y: 37 } : { x: 69, y: 46 }) :
    { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  let connectionLand = 0;
  if (extended) {
    harbor.rows.forEach((row, y) => rows[y].splice(0, harborWidth, ...row));
    const connect = (x, y) => {
      const tile = rows[y][x];
      if (tile === "~") connectionLand++;
      rows[y][x] = tile === "~" && x < harborWidth && y < harborHeight ? "d" : "p";
    };
    for (let x = 45; x <= 60; x++) connect(x, 24);
    for (let y = 29; y <= 37; y++) connect(36, y);
    if (compact) {
      for (let y = 19; y <= 23; y++) connect(56, y);
      for (let x = 37; x <= 44; x++) connect(x, 37);
    }
  }
  const coast = [];
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      if (extended && ((x < harborWidth && y < harborHeight) || rows[y][x] !== "~")) continue;
      const east = (x - spawn.x) / width;
      const south = (y - spawn.y) / height;
      const angle = Math.atan2(south, east);
      const radius = Math.hypot(east, south);
      const headlands = 1 + 0.16 * Math.sin(angle * 3 + 1) + 0.10 * Math.cos(angle * 5 - 1);
      coast.push({ x, y, distance: radius / headlands });
    }
  }
  coast.sort((a, b) => a.distance - b.distance);
  const trailScale = compact ? 0.5 : 1;
  for (const { x, y } of coast.slice(0, extended ? formerLand * (compact ? 1 : 4) - connectionLand : formerLand * 5)) {
    const east = x - spawn.x;
    const south = y - spawn.y;
    const path = Math.abs(east - 6 * trailScale * Math.sin(south / (8 * trailScale))) < 1.1 ||
      Math.abs(south - 4 * trailScale * Math.sin(east / (7 * trailScale))) < 1.1 ||
      Math.abs(Math.hypot(east, south * 1.2) - 23 * trailScale) < 1.05;
    const seed = islandSeed(x, y) % 100;
    const grove = Math.sin(x / 6) + Math.cos(y / 5) > 0.2;
    rows[y][x] = path ? "p" : seed < (grove ? 28 : 8) ? "t" : seed < 55 ? "f" : extended ? "m" : ".";
  }
  return rows.map(row => row.join(""));
}

const natureTiles = {
  m: { name: "Meadow", walkable: true },
  t: { name: "Grove", walkable: true },
  f: { name: "Wildflowers", walkable: true },
};

function joinedRows(harbor, compact) {
  const rows = natureRows(harbor, true, compact);
  const { row, west, east } = bridge;
  rows[row] = rows[row].slice(0, west + 1) + "p" + "d".repeat(east - west - 2) + rows[row].slice(east);
  return rows;
}

export function extendWaterfront(harbor) {
  return {
    ...harbor,
    natureIsland: true,
    harborWidth: harbor.rows[0].length,
    harborHeight: harbor.rows.length,
    originalRows: harbor.rows,
    rows: joinedRows(harbor, true),
    tiles: { ...harbor.tiles, ...natureTiles },
  };
}

export function restoreIslandLayout(storage, district) {
  const { rows, tiles, spawn, originalRows, harborWidth, harborHeight, harborOffset } = district;
  const load = (version, baseline, x, y) => {
    let saved;
    try { saved = JSON.parse(storage?.getItem("block-topia.waterfront.v" + version)); }
    catch { return null; }
    return Array.isArray(saved) && saved.length === baseline.length &&
      saved.every((row, i) => typeof row === "string" && row.length === baseline[i].length &&
        [...row].every(tile => version === 6 ? "~.ptf".includes(tile) : Object.hasOwn(tiles, tile))) && (tiles[saved[y]?.[x]]?.walkable || (version === 6 && saved[y]?.[x] === ".")) ? saved : null;
  };
  const current = load(9, rows, spawn.x, spawn.y);
  if (current) return current;

  // Keep older edits at their original coordinates where the compact map still has land.
  const oldJoined = joinedRows({ rows: originalRows }, false);
  const wideSave = load(8, oldJoined, spawn.x, spawn.y);
  const previous = wideSave ?? load(7, oldJoined, spawn.x, spawn.y);
  if (previous) {
    const { row, west, east } = bridge;
    return rows.map((line, y) => [...line].map((tile, x) => {
      const edit = previous[y][x];
      if (tile === "~" && (x >= harborWidth || y >= harborHeight)) return tile;
      if (!wideSave && y === row && x > west && x < east && edit === (x === west + 1 ? "." : "~")) return tile;
      return edit === oldJoined[y][x] ? tile : edit;
    }).join(""));
  }

  const oldIsland = natureRows({ rows: originalRows });
  const islandSave = load(6, oldIsland, oldIsland[0].length >> 1, oldIsland.length >> 1);
  const { x: harborX, y: harborY } = harborOffset;
  const legacy = district.previousLayout;
  const layouts = [
    [5, originalRows, 0, 0],
    [4, district.harborRows, harborX, harborY],
    [3, district.previousDoorstepRows, harborX, harborY],
    [2, district.previousWideRows, harborX, harborY],
    [1, legacy.rows, harborX + legacy.columnOffset, harborY],
  ];
  const harborSave = layouts.map(([version, baseline, x, y]) =>
    ({ saved: load(version, baseline, spawn.x - x, spawn.y - y), baseline, x, y })).find(entry => entry.saved);
  const land = rows.map((row, y) => [...row].map((tile, x) => {
    if (x < harborWidth && y < harborHeight) {
      if (!harborSave) return tile;
      const oldX = x - harborSave.x;
      const oldY = y - harborSave.y;
      const edit = harborSave.saved[oldY]?.[oldX];
      return edit !== undefined && edit !== harborSave.baseline[oldY]?.[oldX] ? edit : tile;
    }
    if (tile === "~") return tile;
    const edit = islandSave?.[y]?.[x];
    return edit === undefined || edit === oldIsland[y][x] ? tile : edit === "." ? "m" : edit;
  }).join(""));
  return land;
}

// Visit each reachable part of the island once per lap, with a stop in every
// 8×8 area. Sweep in alternating rows to keep consecutive stops nearby.
export function islandPatrol(rows, district, findRoute) {
  const width = rows[0].length;
  const regionSize = 8;
  const canWalk = (x, y) => Boolean(district.tiles[rows[y]?.[x]]?.walkable);
  const points = [district.spawn];
  const visited = new Set([district.spawn.y * width + district.spawn.x]);
  const regions = new Map();
  for (const point of points) {
    const rx = Math.floor(point.x / regionSize);
    const ry = Math.floor(point.y / regionSize);
    const middle = (regionSize - 1) / 2;
    const distance = Math.abs(point.x % regionSize - middle) + Math.abs(point.y % regionSize - middle);
    const key = rx + "," + ry;
    if (!regions.has(key) || distance < regions.get(key).distance) {
      regions.set(key, { point, rx, ry, distance });
    }
    for (const [dx, dy] of neighbors) {
      const x = point.x + dx;
      const y = point.y + dy;
      const index = y * width + x;
      if (canWalk(x, y) && !visited.has(index)) {
        visited.add(index);
        points.push({ x, y });
      }
    }
  }
  const stops = [...regions.values()]
    .sort((a, b) => a.ry - b.ry || (a.ry % 2 ? b.rx - a.rx : a.rx - b.rx))
    .map(({ point }) => point);
  const { row, west, east } = bridge;
  if (Array.from({ length: east - west + 1 }, (_, i) => west + i)
      .every(x => visited.has(row * width + x) && canWalk(x, row))) {
    stops.unshift({ x: west, y: row }, { x: east, y: row });
  }
  return stops.flatMap((stop, index) => {
    const segment = findRoute(stop, stops[(index + 1) % stops.length], canWalk);
    return [stop, ...segment.slice(0, -1).map(({ x, y }) => ({ x, y }))];
  });
}
