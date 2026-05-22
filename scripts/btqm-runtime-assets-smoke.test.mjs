import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const bootstrap = readFileSync('js/arcade/games/block-topia-quest-maze/bootstrap.js', 'utf8');
const fxSystem = readFileSync('js/arcade/games/block-topia-quest-maze/fx-system.js', 'utf8');
const btqmLivePage = readFileSync('games/block-topia-quest-maze/index.html', 'utf8');
const fullscreenShell = readFileSync('js/game-fullscreen.js', 'utf8');
const manifest = JSON.parse(readFileSync('art/btqm/manifest.json', 'utf8'));
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const deployPagesWorkflow = readFileSync('.github/workflows/deploy-pages.yml', 'utf8');
const gitignore = readFileSync('.gitignore', 'utf8');
const hydrateScript = readFileSync('scripts/hydrate-btqm-generated-assets.mjs', 'utf8');
const auditSummary = JSON.parse(execFileSync(process.execPath, ['scripts/btqm-generated-asset-usage-audit.mjs', '--json'], { encoding: 'utf8' }));

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
assert.match(bootstrap, /function\s+isValidBtqmTilesetZoneId\s*\(/, 'runtime loader must validate generated tileset zone IDs before registration');

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
assert.match(bootstrap, /function\s+addBtqmMapTileSprite\s*\(/, 'active zone map renderer must use a dedicated generated-tile sprite helper');
assert.match(bootstrap, /this\.tileSprites\[r\]\[c\]\s*=\s*addBtqmMapTileSprite\([\s\S]*?this,[\s\S]*?this\.zoneId,[\s\S]*?tile,[\s\S]*?c \* TS \+ TS \/ 2,[\s\S]*?r \* TS \+ TS \/ 2,[\s\S]*?TS\s*\)/, 'first-load zone map loop must render through generated tileset sprites');
assert.match(bootstrap, /const tileFrame = getBtqmTileSpriteFrame\(scene,\s*zoneId,\s*tile\)/, 'map tile sprite helper should prefer generated tileset frames');
assert.match(bootstrap, /scene\.add\.image\(x,\s*y,\s*tileFrame\.textureKey,\s*tileFrame\.frame\)/, 'generated map tile rendering must pass the tileset frame to Phaser');
assert.match(bootstrap, /if\s*\(tileFrame && typeof window !== ['"]undefined['"]\)\s*window\.BTQM_TILESET_RENDER_ACTIVE = true/, 'generated map tile rendering should only mark the runtime flag true when generated frames are drawn');
assert.match(bootstrap, /if\s*\(typeof window !== ['"]undefined['"]\)\s*window\.BTQM_TILESET_RENDER_ACTIVE = false/, 'zone map render setup should reset the runtime flag before drawing visible tiles');
assert.match(bootstrap, /sprite\.setTexture\(tileFrame\.textureKey,\s*tileFrame\.frame\)/, 'active tile update path should apply generated tileset frames directly to visible tile sprites');
assert.match(bootstrap, /function\s+getBtqmTileDebugFallback\s*\(/, 'debug tile textures must be isolated behind a fallback helper');
assert.match(bootstrap, /if \(tile === 0\) return ['"]tile_wall_['"] \+ zoneId/, 'zone map rendering must preserve wall debug fallback');
assert.match(bootstrap, /return ['"]tile_floor_['"] \+ zoneId/, 'zone map rendering must preserve floor debug fallback');
assert.match(bootstrap, /setBtqmTileSpriteTexture\(self,\s*self\.tileSprites\[r\]\[c\],\s*self\.zoneId,\s*1,\s*['"]tile_floor_['"] \+ self\.zoneId\)/, 'cleared boss tiles should reset through generated tileset floor fallback helper');
assert.match(bootstrap, /setBtqmTileSpriteTexture\(self,\s*self\.tileSprites\[cy\]\[cx\],\s*self\.zoneId,\s*1,\s*['"]tile_floor_['"] \+ self\.zoneId\)/, 'cleared encounter tiles should reset through generated tileset floor fallback helper');
assert.match(bootstrap, /setBtqmTileSpriteTexture\(self,\s*self\.tileSprites\[r\]\[c\],\s*self\.zoneId,\s*4,\s*getBtqmTexture\(self,\s*['"]tile_exit['"],\s*['"]object-exit-portal['"]\)\)/, 'exit tile updates should preserve generated tileset exit frames');
assert.match(bootstrap, /tileset has invalid zoneId/, 'runtime loader must warn and skip invalid tileset zone registrations');
assert.match(bootstrap, /duplicate tileset zone registration/, 'runtime loader must warn and skip duplicate tileset zone registrations');
assert.doesNotMatch(bootstrap, /console\.(?:log|debug)\(/, 'BTQM runtime must not emit unconditional production log/debug signals');
assert.match(bootstrap, /pixelArt:\s*true/, 'Phaser pixelArt rendering should be enabled');
assert.match(bootstrap, /antialias:\s*false/, 'Phaser antialiasing should be disabled');
assert.match(bootstrap, /roundPixels:\s*true/, 'Phaser should round pixels for crisp sprites');
assert.match(btqmLivePage, /import\s*\{\s*mountGame\s*\}\s*from\s*['"]\/js\/arcade\/core\/game-shell\.js['"]/, 'BTQM live page should mount through game-shell');
assert.match(btqmLivePage, /import\s*\{\s*bootstrapBlockTopiaQuestMaze\s*\}\s*from\s*['"]\/js\/arcade\/games\/block-topia-quest-maze\/bootstrap\.js['"]/, 'BTQM live page should import maintained BTQM bootstrap');
assert.match(btqmLivePage, /mountGame\(\{\s*root:\s*document\.querySelector\(['"]\.game-card['"]\)\s*,\s*bootstrap:\s*bootstrapBlockTopiaQuestMaze\s*\}\)/, 'BTQM live page should mount the maintained BTQM bootstrap');
assert.match(btqmLivePage, /id=['"]btqm-name-overlay['"]/, 'BTQM live page should include BTQM title/name overlay required by bootstrap');
assert.match(btqmLivePage, /id=['"]btqm-daily-bar['"]/, 'BTQM live page should include BTQM daily status bar required by bootstrap');
assert.doesNotMatch(btqmLivePage, /Mega Bomb/iu, 'BTQM live page must not expose retired Mega Bomb public naming');
assert.doesNotMatch(btqmLivePage, /(?:id=['"]btqm-hud['"]|#btqm-hud\b)/u, 'BTQM live page must not keep the retired BTQM HUD markup');
assert.doesNotMatch(btqmLivePage, /(?:id=['"]btqm-ui['"]|#btqm-ui\b)/u, 'BTQM live page must not keep the retired BTQM side-panel layout');
assert.doesNotMatch(btqmLivePage, /(?:id=['"]btqm-log['"]|#btqm-log\b)/u, 'BTQM live page must not keep the retired BTQM log panel');
assert.doesNotMatch(btqmLivePage, /(?:id=['"]btqm-actions['"]|#btqm-actions\b)/u, 'BTQM live page must not keep the retired BTQM action button tray');
assert.doesNotMatch(btqmLivePage, /(?:id=['"]btqm-card['"]|#btqm-card\b)/u, 'BTQM live page must not keep the retired BTQM card overlay');
assert.doesNotMatch(btqmLivePage, /(?:id=['"]btqm-choice-list['"]|#btqm-choice-list\b)/u, 'BTQM live page must not keep the retired BTQM choice list');
assert.doesNotMatch(btqmLivePage, /(?:id=['"]btqm-banner['"]|#btqm-banner\b)/u, 'BTQM live page must not keep the retired BTQM banner overlay');
assert.doesNotMatch(btqmLivePage, /(?:id=['"]btqm-low-hp['"]|#btqm-low-hp\b)/u, 'BTQM live page must not keep the retired BTQM low HP overlay');
assert.doesNotMatch(btqmLivePage, /this\.canvas\s*=\s*document\.getElementById\(['"]btqm-canvas['"]\)/, 'BTQM live page should not run the legacy inline canvas renderer');
assert.doesNotMatch(btqmLivePage, /const\s+game\s*=\s*new\s+Game\s*\(\s*\)\s*;/, 'BTQM live page should not instantiate the legacy inline Game class');

// ── Browser/smoke verification: BTQM first-load map rendering ────────────────
// manifest loaded generated tilesets — verified above (generatedTilesetAssets.length === 6)
// tilesets are allowlisted — verified above (safeCategories.has('tilesets'))
// active map render uses generated texture/frame helpers; fallback did not crash — verified above
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

assert.equal(auditSummary.loadedButUnusedAssets.length, 0, 'audit should not report generated BTQM payloads that are loaded but unused');
assert.equal(auditSummary.missingPayloads.length, 0, 'audit should not report generated manifest records with missing payloads');
assert.deepEqual(auditSummary.orphanPayloads, [], 'audit should not report orphan BTQM .png.base64 payloads');
assert.equal(auditSummary.duplicateHashes.length, 0, 'audit should not report duplicate generated payload hashes within a category');

const usedAssetCountsByCategory = auditSummary.usedAssets.reduce((counts, asset) => {
  counts[asset.category] = (counts[asset.category] || 0) + 1;
  return counts;
}, {});
assert.deepEqual(
  usedAssetCountsByCategory,
  { tilesets: 6, player: 1, enemies: 12, bosses: 3, fx: 3 },
  'audit should keep only the BTQM generated assets that are visibly used by the current runtime',
);
assert.deepEqual(
  auditSummary.usedAssets.filter((asset) => asset.category === 'bosses').map((asset) => asset.id).sort(),
  ['boss-fomo-phantom-prime', 'boss-ngmi-overlord', 'boss-paper-hand-king'],
  'only boss sheets that match current Bonus Battle boss names should remain generated',
);
assert.deepEqual(
  manifest.assets.filter((asset) => asset.status === 'generated' && ['ui', 'icons', 'objects'].includes(asset.category)),
  [],
  'unused BTQM UI, icon, and object payloads should no longer remain generated',
);

assert.doesNotMatch(bootstrap, /BLOCK TOPIA QUEST MAZE/, 'old world-map title phrase ("BLOCK TOPIA QUEST MAZE") must not appear in BTQM runtime source');
assert.doesNotMatch(bootstrap, /MEGA BOMB|Mega Bomb/u, 'BTQM runtime must not expose retired Mega Bomb public naming');
assert.doesNotMatch(bootstrap, /Select a zone/, 'old world-map subtitle ("Select a zone") must not appear in BTQM runtime source');
assert.doesNotMatch(bootstrap, /class WorldScene/, 'WorldScene class must be removed from BTQM runtime');
assert.doesNotMatch(bootstrap, /Returning to World Map/, 'old world-map return message must not appear in BTQM runtime source');
assert.match(bootstrap, /const shouldResumeActiveRun = !!\(\s*hasMatchingPlayer\s*&&\s*btqmRuntime\.runActive\s*&&\s*!btqmRuntime\.runSubmitted/, 'title continue path must explicitly preserve active run state');
assert.match(bootstrap, /if \(!player \|\| player\.name !== name\)\s*\{\s*p = createPlayer\(name\);\s*beginRun\(name\);/, 'new runs should still initialize btqm runtime state');
assert.match(bootstrap, /if \(!shouldResumeActiveRun\)\s*\{\s*p\.hp = p\.maxHp;\s*beginRun\(p\.name\);/, 'continue should call beginRun only for non-active runs');
assert.match(bootstrap, /if \(typeof window !== ['"]undefined['"]\) window\.running = true/, 'active ZoneScene gameplay entry must set window.running true');
assert.match(bootstrap, /const hasNextZone = !this\.daily\.zoneClears\[nextZoneId\]/, 'zone clear flow must compute next-zone continuation without world map');
assert.match(bootstrap, /this\.scene\.start\('ZoneScene', \{ zoneId: nextZoneId \}\)/, 'zone clear continuation should transition directly to next ZoneScene');
assert.match(bootstrap, /this\.spaceKey\.on\('down',\s*\(\)\s*=>\s*this\._handleBombAction\(\)\)/, 'keyboard SPACE should route through the shared BTQM bomb action handler');
assert.match(bootstrap, /placeBomb\(\)\s*\{\s*self\._handleBombAction\(\);\s*\}/, 'test hook bomb placement should route through the shared BTQM bomb action handler');
assert.match(bootstrap, /_handleBombAction\(\)\s*\{\s*if \(this\.runOver \|\| this\.inUpgrade\) return;\s*this\._placeBomb\(\);\s*\}/, 'shared BTQM bomb action handler must preserve runtime guards before placing bombs');
assert.match(fullscreenShell, /btqmCanvas:\s*\{[\s\S]*touchScheme:\s*'dpad-bomb'/, 'fullscreen shell must expose a BTQM touch scheme with a bomb action');
assert.match(fullscreenShell, /function\s+buildDpadBomb\(\)/, 'fullscreen shell must define a BTQM dpad+bomb touch builder');
assert.match(fullscreenShell, /var bomb = makeTouchBtn\('💣',\s*'touch-btn--fire touch-btn--wide',\s*'Place bomb'\);\s*bindTap\(bomb,\s*' '\);/, 'fullscreen shell BTQM touch builder must map the bomb button to SPACE');

console.log('BTQM runtime asset smoke checks passed.');
