// Coordinates are zero-based. Keep these tile IDs and the storage key compatible with existing saves.
window.waterfrontDistrict = {
  name: "Lumina’s Waterfront",
  tileSize: 32,
  spawn: { x: 4, y: 6 },
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
  ],
  tiles: {
    "~": { name: "Water", color: "#123c51" },
    ".": { name: "Ground", color: "#35534d" },
    r: { name: "Street", color: "#6a8386", walkable: true },
    d: { name: "Dock", color: "#986346", walkable: true },
    h: { name: "Lighthouse", color: "#e2ccb0" },
    w: { name: "Workshop", color: "#a8634d" },
    c: { name: "Harbor cottage", color: "#227e78" }
  }
};
