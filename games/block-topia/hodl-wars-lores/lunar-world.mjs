export const tile = 32;
export const width = 72;
export const height = 68;
export const spawn = { x: 24, y: 23 };
export const miningSites = [
  { x: 28, y: 20, name: 'Zcash Mining Fortress', file: 'zcash-fortress.webp', anchorY: 247,
    info: 'Mining rigs are online. Four cooling fans vent heat from the gold-lit reactor stacks.' },
  { x: 22, y: 26, name: 'WAX Bee Node', file: 'wax-bee.webp', anchorY: 234,
    info: 'The honeycomb circuits pulse as the node synchronizes.' },
];

export const stations = [
  { x: 24, y: 23, name: 'Landing Pad', log: 'The last lift left with six empty seats. The manifest still charges all six passengers for the trip.' },
  { x: 42, y: 14, name: 'Relay Nine', log: 'Someone kept the relay transmitting after the company stopped paying for power. Three settlements got the warning.' },
  { x: 53, y: 31, name: 'East Drill Camp', log: 'Night shift found void beneath the rig. Management called it poor yield until the first drill disappeared.' },
  { x: 43, y: 51, name: 'Ash Memorial', log: 'The names are etched into discarded oxygen plates. The living leave a clean filter here when they can spare one.' },
  { x: 24, y: 48, name: 'Cold Vault', log: 'Inside the vault, a frozen recorder still holds the argument over who had the right to shut the doors.' },
  { x: 15, y: 35, name: 'Crater Watch', log: 'The watch used to count lights in the crater. Now they count how many fail to come back up.' },
];

export const directions = [[0, 1], [-1, 0], [1, 0], [0, -1]];
export function noise(x, y) {
  const mixed = Math.imul(x + 27, 374761393) + Math.imul(y + 13, 668265263);
  return ((mixed ^ (mixed >>> 13)) >>> 0) % 1024 / 1024;
}

export function onMoon(x, y) {
  const dx = (x - width / 2) / 29;
  const dy = (y - height / 2) / 29;
  const angle = Math.atan2(dy, dx);
  const ridge = Math.sin(angle * 9) * .027 + Math.cos(angle * 19) * .016;
  return Math.hypot(dx, dy) < 1 + ridge + (noise(x,y) - .5) * .06;
}

export function walkable(x, y) {
  return onMoon(x, y) && !miningSites.some(site => Math.abs(x - site.x) <= 1 && Math.abs(y - site.y) <= 1);
}

export function route(start, end) {
  if (!walkable(end.x, end.y)) return [];
  const queue = [{ ...start, previous: null }];
  const seen = new Set([start.y * width + start.x]);
  for (const current of queue) {
    if (current.x === end.x && current.y === end.y) {
      const steps = [];
      for (let p = current; p.previous; p = p.previous) steps.push({ x: p.x, y: p.y });
      return steps.reverse();
    }
    for (const [dx, dy] of directions) {
      const x = current.x + dx, y = current.y + dy;
      const key = y * width + x;
      if (!walkable(x, y) || seen.has(key)) continue;
      seen.add(key);
      queue.push({ x, y, previous: current });
    }
  }
  return [];
}
