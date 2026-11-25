// GK-approved baseline (games/block-topia/AGENTS.md). Keep the 20 × 20 Survival Grid and its 2:1 tile projection.
// Terrain snapshot from Block Topia survival main.js at 05ab717.
import { createLunarTerrain } from './node-city/lunar-terrain.mjs?v=2';

const GRID_SIZE = 20;
const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
// Reopen the blocked pads of the former buildings as plain lunar terrain.
const clearedLots = [[3,2], [7,2], [1,18], [6,13], [16,3], [19,8], [16,11], [9,14], [1,9], [1,4]];

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
  for (const [x, y] of clearedLots) tiles[getTileId(x, y)].terrain = 'grass';
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

function drawDiamond(ctx, tile, time, textured) {
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
  if (textured) {
    if (tile.terrain !== 'grass') {
      ctx.fillStyle = tile.terrain === 'road' ? 'rgba(113, 140, 155, .14)' : 'rgba(12, 16, 22, .48)';
      ctx.fill();
    }
    ctx.strokeStyle = tile.terrain === 'road' ? 'rgba(169, 204, 222, .36)' : 'rgba(14, 18, 24, .22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    return;
  }
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

export function createSurvivalGround() {
  const floor = createLunarTerrain(GRID_SIZE, GRID_SIZE, 4);
  return (ctx, time) => drawTiles(ctx, time, floor);
}

function drawTiles(ctx, time, floor) {
  if (floor?.width) {
    ctx.save();
    ctx.transform(TILE_WIDTH / 2, TILE_HEIGHT / 2, -TILE_WIDTH / 2, TILE_HEIGHT / 2, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(floor, 0, 0, GRID_SIZE, GRID_SIZE);
    ctx.restore();
  }
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      drawDiamond(ctx, tiles[getTileId(x, y)], time, Boolean(floor?.width));
    }
  }
}

const tiles = createTiles();
export { drawBackground, drawTiles };
export function survivalWalkable(x, y) {
  return x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE && tiles[getTileId(x, y)].terrain !== 'block';
}
