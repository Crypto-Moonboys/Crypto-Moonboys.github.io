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
  rows: [
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
  tiles: {
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
