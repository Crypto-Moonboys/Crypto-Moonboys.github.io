import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bootstrap = readFileSync('js/arcade/games/block-topia-quest-maze/bootstrap.js', 'utf8');
const fxSystem = readFileSync('js/arcade/games/block-topia-quest-maze/fx-system.js', 'utf8');
const manifest = JSON.parse(readFileSync('art/btqm/manifest.json', 'utf8'));

function extractStringSet(source, constantName) {
  const match = source.match(new RegExp(`const\\s+${constantName}\\s*=\\s*new\\s+Set\\s*\\(\\s*\\[([\\s\\S]*?)\\]\\s*\\)`));
  assert.ok(match, `${constantName} must be declared as a Set`);
  return new Set([...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((item) => item[1]));
}

function assertSetEquals(actual, expected, message) {
  assert.deepEqual([...actual].sort(), [...expected].sort(), message);
}

const manifestUrl = bootstrap.match(/const\s+BTQM_ASSET_MANIFEST_URL\s*=\s*['"]([^'"]+)['"]/);
assert.ok(manifestUrl, 'BTQM manifest URL constant must exist');
assert.equal(manifestUrl[1], '/art/btqm/manifest.json', 'BTQM manifest URL must point at art/btqm/manifest.json');

assert.match(bootstrap, /status\s*===\s*['"]generated['"]/, 'runtime loader must filter to generated assets only');

const safeCategories = extractStringSet(bootstrap, 'BTQM_SAFE_ASSET_CATEGORIES');
assertSetEquals(safeCategories, new Set(['icons', 'ui', 'objects', 'fx', 'player']), 'phase-1 category allowlist must contain exactly the safe categories');
assert.ok(!safeCategories.has('enemies'), 'enemies must not be in the phase-1 runtime allowlist');
assert.ok(!safeCategories.has('bosses'), 'bosses must not be in the phase-1 runtime allowlist');
assert.ok(!safeCategories.has('tilesets'), 'tilesets must not be in the phase-1 runtime allowlist');

const fxSheets = extractStringSet(bootstrap, 'BTQM_FX_SHEET_IDS');
assertSetEquals(fxSheets, new Set(['fx-slash', 'fx-crit', 'fx-poison', 'fx-bleed', 'fx-shield', 'fx-treasure']), 'phase-1 FX allowlist must exclude portal and boss-intro sheets');

assert.match(bootstrap, /handleBtqmAssetLoadError/, 'loaderror handler should be named so it can be unregistered');
assert.match(bootstrap, /scene\.load\.off\(\s*['"]loaderror['"]\s*,\s*handleBtqmAssetLoadError\s*\)/, 'loaderror handler should be removed on shutdown');
assert.match(bootstrap, /generateFrameNumbers\(textureKey,\s*{[\s\S]*start:\s*0,[\s\S]*end:\s*frameCount\s*-\s*1,[\s\S]*}\)/, 'FX animation registration should use explicit frame ranges');
assert.match(bootstrap, /console\.warn\(\s*['"]\[BTQM assets\]/, 'missing assets should warn instead of crashing silently');
assert.match(bootstrap, /pixelArt:\s*true/, 'Phaser pixelArt rendering should be enabled');
assert.match(bootstrap, /antialias:\s*false/, 'Phaser antialiasing should be disabled');
assert.match(bootstrap, /roundPixels:\s*true/, 'Phaser should round pixels for crisp sprites');
assert.match(fxSystem, /fx-slash/, 'slash FX animation should be used at runtime when available');
assert.match(fxSystem, /fx-crit/, 'crit FX animation should be used at runtime when available');
assert.match(fxSystem, /fx-treasure/, 'treasure FX animation should be used at runtime when available');

assert.equal(manifest.outputRoot, 'art/btqm/generated', 'BTQM manifest should point at generated asset root');
assert.ok(Array.isArray(manifest.assets), 'BTQM manifest must include an assets array');

console.log('BTQM runtime asset smoke checks passed.');
