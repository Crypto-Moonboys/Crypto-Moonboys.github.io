import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bootstrap = readFileSync('js/arcade/games/block-topia-quest-maze/bootstrap.js', 'utf8');
const fxSystem = readFileSync('js/arcade/games/block-topia-quest-maze/fx-system.js', 'utf8');
const manifest = JSON.parse(readFileSync('art/btqm/manifest.json', 'utf8'));

assert.match(bootstrap, /BTQM_ASSET_MANIFEST_URL = '\/art\/btqm\/manifest\.json'/, 'BTQM manifest URL must stay wired to art/btqm/manifest.json');
assert.match(bootstrap, /asset\.status === 'generated'/, 'runtime loader must filter to generated assets only');
assert.match(bootstrap, /BTQM_SAFE_ASSET_CATEGORIES = new Set\(\['icons', 'ui', 'objects', 'fx', 'player'\]\)/, 'phase-1 category allowlist must stay limited');
assert.doesNotMatch(bootstrap, /BTQM_SAFE_ASSET_CATEGORIES = new Set\([^)]*enemies/, 'enemies must not be in the phase-1 runtime allowlist');
assert.doesNotMatch(bootstrap, /BTQM_SAFE_ASSET_CATEGORIES = new Set\([^)]*bosses/, 'bosses must not be in the phase-1 runtime allowlist');
assert.doesNotMatch(bootstrap, /BTQM_SAFE_ASSET_CATEGORIES = new Set\([^)]*tilesets/, 'tilesets must not be in the phase-1 runtime allowlist');
assert.match(bootstrap, /console\.warn\('\[BTQM assets\]/, 'missing assets should warn instead of crashing silently');
assert.match(bootstrap, /pixelArt: true/, 'Phaser pixelArt rendering should be enabled');
assert.match(bootstrap, /antialias: false/, 'Phaser antialiasing should be disabled');
assert.match(bootstrap, /roundPixels: true/, 'Phaser should round pixels for crisp sprites');
assert.match(fxSystem, /fx-slash/, 'slash FX animation should be registered at runtime');
assert.match(fxSystem, /fx-crit/, 'crit FX animation should be registered at runtime');
assert.match(fxSystem, /fx-treasure/, 'treasure FX animation should be registered at runtime');

assert.equal(manifest.outputRoot, 'art/btqm/generated', 'BTQM manifest should point at generated asset root');
assert.ok(Array.isArray(manifest.assets), 'BTQM manifest must include an assets array');

console.log('BTQM runtime asset smoke checks passed.');
