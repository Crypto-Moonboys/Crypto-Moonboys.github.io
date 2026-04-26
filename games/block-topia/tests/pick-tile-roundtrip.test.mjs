/**
 * Round-trip test: tileToScreen(x, y) -> pickTile(sx, sy) must return (x, y)
 * for every tile in the 20x20 grid.
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

// The default camera state (cameraX=0, cameraY=0, cameraScale=1) is used
// because resize() is never called in this context.  The round-trip is
// algebraically invariant to camera position and scale, so any valid state
// would prove correctness equally.
const GRID_SIZE = 20;

for (let y = 0; y < GRID_SIZE; y++) {
  for (let x = 0; x < GRID_SIZE; x++) {
    const [sx, sy] = context.tileToScreen(x, y);
    const tile = context.pickTile(sx, sy);

    assert.ok(
      tile !== null && tile !== undefined,
      `pickTile(${sx}, ${sy}) returned null/undefined for tile (${x}, ${y})`,
    );
    assert.strictEqual(
      tile.x,
      x,
      `pickTile round-trip x mismatch for tile (${x}, ${y}): got x=${tile.x}`,
    );
    assert.strictEqual(
      tile.y,
      y,
      `pickTile round-trip y mismatch for tile (${x}, ${y}): got y=${tile.y}`,
    );
  }
}

console.log(`pickTile round-trip: all ${GRID_SIZE * GRID_SIZE} tiles PASS`);
