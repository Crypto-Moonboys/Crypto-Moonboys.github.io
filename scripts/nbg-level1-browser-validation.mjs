import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { chromium } from 'playwright';

const shouldServe = process.argv.includes('--serve');
const port = Number(process.env.NBG_LEVEL1_PORT || 4175);
const host = process.env.NBG_LEVEL1_HOST || '127.0.0.1';
const url = process.env.NBG_LEVEL1_URL || `http://${host}:${port}/games/nbg-london/`;
const legacyUrl = new URL('/game/demo-launch.html', url).toString();
const browserExecutableCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const executablePath = browserExecutableCandidates.find((candidate) => fs.existsSync(candidate));
let server;
const waitingHudText = 'MOVE TO START';

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8']
]);

function serveStaticFile(request, response) {
  const requestUrl = new URL(request.url, `http://${host}:${port}`);
  const decodedPath = decodeURIComponent(requestUrl.pathname);
  const relativePath = decodedPath === '/'
    ? 'index.html'
    : decodedPath.replace(/^\/+/, '').replace(/\/$/, '/index.html');
  const root = process.cwd();
  const fullPath = path.resolve(root, relativePath);
  const relativeFromRoot = path.relative(root, fullPath);

  if (
    relativeFromRoot === '..' ||
    relativeFromRoot.startsWith('..' + path.sep) ||
    path.isAbsolute(relativeFromRoot)
  ) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.stat(fullPath, (statError, stats) => {
    const filePath = !statError && stats.isDirectory() ? path.join(fullPath, 'index.html') : fullPath;
    fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'content-type': mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream'
    });
    response.end(data);
  });
  });
}

async function startServer() {
  if (!shouldServe) return;
  server = http.createServer(serveStaticFile);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
}

async function stopServer() {
  if (!server) return;
  const closePromise = new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  if (typeof server.unref === 'function') server.unref();
  await Promise.race([
    closePromise,
    new Promise((resolve) => setTimeout(resolve, 1000))
  ]);
  server = null;
}

function averagePixelEnergy(buffer) {
  let total = 0;
  for (let i = 0; i < buffer.length; i += 4) {
    total += buffer[i] + buffer[i + 1] + buffer[i + 2];
  }
  return total / (buffer.length / 4);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8'));
}

async function openWithDelayedNbgInit(browser, targetUrl, pageOptions = { viewport: { width: 960, height: 540 } }) {
  const delayedPage = await browser.newPage(pageOptions);
  await delayedPage.route('**/game/assets/asset-manifest.json', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 650));
    await route.continue();
  });
  await delayedPage.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await delayedPage.waitForSelector('#game', { state: 'visible', timeout: 5000 });
  await delayedPage.waitForFunction(() => window.NBGLevel1State && window.NBGLevel1State.assetsLoaded === false, null, { timeout: 5000 });
  return delayedPage;
}

async function holdRunnerRight(page, durationMs = 0) {
  const rightControl = page.locator('[data-control="right"]').first();
  await rightControl.waitFor({ state: 'attached', timeout: 5000 });
  await rightControl.dispatchEvent('pointerdown', {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    bubbles: true
  });
  if (durationMs > 0) await page.waitForTimeout(durationMs);
  await rightControl.dispatchEvent('pointerup', {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    bubbles: true
  });
}

const expectedAnimations = {
  idle: { spriteSheet: 'player/animations/idle.png', sourceFrameWidth: 128, sourceFrameHeight: 128, renderWidth: 72, renderHeight: 86, renderOffsetY: 11, frames: 6, columns: 3, frameMs: 145 },
  run: { spriteSheet: 'player/animations/run.png', sourceFrameWidth: 128, sourceFrameHeight: 128, renderWidth: 72, renderHeight: 86, renderOffsetY: 17, frames: 6, columns: 3, frameMs: 88 },
  jump: { spriteSheet: 'player/animations/jump.png', sourceFrameWidth: 128, sourceFrameHeight: 128, renderWidth: 72, renderHeight: 86, renderOffsetY: 23, frames: 6, columns: 3, frameMs: 145 },
  fall: { spriteSheet: 'player/animations/fall.png', sourceFrameWidth: 128, sourceFrameHeight: 128, renderWidth: 72, renderHeight: 86, renderOffsetY: 20, frames: 6, columns: 3, frameMs: 145 },
  spray: { spriteSheet: 'player/animations/spray.png', sourceFrameWidth: 128, sourceFrameHeight: 128, renderWidth: 72, renderHeight: 86, renderOffsetY: 6, frames: 6, columns: 3, frameMs: 110 },
  hurt: { spriteSheet: 'player/animations/hurt.png', sourceFrameWidth: 128, sourceFrameHeight: 128, renderWidth: 72, renderHeight: 86, renderOffsetY: 6, frames: 6, columns: 3, frameMs: 120 },
  victory: { spriteSheet: 'player/animations/victory.png', sourceFrameWidth: 128, sourceFrameHeight: 128, renderWidth: 72, renderHeight: 86, renderOffsetY: 13, frames: 6, columns: 3, frameMs: 145 }
};
const expectedPlayerAssetUrls = Object.fromEntries(Object.entries(expectedAnimations).map(([key, animation]) => [
  `player.${key}`,
  `/game/assets/${animation.spriteSheet}`
]));
const assetManifest = readJson('game/assets/asset-manifest.json');
const playerAnimationManifest = readJson('game/assets/player/nbg-runner-animation-manifest.json');
const expectedSkylineLayers = [
  'world/LONDON BACKGROUND1.png',
  'world/LONDON BACKGROUND2.png',
  'world/LONDON BACKGROUND3.png'
];

assert.equal(
  fs.existsSync(path.resolve(process.cwd(), 'game/assets/sprite-manifest.json')),
  false,
  'sprite-manifest.json must not exist as a second animation authority'
);

