import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const bootstrap = readFileSync('js/arcade/games/block-topia-quest-maze/bootstrap.js', 'utf8');
const fxSystem = readFileSync('js/arcade/games/block-topia-quest-maze/fx-system.js', 'utf8');
const manifest = JSON.parse(readFileSync('art/btqm/manifest.json', 'utf8'));
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const deployPagesWorkflow = readFileSync('.github/workflows/deploy-pages.yml', 'utf8');
const gitignore = readFileSync('.gitignore', 'utf8');
const hydrateScript = readFileSync('scripts/hydrate-btqm-generated-assets.mjs', 'utf8');

const generatedAssetRoot = 'art/btqm/generated';
const binaryAssetExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp3', '.wav']);
const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function walkFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
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
assert.match(bootstrap, /function\s+isValidBtqmGeneratedAssetPath\s*\(/, 'runtime loader must validate generated asset paths before loading');
assert.match(bootstrap, /function\s+isValidBtqmTileset\s*\(/, 'runtime loader must validate generated tileset dimensions before loading');

const safeCategories = extractStringSet(bootstrap, 'BTQM_SAFE_ASSET_CATEGORIES');
assertSetEquals(safeCategories, new Set(['icons', 'ui', 'objects', 'fx', 'player', 'enemies', 'bosses', 'tilesets']), 'phase-3 category allowlist must include generated tilesets, enemies, and bosses');
assert.ok(safeCategories.has('enemies'), 'enemies must be in the phase-3 runtime allowlist');
assert.ok(safeCategories.has('bosses'), 'bosses must be in the phase-3 runtime allowlist');
assert.ok(safeCategories.has('tilesets'), 'tilesets must be in the runtime allowlist');

const fxSheets = extractStringSet(bootstrap, 'BTQM_FX_SHEET_IDS');
assertSetEquals(fxSheets, new Set(['fx-slash', 'fx-crit', 'fx-poison', 'fx-bleed', 'fx-shield', 'fx-treasure']), 'phase-1 FX allowlist must exclude portal and boss-intro sheets');

assert.match(bootstrap, /handleBtqmAssetLoadError/, 'loaderror handler should be named so it can be unregistered');
assert.match(bootstrap, /scene\.load\.off\(\s*['"]loaderror['"]\s*,\s*handleBtqmAssetLoadError\s*\)/, 'loaderror handler should be removed on shutdown');
assert.match(bootstrap, /generateFrameNumbers\(textureKey,\s*{[\s\S]*start:\s*0,[\s\S]*end:\s*frameCount\s*-\s*1,[\s\S]*}\)/, 'animation registration should use explicit frame ranges');
assert.match(bootstrap, /function\s+getBtqmEnemyTexture\s*\(/, 'enemy texture helper must exist');
assert.match(bootstrap, /function\s+getBtqmBossTexture\s*\(/, 'boss texture helper must exist');
assert.match(bootstrap, /function\s+addBtqmEnemySprite\s*\(/, 'enemy sprite helper must exist');
assert.match(bootstrap, /function\s+addBtqmBossSprite\s*\(/, 'boss sprite helper must exist');
assert.match(bootstrap, /isValidBtqmCharacterSheet/, 'enemy and boss sheets should be validated before animation registration');
assert.match(bootstrap, /getBtqmEnemyTexture\(scene,\s*enemyId\)\s*\|\|\s*fallbackKey/, 'enemy sprite helper must preserve debug texture fallback');
assert.match(bootstrap, /getBtqmBossTexture\(scene,\s*bossId\)\s*\|\|\s*fallbackKey/, 'boss sprite helper must preserve debug texture fallback');
assert.match(bootstrap, /addBtqmBossSprite\(this,\s*enemyPanelX,\s*110,\s*enemyAssetId,\s*enemyTexKey\)/, 'combat scene should use generated boss sprites when available');
assert.match(bootstrap, /addBtqmEnemySprite\(this,\s*enemyPanelX,\s*110,\s*enemyAssetId,\s*enemyTexKey\)/, 'combat scene should use generated enemy sprites when available');
assert.match(bootstrap, /console\.warn\(\s*['"]\[BTQM assets\]/, 'missing assets should warn instead of crashing silently');
assert.match(bootstrap, /getBtqmTileSpriteFrame\(this,\s*this\.zoneId,\s*tile\)/, 'zone map rendering should prefer generated tileset frames');
assert.match(bootstrap, /else if \(tile === 0\) texKey = ['"]tile_wall_['"] \+ this\.zoneId/, 'zone map rendering must preserve wall debug fallback');
assert.match(bootstrap, /else\s+texKey = ['"]tile_floor_['"] \+ this\.zoneId/, 'zone map rendering must preserve floor debug fallback');
assert.match(bootstrap, /pixelArt:\s*true/, 'Phaser pixelArt rendering should be enabled');
assert.match(bootstrap, /antialias:\s*false/, 'Phaser antialiasing should be disabled');
assert.match(bootstrap, /roundPixels:\s*true/, 'Phaser should round pixels for crisp sprites');
assert.match(fxSystem, /fx-slash/, 'slash FX animation should be used at runtime when available');
assert.match(fxSystem, /fx-crit/, 'crit FX animation should be used at runtime when available');
assert.match(fxSystem, /fx-treasure/, 'treasure FX animation should be used at runtime when available');

assert.equal(manifest.outputRoot, 'art/btqm/generated', 'BTQM manifest should point at generated asset root');
assert.ok(Array.isArray(manifest.assets), 'BTQM manifest must include an assets array');
assert.equal(
  packageJson.scripts['btqm:assets:hydrate'],
  'node scripts/hydrate-btqm-generated-assets.mjs',
  'package.json must expose a local BTQM asset hydration command',
);
assert.match(
  deployPagesWorkflow,
  /node scripts\/hydrate-btqm-generated-assets\.mjs --clean-base64/,
  'Pages deploy must hydrate BTQM PNGs through the shared script and clean encoded payloads from the artifact',
);
assert.match(
  gitignore,
  /art\/btqm\/generated\/\*\*\/\*\.png/,
  'locally hydrated BTQM generated PNG files must be ignored',
);
assert.match(hydrateScript, /--clean-base64/, 'hydration script must support deploy cleanup mode');
assert.match(hydrateScript, /endsWith\(['"]\.png\.base64['"]\)/, 'hydration script must walk encoded PNG payloads');

const generatedFiles = walkFiles(generatedAssetRoot);
assert.ok(generatedFiles.some((file) => file.endsWith('.png.base64')), 'generated asset payloads should remain committed as .png.base64 files');
const trackedGeneratedFiles = execFileSync('git', ['ls-files', generatedAssetRoot], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
const committedBinaryAssets = trackedGeneratedFiles.filter((file) => binaryAssetExtensions.has(extensionForAssetCheck(file)));
assert.deepEqual(committedBinaryAssets, [], 'BTQM generated assets must be text-reviewable; do not commit binary image/audio files under art/btqm/generated');


const generatedTilesetAssets = manifest.assets.filter((asset) => asset.status === 'generated' && asset.category === 'tilesets');
assert.equal(generatedTilesetAssets.length, 6, 'all generated tileset assets should be present');
for (const asset of generatedTilesetAssets) {
  assert.ok(asset.encodedOutput, `${asset.id} generated tileset record must include encodedOutput`);
  assert.equal(
    asset.encodedOutput.replace(/\.base64$/u, ''),
    asset.output,
    `${asset.id} encodedOutput must hydrate to asset.output`,
  );
}

const generatedEnemyBossAssets = manifest.assets.filter((asset) => asset.status === 'generated' && ['enemies', 'bosses'].includes(asset.category));
assert.equal(generatedEnemyBossAssets.filter((asset) => asset.category === 'enemies').length, 12, 'all generated enemy assets should be present');
assert.equal(generatedEnemyBossAssets.filter((asset) => asset.category === 'bosses').length, 6, 'all generated boss assets should be present');
for (const asset of generatedEnemyBossAssets) {
  assert.ok(asset.encodedOutput, `${asset.id} generated enemy/boss record must include encodedOutput`);
  assert.equal(
    asset.encodedOutput.replace(/\.base64$/u, ''),
    asset.output,
    `${asset.id} encodedOutput must hydrate to asset.output`,
  );
}

const generatedManifestAssets = manifest.assets.filter((asset) => asset.status === 'generated');
const shaByCategory = new Map();
for (const asset of generatedManifestAssets) {
  assert.ok(asset.encodedOutput, `${asset.id} generated record must include encodedOutput`);
  assert.equal(
    asset.encodedOutput.replace(/\.base64$/u, ''),
    asset.output,
    `${asset.id} encodedOutput must hydrate to asset.output`,
  );
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
