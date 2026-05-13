import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

const bootstrap = readFileSync('js/arcade/games/block-topia-quest-maze/bootstrap.js', 'utf8');
const fxSystem = readFileSync('js/arcade/games/block-topia-quest-maze/fx-system.js', 'utf8');
const manifest = JSON.parse(readFileSync('art/btqm/manifest.json', 'utf8'));

const generatedAssetRoot = 'art/btqm/generated';
const binaryAssetExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp3', '.wav']);
const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function walkFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = `${dir}/${entry}`;
    return statSync(fullPath).isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

function extensionForAssetCheck(file) {
  const lower = file.toLowerCase();
  if (lower.endsWith('.png.base64')) return '.png.base64';
  const match = lower.match(/\.(png|jpe?g|webp|gif|mp3|wav)$/u);
  return match ? match[0] : '';
}

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

const generatedFiles = walkFiles(generatedAssetRoot);
const committedBinaryAssets = generatedFiles.filter((file) => binaryAssetExtensions.has(extensionForAssetCheck(file)));
assert.deepEqual(committedBinaryAssets, [], 'BTQM generated assets must be text-reviewable; do not commit binary image/audio files under art/btqm/generated');

const generatedManifestAssets = manifest.assets.filter((asset) => asset.status === 'generated');
const shaByCategory = new Map();
for (const asset of generatedManifestAssets) {
  assert.ok(asset.encodedOutput, `${asset.id} generated record must include encodedOutput`);
  assert.ok(existsSync(asset.encodedOutput), `${asset.id} encodedOutput must exist: ${asset.encodedOutput}`);

  const decoded = Buffer.from(readFileSync(asset.encodedOutput, 'utf8').replace(/\s+/gu, ''), 'base64');
  assert.ok(decoded.subarray(0, pngMagic.length).equals(pngMagic), `${asset.id} encodedOutput must decode to PNG bytes`);
  assert.equal(decoded.length, asset.bytes, `${asset.id} bytes must match decoded payload length`);
  assert.equal(createHash('sha256').update(decoded).digest('hex'), asset.sha256, `${asset.id} sha256 must match decoded payload`);

  const categoryHashes = shaByCategory.get(asset.category) || new Map();
  const duplicateAssetId = categoryHashes.get(asset.sha256);
  assert.ok(!duplicateAssetId, `${asset.category} generated assets must not duplicate sha256: ${duplicateAssetId} and ${asset.id}`);
  categoryHashes.set(asset.sha256, asset.id);
  shaByCategory.set(asset.category, categoryHashes);
}

console.log('BTQM runtime asset smoke checks passed.');