assert.deepEqual(
  assetManifest.world.layerNames,
  ['sky', 'london-skyline', 'graffiti-wall', 'street'],
  'asset-manifest.json must define the canonical render layer names'
);
assert.deepEqual(
  assetManifest.world.layers[1],
  expectedSkylineLayers,
  'asset-manifest.json must reference the three direct skyline PNG panels'
);
assert.equal(
  JSON.stringify(assetManifest).includes('london-skyline-stitched.svg'),
  false,
  'asset-manifest.json must not depend on the stitched skyline SVG wrapper'
);
for (const skylineLayer of expectedSkylineLayers) {
  const assetPath = path.resolve(process.cwd(), 'game/assets', skylineLayer);
  assert.equal(fs.existsSync(assetPath), true, `skyline PNG panel must exist: ${skylineLayer}`);
  const pngHeader = fs.readFileSync(assetPath).subarray(16, 24);
  assert.equal(pngHeader.readUInt32BE(0), 480, `skyline PNG panel width must remain 480px: ${skylineLayer}`);
  assert.equal(pngHeader.readUInt32BE(4), 160, `skyline PNG panel height must remain 160px: ${skylineLayer}`);
}
assert.deepEqual(
  playerAnimationManifest.animations,
  expectedAnimations,
  'player animation manifest must define explicit AutoSprite sheet metadata per animation'
);
assert.equal('spriteSheet' in playerAnimationManifest, false, 'player animation manifest must not define a single atlas spriteSheet');
assert.equal('frameSize' in playerAnimationManifest, false, 'player animation manifest must not define global atlas frameSize');
assert.equal('anchor' in playerAnimationManifest, false, 'player animation manifest must not define atlas anchor metadata');
assert.equal('spriteSheet' in assetManifest.player, false, 'asset-manifest.json must not require the old player atlas spriteSheet');
assert.equal('animationManifest' in assetManifest.player, true, 'asset-manifest.json must point to the player animation manifest');
for (const animation of Object.values(expectedAnimations)) {
  const assetPath = path.resolve(process.cwd(), 'game/assets', animation.spriteSheet);
  assert.equal(fs.existsSync(assetPath), true, `AutoSprite animation PNG must exist: ${animation.spriteSheet}`);
  const pngHeader = fs.readFileSync(assetPath).subarray(16, 24);
  assert.equal(pngHeader.readUInt32BE(0), 384, `AutoSprite animation PNG width must remain committed grid export width: ${animation.spriteSheet}`);
  assert.equal(pngHeader.readUInt32BE(4), 256, `AutoSprite animation PNG height must remain committed grid export height: ${animation.spriteSheet}`);
  assert.notEqual(animation.renderWidth, animation.sourceFrameWidth, `render width must be separate from source frame width: ${animation.spriteSheet}`);
  assert.notEqual(animation.renderHeight, animation.sourceFrameHeight, `render height must be separate from source frame height: ${animation.spriteSheet}`);
}
const runtimeSource = fs.readFileSync(path.resolve(process.cwd(), 'game/nbg-level1.js'), 'utf8');
const gameCssSource = fs.readFileSync(path.resolve(process.cwd(), 'game/game.css'), 'utf8');
const fullscreenShellSource = fs.readFileSync(path.resolve(process.cwd(), 'js/game-fullscreen.js'), 'utf8');
const fullscreenCssSource = fs.readFileSync(path.resolve(process.cwd(), 'css/game-fullscreen.css'), 'utf8');
const arcadeRouteSource = fs.readFileSync(path.resolve(process.cwd(), 'games/nbg-london/index.html'), 'utf8');
const arcadeIndexSource = fs.readFileSync(path.resolve(process.cwd(), 'games/index.html'), 'utf8');
const playerRendererSource = fs.readFileSync(path.resolve(process.cwd(), 'game/engine/player-sprite-renderer.js'), 'utf8');
const playerControllerSource = fs.readFileSync(path.resolve(process.cwd(), 'game/engine/player-animation-controller.js'), 'utf8');
const playerBindingSource = fs.readFileSync(path.resolve(process.cwd(), 'game/assets/player/nbg-runner-asset-binding.js'), 'utf8');
const assetRegistrySource = fs.readFileSync(path.resolve(process.cwd(), 'game/assets/asset-registry.js'), 'utf8');
const runtimeAssetLoaderSource = fs.readFileSync(path.resolve(process.cwd(), 'game/assets/runtime-asset-loader.js'), 'utf8');
const level1RenderBridgeSource = fs.readFileSync(path.resolve(process.cwd(), 'game/engine/level1-render-bridge.js'), 'utf8');
const levelRenderPipelineSource = fs.readFileSync(path.resolve(process.cwd(), 'game/engine/level-render-pipeline.js'), 'utf8');
const playerAnimationRuntimeSource = fs.readFileSync(path.resolve(process.cwd(), 'game/level1/level1-player-animation-runtime.js'), 'utf8');
const playerSpawnRuntimeSource = fs.readFileSync(path.resolve(process.cwd(), 'game/level1/level1-player-spawn-runtime.js'), 'utf8');
const demoLaunchSource = fs.readFileSync(path.resolve(process.cwd(), 'game/demo-launch.html'), 'utf8');
assert.equal(
  runtimeSource.includes('assets/player/nbg-runner-sprite-sheet.svg'),
  false,
  'canonical runtime must not load the old player atlas sprite sheet'
);
assert.equal(
  [runtimeSource, playerRendererSource, playerControllerSource].some(source => /naturalWidth\s*%\s*frameHeight/.test(source)),
  false,
  'player runtime must not infer non-square AutoSprite frame dimensions from image naturalWidth modulo frameHeight'
);
assert.equal(
  [runtimeSource, playerRendererSource, playerControllerSource].some(source => /naturalWidth\s*%\s*sourceFrameHeight/.test(source)),
  false,
  'player runtime must not infer square AutoSprite frame dimensions from image naturalWidth modulo sourceFrameHeight'
);
assert.equal(
  runtimeSource.includes('sourceFrameWidth') && runtimeSource.includes('sourceFrameHeight'),
  true,
  'standalone Level 1 runtime must crop from source frame metadata'
);
assert.equal(
  runtimeSource.includes('renderWidth') && runtimeSource.includes('renderHeight'),
  true,
  'standalone Level 1 runtime must draw using render size metadata'
);
assert.equal(
  runtimeSource.includes('var STREET_BAND_HEIGHT = 28') &&
    runtimeSource.includes('var STREET_Y = HEIGHT - STREET_BAND_HEIGHT') &&
    runtimeSource.includes('var PLAYER_VISUAL_FOOT_Y = STREET_Y + 10') &&
    runtimeSource.includes('var PLAYER_VISUAL_OFFSET_Y = PLAYER_VISUAL_FOOT_Y - FLOOR_Y') &&
    runtimeSource.includes('function drawStreetLayer()') &&
    runtimeSource.includes('var sourceY = Math.floor(naturalHeight / 2)') &&
    runtimeSource.includes('ctx.drawImage(images.street, 0, sourceY, naturalWidth, sourceH, x, STREET_Y, tileW, STREET_BAND_HEIGHT)') &&
    runtimeSource.includes('var visualFootY = y + player.h + PLAYER_VISUAL_OFFSET_Y') &&
    !runtimeSource.includes('drawImageLayer(images.street'),
  true,
  'standalone Level 1 runtime must crop the lower street half at the bottom and apply render-only visual offsets'
);
assert.equal(
  runtimeSource.includes('var FOREGROUND_VISUAL_OFFSET_Y = PLAYER_VISUAL_OFFSET_Y'),
  true,
  'standalone Level 1 runtime must define a shared foreground visual offset alias from the player visual offset'
);
assert.equal(
  runtimeSource.includes('var CAMERA_JUMP_FOLLOW = 0.95') &&
    runtimeSource.includes('var CAMERA_JUMP_MAX_Y = 42') &&
    runtimeSource.includes('var CAMERA_JUMP_EASE = 0.28') &&
    runtimeSource.includes('var cameraY = 0') &&
    runtimeSource.includes('function updateCameraY()') &&
    runtimeSource.includes('var groundedY = FLOOR_Y - player.h') &&
    runtimeSource.includes('var jumpLift = Math.max(0, groundedY - player.y)') &&
    runtimeSource.includes('var targetCameraY = Math.min(CAMERA_JUMP_MAX_Y, jumpLift * CAMERA_JUMP_FOLLOW)') &&
    runtimeSource.includes('cameraY += (targetCameraY - cameraY) * CAMERA_JUMP_EASE') &&
    runtimeSource.includes('get cameraY() { return cameraY; }'),
  true,
  'standalone Level 1 runtime must expose a render-only eased vertical jump camera'
);
assert.equal(
  /function render\(time\)\s*\{\s*ctx\.clearRect\(0, 0, WIDTH, HEIGHT\);\s*ctx\.fillStyle = '#0076fc';\s*ctx\.fillRect\(0, 0, WIDTH, HEIGHT\);\s*ctx\.save\(\);\s*ctx\.translate\(0, Math\.round\(cameraY\)\);\s*drawWorld\(\);\s*drawCoins\(time\);\s*drawSecretCoins\(time\);\s*drawObjects\(\);\s*drawEnemies\(time\);\s*drawParachuteRats\(time\);\s*drawPlayer\(\);\s*ctx\.restore\(\);\s*drawSpeedrunHud\(runElapsedMs\);\s*drawSecretNotification\(runElapsedMs\);\s*drawRewardNotification\(runElapsedMs\);\s*drawOverlay\(\);/.test(runtimeSource),
  true,
  'standalone Level 1 render must wrap gameplay drawing in a positive rounded cameraY transform while leaving the overlay unshifted'
);
assert.equal(
  /updateCamera\(\);\s*updateCameraY\(\);/.test(runtimeSource),
  true,
  'standalone Level 1 tick/init/reset paths must update vertical camera after horizontal camera'
);
assert.equal(
  /function finishInit\(\)\s*\{[\s\S]*updateCamera\(\);\s*updateCameraY\(\);\s*cameraY = 0;[\s\S]*render\(performance\.now\(\)\);/.test(runtimeSource),
  true,
  'finishInit must reset cameraY before the initial render'
);
assert.equal(
  /function resetRun\(\)\s*\{[\s\S]*cameraX = 0;\s*cameraY = 0;[\s\S]*updateCamera\(\);\s*updateCameraY\(\);[\s\S]*render\(typeof performance !== 'undefined' && performance\.now \? performance\.now\(\) : 0\);/.test(runtimeSource),
  true,
  'resetRun must reset cameraY to zero before rendering the reset state'
);
assert.equal(
  runtimeSource.includes('var platformY = p.y + FOREGROUND_VISUAL_OFFSET_Y') &&
    runtimeSource.includes("var tileImage = p.material === 'rock' ? images.floatingRock : images.floatingBrick") &&
    runtimeSource.includes('for (var tileX = 0; tileX < p.w; tileX += 16)') &&
    runtimeSource.includes('x + tileX, platformY, width, p.h)') &&
    runtimeSource.includes('var y = Math.round(coin.y + (coin.float || 0) + FOREGROUND_VISUAL_OFFSET_Y - coinSize / 2)') &&
    !runtimeSource.includes('ctx.fillRect(x - 2, y + coinSize + Math.sin(time / 120) * 1, coinSize + 4, 2)') &&
    runtimeSource.includes('var y = Math.round(enemy.y + (enemy.bob || 0) + FOREGROUND_VISUAL_OFFSET_Y)') &&
    runtimeSource.includes('var checkpointY = checkpoint.y + FOREGROUND_VISUAL_OFFSET_Y') &&
    runtimeSource.includes('ctx.drawImage(images.checkpoint, checkX, checkpointY, checkpoint.w, checkpoint.h)') &&
    runtimeSource.includes('ctx.fillRect(checkX + 12, checkpointY + 8, 10, 8)') &&
    runtimeSource.includes('ctx.drawImage(images.finish, Math.round(finish.x - cameraX), finish.y + FOREGROUND_VISUAL_OFFSET_Y, finish.w, finish.h)'),
  true,
  'standalone Level 1 foreground gameplay visuals must draw through FOREGROUND_VISUAL_OFFSET_Y'
);
assert.equal(
  runtimeSource.includes('var WORLD_WIDTH = 22000') &&
    runtimeSource.includes('var FLOOR_Y = 214') &&
    runtimeSource.includes('y: FLOOR_Y - 38') &&
    runtimeSource.includes('{ x: 360, y: 178, w: 150, h: 16 }') &&
    runtimeSource.includes('{ x: 720, y: 154, w: 132, h: 16 }') &&
    runtimeSource.includes('{ x: 155, y: 176, r: 8, xp: 100, taken: false }') &&
    runtimeSource.includes('{ x: 760, y: 116, r: 8, xp: 150, taken: false }') &&
    runtimeSource.includes("{ type: 'rat', x: 600, y: FLOOR_Y - 42, w: 28, h: 42, vx: 1.1, min: 540, max: 690 }") &&
    runtimeSource.includes("{ type: 'pigeon', x: 1010, y: 128, w: 28, h: 22, vx: 1.35, min: 940, max: 1128, bob: 0 }") &&
    runtimeSource.includes("{ type: 'bot', x: 1455, y: FLOOR_Y - 38, w: 30, h: 38, vx: 0.85, min: 1390, max: 1550 }") &&
    runtimeSource.includes('var checkpoint = { x: 1240, y: FLOOR_Y - 48, w: 30, h: 48, active: false }') &&
    runtimeSource.includes('var finish = { x: WORLD_WIDTH - 150, y: FLOOR_Y - 62, w: 38, h: 62 }') &&
    runtimeSource.includes('var SKYLINE_Y = 40') &&
    runtimeSource.includes('ctx.drawImage(images.street, 0, sourceY, naturalWidth, sourceH, x, STREET_Y, tileW, STREET_BAND_HEIGHT)') &&
    runtimeSource.includes('drawImageLayer(images.wall, 0.58, 154, 88,') &&
    runtimeSource.includes('SKYLINE_Y,') &&
    !/FLOOR_Y\s*[+\-]=|STREET_Y\s*[+\-]=|SKYLINE_Y\s*[+\-]=/.test(runtimeSource),
  true,
  'standalone Level 1 physics constants, wall draw position, skyline draw Y, road draw Y, and raw foreground object y-values must remain unchanged'
);
assert.equal(
  runtimeSource.includes('renderOffsetY') && playerRendererSource.includes('renderOffsetY'),
  true,
  'player renderers must align sprite feet from manifest renderOffsetY metadata'
);
assert.equal(
  runtimeSource.includes("document.getElementById('startBtn') || document.getElementById('start')"),
  true,
  'standalone Level 1 runtime must support both arcade and legacy start buttons'
);
assert.equal(
  runtimeSource.includes('window.NBGLevel1Runtime = runtime') &&
    runtimeSource.includes("window.addEventListener('moonboys:game-reset', resetRuntimeFromShell)") &&
    runtimeSource.includes('reset: function ()') &&
    runtimeSource.includes('restart: function ()') &&
    runtimeSource.includes('MOVE TO START'),
  true,
  'standalone Level 1 runtime must expose and handle an in-page reset contract'
);
assert.equal(
  fullscreenShellSource.includes("btnReset.setAttribute('data-fullscreen-action', 'reset')") &&
    fullscreenShellSource.includes("new CustomEvent('moonboys:game-reset'") &&
    fullscreenShellSource.includes("new CustomEvent('arcade-run-reset'"),
  true,
  'shared fullscreen shell reset button must expose a stable selector and dispatch reset events'
);
assert.equal(
  arcadeRouteSource.includes('/css/game-fullscreen.css?v=20260903-runner-upper-buttons') &&
    arcadeRouteSource.includes('class="game-card"') &&
    arcadeRouteSource.includes('/js/game-fullscreen.js') &&
    arcadeRouteSource.includes('id="startBtn"') &&
    arcadeRouteSource.includes('data-overlay-fullscreen-only="true"') &&
    arcadeRouteSource.includes('data-overlay-hide-start="true"') &&
    /class="[^"]*\bnbg-game-stage\b[^"]*"/.test(arcadeRouteSource) &&
    arcadeRouteSource.includes('is-active') &&
    !arcadeRouteSource.includes('id="title-screen"') &&
    !arcadeRouteSource.includes('class="game-stage"'),
  true,
  'NBG arcade route must use the shared fullscreen shell contract without a title gate'
);
assert.equal(
  arcadeRouteSource.includes('role="region" aria-label="NBG London Graffiti Run Level 1"') &&
    arcadeRouteSource.includes('class="touch-controls" role="group" aria-label="Touch controls"'),
  true,
  'NBG arcade route must expose generic div labels through explicit ARIA roles'
);
assert.equal(
  fullscreenShellSource.includes("touchScheme: 'runner'") &&
    fullscreenShellSource.includes("function buildRunner()") &&
    fullscreenShellSource.includes("overlay-runner-game") &&
    fullscreenShellSource.includes("screen.orientation.lock('landscape')") &&
    fullscreenShellSource.includes("ids[i] === 'game' && !/\\/games\\/nbg-london\\//.test(window.location.pathname)"),
  true,
  'fullscreen shell must give NBG London runner its own touch controls and landscape lock attempt without stealing generic #game canvases'
);
assert.equal(
  /\.nbg-game-stage\s*\{[^}]*position:\s*relative;/.test(gameCssSource) &&
    /\.nbg-game-stage\.is-active\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\);/.test(gameCssSource) &&
    /@media\s*\(hover:\s*none\),\s*\(pointer:\s*coarse\),\s*\(max-width:\s*760px\)\s*\{[\s\S]*\.nbg-game-stage\.is-active\s*\{[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto;/.test(gameCssSource) &&
    /\.touch-controls\s*\{[^}]*grid-row:\s*2;[^}]*\}/.test(gameCssSource) &&
    !/\.touch-controls\s*\{[^}]*position:\s*absolute/.test(gameCssSource),
  true,
  'NBG mobile controls must live in a reserved grid row instead of overlaying the game canvas'
);
assert.equal(
  fullscreenCssSource.includes('#game-overlay .game-card .touch-controls') &&
    fullscreenCssSource.includes('display: none !important') &&
    fullscreenCssSource.includes('#game-overlay.overlay-runner-game .game-card .nbg-game-stage') &&
    fullscreenCssSource.includes('#game-overlay.overlay-runner-game .game-card .nbg-game-stage::after') &&
    /@media\s*\(orientation:\s*landscape\)\s*and\s*\(pointer:\s*coarse\),\s*\(orientation:\s*landscape\)\s*and\s*\(max-height:\s*500px\)\s*and\s*\(max-width:\s*900px\)\s*\{[\s\S]*#game-overlay\.overlay-runner-game \.game-card \.nbg-game-stage::after\s*\{[\s\S]*display:\s*none !important;/.test(fullscreenCssSource) &&
    /#game-overlay\.overlay-runner-game\.overlay-has-touch\s*\{[\s\S]*--overlay-touch-height:\s*0px;/.test(fullscreenCssSource) &&
    fullscreenCssSource.includes('--runner-side-rail-width: clamp(64px, 12vw, 156px)') &&
    fullscreenCssSource.includes('padding-left: env(safe-area-inset-left, 0px)') &&
    fullscreenCssSource.includes('padding-right: env(safe-area-inset-right, 0px)') &&
    fullscreenCssSource.includes('width: min(calc(100% - (var(--runner-side-rail-width) * 2)), calc((100dvh - var(--overlay-toolbar-height) - var(--overlay-touch-height) - var(--overlay-stage-gap)) * 16 / 9))') &&
    fullscreenCssSource.includes('width: min(calc(100% - (var(--runner-side-rail-width) * 2)), calc((100vh - var(--overlay-toolbar-height) - var(--overlay-touch-height) - var(--overlay-stage-gap)) * 16 / 9))') &&
    /#game-overlay\.overlay-runner-game \.touch-runner-row\s*\{[\s\S]*top:\s*25%;/.test(fullscreenCssSource) &&
    /#game-overlay\.overlay-runner-game \.touch-runner-row\s*\{[\s\S]*width:\s*var\(--runner-side-rail-width\);[\s\S]*flex-direction:\s*column;/.test(fullscreenCssSource) &&
    fullscreenCssSource.includes('#game-overlay.overlay-runner-game .touch-runner-row:first-child') &&
    fullscreenCssSource.includes('#game-overlay.overlay-runner-game .touch-runner-row:last-child') &&
    fullscreenCssSource.indexOf('NBG Runner touch/mobile landscape side rails override generic touch breakpoints') >
      fullscreenCssSource.lastIndexOf('@media (pointer: coarse)') &&
    fullscreenCssSource.includes('width: min(100%, calc((100dvh - var(--overlay-toolbar-height) - var(--overlay-touch-height) - var(--overlay-stage-gap)) * 16 / 9))') &&
    fullscreenCssSource.includes('#game-overlay .touch-runner') &&
    fullscreenCssSource.includes('#game-overlay .touch-runner-row'),
  true,
  'fullscreen overlay must hide in-page NBG touch controls, center a 16:9 runner stage, preserve the portrait rotation prompt, and place landscape runner touch controls in upper side rails'
);
assert.equal(
  gameCssSource.includes('ROTATE PHONE FOR FULL RUNNER VIEW'),
  true,
  'NBG route must show a clear portrait rotation prompt for phone users'
);
assert.equal(
  arcadeIndexSource.includes('href="/games/nbg-london/"') &&
    arcadeIndexSource.includes('NBG London Graffiti Run'),
  true,
  'Arcade catalog must link to the NBG London fullscreen route'
);
assert.equal(
  runtimeSource.includes('Math.floor(frame / frameMeta.columns)') && playerRendererSource.includes('Math.floor(frame / columns)'),
  true,
  'player renderers must support grid sheet row coordinates'
);
assert.equal(
  runtimeSource.includes('sourceX, sourceY, frameMeta.sourceWidth, frameMeta.sourceHeight') &&
    /sourceX,\s*sourceY,\s*sourceFrameWidth,\s*sourceFrameHeight/.test(playerRendererSource),
  true,
  'player renderers must pass grid source rectangles to drawImage'
);
assert.equal(
  /frames:\s*Array\.isArray\(animation\.frames\)\s*\?\s*animation\.frames\s*:\s*null/.test(playerControllerSource),
  false,
  'animation controller must preserve numeric animation frame counts'
);
assert.equal(
  /nbg-runner-sprite-sheet\.(svg|png)/.test(playerRendererSource),
  false,
  'player renderer must not hardcode the player sprite file extension'
);
assert.equal(
  /assetLoader\?\.get\(animation\?\.spriteKey\s*\|\|\s*player\.sprite\s*\|\|\s*this\.spriteKey\)/.test(playerRendererSource),
  false,
  'player renderer must not fall back to the legacy nbg-runner atlas asset key'
);
assert.equal(
  playerRendererSource.includes('`${this.spriteKey}:${animationKey}`'),
  true,
  'player renderer must resolve sprites through the per-animation runtime key'
);
assert.equal(
  /this\.assets\[`nbg-runner:\$\{key\}`\]\s*=\s*image/.test(runtimeAssetLoaderSource),
  false,
  'runtime asset loader must not assign loaded animation images twice'
);
assert.equal(
  assetRegistrySource.includes('animations:'),
  false,
  'asset registry must not duplicate player animation paths from the player manifest'
);
assert.equal(
  playerBindingSource.includes('animations:'),
  false,
  'player asset binding must not duplicate player animation paths from the player manifest'
);
assert.equal(
  runtimeSource.includes('var ASSETS ='),
  false,
  'standalone Level 1 runtime must resolve required assets from asset-manifest.json'
);
assert.equal(
  /function resolvePlayerAnimation(Key)?\(/.test(runtimeSource),
  false,
  'standalone Level 1 runtime must not keep unused duplicate player animation resolution helpers'
);
assert.equal(
  /var drawWidth = 32;|var drawWidth = 40;|var drawHeight = 40;|var drawWidth = frameMeta\.sourceWidth|var drawHeight = frameMeta\.sourceHeight/.test(runtimeSource),
  false,
  'standalone Level 1 player renderer must not draw AutoSprite source frames as the in-game size'
);
for (const forbiddenBindingToken of ['src:', 'frameWidth:', 'frameHeight:']) {
  assert.equal(
    playerBindingSource.includes(forbiddenBindingToken),
    false,
    `player asset binding must not define independent ${forbiddenBindingToken} authority`
  );
}
assert.equal(
  /y\s*-\s*14/.test(runtimeSource),
  false,
  'canonical runtime must use manifest anchor metadata instead of magic vertical offsets'
);
assert.equal(
  [runtimeSource, runtimeAssetLoaderSource, level1RenderBridgeSource, levelRenderPipelineSource].some(source => source.includes('sprite-manifest')),
  false,
  'runtime loaders and render bridges must use asset-manifest.json instead of sprite-manifest.json'
);
assert.equal(
  runtimeAssetLoaderSource.includes('manifest.world.layerNames'),
  true,
  'runtime asset loader must register world layers from asset-manifest.json layerNames'
);
assert.equal(
  runtimeAssetLoaderSource.includes('worldEntries[name] = sources') &&
    runtimeAssetLoaderSource.includes('worldEntries[`${name}:${layerIndex + 1}`] = src'),
  true,
  'runtime asset loader must retain canonical array-backed world layers plus numbered panel entries'
);
assert.equal(
  levelRenderPipelineSource.includes('manifest?.world?.layerNames') &&
    levelRenderPipelineSource.includes('Array.isArray(entry)') &&
    levelRenderPipelineSource.includes('`${layer}:${index + 1}`'),
  true,
  'render pipeline layer names must come from asset-manifest.json and expand array-backed layer panels'
);
assert.equal(
  demoLaunchSource.includes("window.location.replace('/games/nbg-london/')") &&
    demoLaunchSource.includes('url=/games/nbg-london/'),
  true,
  'legacy demo launcher must redirect to the fullscreen NBG London route'
);

const animationControllerContext = { window: {} };
vm.runInNewContext(playerControllerSource, animationControllerContext);
animationControllerContext.window.NBGAnimationController.init(playerAnimationManifest);
animationControllerContext.window.NBGAnimationController.setState('moving');
animationControllerContext.window.NBGAnimationController.setAnimationImage('run', {
  naturalWidth: 6,
  naturalHeight: 1,
  width: 6,
  height: 1
});
for (let i = 0; i < 10; i += 1) {
  animationControllerContext.window.NBGAnimationController.update(0.0167);
}
assert.equal(
  animationControllerContext.window.NBGAnimationController.state,
  'run',
  'animation controller must map moving state to run animation'
);
assert.ok(
  animationControllerContext.window.NBGAnimationController.getFrame() > 0,
  'animation controller must advance AutoSprite sheet frames when callers pass seconds deltas'
);

const level1AnimationContext = { window: {} };
vm.runInNewContext(playerAnimationRuntimeSource, level1AnimationContext);
level1AnimationContext.window.NBGAnimationController = {
  state: null,
  setState(state) {
    this.state = state;
  }
};
vm.runInNewContext(playerSpawnRuntimeSource, level1AnimationContext);
const spawnedPlayer = level1AnimationContext.window.Level1PlayerSpawnRuntime.create({ x: 12, y: 34 });
assert.equal(
  level1AnimationContext.window.Level1PlayerAnimationRuntime.player,
  spawnedPlayer,
  'Level1PlayerSpawnRuntime must connect spawned players through Level1PlayerAnimationRuntime.bind'
);
assert.equal(
  level1AnimationContext.window.Level1PlayerAnimationRuntime.animationController,
  level1AnimationContext.window.NBGAnimationController,
  'Level1PlayerAnimationRuntime.bind must connect the real NBGAnimationController'
);
spawnedPlayer.grounded = false;
spawnedPlayer.velocityY = 3;
level1AnimationContext.window.Level1PlayerAnimationRuntime.update();
assert.equal(
  level1AnimationContext.window.NBGAnimationController.state,
  'falling',
  'Level1PlayerAnimationRuntime.update must drive NBGAnimationController from spawned player state'
);

let browser;

try {
await startServer();
const launchOptions = executablePath ? { executablePath } : {};
browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
const failedRequests = [];

page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.text() === 'Failed to load resource: net::ERR_NETWORK_ACCESS_DENIED') return;
  if (message.type() === 'error') errors.push(message.text());
});
page.on('requestfailed', (request) => {
  const failedUrl = request.url();
  if (
    failedUrl.startsWith('https://fonts.googleapis.com/') ||
    failedUrl.startsWith('https://fonts.gstatic.com/')
  ) return;
  failedRequests.push(`${failedUrl} ${request.failure()?.errorText || 'failed'}`);
});

await page.goto(legacyUrl, { waitUntil: 'networkidle' });
await page.waitForURL('**/games/nbg-london/', { timeout: 3000 });
assert.equal(new URL(page.url()).pathname, '/games/nbg-london/', 'legacy demo launch URL must redirect to fullscreen arcade route');

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('#game', { state: 'visible', timeout: 5000 });
await page.waitForSelector('#hud-state', { state: 'visible', timeout: 5000 });
await page.waitForFunction(() => window.NBGLevel1State?.assetsLoaded === true, null, { timeout: 5000 });

let startVisibility = await page.evaluate(() => ({
  route: window.location.pathname,
  titleScreenCount: document.querySelectorAll('#title-screen').length,
  visibleStartButtons: Array.from(document.querySelectorAll('#start, #startBtn, #overlay-btn-start')).filter((element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }).map((element) => element.id),
  canvasVisible: Boolean(document.querySelector('#game')?.offsetParent || document.querySelector('#game')?.getClientRects().length),
  hudVisible: Boolean(document.querySelector('#hud-state')?.offsetParent || document.querySelector('#hud-state')?.getClientRects().length),
  hudState: document.getElementById('hud-state')?.textContent,
  cameraY: window.NBGLevel1State.cameraY,
  state: {
    assetsLoaded: window.NBGLevel1State.assetsLoaded,
    gameVisible: window.NBGLevel1State.gameVisible,
    waitingForFirstInput: window.NBGLevel1State.waitingForFirstInput,
    running: window.NBGLevel1State.running
  }
}));
assert.equal(startVisibility.route, '/games/nbg-london/', 'validation must exercise the fullscreen NBG London route');
assert.equal(startVisibility.titleScreenCount, 0, 'fullscreen route must not render the NBG title screen');
assert.deepEqual(startVisibility.visibleStartButtons, [], 'fullscreen route must not show a START button');
assert.equal(startVisibility.canvasVisible, true, 'canvas must be visible immediately');
assert.equal(startVisibility.hudVisible, true, 'HUD must be visible immediately');
assert.equal(startVisibility.hudState, waitingHudText, 'HUD must show an accurate pre-input ready state');
assert.deepEqual(
  startVisibility.state,
  { assetsLoaded: true, gameVisible: true, waitingForFirstInput: true, running: false },
  'game must be visible and waiting, not running, before first input'
);
assert.equal(typeof startVisibility.cameraY, 'number', 'cameraY must exist in the browser test state');
assert.equal(startVisibility.cameraY, 0, 'cameraY must start clean after finishInit');

// Reproduce the Chrome-denied fullscreen path from GK's real NBG beta run.
// Native fullscreen refusal must not imply the windowed game is blocked.
await page.evaluate(() => {
  const overlay = document.getElementById('game-overlay');
  window.__nbgFullscreenRetryCalls = 0;
  overlay.requestFullscreen = () => {
    window.__nbgFullscreenRetryCalls += 1;
    return Promise.reject(new Error('fullscreen denied by browser'));
  };
  document.getElementById('overlay-fullscreen-prompt-btn').click();
});
await page.waitForFunction(() => {
  const prompt = document.getElementById('overlay-fullscreen-prompt-text');
  return window.__nbgFullscreenRetryCalls === 1 &&
    prompt && /Browser fullscreen unavailable/.test(prompt.textContent);
});
assert.equal(await page.evaluate(() => window.__nbgFullscreenRetryCalls), 1,
  'user-initiated retry must invoke requestFullscreen exactly once');
const windowedFullscreenState = await page.evaluate(() => ({
  message: document.getElementById('overlay-fullscreen-prompt-text').textContent,
  promptVisible: getComputedStyle(document.getElementById('overlay-fullscreen-prompt')).display !== 'none',
  ready: window.NBGLevel1State.waitingForFirstInput,
  canvasVisible: Boolean(document.querySelector('#game')?.getClientRects().length)
}));
assert.match(windowedFullscreenState.message, /You can keep playing here/,
  'fullscreen denial must explicitly allow NBG windowed gameplay');
assert.doesNotMatch(windowedFullscreenState.message, /to continue/,
  'fullscreen denial must not falsely state the playable NBG game is blocked');
assert.equal(windowedFullscreenState.promptVisible, true,
  'user-initiated retry control must remain available');
assert.equal(windowedFullscreenState.ready, true,
  'denied fullscreen must leave the level ready for input');
assert.equal(windowedFullscreenState.canvasVisible, true,
  'denied fullscreen must not hide the game canvas');

const preInitMovePage = await openWithDelayedNbgInit(browser, url);
await preInitMovePage.keyboard.down('ArrowRight');
await preInitMovePage.keyboard.up('ArrowRight');
await preInitMovePage.waitForFunction(() => window.NBGLevel1State?.running === true, null, { timeout: 5000 });
await preInitMovePage.waitForTimeout(240);
let preInitState = await preInitMovePage.evaluate(() => ({
  x: window.NBGLevel1State.player.x,
  pendingInitialInput: window.NBGLevel1State.pendingInitialInput
}));
assert.ok(preInitState.x > 64.2, 'pre-init ArrowRight must be replayed instead of ignored');
assert.equal(preInitState.pendingInitialInput, null, 'pre-init movement replay must clear pending input');
await preInitMovePage.close();

const preInitTouchPage = await openWithDelayedNbgInit(browser, url, { viewport: { width: 390, height: 700 }, isMobile: true, hasTouch: true });
await holdRunnerRight(preInitTouchPage);
await preInitTouchPage.waitForFunction(() => window.NBGLevel1State?.running === true, null, { timeout: 5000 });
await preInitTouchPage.waitForTimeout(240);
preInitState = await preInitTouchPage.evaluate(() => ({
  x: window.NBGLevel1State.player.x
}));
assert.ok(preInitState.x > 64.2, 'pre-init touch right must be replayed instead of ignored');
await preInitTouchPage.close();

const preInitJumpPage = await openWithDelayedNbgInit(browser, url);
await preInitJumpPage.keyboard.down('Space');
await preInitJumpPage.keyboard.up('Space');
await preInitJumpPage.waitForFunction(() => window.NBGLevel1State?.running === true, null, { timeout: 5000 });
await preInitJumpPage.waitForTimeout(100);
preInitState = await preInitJumpPage.evaluate(() => ({
  y: window.NBGLevel1State.player.y,
  anim: window.NBGLevel1State.player.anim
}));
assert.ok(preInitState.y < 180, 'pre-init jump input must be replayed once gameplay starts');
assert.ok(['jump', 'fall'].includes(preInitState.anim), 'pre-init jump replay must enter an airborne animation');
await preInitJumpPage.close();

const preInitSprayPage = await openWithDelayedNbgInit(browser, url);
await preInitSprayPage.keyboard.down('KeyS');
await preInitSprayPage.keyboard.up('KeyS');
await preInitSprayPage.waitForFunction(() => window.NBGLevel1State?.running === true, null, { timeout: 5000 });
await preInitSprayPage.waitForTimeout(60);
preInitState = await preInitSprayPage.evaluate(() => ({
  anim: window.NBGLevel1State.player.anim
}));
assert.equal(preInitState.anim, 'spray', 'pre-init spray input must be replayed once gameplay starts');
await preInitSprayPage.close();

const touchStartPage = await browser.newPage({ viewport: { width: 390, height: 700 }, isMobile: true, hasTouch: true });
await touchStartPage.goto(url, { waitUntil: 'networkidle' });
await touchStartPage.waitForFunction(() => window.NBGLevel1State?.assetsLoaded === true && window.NBGLevel1State.running === false, null, { timeout: 5000 });
await holdRunnerRight(touchStartPage);
await touchStartPage.waitForFunction(() => window.NBGLevel1State?.running === true, null, { timeout: 5000 });
await touchStartPage.close();

await page.keyboard.down('ArrowRight');
await page.waitForFunction(() => window.NBGLevel1State?.running === true, null, { timeout: 5000 });
await page.waitForTimeout(450);

let state = await page.evaluate(() => ({
  running: window.NBGLevel1State.running,
  x: window.NBGLevel1State.player.x,
  y: window.NBGLevel1State.player.y,
  health: window.NBGLevel1State.player.health,
  coinCount: window.NBGLevel1State.coins.length,
  enemyCount: window.NBGLevel1State.enemies.length,
  platformCount: window.NBGLevel1State.platforms.length,
  hazardCount: window.NBGLevel1State.hazards.length,
  extraCheckpointCount: window.NBGLevel1State.courseCheckpoints.length,
  courseLastPlatformX: Math.max(...window.NBGLevel1State.platforms.map((p) => p.x)),
  courseLastHazardX: Math.max(...window.NBGLevel1State.hazards.map((h) => h.x)),
  runElapsedMs: window.NBGLevel1State.runElapsedMs,
  cameraY: window.NBGLevel1State.cameraY,
  xp: window.NBGLevel1State.xp,
  assetStatus: window.NBGLevel1State.assetStatus,
  requiredAssets: window.NBGLevel1State.requiredAssets,
  playerAnimations: Object.fromEntries(Object.entries(window.NBGLevel1State.playerAnimations).map(([key, animation]) => [
    key,
    {
      spriteSheet: animation.spriteSheet,
      sourceFrameWidth: animation.sourceFrameWidth,
      sourceFrameHeight: animation.sourceFrameHeight,
      renderWidth: animation.renderWidth,
      renderHeight: animation.renderHeight,
      renderOffsetY: animation.renderOffsetY,
      frames: animation.frames,
      columns: animation.columns,
      frameMs: animation.frameMs,
      naturalWidth: animation.image?.naturalWidth,
      naturalHeight: animation.image?.naturalHeight
    }
  ]))
}));

assert.ok(
  runtimeSource.includes('var BOT_SHEET_COLUMNS = 5') &&
  runtimeSource.includes('var BOT_SHEET_ROWS = 5') &&
  runtimeSource.includes('var BOT_SHEET_FRAMES = 25') &&
  runtimeSource.includes("botHurt ? 'botHurt' : botKicking ? 'botKick' : 'bot'") &&
  runtimeSource.includes('var cellW = image.naturalWidth / BOT_SHEET_COLUMNS') &&
  runtimeSource.includes('var cellH = image.naturalHeight / BOT_SHEET_ROWS') &&
  runtimeSource.includes('function drawEnemies(time)') &&
  runtimeSource.includes('ctx.drawImage(image, sourceX, sourceY, cellW, cellH, drawX, drawY, BOT_RENDER_WIDTH, BOT_RENDER_HEIGHT)'),
  'graffiti bot must use three time-animated 25-frame 5x5 sprite sheets'
);
assert.deepEqual(
  Object.fromEntries(['bot', 'botKick', 'botHurt'].map((key) => [
    key, new URL(state.assetStatus[key]?.src || '', url).pathname
  ])),
  {
    bot: '/game/assets/enemies/bb8-walk.png',
    botKick: '/game/assets/enemies/bb8-kick.png',
    botHurt: '/game/assets/enemies/bb8-hurt.png'
  },
  'all three uploaded BB8 animation sheets must be required runtime assets'
);
assert.ok(
  runtimeSource.includes('var coinColumns = 5') &&
  runtimeSource.includes('var coinRows = 5') &&
  runtimeSource.includes('var coinFrameCount = coinColumns * coinRows') &&
  runtimeSource.includes('var coinFrame = Math.floor((time + coin.x * 7) / 85) % coinFrameCount') &&
  runtimeSource.includes('ctx.drawImage(images.coin, coinSourceX, coinSourceY,'),
  'regular XP coins must animate individual 5x5 WAX CASH sheet frames'
);
assert.equal(
  new URL(state.assetStatus.coin.src, url).pathname,
  '/game/assets/objects/2300-spritesheet.png',
  'regular XP coins must load the uploaded WAX CASH sprite sheet'
);
assert.ok(
  runtimeSource.includes('var RAT_SHEET_COLUMNS = 5') &&
  runtimeSource.includes('var RAT_SHEET_ROWS = 5') &&
  runtimeSource.includes('var RAT_SHEET_FRAMES = 25') &&
  runtimeSource.includes('var RAT_RENDER_WIDTH = 50') &&
  runtimeSource.includes('var RAT_RENDER_HEIGHT = 60') &&
  runtimeSource.includes("nextRunRandom() < 0.5 ? 'ratBladeFlurry' : 'ratViperPounce'") &&
  runtimeSource.includes('var ratFrameWidth = image.naturalWidth / RAT_SHEET_COLUMNS') &&
  runtimeSource.includes('var ratFrameHeight = image.naturalHeight / RAT_SHEET_ROWS'),
  'rat must render at 70% runner size from 5x5 frames and choose random attacks'
);
assert.deepEqual(
  Object.fromEntries(['rat','ratBladeFlurry','ratViperPounce'].map(key =>
    [key, new URL(state.assetStatus[key]?.src || '', url).pathname])),
  {
    rat: '/game/assets/enemies/BRATTY1-walk.png',
    ratBladeFlurry: '/game/assets/enemies/BRATTY1-asm_dagger_blade_flurry.png',
    ratViperPounce: '/game/assets/enemies/BRATTY1-asm_dagger_viper_pounce.png'
  },
  'all three BRATTY sprite sheets must load in Level 1'
);
assert.equal(state.running, true, 'ArrowRight must start the game loop');
assert.equal(state.coinCount, 312, 'speedrun must spawn 312 XP coins across four sizes');
assert.equal(state.enemyCount, 36, 'speedrun must spawn 36 moving enemies');
assert.equal(state.platformCount, 76, 'speedrun must provide 76 playable jump platforms');
assert.equal(state.hazardCount, 39, 'speedrun must provide 39 collidable obstacles');
assert.equal(state.extraCheckpointCount, 4, 'extended course must have four additional checkpoints');
assert.ok(state.courseLastPlatformX > 20000, 'platform course must reach the final world section');
assert.ok(state.courseLastHazardX > 20000, 'late world sections must contain obstacles');
assert.ok(state.runElapsedMs > 0, 'speedrun clock must advance once play starts');
assert.equal(state.health, 3, 'player must spawn with health');
assert.equal(typeof state.cameraY, 'number', 'cameraY must remain exposed after gameplay starts');
assert.deepEqual(
  Object.keys(state.assetStatus).sort(),
  state.requiredAssets.slice().sort(),
  'runtime must report every required asset'
);
for (const [key, asset] of Object.entries(state.assetStatus)) {
  assert.equal(asset.loaded, true, `required asset must load successfully: ${key} (${asset.src})`);
}
for (let index = 0; index < expectedSkylineLayers.length; index += 1) {
  const key = `skyline${index + 1}`;
  assert.equal(state.assetStatus[key]?.loaded, true, `browser runtime must load skyline PNG panel ${index + 1}`);
  assert.equal(
    decodeURIComponent(new URL(state.assetStatus[key].src, url).pathname),
    `/game/assets/${expectedSkylineLayers[index]}`,
    `browser runtime must load exact skyline PNG panel path ${index + 1}`
  );
}
assert.deepEqual(
  Object.fromEntries(Object.entries(state.playerAnimations).map(([key, animation]) => [
    key,
    {
      spriteSheet: animation.spriteSheet,
      sourceFrameWidth: animation.sourceFrameWidth,
      sourceFrameHeight: animation.sourceFrameHeight,
      renderWidth: animation.renderWidth,
      renderHeight: animation.renderHeight,
      renderOffsetY: animation.renderOffsetY,
      frames: animation.frames,
      columns: animation.columns,
      frameMs: animation.frameMs
    }
  ])),
  expectedAnimations,
  'browser runtime must expose the AutoSprite animation metadata from the player manifest'
);
for (const key of Object.keys(expectedAnimations)) {
  assert.equal(state.assetStatus[`player.${key}`]?.loaded, true, `browser runtime must load player ${key} animation sheet`);
  assert.equal(
    new URL(state.assetStatus[`player.${key}`].src, url).pathname,
    expectedPlayerAssetUrls[`player.${key}`],
    `browser runtime must load exact final-quality player ${key} sheet path`
  );
  assert.equal(state.playerAnimations[key].naturalWidth, 384, `browser runtime must load 384px-wide player ${key} sheet`);
  assert.equal(state.playerAnimations[key].naturalHeight, 256, `browser runtime must load 256px-tall player ${key} sheet`);
}

const beforeMoveX = state.x;
await page.waitForTimeout(550);
await page.keyboard.up('ArrowRight');
state = await page.evaluate(() => ({
  x: window.NBGLevel1State.player.x,
  y: window.NBGLevel1State.player.y
}));
assert.ok(state.x > beforeMoveX + 8, 'player must move right');

await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(1600);
await page.keyboard.up('ArrowLeft');
await page.keyboard.down('KeyS');
await page.waitForTimeout(80);
await page.keyboard.up('KeyS');
await page.waitForTimeout(80);
state = await page.evaluate(() => {
  const player = window.NBGLevel1State.player;
  const animation = window.NBGLevel1State.playerAnimations[player.anim];
  const visualMarginX = Math.max(0, Math.round((animation.renderWidth - player.w) / 2));
  return {
    x: player.x,
    y: player.y,
    w: player.w,
    h: player.h,
    facing: player.facing,
    anim: player.anim,
    cameraX: window.NBGLevel1State.cameraX,
    renderWidth: animation.renderWidth,
    visualMarginX,
    visualDrawX: Math.round(player.x - window.NBGLevel1State.cameraX) - visualMarginX
  };
});
assert.equal(state.w, 24, 'left-boundary visual clamp must not change player hitbox width');
assert.equal(state.h, 34, 'left-boundary visual clamp must not change player hitbox height');
assert.equal(state.renderWidth, 72, 'left-boundary visual clamp must preserve enlarged runner render width');
assert.equal(state.visualMarginX, 24, 'left-boundary visual clamp must account for the enlarged runner visual margin');
assert.equal(state.facing, -1, 'left-boundary regression must validate facing-left frames');
assert.equal(state.anim, 'spray', 'left-boundary regression must validate spray animation frames');
assert.ok(state.x >= 12 + state.visualMarginX, 'player world clamp must include the runner visual margin');
assert.ok(state.visualDrawX >= 0, 'runner visual sprite must not be clipped at the left canvas edge');

const beforeTouchMoveX = state.x;
await holdRunnerRight(page, 360);
state = await page.evaluate(() => ({
  x: window.NBGLevel1State.player.x,
  y: window.NBGLevel1State.player.y
}));
assert.ok(state.x > beforeTouchMoveX + 5, 'touch right control must move player');

await page.evaluate(() => {
  const player = window.NBGLevel1State.player;
  player.invuln = 0;
  player.x = 1242;
  player.y = 166;
});
await page.waitForTimeout(140);
state = await page.evaluate(() => ({
  checkpointActive: window.NBGLevel1State.checkpoint.active,
  xp: window.NBGLevel1State.xp
}));
assert.equal(state.checkpointActive, true, 'checkpoint must activate when player reaches it');
assert.ok(state.xp >= 250, 'checkpoint must award XP');

await page.evaluate(() => {
  const player = window.NBGLevel1State.player;
  player.y = 380;
});
await page.waitForTimeout(120);
state = await page.evaluate(() => ({
  x: window.NBGLevel1State.player.x,
  y: window.NBGLevel1State.player.y,
  health: window.NBGLevel1State.player.health
}));
assert.ok(Math.abs(state.x - 1240) < 2, 'checkpoint respawn must restore player x to checkpoint');
assert.ok(state.y < 190, 'checkpoint respawn must restore player to playable height');
assert.equal(state.health, 2, 'checkpoint respawn fall damage must reduce health once');
await page.evaluate(() => {
  window.NBGLevel1State.player.invuln = 0;
});

// Double jump is edge-triggered and resets on landing, respawn and restart.
assert.ok(
  runtimeSource.includes('var DOUBLE_JUMP_VELOCITY = -12.8') &&
  runtimeSource.includes('var DOUBLE_JUMP_SIDE_SPEED = 5.4') &&
  runtimeSource.includes('var pendingJumpPresses = 0') &&
  runtimeSource.includes("getControlForCode(e.code) === 'jump'") &&
  runtimeSource.includes('var jumpPressed = pendingJumpPresses > 0') &&
  runtimeSource.includes('if (jumpPressed && player.grounded)') &&
  runtimeSource.includes('else if (jumpPressed && !player.grounded && jumpsUsed === 1)') &&
  runtimeSource.includes('player.vy = DOUBLE_JUMP_VELOCITY') &&
  runtimeSource.includes('player.vx = left ? -DOUBLE_JUMP_SIDE_SPEED : DOUBLE_JUMP_SIDE_SPEED') &&
  runtimeSource.includes('jumpsUsed = 2') &&
  runtimeSource.includes('jumpsUsed = 0'),
  'double jump must require a fresh second press and reset on landing'
);

const beforeJumpY = state.y;
await page.keyboard.down('Space');
await page.waitForTimeout(80);
await page.keyboard.up('Space');
await page.waitForTimeout(220);
state = await page.evaluate(() => ({
  y: window.NBGLevel1State.player.y,
  anim: window.NBGLevel1State.player.anim,
  cameraY: window.NBGLevel1State.cameraY
}));
assert.ok(state.y < beforeJumpY, 'player must jump upward');
assert.equal(state.anim, 'jump', 'player must switch to jump animation');
assert.ok(state.cameraY > 0, 'cameraY must rise smoothly after the player jumps');
assert.ok(state.cameraY <= 42, 'cameraY must stay capped by CAMERA_JUMP_MAX_Y');

await page.keyboard.down('KeyA');
await page.keyboard.down('Space');
await page.waitForTimeout(70);
await page.keyboard.up('Space');
await page.keyboard.up('KeyA');
state = await page.evaluate(() => ({
  vy: window.NBGLevel1State.player.vy,
  vx: window.NBGLevel1State.player.vx,
  jumpsUsed: window.NBGLevel1State.jumpsUsed
}));
assert.equal(state.jumpsUsed, 2, 'second midair press must consume exactly the second jump');
assert.ok(state.vy < 0, 'second jump must add fresh upward velocity');
assert.ok(state.vx < 0, 'second jump plus left must reverse horizontal momentum');
await page.keyboard.down('Space');
await page.waitForTimeout(50);
await page.keyboard.up('Space');
assert.equal(await page.evaluate(() => window.NBGLevel1State.jumpsUsed), 2, 'third jump press must not grant another jump');


await page.waitForFunction(() => (
  window.NBGLevel1State.player.vy > 0 &&
  window.NBGLevel1State.player.anim === 'fall'
), null, { timeout: 1500 });
state = await page.evaluate(() => ({
  vy: window.NBGLevel1State.player.vy,
  anim: window.NBGLevel1State.player.anim,
  cameraY: window.NBGLevel1State.cameraY,
  fallLoaded: Boolean(window.NBGLevel1State.playerAnimations.fall?.image)
}));
assert.ok(state.vy > 0, 'player must be descending during fall validation');
assert.equal(state.anim, 'fall', 'descending airborne player must switch to fall animation');
assert.ok(state.cameraY > 0, 'cameraY must continue to follow while the player is falling');
assert.equal(state.fallLoaded, true, 'fall animation sheet must be loaded');

await page.evaluate(() => {
  const player = window.NBGLevel1State.player;
  player.grounded = true;
  player.vy = 0;
  player.invuln = 0;
});
await page.keyboard.down('KeyS');
await page.waitForTimeout(80);
await page.keyboard.up('KeyS');
state = await page.evaluate(() => ({
  anim: window.NBGLevel1State.player.anim
}));
assert.equal(state.anim, 'spray', 'spray input must switch to spray animation');

await page.evaluate(() => {
  const player = window.NBGLevel1State.player;
  const coin = window.NBGLevel1State.coins.find((entry) => !entry.taken);
  player.x = coin.x - 4;
  player.y = coin.y - 14;
});
await page.waitForTimeout(120);
state = await page.evaluate(() => ({
  xp: window.NBGLevel1State.xp,
  taken: window.NBGLevel1State.coins.filter((coin) => coin.taken).length
}));
assert.ok(state.xp >= 100, 'collecting a coin must add XP');
assert.ok(state.taken >= 1, 'coin must be marked collected');

await page.evaluate(() => {
  const player = window.NBGLevel1State.player;
  const hazard = window.NBGLevel1State.hazards[0];
  player.health = 3;
  player.invuln = 0;
  player.x = hazard.x + 4;
  player.y = hazard.y;
  player.vx = 0;
  player.vy = 0;
});
await page.waitForFunction(() => window.NBGLevel1State.player.invuln > 0, null, { timeout: 2500 });
state = await page.evaluate(() => ({
  health: window.NBGLevel1State.player.health,
  combo: window.NBGLevel1State.comboCount
}));
assert.ok(state.health < 3, 'course obstacle collisions must damage the runner');
assert.equal(state.combo, 0, 'hitting a hazard must break the XP combo');

await page.evaluate(() => {
  const player = window.NBGLevel1State.player;
  const marker = window.NBGLevel1State.courseCheckpoints[0];
  player.x = marker.x + 4;
  player.y = marker.y;
  player.vx = 0;
  player.vy = 0;
  player.invuln = 2000;
});
await page.waitForFunction(() => window.NBGLevel1State.courseCheckpoints[0].active, null, { timeout: 2500 });
assert.equal(
  await page.evaluate(() => window.NBGLevel1State.courseCheckpoints[0].active),
  true,
  'mid-course checkpoint must activate'
);

await page.evaluate(() => {
  const player = window.NBGLevel1State.player;
  const enemy = window.NBGLevel1State.enemies[0];
  player.invuln = 0;
  player.x = enemy.x;
  player.y = enemy.y;
});
await page.waitForTimeout(120);
state = await page.evaluate(() => ({
  health: window.NBGLevel1State.player.health,
  anim: window.NBGLevel1State.player.anim,
  hurtLoaded: Boolean(window.NBGLevel1State.playerAnimations.hurt?.image)
}));
assert.ok(state.health < 3, 'enemy collision must damage player');
assert.equal(state.anim, 'hurt', 'enemy collision must switch to hurt animation');
assert.equal(state.hurtLoaded, true, 'hurt animation sheet must be loaded');

await page.evaluate(() => {
  const player = window.NBGLevel1State.player;
  player.invuln = 0;
  const finish = window.NBGLevel1State.finish;
  player.x = finish.x + 2;
  player.y = finish.y + 2;
});
await page.waitForFunction(
  () =>
    window.NBGLevel1State?.complete === true &&
    window.NBGLevel1State?.completionAnimationActive === false,
  null,
  {
    timeout: expectedAnimations.victory.frames * expectedAnimations.victory.frameMs + 1000
  }
);
state = await page.evaluate(() => ({
  complete: window.NBGLevel1State.complete,
  running: window.NBGLevel1State.running,
  completionAnimationActive: window.NBGLevel1State.completionAnimationActive,
  xp: window.NBGLevel1State.xp,
  hud: document.getElementById('hud-state').textContent,
  anim: window.NBGLevel1State.player.anim,
  frame: window.NBGLevel1State.player.frame,
  victoryLoaded: Boolean(window.NBGLevel1State.playerAnimations.victory?.image),
  elapsed: window.NBGLevel1State.runElapsedMs,
  speedBonus: window.NBGLevel1State.speedrunBonusXp,
  bestTime: window.NBGLevel1State.bestTimeMs,
  bestXp: window.NBGLevel1State.bestXp
}));
assert.ok(state.elapsed > 0, 'finish result must report elapsed run time');
assert.ok(state.speedBonus > 0, 'fast finish must earn a speedrun time bonus');
assert.ok(state.bestTime > 0, 'finish must store a personal best time');
assert.equal(state.bestXp, state.xp, 'finish must save the highest XP score');
assert.equal(state.complete, true, 'finish flag must complete the level');
assert.equal(state.running, false, 'game loop update state must stop after completion');
assert.equal(state.completionAnimationActive, false, 'victory animation loop must stop after the final victory frame renders');
assert.ok(state.xp >= 600, 'finish must award leaderboard-ready XP');
assert.equal(state.hud, 'LEVEL COMPLETE', 'HUD must report completion');
assert.equal(state.anim, 'victory', 'finish flag must switch to victory animation');
assert.equal(state.victoryLoaded, true, 'victory animation sheet must be loaded');

const resetSelector = '[data-fullscreen-action="reset"]';
assert.equal(await page.locator(resetSelector).count(), 1, 'fullscreen reset control must have a stable selector');
await page.click(resetSelector);
await page.waitForFunction(() => window.NBGLevel1State?.complete === false && window.NBGLevel1State?.running === false, null, { timeout: 3000 });
await page.waitForTimeout(120);
state = await page.evaluate(() => ({
  complete: window.NBGLevel1State.complete,
  running: window.NBGLevel1State.running,
  waitingForFirstInput: window.NBGLevel1State.waitingForFirstInput,
  x: window.NBGLevel1State.player.x,
  y: window.NBGLevel1State.player.y,
  w: window.NBGLevel1State.player.w,
  h: window.NBGLevel1State.player.h,
  health: window.NBGLevel1State.player.health,
  invuln: window.NBGLevel1State.player.invuln,
  anim: window.NBGLevel1State.player.anim,
  frame: window.NBGLevel1State.player.frame,
  frameTime: window.NBGLevel1State.player.frameTime,
  vx: window.NBGLevel1State.player.vx,
  vy: window.NBGLevel1State.player.vy,
  xp: window.NBGLevel1State.xp,
  taken: window.NBGLevel1State.coins.filter((coin) => coin.taken).length,
  checkpointActive: window.NBGLevel1State.checkpoint.active,
  pendingInitialInput: window.NBGLevel1State.pendingInitialInput,
  cameraY: window.NBGLevel1State.cameraY,
  resetElapsed: window.NBGLevel1State.runElapsedMs,
  resetSpeedBonus: window.NBGLevel1State.speedrunBonusXp,
  resetCourseCheckpoints: window.NBGLevel1State.courseCheckpoints.filter((marker) => marker.active).length,
  bestXpAfterReset: window.NBGLevel1State.bestXp,
  hud: document.getElementById('hud-state').textContent,
  titleScreenCount: document.querySelectorAll('#title-screen').length,
  stageActive: document.getElementById('game-stage').classList.contains('is-active')
}));
assert.equal(state.complete, false, 'fullscreen reset must clear completion state');
assert.equal(state.running, false, 'fullscreen reset must return to the first-input wait state');
assert.equal(state.waitingForFirstInput, true, 'fullscreen reset must restore first-input contract');
assert.equal(state.hud, waitingHudText, 'fullscreen reset HUD must prompt MOVE TO START');
assert.equal(state.x, 64, 'fullscreen reset must restore player x to Level 1 start');
assert.equal(state.w, 24, 'fullscreen reset must restore player width');
assert.equal(state.h, 34, 'fullscreen reset must restore player height');
assert.equal(state.y, 214 - state.h, 'fullscreen reset must compute player y from floor minus current player height');
assert.equal(state.health, 3, 'fullscreen reset must restore player health');
assert.equal(state.invuln, 0, 'fullscreen reset must clear player invulnerability');
assert.equal(state.anim, 'idle', 'fullscreen reset must restore idle animation');
assert.equal(state.frame, 0, 'fullscreen reset must reset animation frame');
assert.equal(state.frameTime, 0, 'fullscreen reset must reset animation frame timer');
assert.equal(state.vx, 0, 'fullscreen reset must clear horizontal velocity');
assert.equal(state.vy, 0, 'fullscreen reset must clear vertical velocity');
assert.equal(state.xp, 0, 'fullscreen reset must clear XP');
assert.equal(state.taken, 0, 'fullscreen reset must restore every coin to untaken');
assert.equal(state.checkpointActive, false, 'fullscreen reset must clear checkpoint state');
assert.equal(state.pendingInitialInput, null, 'fullscreen reset must clear queued first input state');
assert.equal(state.cameraY, 0, 'fullscreen reset must reset cameraY to zero');
assert.equal(state.resetElapsed, 0, 'fullscreen reset must restart speedrun clock');
assert.equal(state.resetSpeedBonus, 0, 'fullscreen reset must clear previous speed bonus');
assert.equal(state.resetCourseCheckpoints, 0, 'fullscreen reset must restore every mid-course checkpoint');
assert.ok(state.bestXpAfterReset > 0, 'personal best XP must survive a run reset');
assert.equal(state.titleScreenCount, 0, 'fullscreen reset must not return to title screen');
assert.equal(state.stageActive, true, 'fullscreen reset must keep canvas and HUD visible');

const resetStartX = state.x;
await page.keyboard.down('KeyD');
await page.waitForFunction(() => window.NBGLevel1State?.running === true, null, { timeout: 3000 });
await page.waitForTimeout(260);
await page.keyboard.up('KeyD');
state = await page.evaluate(() => ({
  running: window.NBGLevel1State.running,
  x: window.NBGLevel1State.player.x,
  hud: document.getElementById('hud-state').textContent
}));
assert.equal(state.running, true, 'first valid keyboard input after fullscreen reset must start the game');
assert.ok(state.x > resetStartX, 'fresh run after fullscreen reset must move from the start position');
assert.equal(state.hud, 'RUNNING', 'HUD must return to RUNNING after first reset input starts play');

// Six hidden rewards are collectible off-screen without changing the normal coin counter.
state = await page.evaluate(() => ({
  secretCount: window.NBGLevel1State.secretCoins.length,
  secretValues: window.NBGLevel1State.secretCoins.map((coin) => coin.xp),
  secretHeights: window.NBGLevel1State.secretCoins.map((coin) => coin.y),
  regularCount: window.NBGLevel1State.coins.length,
  regularHud: document.getElementById('hud-coins').textContent,
  xp: window.NBGLevel1State.xp
}));
assert.equal(state.secretCount, 6, 'level must contain six secret rewards');
assert.deepEqual(state.secretValues, [500, 500, 500, 500, 500, 500], 'each secret coin must award 500 XP');
assert.ok(state.secretHeights.every((y) => y < 0), 'each secret reward must sit above the regular gameplay viewport');
const secretStartingXp = state.xp;
const regularHudBeforeSecrets = state.regularHud;
for (let index = 0; index < 6; index += 1) {
  await page.evaluate((i) => {
    const state = window.NBGLevel1State;
    const secret = state.secretCoins[i];
    state.player.x = secret.x - 8;
    state.player.y = secret.y - 8;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.invuln = 2000;
  }, index);
  await page.waitForFunction((i) => window.NBGLevel1State.secretCoins[i].taken, index, { timeout: 2000 });
}
state = await page.evaluate(() => ({
  xp: window.NBGLevel1State.xp,
  taken: window.NBGLevel1State.secretCoins.filter((coin) => coin.taken).length,
  banner: window.NBGLevel1State.secretNotificationText,
  bannerUntil: window.NBGLevel1State.secretNotificationUntil,
  hud: document.getElementById('hud-coins').textContent
}));
assert.equal(state.xp, secretStartingXp + 3000, 'all six secrets must add exactly 3000 XP');
assert.equal(state.taken, 6, 'secret coins must remain collected during the run');
assert.equal(state.banner, 'SECRET FOUND +500 XP', 'secret collection must display discovery notification');
assert.ok(state.bannerUntil > 0, 'secret discovery notification must have an expiry time');
assert.equal(state.hud, regularHudBeforeSecrets, 'secret collection must not change normal coin HUD counts');
await page.waitForTimeout(120);
assert.equal(await page.evaluate(() => window.NBGLevel1State.xp), secretStartingXp + 3000, 'secret cannot be collected twice');
await page.evaluate(() => window.NBGLevel1Runtime.reset());
state = await page.evaluate(() => ({
  xp: window.NBGLevel1State.xp,
  taken: window.NBGLevel1State.secretCoins.filter((coin) => coin.taken).length,
  banner: window.NBGLevel1State.secretNotificationText,
  bannerUntil: window.NBGLevel1State.secretNotificationUntil
}));
assert.equal(state.xp, 0, 'reset must clear secret XP');
assert.equal(state.taken, 0, 'reset must restore every secret coin');
assert.equal(state.banner, '', 'reset must clear secret notification');
assert.equal(state.bannerUntil, 0, 'reset must clear secret notification expiry');

// Four WAX CASH coin sizes have fixed XP tiers and scaled collision hitboxes.
await page.evaluate(() => window.NBGLevel1Runtime.reset());
await page.keyboard.down('KeyD');
await page.waitForFunction(() => window.NBGLevel1State?.running === true, null, { timeout: 3000 });
await page.keyboard.up('KeyD');
state = await page.evaluate(() => ({
  tiers: [...new Set(window.NBGLevel1State.coins.map((coin) => coin.tier))].sort(),
  pairs: Object.fromEntries(['small', 'medium', 'large', 'xl'].map((tier) => {
    const coin = window.NBGLevel1State.coins.find((entry) => entry.tier === tier);
    return [tier, { size: coin.size, xp: coin.xp, r: coin.r }];
  }))
}));
assert.deepEqual(state.tiers, ['large', 'medium', 'small', 'xl'], 'four coin tiers must be present');
assert.deepEqual(state.pairs, {
  small: { size: 16, xp: 100, r: 6 },
  medium: { size: 32, xp: 250, r: 13 },
  large: { size: 40, xp: 500, r: 16 },
  xl: { size: 50, xp: 1000, r: 20 }
}, 'each coin tier must use the required size, XP and pickup radius');
for (const tier of ['small', 'medium', 'large', 'xl']) {
  const previous = await page.evaluate((name) => {
    const state = window.NBGLevel1State;
    const coin = state.coins.find((entry) => entry.tier === name && !entry.taken);
    state.player.x = coin.x - 8;
    state.player.y = coin.y - 8;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.invuln = 3000;
    return { xp: state.xp, coinX: coin.x, xpValue: coin.xp };
  }, tier);
  await page.waitForFunction((coinX) =>
    window.NBGLevel1State.coins.some((coin) => coin.x === coinX && coin.taken),
    previous.coinX, { timeout: 2500 }
  );
  const gained = await page.evaluate(() => ({
    xp: window.NBGLevel1State.xp,
    multiplier: window.NBGLevel1State.comboCount
  }));
  assert.equal(gained.xp - previous.xp, previous.xpValue * gained.multiplier,
    tier + ' coin collection must award the tier XP times the earned combo multiplier');
}
await page.evaluate(() => window.NBGLevel1Runtime.reset());
assert.equal(await page.evaluate(() => window.NBGLevel1State.coins.filter((coin) => coin.taken).length),
  0, 'reset must restore all four sizes of regular coins');

// Five new 81x81 PNG objects must load; each platform is tiled from just one material.
const blockState = await page.evaluate(() => ({
  crates: window.NBGLevel1State.crates.length,
  boxes: window.NBGLevel1State.rewardBoxes.length,
  materials: [...new Set(window.NBGLevel1State.platforms.map((platform) => platform.material))].sort(),
  initialClosed: window.NBGLevel1State.rewardBoxes.every((box) => !box.opened),
  assets: Object.fromEntries(['mysteryBox', 'starBox', 'floorCrate', 'floatingBrick', 'floatingRock'].map((name) =>
    [name, window.NBGLevel1State.assetStatus[name]?.src]))
}));
assert.equal(blockState.crates, 38, 'all 18 sections and the opening must contain solid crates');
assert.equal(blockState.boxes, 38, 'all 18 sections and the opening must contain reward boxes');
assert.deepEqual(blockState.materials, ['brick', 'rock'], 'platforms use only uniform brick or rock textures');
assert.equal(blockState.initialClosed, true, 'all random reward boxes start unopened');
assert.deepEqual(Object.fromEntries(Object.entries(blockState.assets).map(([key, value]) =>
  [key, new URL(value, url).pathname])), {
  mysteryBox: '/game/assets/objects/RANDOMBOX.png',
  starBox: '/game/assets/objects/STARBOX.png',
  floorCrate: '/game/assets/objects/CRATE1.png',
  floatingBrick: '/game/assets/objects/BRICK1.png',
  floatingRock: '/game/assets/objects/ROCK1.png'
}, 'runtime must load the five exact uploaded object images');
assert.ok(
  runtimeSource.includes('var solids = [floor].concat(platforms, crates)') &&
  runtimeSource.includes('player.x = crate.x - player.w') &&
  runtimeSource.includes('player.x = crate.x + crate.w') &&
  runtimeSource.includes('var roll = Math.min(pool.length - 1, Math.floor(nextRunRandom() * pool.length))') &&
  runtimeSource.includes("new CustomEvent('nbg-reward-found'"),
  'crates must have real solid collisions and each reward box must roll on collection'
);

// Check physical side collision and standing on top of a floor crate.
await page.keyboard.down('KeyD');
await page.waitForFunction(() => window.NBGLevel1State.running === true, null, { timeout: 3000 });
await page.evaluate(() => {
  const state = window.NBGLevel1State;
  const crate = state.crates[0];
  state.player.x = crate.x - state.player.w - 1;
  state.player.y = 214 - state.player.h;
  state.player.vx = 4;
  state.player.vy = 0;
  state.player.invuln = 5000;
});
await page.waitForTimeout(115);
await page.keyboard.up('KeyD');
assert.equal(await page.evaluate(() => {
  const state = window.NBGLevel1State;
  return state.player.x <= state.crates[0].x - state.player.w + 1;
}), true, 'crate must block walking sideways');
await page.evaluate(() => {
  const state = window.NBGLevel1State;
  const crate = state.crates[0];
  state.player.x = crate.x + 2;
  state.player.y = crate.y - state.player.h - 10;
  state.player.vx = 0;
  state.player.vy = 2;
  state.player.grounded = false;
});
await page.waitForFunction(() => {
  const state = window.NBGLevel1State;
  return state.player.grounded && Math.abs(state.player.y - (state.crates[0].y - state.player.h)) < 2;
}, null, { timeout: 2500 });

// Exercise deterministic seeded reward pools; overriding Math.random must not change ranked gameplay.
const beforeMystery = await page.evaluate(() => {
  const state = window.NBGLevel1State;
  const box = state.rewardBoxes.find((candidate) => candidate.type === 'mystery' && !candidate.opened);
  state.player.x = box.x + 3;
  state.player.y = box.y + 3;
  state.player.vx = 0; state.player.vy = 0;
  state.player.invuln = 5000;
  return { xp: state.xp, x: box.x };
});
await page.waitForFunction((x) =>
  window.NBGLevel1State.rewardBoxes.some((box) => box.x === x && box.opened),
  beforeMystery.x, { timeout: 2500 });
const mysteryResult = await page.evaluate(() => ({
  xp: window.NBGLevel1State.xp,
  reward: window.NBGLevel1State.rewardBoxes.find(box =>
    box.type === 'mystery' && box.opened)?.reward,
}));
assert.ok(mysteryResult.reward &&
  [0, 100, 250, 500].includes(mysteryResult.reward.xp) &&
  mysteryResult.xp === beforeMystery.xp + mysteryResult.reward.xp,
  'mystery box must award exactly its seeded reward');
const beforeStar = await page.evaluate(() => {
  const state = window.NBGLevel1State;
  const box = state.rewardBoxes.find((candidate) => candidate.type === 'star' && !candidate.opened);
  state.player.x = box.x + 3;
  state.player.y = box.y + 3;
  state.player.vx = 0; state.player.vy = 0;
  state.player.invuln = 5000;
  return { xp: state.xp, x: box.x };
});
await page.waitForFunction((x) =>
  window.NBGLevel1State.rewardBoxes.some((box) => box.x === x && box.opened),
  beforeStar.x, { timeout: 2500 });
const starResult = await page.evaluate(() => ({
  xp: window.NBGLevel1State.xp,
  banner: window.NBGLevel1State.rewardNotificationText,
  mysteryOpened: window.NBGLevel1State.rewardBoxes[0].opened,
  starOpened: window.NBGLevel1State.rewardBoxes[1].opened,
  reward: window.NBGLevel1State.rewardBoxes[1].reward,
}));
assert.ok(starResult.reward &&
  [0, 500, 750, 1000].includes(starResult.reward.xp) &&
  starResult.xp === beforeStar.xp + starResult.reward.xp,
  'star box must award exactly its seeded reward');
assert.ok(starResult.banner.includes('STAR BOX'), 'the seeded reward must be displayed');
assert.equal(starResult.mysteryOpened && starResult.starOpened, true, 'collected boxes stay opened in a run');
await page.waitForTimeout(100);
assert.equal(await page.evaluate(() => window.NBGLevel1State.xp), starResult.xp,
  'opened boxes must not pay the same reward twice');
await page.evaluate(() => window.NBGLevel1Runtime.reset());
assert.equal(await page.evaluate(() =>
  window.NBGLevel1State.rewardBoxes.every((box) => !box.opened && box.reward == null)), true,
  'reset must restore all reward boxes and clear their rewards');
assert.equal(await page.evaluate(() => window.NBGLevel1State.rewardNotificationUntil), 0,
  'reset must clear reward notification timing');

// Parachuting rats: exact uploads, glide physics, landing conversion, and reset.
const parachuteAssets = await page.evaluate(() =>
  Object.fromEntries(['parachuteRatA','parachuteRatB','parachuteRatC'].map(key => [
    key, window.NBGLevel1State.assetStatus[key]?.src
  ])));
assert.deepEqual(Object.fromEntries(Object.entries(parachuteAssets).map(([key, value]) =>
  [key, new URL(value, url).pathname])), {
  parachuteRatA: '/game/assets/enemies/bX4VuQWSc3xcqQaY7FQFP3-spritesheet.png',
  parachuteRatB: '/game/assets/enemies/dds-dss.png',
  parachuteRatC: '/game/assets/enemies/fgg-ggf.png'
}, 'all three parachute rat sprite sheets must load');
assert.ok(
  runtimeSource.includes('function updateParachuteRats(time, dt)') &&
  runtimeSource.includes('function drawParachuteRats(time)') &&
  runtimeSource.includes('PARACHUTE_GLIDE_SPEED + Math.sin(') &&
  runtimeSource.includes('enemies.push({') &&
  runtimeSource.includes("damagePlayer('parachute-rat', rat.x)"),
  'parachute rats must glide, attack on contact and convert to walkers when grounded'
);
await page.keyboard.down('KeyD');
await page.waitForFunction(() => window.NBGLevel1State.running === true, null, { timeout: 3000 });
await page.keyboard.up('KeyD');
await page.evaluate(() => {
  const state = window.NBGLevel1State;
  state.player.x = 400;
  state.player.y = 214 - state.player.h;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.invuln = 5000;
});
await page.waitForFunction(() => window.NBGLevel1State.parachuteSpawnCount >= 1, null, { timeout: 12000 });
let chuteState = await page.evaluate(() => ({
  count: window.NBGLevel1State.parachuteRats.length,
  first: window.NBGLevel1State.parachuteRats[0] ? { ...window.NBGLevel1State.parachuteRats[0] } : null,
  countWalkers: window.NBGLevel1State.enemies.length
}));
assert.equal(chuteState.count, 1, 'a random aerial rat must spawn');
const beforeGlideY = chuteState.first.y;
await page.waitForTimeout(200);
chuteState = await page.evaluate(() => ({
  y: window.NBGLevel1State.parachuteRats[0]?.y,
  x: window.NBGLevel1State.parachuteRats[0]?.x
}));
assert.ok(chuteState.y > beforeGlideY && chuteState.y - beforeGlideY < 35,
  'parachute rat must descend gradually, without snapping downward');
await page.evaluate(() => {
  const state = window.NBGLevel1State;
  state.parachuteRats[0].y = 214 - state.parachuteRats[0].h - 1;
  state.parachuteRats[0].x = state.player.x + 75;
});
const walkersBeforeLand = await page.evaluate(() => window.NBGLevel1State.enemies.length);
await page.waitForFunction(() => window.NBGLevel1State.parachuteRats.length === 0, null, { timeout: 1500 });
assert.equal(await page.evaluate(() => window.NBGLevel1State.enemies.length), walkersBeforeLand + 1,
  'missed parachute rat must become a walking BRATTY rat on landing');
await page.evaluate(() => window.NBGLevel1Runtime.reset());
assert.deepEqual(await page.evaluate(() => ({
  active: window.NBGLevel1State.parachuteRats.length,
  spawns: window.NBGLevel1State.parachuteSpawnCount,
  enemies: window.NBGLevel1State.enemies.length
})), { active: 0, spawns: 0, enemies: 36 }, 'reset must clear parachutes and restore original enemy roster');

// The three new monochrome rat sheets belong only to the turquoise parachute.
const turquoiseSources = await page.evaluate(() =>
  Object.fromEntries(['turquoiseRatWalk','turquoiseRatKick','turquoiseRatPunch'].map(key =>
    [key, window.NBGLevel1State.assetStatus[key]?.src])));
assert.deepEqual(Object.fromEntries(Object.entries(turquoiseSources).map(([key,value]) =>
  [key, new URL(value, url).pathname])), {
  turquoiseRatWalk: '/game/assets/enemies/ggdf-walk.png',
  turquoiseRatKick: '/game/assets/enemies/ggdf-kick.png',
  turquoiseRatPunch: '/game/assets/enemies/ggdf-punch.png'
}, 'all three exclusive turquoise-rat animations must load');
assert.ok(
  runtimeSource.includes("type: rat.variant === 'parachuteRatC' ? 'turquoiseRat' : 'brownRat'") &&
  runtimeSource.includes("enemy.type === 'turquoiseRat' ?") &&
  runtimeSource.includes("'turquoiseRatKick' : 'turquoiseRatPunch'") &&
  runtimeSource.includes("enemy.type === 'turquoiseRat' ? 'turquoiseRatWalk' :"),
  'only turquoise parachutes must turn into turquoise walking and attacking rats'
);

const brownAssets = await page.evaluate(() =>
  Object.fromEntries(['brownRatWalk','brownRatPunch'].map(key =>
    [key, window.NBGLevel1State.assetStatus[key]?.src])));
assert.deepEqual(Object.fromEntries(Object.entries(brownAssets).map(([key,value]) =>
  [key, new URL(value, url).pathname])), {
  brownRatWalk: '/game/assets/enemies/dfgdf-walk.png',
  brownRatPunch: '/game/assets/enemies/dfgdf-punch_fast_with_lightning_bolts.png'
}, 'the two brown rat sheets must load');
assert.ok(
  runtimeSource.includes("type: rat.variant === 'parachuteRatC' ? 'turquoiseRat' : 'brownRat'") &&
  runtimeSource.includes("enemy.type === 'brownRat' ? 'brownRatWalk' : 'rat'") &&
  runtimeSource.includes("enemy.type === 'brownRat' ? 'brownRatPunch'") &&
  runtimeSource.includes("enemy.type === 'brownRat' ? 1.35 : 1"),
  'only the two non-turquoise parachutes use brown walk and enlarged lightning punch'
);

// Long-running survival regression: enemies must be defeatable, limited, and resettable.
assert.ok(
  runtimeSource.includes('var PARACHUTE_MAX_LANDED = 5') &&
  runtimeSource.includes('landedCount < PARACHUTE_MAX_LANDED') &&
  runtimeSource.includes('PARACHUTE_LANDED_LIFETIME_MS') &&
  runtimeSource.includes("new CustomEvent('nbg-enemy-defeated'") &&
  runtimeSource.includes("new CustomEvent('nbg-game-over'"),
  'enemies must have bounded populations, defeat events and a true game-over state'
);
await page.evaluate(() => window.NBGLevel1Runtime.reset());
await page.keyboard.down('KeyD');
await page.waitForFunction(() => window.NBGLevel1State.running === true, null, { timeout: 2500 });
await page.keyboard.up('KeyD');
const beforeDefeat = await page.evaluate(() => {
  const state = window.NBGLevel1State;
  const target = state.enemies[0];
  state.player.x = 420;
  state.player.y = 214 - state.player.h;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.facing = 1;
  state.player.invuln = 5000;
  target.x = state.player.x + 50;
  target.y = 214 - target.h;
  target.vx = 0;
  return { xp: state.xp, health: state.player.health };
});
await page.keyboard.down('KeyS');
await page.waitForFunction(() => window.NBGLevel1State.enemies[0].defeated === true, null, { timeout: 2500 });
await page.keyboard.up('KeyS');
const afterDefeat = await page.evaluate(() => ({
  xp: window.NBGLevel1State.xp,
  defeated: window.NBGLevel1State.enemies[0].defeated,
  health: window.NBGLevel1State.player.health
}));
assert.equal(afterDefeat.defeated, true, 'spray must defeat regular rats, not only animate');
assert.equal(afterDefeat.xp, beforeDefeat.xp + 75, 'rat defeat must award XP only once');
assert.equal(afterDefeat.health, beforeDefeat.health, 'spraying a rat must not harm the player');
await page.waitForTimeout(120);
assert.equal(await page.evaluate(() => window.NBGLevel1State.xp), afterDefeat.xp,
  'a defeated enemy must not award XP again');

// Expired parachute walkers must not accumulate, even after dozens of spawns.
await page.evaluate(() => {
  const state = window.NBGLevel1State;
  for (let i = 0; i < 100; i++) {
    state.enemies.push({
      type: 'brownRat', x: 1800 + i * 3, y: 172, w: 28, h: 42,
      vx: 0.5, min: 1780, max: 2200, spawnedByParachute: true,
      spawnedAt: -100000
    });
  }
});
await page.waitForFunction(() => window.NBGLevel1State.activeSpawnedRats === 0,
  null, { timeout: 2500 });
assert.equal(await page.evaluate(() => window.NBGLevel1State.enemies.length), 36,
  '100 expired parachute walkers must be removed without affecting fixed enemies');

// Health reaching zero must freeze the timer until an explicit reset.
await page.evaluate(() => {
  const state = window.NBGLevel1State;
  const hazard = state.hazards[0];
  state.player.health = 1;
  state.player.invuln = 0;
  state.player.x = hazard.x + 5;
  state.player.y = hazard.y;
  state.player.vx = 0;
  state.player.vy = 0;
});
await page.waitForFunction(() => window.NBGLevel1State.gameOver === true,
  null, { timeout: 2500 });
const deadState = await page.evaluate(() => ({
  health: window.NBGLevel1State.player.health,
  elapsed: window.NBGLevel1State.runElapsedMs,
  running: window.NBGLevel1State.running,
  hud: document.getElementById('hud-state')?.textContent
}));
assert.equal(deadState.health, 0, 'zero health must not silently restore lives');
assert.equal(deadState.running, false, 'game over must end active gameplay');
assert.equal(deadState.hud, 'GAME OVER', 'game over must be visible to the player');
await page.waitForTimeout(300);
assert.equal(await page.evaluate(() => window.NBGLevel1State.runElapsedMs), deadState.elapsed,
  'clock must stop completely once the player dies');
await page.evaluate(() => window.NBGLevel1Runtime.start());
assert.equal(await page.evaluate(() => window.NBGLevel1State.running), false,
  'starting without resetting must not resume a failed run');
await page.evaluate(() => window.NBGLevel1Runtime.reset());
assert.deepEqual(await page.evaluate(() => ({
  running: window.NBGLevel1State.running,
  gameOver: window.NBGLevel1State.gameOver,
  health: window.NBGLevel1State.player.health,
  elapsed: window.NBGLevel1State.runElapsedMs,
  active: window.NBGLevel1State.parachuteRats.length,
  spawned: window.NBGLevel1State.activeSpawnedRats,
  enemies: window.NBGLevel1State.enemies.length,
  defeated: window.NBGLevel1State.enemies.filter(enemy => enemy.defeated).length
})), {
  running: false, gameOver: false, health: 3, elapsed: 0,
  active: 0, spawned: 0, enemies: 36, defeated: 0
}, 'reset must restore all enemies, health and speedrun clock');
await page.keyboard.down('KeyD');
await page.waitForFunction(() => window.NBGLevel1State.running === true, null, { timeout: 2500 });
await page.keyboard.up('KeyD');
const afterRestart = await page.evaluate(() => window.NBGLevel1State.runElapsedMs);
assert.ok(afterRestart < 2500, 'new run must restart with a fresh clock');
await page.evaluate(() => window.NBGLevel1Runtime.reset());

// When a same-owner ranked start is queued behind an earlier HTTP request,
// simulation must remain at elapsed 0 until the replacement session exists.
// Exercise an actual short key press that is released during the handshake.
await page.evaluate(() => {
  window.__nbgOriginalQueuedStart = window.NBGLondonBeforeQueuedRun;
  window.NBGLondonBeforeQueuedRun = () => new Promise(resolve => {
    window.__nbgReleaseQueuedStart = resolve;
  });
});
await page.keyboard.press('s');
await page.waitForFunction(() => typeof window.__nbgReleaseQueuedStart === 'function');
await page.waitForTimeout(300);
assert.deepEqual(await page.evaluate(() => ({
  running: window.NBGLevel1State.running,
  elapsed: window.NBGLevel1State.runElapsedMs,
  control: window.NBGLevel1State.pendingInitialInput?.control,
})), { running: false, elapsed: 0, control: 'spray' },
'queued ranked session must freeze physics and preserve initiating key press');
await page.evaluate(() => window.__nbgReleaseQueuedStart());
await page.waitForFunction(() => window.NBGLevel1State.running &&
  window.NBGLevel1State.runElapsedMs > 0);
await page.evaluate(() => {
  window.NBGLevel1Runtime.reset();
  window.NBGLondonBeforeQueuedRun = window.__nbgOriginalQueuedStart;
  delete window.__nbgOriginalQueuedStart;
  delete window.__nbgReleaseQueuedStart;
});

// A single queued Jump press (keyboard or touch) must not consume the
// second jump. The input layer already stores it in pendingJumpPresses; the
// queued-start replay must not duplicate it on the first positive-time tick.
for (const mode of ['keyboard', 'touch']) {
  await page.evaluate(() => {
    window.__nbgOriginalQueuedStart = window.NBGLondonBeforeQueuedRun;
    window.NBGLondonBeforeQueuedRun = () => new Promise(resolve => {
      window.__nbgReleaseQueuedStart = resolve;
    });
  });
  if (mode === 'keyboard') {
    await page.keyboard.press('w');
  } else {
    await page.evaluate(() => {
      window.NBGLevel1Runtime.setTouchControl('jump', true);
      window.NBGLevel1Runtime.setTouchControl('jump', false);
    });
  }
  await page.waitForFunction(() => typeof window.__nbgReleaseQueuedStart === 'function');
  assert.deepEqual(await page.evaluate(() => ({
    running: window.NBGLevel1State.running,
    elapsed: window.NBGLevel1State.runElapsedMs,
  })), { running: false, elapsed: 0 },
  mode + ' Jump must not advance physics during queued start');
  await page.evaluate(() => window.__nbgReleaseQueuedStart());
  await page.waitForFunction(() => window.NBGLevel1State.running &&
    window.NBGLevel1State.runElapsedMs > 50 && window.NBGLevel1State.jumpsUsed > 0);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.NBGLevel1State.jumpsUsed), 1,
    mode + ' single queued Jump must consume only first jump, not double jump');
  await page.evaluate(() => {
    window.NBGLevel1Runtime.reset();
    window.NBGLondonBeforeQueuedRun = window.__nbgOriginalQueuedStart;
    delete window.__nbgOriginalQueuedStart;
    delete window.__nbgReleaseQueuedStart;
  });
}

// Resetting while a signed handshake is pending must not revive a stale run.
await page.evaluate(() => {
  window.__nbgOriginalQueuedStart = window.NBGLondonBeforeQueuedRun;
  window.NBGLondonBeforeQueuedRun = () => new Promise(resolve => {
    window.__nbgReleaseQueuedStart = resolve;
  });
});
await page.keyboard.press('s');
await page.waitForFunction(() => typeof window.__nbgReleaseQueuedStart === 'function');
await page.evaluate(() => window.NBGLevel1Runtime.reset());
await page.evaluate(() => window.__nbgReleaseQueuedStart());
await page.waitForTimeout(150);
assert.deepEqual(await page.evaluate(() => ({
  running: window.NBGLevel1State.running,
  elapsed: window.NBGLevel1State.runElapsedMs
})), { running: false, elapsed: 0 },
'reset must prevent a stale queued session from starting gameplay');
await page.evaluate(() => {
  window.NBGLondonBeforeQueuedRun = window.__nbgOriginalQueuedStart;
  delete window.__nbgOriginalQueuedStart;
  delete window.__nbgReleaseQueuedStart;
});

// A linked account change during an unresolved pre-play handshake must let
// the new player's controls start immediately, even if old HTTP never settles.
await page.evaluate(() => {
  window.__nbgOriginalQueuedStart = window.NBGLondonBeforeQueuedRun;
  window.NBGLondonBeforeQueuedRun = () => new Promise(resolve => {
    window.__nbgReleaseQueuedStart = resolve;
  });
});
await page.keyboard.press('s');
await page.waitForFunction(() => typeof window.__nbgReleaseQueuedStart === 'function');
await page.evaluate(() => {
  // A genuine identity-change signal invalidates old owner gameplay waits.
  window.NBGLondonBeforeQueuedRun = null;
  window.dispatchEvent(new Event('moonboys:identity-change'));
});
await page.keyboard.press('d');
await page.waitForFunction(() => window.NBGLevel1State.running === true, null, { timeout: 2500 });
await page.evaluate(() => window.__nbgReleaseQueuedStart());
await page.waitForTimeout(150);
assert.equal(await page.evaluate(() => window.NBGLevel1State.running), true,
  'stale owner handshake must neither freeze nor restart new gameplay');
await page.evaluate(() => {
  window.NBGLevel1Runtime.reset();
  window.NBGLondonBeforeQueuedRun = window.__nbgOriginalQueuedStart;
  delete window.__nbgOriginalQueuedStart;
  delete window.__nbgReleaseQueuedStart;
});

// Guest runs cannot leave permanent device-local best scores, even after finishing.
const guestRecords = await page.evaluate(() => ({
  bestXp: localStorage.getItem('nbg-london-best-xp'),
  bestTime: localStorage.getItem('nbg-london-best-run-ms'),
  tabs: [...document.querySelectorAll('[data-nbg-metric]')].map(button => button.dataset.nbgMetric),
  account: document.getElementById('nbg-record-account')?.textContent || '',
  hud: document.getElementById('nbg-hud-player')?.textContent || ''
}));
assert.equal(guestRecords.bestXp, null, 'guest XP must not remain permanently in localStorage');
assert.equal(guestRecords.bestTime, null, 'guest run time must not remain permanently in localStorage');
assert.deepEqual(guestRecords.tabs, ['fastest', 'speed_xp', 'xp'], 'three London ranking views must be visible');
assert.ok(guestRecords.account.includes('Guest') && guestRecords.hud === 'GUEST',
  'guest players must be shown as unranked, not as permanently scored Telegram users');

// Actual fullscreen UX regression: records must be inside the overlay and
// reachable via keyboard/pointer, not merely present behind an opaque modal.
await page.waitForSelector('#game-overlay.active', { state: 'visible', timeout: 5000 });
const scoreToggle = page.locator('#nbg-open-records');
await scoreToggle.waitFor({ state: 'visible', timeout: 5000 });
assert.equal(await page.locator('#nbg-record-drawer').isVisible(), false,
  'the records drawer should not cover the game by default');
await scoreToggle.click();
await page.locator('#nbg-record-drawer').waitFor({ state: 'visible', timeout: 3000 });
assert.equal(await scoreToggle.getAttribute('aria-expanded'), 'true');
assert.equal(await page.locator('#nbg-record-board').evaluate(element =>
  element.closest('#game-overlay') !== null), true,
'leaderboard must live within the fullscreen overlay');
assert.equal(await page.locator('#nbg-record-status').isVisible(), true,
  'Telegram score save/errors must be visible in fullscreen');
assert.equal(await page.locator('#nbg-record-personal').isVisible(), true,
  'personal bests must be readable inside fullscreen');
assert.equal(await page.locator('#nbg-record-drawer').evaluate(element =>
  getComputedStyle(element).overflowY === 'auto' && element.scrollHeight > element.clientHeight),
  true, 'records panel must scroll independently on a normal viewport');
await page.locator('[data-nbg-metric="xp"]').click();
assert.equal(await page.locator('[data-nbg-metric="xp"]').getAttribute('aria-pressed'), 'true',
  'all-time score tabs must work inside the fullscreen drawer');
await page.locator('[data-nbg-period="weekly"]').click();
assert.equal(await page.locator('[data-nbg-period="weekly"]').getAttribute('aria-pressed'), 'true',
  'weekly/daily/seasonal tabs must remain interactive');
const gameplayBeforeKeys = await page.evaluate(() => ({
  running: window.NBGLevel1State.running,
  x: window.NBGLevel1State.player.x
}));
await page.locator('[data-nbg-metric="fastest"]').focus();
await page.keyboard.press('Space');
assert.equal(await page.locator('[data-nbg-metric="fastest"]').getAttribute('aria-pressed'), 'true',
  'Space must activate native Scores buttons rather than jumping or starting game');
await page.keyboard.press('ArrowRight');
assert.deepEqual(await page.evaluate(() => ({
  running: window.NBGLevel1State.running,
  x: window.NBGLevel1State.player.x
})), gameplayBeforeKeys, 'arrow keys must not move the game behind the open Scores drawer');
await page.keyboard.press('Escape');
assert.equal(await page.locator('#nbg-record-drawer').isVisible(), false,
  'Escape should close scores rather than exit fullscreen game');
assert.equal(new URL(page.url()).pathname, '/games/nbg-london/',
  'closing scores must not navigate away from the game');
await scoreToggle.focus();
await page.keyboard.press('Enter');
await page.locator('#nbg-record-drawer').waitFor({ state: 'visible', timeout: 3000 });
assert.equal(new URL(page.url()).pathname, '/games/nbg-london/',
  'Enter on the Scores button must not trigger a game shell navigation or start');
await page.locator('#nbg-close-records').focus();
await page.keyboard.press('Space');
assert.equal(await scoreToggle.getAttribute('aria-expanded'), 'false',
  'Space on the native Close button must close the Scores drawer without a jump');
assert.equal(await page.locator('#game').isVisible(), true, 'closing scores must restore the game');
  
// Closing Scores leaves focus on its toolbar control. Movement must
// still reach the runner without a second click or Tab press.
const resumedFrom = await page.evaluate(() => ({
  running: window.NBGLevel1State.running,
  x: window.NBGLevel1State.player.x
}));
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(300);
await page.keyboard.up('ArrowRight');
const resumedTo = await page.evaluate(() => ({
  running: window.NBGLevel1State.running,
  x: window.NBGLevel1State.player.x
}));
assert.equal(resumedTo.running, true,
  'ArrowRight must start or resume gameplay when Scores is closed');
assert.ok(resumedTo.x > resumedFrom.x,
  'ArrowRight must move the player with focus left on the closed Scores button');

const pixelEnergy = await page.evaluate(() => {
  const canvas = document.getElementById('game');
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  return Array.from(data);
}).then((data) => averagePixelEnergy(data));
assert.ok(pixelEnergy > 20, 'canvas must render nonblank pixels');

assert.deepEqual(errors, [], 'browser console must not report runtime errors');
assert.deepEqual(failedRequests, [], 'browser must not report non-font request failures');

console.log('[PASS] NBG London Graffiti Run Level 1 browser validation');
} finally {
  if (browser) {
    await browser.close().catch(() => {});
  }
  await stopServer();
}

process.exit(0);
