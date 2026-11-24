// Terrain snapshot from Block Topia survival main.js at 05ab717.
const GRID_SIZE = 20;
const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
export function projectSurvival(x, y) {
  return { x: (x-y)*32, y: (x+y)*16+16 };
}

function getTileId(x, y) {
  return y * GRID_SIZE + x;
}

function decideTerrain(x, y) {
  const lineRoad = x % 5 === 0 || y % 5 === 0;
  const diagonalRoad = (x + y) % 7 === 0;
  const hash = ((x + 17) * 928371 + (y + 31) * 192847 + x * y * 11939) % 1000;
  if (lineRoad || diagonalRoad) return 'road';
  if (hash < 125) return 'block';
  return 'grass';
}

function createTiles() {
  const tiles = {};
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const id = getTileId(x, y);
      tiles[id] = { id, x, y, terrain: decideTerrain(x, y) };
    }
  }
  forceRoad(tiles, 1, 1);
  forceRoad(tiles, 2, 1);
  forceRoad(tiles, 1, 2);
  forceRoad(tiles, GRID_SIZE - 2, GRID_SIZE - 2);
  forceRoad(tiles, GRID_SIZE - 3, GRID_SIZE - 2);
  forceRoad(tiles, GRID_SIZE - 2, GRID_SIZE - 3);
  return tiles;
}

function forceRoad(tiles, x, y) {
  const tile = tiles[getTileId(x, y)];
  if (tile) tile.terrain = 'road';
}

function drawBackground(ctx, viewWidth, viewHeight) {
  const gradient = ctx.createLinearGradient(0, 0, 0, viewHeight);
  gradient.addColorStop(0, '#050b1a');
  gradient.addColorStop(0.5, '#0a1429');
  gradient.addColorStop(1, '#03070f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, viewWidth, viewHeight);
}

function getTerrainColor(tile) {
  if (tile.terrain === 'block') {
    const shade = 42 + ((tile.x + tile.y) % 3) * 6;
    return `rgb(${shade}, ${shade + 3}, ${shade + 10})`;
  }
  if (tile.terrain === 'road') {
    const shade = 70 + ((tile.x * 3 + tile.y * 5) % 4) * 5;
    return `rgb(${shade}, ${shade + 8}, ${shade + 22})`;
  }
  const shade = 58 + ((tile.x * 7 + tile.y * 11) % 5) * 4;
  return `rgb(${shade - 8}, ${shade + 16}, ${shade - 4})`;
}

function drawDiamond(ctx, tile, time) {
  const { x: sx, y: centerY } = projectSurvival(tile.x, tile.y);
  const sy = centerY - TILE_HEIGHT / 2;
  const tw = TILE_WIDTH;
  const th = TILE_HEIGHT;

  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + tw / 2, sy + th / 2);
  ctx.lineTo(sx, sy + th);
  ctx.lineTo(sx - tw / 2, sy + th / 2);
  ctx.closePath();
  ctx.fillStyle = getTerrainColor(tile);
  ctx.fill();

  if (tile.terrain === 'road') {
    const glow = 0.2 + 0.2 * (Math.sin(time * 0.002 + tile.x + tile.y) * 0.5 + 0.5);
    ctx.strokeStyle = `rgba(150, 205, 255, ${glow})`;
    ctx.lineWidth = 2.3;
  } else if (tile.terrain === 'grass') {
    ctx.strokeStyle = 'rgba(40, 60, 36, 0.9)';
    ctx.lineWidth = 1.5;
  } else {
    ctx.strokeStyle = 'rgba(76, 82, 98, 0.95)';
    ctx.lineWidth = 1.8;
  }

  ctx.stroke();
}

function drawTiles(ctx, time) {
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      drawDiamond(ctx, tiles[getTileId(x, y)], time);
    }
  }
}

const tiles = createTiles();
export { drawBackground, drawTiles };
export function survivalWalkable(x, y) {
  return x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE && tiles[getTileId(x, y)].terrain !== 'block';
}
