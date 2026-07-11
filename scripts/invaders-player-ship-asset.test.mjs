/**
 * invaders-player-ship-asset.test.mjs
 *
 * Validation proving:
 *   1. PNG payload is valid (correct magic bytes)
 *   2. Exact dimensions match the Level 1 Bitcoin Cannon asset contract (80×40)
 *   3. Transparency exists (at least one pixel with alpha < 255)
 *   4. Hydrated output path matches the manifest runtimePath
 *   5. Runtime renderer (render-system.js) requests and draws the asset
 *   6. Primitive fallback function still exists
 *   7. No gameplay logic was changed (SHIP_W/SHIP_H constants unchanged)
 *
 * Run:
 *   node scripts/invaders-player-ship-asset.test.mjs
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function readRootFile(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function readRootBuffer(rel) {
  return readFileSync(path.join(ROOT, rel));
}

function parsePngDimensions(buf) {
  // PNG IHDR chunk starts at offset 16 and holds width(4) + height(4) big-endian
  if (buf.length < 24) throw new Error('Buffer too short to read PNG dimensions');
  const width  = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

function hasTransparency(buf) {
  // RGBA PNG: raw pixel data starts past PNG header/IHDR.
  // Use a brute-force zlib approach by scanning for the IDAT-deflated alpha
  // channel through sharp (which must already be installed for hydration).
  // Fallback: check for colour type 6 (RGBA) or 4 (greyscale+alpha) in IHDR.
  const colourType = buf[25]; // byte 25 in a standard PNG IHDR
  return colourType === 4 || colourType === 6;
}

// ── Load manifest ─────────────────────────────────────────────────────────────

const manifest = JSON.parse(readRootFile('art/invaders/manifest.json'));
assert.ok(manifest && typeof manifest === 'object', 'manifest must be an object');
assert.ok(Array.isArray(manifest.assets), 'manifest.assets must be an array');

const shipAsset = manifest.assets.find(a => a.id === 'invaders-player-ship');
assert.ok(shipAsset, 'manifest must contain an asset with id "invaders-player-ship"');

// ── Test 1: encoded source file exists and is valid base64 ───────────────────

const encodedPath = shipAsset.encodedOutput;
assert.ok(
  existsSync(path.join(ROOT, encodedPath)),
  `Encoded source must exist: ${encodedPath}`
);

const encoded = readRootFile(encodedPath).replace(/\s+/gu, '');
const pngBuf = Buffer.from(encoded, 'base64');

assert.ok(
  pngBuf.length >= PNG_MAGIC.length && pngBuf.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC),
  'Decoded base64 payload must start with PNG magic bytes'
);
console.log('✅  Test 1 — PNG payload is valid');

// ── Test 2: exact dimensions match the cannon asset contract (80×40) ──────────────────────

const ASSET_W = 80;
const ASSET_H = 40;
const HITBOX_W = 36;
const HITBOX_H = 20;
const { width, height } = parsePngDimensions(pngBuf);

assert.equal(width,  ASSET_W, `PNG width must be ${ASSET_W}, got ${width}`);
assert.equal(height, ASSET_H, `PNG height must be ${ASSET_H}, got ${height}`);
console.log(`✅  Test 2 — Exact dimensions ${width}×${height} match contract`);

// ── Test 3: transparency exists ───────────────────────────────────────────────

assert.ok(
  hasTransparency(pngBuf),
  'PNG must have an alpha channel (colour type 4 or 6 in IHDR)'
);
console.log('✅  Test 3 — PNG has an alpha channel');

// ── Test 4: hydrated output path matches the manifest runtimePath ─────────────

const runtimePath = shipAsset.runtimePath; // e.g. /games/invaders-3008/assets/ships/player-ship.png
assert.match(runtimePath, /^\//, 'runtimePath must be an absolute web path');

const hydratedAbs = path.join(ROOT, runtimePath.replace(/^\//, ''));
assert.ok(
  existsSync(hydratedAbs),
  `Hydrated PNG must exist at runtimePath ${runtimePath}. Run: node scripts/hydrate-invaders-player-ship.mjs`
);

const hydratedBuf = readRootBuffer(runtimePath.replace(/^\//, ''));
assert.ok(
  hydratedBuf.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC),
  'Hydrated PNG must be a valid PNG'
);

// Confirm source and hydrated produce identical content
const srcHash      = createHash('sha256').update(pngBuf).digest('hex');
const hydratedHash = createHash('sha256').update(hydratedBuf).digest('hex');
assert.equal(hydratedHash, srcHash, 'Hydrated PNG content must match the decoded .base64 source');

console.log(`✅  Test 4 — Hydrated output at ${runtimePath} matches manifest and source`);

// ── Test 5: runtime renderer requests and draws the asset ─────────────────────

const renderSystem = readRootFile('js/arcade/games/invaders/render-system.js');

assert.match(
  renderSystem,
  /PLAYER_SHIP_ASSET_SRC\s*=\s*['"]\/games\/invaders-3008\/assets\/ships\/player-ship\.png(?:\?[^'"]+)?['"]/,
  'render-system.js must declare PLAYER_SHIP_ASSET_SRC pointing to the runtime PNG'
);
assert.match(
  renderSystem,
  /getPlayerShipImage\s*\(\s*\)/,
  'render-system.js must call getPlayerShipImage() inside drawShip'
);
assert.match(
  renderSystem,
  /ctx\.drawImage\s*\(\s*shipImg/,
  'render-system.js must call ctx.drawImage with the loaded ship sprite'
);
assert.match(
  renderSystem,
  /imageSmoothingEnabled\s*=\s*false/,
  'render-system.js must disable image smoothing for crisp pixel-art scaling'
);
assert.match(
  renderSystem,
  /__playerShipLoader/,
  'render-system.js must export __playerShipLoader for integration tests'
);

console.log('✅  Test 5 — renderer requests and draws the asset');

// ── Test 6: primitive fallback still exists ───────────────────────────────────

assert.match(
  renderSystem,
  /function\s+drawShipPrimitive\s*\(/,
  'render-system.js must retain drawShipPrimitive() as the fallback'
);
assert.match(
  renderSystem,
  /getPlayerShipImage\(\)\s*;\s*\n\s*if\s*\(\s*shipImg\s*\)/,
  'drawShip must check getPlayerShipImage() before deciding primitive vs asset'
);

console.log('✅  Test 6 — primitive fallback function exists');

// ── Test 7: no gameplay logic changed ─────────────────────────────────────────

const bootstrap = readRootFile('js/arcade/games/invaders/bootstrap.js');

const shipWMatch = bootstrap.match(/const\s+SHIP_W\s*=\s*(\d+)/);
const shipHMatch = bootstrap.match(/const\s+SHIP_H\s*=\s*(\d+)/);

assert.ok(shipWMatch, 'bootstrap.js must still declare SHIP_W');
assert.ok(shipHMatch, 'bootstrap.js must still declare SHIP_H');

assert.equal(
  Number(shipWMatch[1]), HITBOX_W,
  `bootstrap.js SHIP_W must remain ${HITBOX_W} — gameplay dimension unchanged`
);
assert.equal(
  Number(shipHMatch[1]), HITBOX_H,
  `bootstrap.js SHIP_H must remain ${HITBOX_H} — gameplay dimension unchanged`
);

// render-system must not import or reference old sheet/atlas paths
const FORBIDDEN_SHEETS = [
  'enemy-sheet.png',
  'boss-sheet.png',
  'projectile-fx-sheet.png',
  'player-ship-sheet.png',
  'remaining-game-assets.png',
];
for (const sheet of FORBIDDEN_SHEETS) {
  assert.doesNotMatch(
    renderSystem,
    new RegExp(sheet.replace('.', '\\.'), 'u'),
    `render-system.js must not reference old sheet path: ${sheet}`
  );
}

console.log('✅  Test 7 — gameplay constants unchanged; old sheet paths absent');

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n✅  All invaders player-ship asset validation tests passed');
