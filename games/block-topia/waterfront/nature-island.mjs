const neighbors = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export function islandSeed(x, y) {
  return Math.imul((Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0, 2654435761) >>> 0;
}

export function makeNatureIsland(harbor) {
  const width = harbor.rows[0].length * 2;
  const height = harbor.rows.length * 5 / 2;
  const formerLand = harbor.rows.reduce((count, row) => count + row.replaceAll("~", "").length, 0);
  const rows = Array.from({ length: height }, () => Array(width).fill("~"));
  const spawn = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  const coast = [];
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const east = (x - spawn.x) / width;
      const south = (y - spawn.y) / height;
      const angle = Math.atan2(south, east);
      const radius = Math.hypot(east, south);
      const headlands = 1 + 0.16 * Math.sin(angle * 3 + 1) + 0.10 * Math.cos(angle * 5 - 1);
      coast.push({ x, y, distance: radius / headlands });
    }
  }
  coast.sort((a, b) => a.distance - b.distance);
  for (const { x, y } of coast.slice(0, formerLand * 5)) {
    const east = x - spawn.x;
    const south = y - spawn.y;
    const path = Math.abs(east - 6 * Math.sin(south / 8)) < 1.1 ||
      Math.abs(south - 4 * Math.sin(east / 7)) < 1.1 ||
      Math.abs(Math.hypot(east, south * 1.2) - 23) < 1.05;
    const seed = islandSeed(x, y) % 100;
    const grove = Math.sin(x / 6) + Math.cos(y / 5) > 0.2;
    rows[y][x] = path ? "p" : seed < (grove ? 28 : 8) ? "t" : seed < 55 ? "f" : ".";
  }
  return {
    natureIsland: true,
    name: harbor.name,
    tileSize: harbor.tileSize,
    spawn,
    rows: rows.map(row => row.join("")),
    tiles: {
      "~": { name: "Water" },
      ".": { name: "Meadow", walkable: true },
      p: { name: "Walking trail", walkable: true },
      t: { name: "Grove", walkable: true },
      f: { name: "Wildflowers", walkable: true },
    },
  };
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
  return stops.flatMap((stop, index) => {
    const segment = findRoute(stop, stops[(index + 1) % stops.length], canWalk);
    return [stop, ...segment.slice(0, -1).map(({ x, y }) => ({ x, y }))];
  });
}
