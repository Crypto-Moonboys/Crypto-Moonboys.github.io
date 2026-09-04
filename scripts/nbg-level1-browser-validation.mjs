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
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
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
  idle: { spriteSheet: 'player/animations/idle.png', sourceFrameWidth: 128, sourceFrameHeight: 128, renderWidth: 72, renderHeight: 86, renderOffsetY: 6, frames: 6, columns: 3, frameMs: 145 },
  run: { spriteSheet: 'player/animations/run.png', sourceFrameWidth: 128, sourceFrameHeight: 128, renderWidth: 72, renderHeight: 86, renderOffsetY: 12, frames: 6, columns: 3, frameMs: 88 },
  jump: { spriteSheet: 'player/animations/jump.png', sourceFrameWidth: 128, sourceFrameHeight: 128, renderWidth: 72, renderHeight: 86, renderOffsetY: 18, frames: 6, columns: 3, frameMs: 145 },
  fall: { spriteSheet: 'player/animations/fall.png', sourceFrameWidth: 128, sourceFrameHeight: 128, renderWidth: 72, renderHeight: 86, renderOffsetY: 15, frames: 6, columns: 3, frameMs: 145 },
  spray: { spriteSheet: 'player/animations/spray.png', sourceFrameWidth: 128, sourceFrameHeight: 128, renderWidth: 72, renderHeight: 86, renderOffsetY: 1, frames: 6, columns: 3, frameMs: 110 },
  hurt: { spriteSheet: 'player/animations/hurt.png', sourceFrameWidth: 128, sourceFrameHeight: 128, renderWidth: 72, renderHeight: 86, renderOffsetY: 1, frames: 6, columns: 3, frameMs: 120 },
  victory: { spriteSheet: 'player/animations/victory.png', sourceFrameWidth: 128, sourceFrameHeight: 128, renderWidth: 72, renderHeight: 86, renderOffsetY: 8, frames: 6, columns: 3, frameMs: 145 }
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
    runtimeSource.includes('function drawStreetLayer()') &&
    runtimeSource.includes('var sourceY = Math.floor(naturalHeight / 2)') &&
    runtimeSource.includes('ctx.drawImage(images.street, 0, sourceY, naturalWidth, sourceH, x, STREET_Y, tileW, STREET_BAND_HEIGHT)') &&
    runtimeSource.includes('var visualFootY = y + player.h + PLAYER_VISUAL_OFFSET_Y') &&
    !runtimeSource.includes('drawImageLayer(images.street'),
  true,
  'standalone Level 1 runtime must crop the lower street half at the bottom and lower only the player visual feet'
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

assert.equal(state.running, true, 'ArrowRight must start the game loop');
assert.equal(state.coinCount, 12, 'Level 1 must spawn 12 XP coins');
assert.equal(state.enemyCount, 3, 'Level 1 must spawn 3 enemies');
assert.equal(state.health, 3, 'player must spawn with health');
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

const beforeJumpY = state.y;
await page.keyboard.down('Space');
await page.waitForTimeout(80);
await page.keyboard.up('Space');
await page.waitForTimeout(220);
state = await page.evaluate(() => ({
  y: window.NBGLevel1State.player.y,
  anim: window.NBGLevel1State.player.anim
}));
assert.ok(state.y < beforeJumpY, 'player must jump upward');
assert.equal(state.anim, 'jump', 'player must switch to jump animation');

await page.waitForFunction(() => (
  window.NBGLevel1State.player.vy > 0 &&
  window.NBGLevel1State.player.anim === 'fall'
), null, { timeout: 1500 });
state = await page.evaluate(() => ({
  vy: window.NBGLevel1State.player.vy,
  anim: window.NBGLevel1State.player.anim,
  fallLoaded: Boolean(window.NBGLevel1State.playerAnimations.fall?.image)
}));
assert.ok(state.vy > 0, 'player must be descending during fall validation');
assert.equal(state.anim, 'fall', 'descending airborne player must switch to fall animation');
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
  victoryLoaded: Boolean(window.NBGLevel1State.playerAnimations.victory?.image)
}));
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
