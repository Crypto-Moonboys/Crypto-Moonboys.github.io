/**
 * Round-trip test: tileToScreen(x, y) -> pickTile must return (x, y) for:
 *   - the tile top vertex
 *   - the tile visual center (sy + th/2)
 *   - four interior diamond points at 80% of the way from centre to each edge
 *
 * Tests all 400 tiles in the 20×20 grid with 6 click points each = 2400 assertions.
 *
 * Runs main.js in a sandboxed vm context with a minimal window mock so that
 * the pure math functions (tileToScreen, pickTile) can be exercised without
 * a browser.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.resolve(here, '../main.js');
const source = await fs.readFile(mainPath, 'utf8');

// Provide the minimum browser globals main.js touches at evaluation time.
const context = vm.createContext({ window: {}, console });
vm.runInContext(source, context);

// Sanity-check that the functions are present.
assert.strictEqual(typeof context.tileToScreen, 'function', 'tileToScreen must be a function in main.js');
assert.strictEqual(typeof context.pickTile, 'function', 'pickTile must be a function in main.js');

const GRID_SIZE = 20;
const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;

// Default camera state (cameraX=0, cameraY=0, cameraScale=1) — resize() is never
// called in this context.  The round-trip is algebraically invariant to camera
// position and scale, so any valid state proves correctness equally.
const tw = TILE_WIDTH;
const th = TILE_HEIGHT;

for (let y = 0; y < GRID_SIZE; y++) {
  for (let x = 0; x < GRID_SIZE; x++) {
    const [sx, sy] = context.tileToScreen(x, y);
    // Visual centre of the diamond: (sx, sy + th/2)
    const cx = sx;
    const cy = sy + th / 2;

    // Six test click points per tile:
    //   1. top vertex (the point returned by tileToScreen itself)
    //   2. visual centre
    //   3-6. four interior points at 80% of the half-axes toward each vertex
    //         — these have diamond-distance 0.4+0.4=0.8, well inside the tile
    const clicks = [
      [sx, sy],                              // top vertex
      [cx, cy],                              // centre
      [cx + (tw / 2) * 0.4, cy - (th / 2) * 0.4], // upper-right interior
      [cx - (tw / 2) * 0.4, cy - (th / 2) * 0.4], // upper-left interior
      [cx + (tw / 2) * 0.4, cy + (th / 2) * 0.4], // lower-right interior
      [cx - (tw / 2) * 0.4, cy + (th / 2) * 0.4], // lower-left interior
    ];

    for (const [px, py] of clicks) {
      const tile = context.pickTile(px, py);

      assert.ok(
        tile !== null && tile !== undefined,
        `pickTile(${px}, ${py}) returned null/undefined for tile (${x}, ${y})`,
      );
      assert.strictEqual(
        tile.x,
        x,
        `pickTile round-trip x mismatch for tile (${x}, ${y}) at click (${px}, ${py}): got x=${tile.x}`,
      );
      assert.strictEqual(
        tile.y,
        y,
        `pickTile round-trip y mismatch for tile (${x}, ${y}) at click (${px}, ${py}): got y=${tile.y}`,
      );
    }
  }
}

console.log(`pickTile round-trip: all ${GRID_SIZE * GRID_SIZE * 6} assertions PASS (top vertex, centre, 4 interior points)`);

