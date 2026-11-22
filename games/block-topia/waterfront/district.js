// Coordinates are zero-based. Keep these tile IDs and the storage key compatible with existing saves.
window.waterfrontDistrict = {
  name: "Lumina’s Waterfront",
  tileSize: 32,
  spawn: { x: 12, y: 6 },
  previousLayout: {
    columnOffset: 8,
    rows: [
      "~~~~d~~~~~~~",
      "~~~~d~~~~~~~",
      "...rr.......",
      "...hrw...~..",
      "....r.......",
      "....rc......",
      "..rrrrrrrr..",
      "..r...c..r..",
      "..rw.....r..",
      "..rrrrrrrr..",
      "......r.....",
      "......r....."
    ]
  },
  previousWideRows: [
    "~~~d~~~~~~~~d~~~~~~~~~~~d~~~",
    "~~~d~~~~~~~~d~~~~~~~~~~~d~~~",
    "...r.......rr...........r...",
    ".g.r.b.....hrw...~....g.r.b.",
    ".rrrrrr.....r........rrrrrr.",
    "..wr.gr.....rc........w.r.g.",
    ".rrrrrrrrrrrrrrrrrrrrrrrrrr.",
    ".r.sw.r...r...c..r...r..s.r.",
    ".r....r...rw.....r...r.g..r.",
    ".rrrrrrrrrrrrrrrrrrrrrrrrrr.",
    "..b..rc.......r.......c.rw..",
    ".....r........r.........r..."
  ],
  previousDoorstepRows: [
    "~~~d~~~~~~~~d~~~~~~~~~~~d~~~",
    "~~~d~~~~~~~~d~~~~~~~~~~~d~~~",
    "...r.......rr...........r...",
    ".g.r.b.....hrw...~....g.r.b.",
    ".rrrrrr....prp.......rrrrrr.",
    "..wr.gr.....rc........w.r.g.",
    ".rrrrrrrrrrrrrrrrrrrrrrrrrr.",
    ".r.sw.r...r...c..r...r..s.r.",
    ".r.pp.r...rw..p..r...r.gp.r.",
    ".rrrrrrrrrrrrrrrrrrrrrrrrrr.",
    ".pb..rc.......r.......c.rw..",
    ".pp..rp.......r.......pprp.."
  ],
  rows: [
    "~~~d~~~~~~~~d~~~~~~~~~~~d~~~",
    "~~~d~~~~~~~~d~~~~~~~~~~~d~~~",
    "...r.......rr...........r...",
    ".g.r.b.....hrw...~....g.r.b.",
    ".rrrrrr....prp.......rrrrrr.",
    "..wr.grE.V..rc.L..N.A.w.r.g.",
    ".rrrrrrrrrrrrrrrrrrrrrrrrrr.",
    ".r.sw.r...r...c..r...r..s.r.",
    ".r.pp.r.H.rw..p..r...r.gp.r.",
    ".rrrrrrrrrrrrrrrrrrrrrrrrrr.",
    ".pb..rc.......r.......c.rw..",
    ".pp..rp.......r.......pprp.."
  ],
  // Ground finishes for open land. Coordinates are inclusive [left, top, right, bottom].
  groundZones: [
    { material: "grass", bounds: [7, 3, 10, 5] },
    { material: "grass", bounds: [15, 3, 18, 5] },
    { material: "grass", bounds: [12, 7, 16, 8] },
    { material: "grass", bounds: [18, 7, 19, 8] },
    { material: "grass", bounds: [8, 10, 13, 11] },
    { material: "grass", bounds: [19, 10, 21, 11] },
    { material: "gravel", bounds: [0, 2, 7, 5] },
    { material: "gravel", bounds: [19, 2, 27, 5] },
    { material: "gravel", bounds: [2, 7, 8, 8] },
    { material: "gravel", bounds: [0, 10, 4, 11] },
    { material: "gravel", bounds: [25, 10, 27, 11] }
  ],
  tiles: {
    E: { name: "Block Exchange", color: "#4f4366" },
    V: { name: "Cold Vault", color: "#4f4366" },
    H: { name: "Hash House", color: "#4f4366" },
    L: { name: "Lucky Block Casino", color: "#4f4366" },
    N: { name: "Neon Ledger Casino", color: "#4f4366" },
    A: { name: "Afterblock Club", color: "#4f4366" },
    "~": { name: "Water", color: "#101f34" },
    ".": { name: "Ground", color: "#23242e" },
    p: { name: "Paved footpath", color: "#6f6268", walkable: true },
    r: { name: "Street", color: "#454b5a", walkable: true },
    d: { name: "Dock", color: "#725065", walkable: true },
    h: { name: "Lighthouse", color: "#e2ccb0" },
    w: { name: "Workshop", color: "#a8634d" },
    c: { name: "Harbor apartment", color: "#407c83" },
    g: { name: "Graffiti wall", color: "#923b64" },
    s: { name: "Record shop", color: "#504879" },
    b: { name: "Warehouse", color: "#714e54" }
  }
};

// The original harbor remains the only built-up district.
{
  const district = window.waterfrontDistrict;
  const harborRows = district.rows;
  const offset = { x: 10, y: 8 };
  const world = Array.from({length: 34}, () => Array(56).fill("~"));
  const fill = (left, top, right, bottom, tile) => {
    for (let y = top; y <= bottom; y++) world[y].fill(tile, left, right + 1);
  };
  fill(9, 10, 47, 26, ".");
  fill(11, 27, 45, 28, ".");
  fill(15, 29, 40, 29, ".");
  fill(39, 9, 44, 9, ".");
  fill(2, 3, 15, 4, ".");
  fill(4, 2, 13, 5, ".");
  fill(50, 22, 54, 29, ".");
  fill(51, 20, 53, 31, ".");
  harborRows.forEach((row, y) => [...row].forEach((tile, x) => {
    world[y + offset.y][x + offset.x] = tile;
  }));
  fill(24, 20, 24, 27, "r");
  fill(13, 24, 44, 24, "r");
  fill(44, 14, 44, 24, "r");
  fill(36, 14, 44, 14, "r");
  fill(44, 19, 46, 19, "p");
  fill(16, 24, 16, 27, "p");
  fill(36, 24, 36, 28, "p");
  const openZones = [
    { name: "West Meadow", material: "grass", bounds: [11,20,22,23] },
    { name: "Southwest Park", material: "grass", bounds: [12,25,23,28] },
    { name: "South Point", material: "grass", bounds: [25,25,40,29] },
    { name: "East Common", material: "grass", bounds: [38,15,43,22] },
    { name: "East Shore", material: "grass", bounds: [45,11,47,26] }
  ];
  district.harborRows = harborRows;
  district.harborOffset = offset;
  district.spawn = {x: district.spawn.x + offset.x, y: district.spawn.y + offset.y};
  district.rows = world.map(row => row.join(""));
  district.groundZones = [...district.groundZones.map(zone => ({
    ...zone, bounds: zone.bounds.map((n,i) => n + (i % 2 ? offset.y : offset.x))
  })), ...openZones,
  {material:"grass", bounds:[2,2,15,5]}, {material:"grass", bounds:[50,20,54,31]}];
}
