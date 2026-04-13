export function generateDistrictLayout(seed = Date.now()) {
  const rand = mulberry32(seed);

  const districts = [
    'neon-exchange',
    'mural-sector',
    'dead-rail',
    'black-fork-alley',
    'chain-plaza',
    'moon-gate'
  ];

  return districts.map((id, index) => ({
    id,
    x: 200 + index * 120 + Math.floor(rand() * 40),
    y: 250 + Math.floor(rand() * 180),
    width: 140 + Math.floor(rand() * 30),
    height: 100 + Math.floor(rand() * 30),
    difficulty: Math.floor(rand() * 5) + 1
  }));
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
