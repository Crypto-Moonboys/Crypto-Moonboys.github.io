import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { chromium } from 'playwright';
import { verifyNbgLondonReplay } from '../workers/leaderboard/nbg-london-replay.js';

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
  idle: { spriteSheet: 'player/animations/idle.png', sourceFrameWidth: 128, sourceFrameHeight: 128, renderWidth: 72, renderHeight: 86, renderOffsetY: 6, frames: 6, columns: 3, frameMs: 145 },
  run: { spriteSheet: 'player/animations/run.png', sourceFrameWidth: 128, sourceFrameHeight: 128, renderWidth: 72, renderHeight: 86, renderOffsetY: 12, frames: 6, columns: 3, frameMs: 88 },
  crouch: { spriteSheet: 'player/animations/NBG Runner Final-crouch.png', sourceFrameWidth: 256, sourceFrameHeight: 256, renderWidth: 72, renderHeight: 86, renderOffsetY: 16, frames: 15, frameStart: 10, columns: 5, frameMs: 130, nativeFacing: 1 },
  crouchLeft: { spriteSheet: 'player/animations/NBG Runner Final-crouchr.png', sourceFrameWidth: 256, sourceFrameHeight: 256, renderWidth: 72, renderHeight: 86, renderOffsetY: 16, frames: 20, frameStart: 5, columns: 5, frameMs: 82, nativeFacing: -1 },
  crouchRight: { spriteSheet: 'player/animations/NBG Runner Final-sneaking_left.png', sourceFrameWidth: 256, sourceFrameHeight: 256, renderWidth: 72, renderHeight: 86, renderOffsetY: 16, frames: 20, frameStart: 5, columns: 5, frameMs: 82, nativeFacing: 1 },
  jump: { spriteSheet: 'player/animations/jump.png', sourceFrameWidth: 128, sourceFrameHeight: 128, renderWidth: 72, renderHeight: 86, renderOffsetY: 17, frames: 6, columns: 3, frameMs: 145 },
  backflip: { spriteSheet: 'player/animations/NBG Runner Final-backflip.png', sourceFrameWidth: 128, sourceFrameHeight: 128, renderWidth: 72, renderHeight: 86, renderOffsetY: 12, frames: 16, columns: 4, frameMs: 42 },
  fall: { spriteSheet: 'player/animations/fall.png', sourceFrameWidth: 128, sourceFrameHeight: 128, renderWidth: 72, renderHeight: 86, renderOffsetY: 15, frames: 6, columns: 3, frameMs: 145 },
  spray: { spriteSheet: 'player/NBG Runner Final-spray.png', sourceFrameWidth: 256, sourceFrameHeight: 256, renderWidth: 164, renderHeight: 164, renderOffsetY: 45, frames: 25, columns: 5, frameMs: 8 },
  hurt: { spriteSheet: 'player/animations/hurt.png', sourceFrameWidth: 128, sourceFrameHeight: 128, renderWidth: 72, renderHeight: 86, renderOffsetY: 1, frames: 6, columns: 3, frameMs: 120 },
  victory: { spriteSheet: 'player/animations/victory.png', sourceFrameWidth: 128, sourceFrameHeight: 128, renderWidth: 72, renderHeight: 86, renderOffsetY: 8, frames: 6, columns: 3, frameMs: 145 }
};
const expectedPlayerAssetUrls = Object.fromEntries(Object.entries(expectedAnimations).map(([key, animation]) => [
  `player.${key}`,
  encodeURI(`/game/assets/${animation.spriteSheet}`)
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
  const expectedRows = Math.ceil(((animation.frameStart || 0) + animation.frames) / animation.columns);
  assert.equal(pngHeader.readUInt32BE(0),
    animation.columns * animation.sourceFrameWidth,
    `animation PNG width must match the committed sheet grid: ${animation.spriteSheet}`);
  assert.equal(pngHeader.readUInt32BE(4),
    expectedRows * animation.sourceFrameHeight,
    `animation PNG height must match the committed sheet grid: ${animation.spriteSheet}`);
  assert.notEqual(animation.renderWidth, animation.sourceFrameWidth, `render width must be separate from source frame width: ${animation.spriteSheet}`);
  assert.notEqual(animation.renderHeight, animation.sourceFrameHeight, `render height must be separate from source frame height: ${animation.spriteSheet}`);
}
// The uploaded clouds.jpg is exactly one 480x270 game viewport. Its
// opposite edges do not match, so ordinary same-direction repetition makes
// the rectangular seam reported in the game screenshot.
const cloudBytes = fs.readFileSync(path.resolve(process.cwd(), 'game/assets/world/clouds.jpg'));
let cloudDimension = null;
for (let i = 2; i < cloudBytes.length - 9;) {
  if (cloudBytes[i] !== 0xff) { i++; continue; }
  const marker = cloudBytes[i + 1];
  if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
    cloudDimension = { width: cloudBytes.readUInt16BE(i + 7),
      height: cloudBytes.readUInt16BE(i + 5) };
    break;
  }
  if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) { i += 2; continue; }
  const segmentLength = cloudBytes.readUInt16BE(i + 2);
  if (segmentLength < 2) break;
  i += 2 + segmentLength;
}
assert.deepEqual(cloudDimension, { width: 480, height: 270 },
  'uploaded sky JPEG must retain native 480x270 full-viewport dimensions');

// The user-supplied flying pig is a 5-column x 4-row (20-frame) 700x560
// sheet. The pigeon remains the same 28x22 collision/score entity; only its
// animation is presented at twice the former on-screen size (56x44).
assert.equal(assetManifest.enemies.pigeon, 'enemies/PIGFLY-iji.png',
  'flying pig must replace only the former pigeon art path');
const flyingPigFile = path.resolve(process.cwd(), 'game/assets/enemies/PIGFLY-iji.png');
const flyingPigHeader = fs.readFileSync(flyingPigFile).subarray(16, 24);
assert.equal(flyingPigHeader.readUInt32BE(0), 700,
  'flying pig sprite sheet must retain its native 700px width');
assert.equal(flyingPigHeader.readUInt32BE(4), 560,
  'flying pig sprite sheet must retain its native 560px height');

const runtimeSource = fs.readFileSync(path.resolve(process.cwd(), 'game/nbg-level1.js'), 'utf8');
assert.ok(runtimeSource.includes('function drawSkyWallpaper()') &&
  runtimeSource.includes('var tileW = WIDTH') &&
  runtimeSource.includes('var offset = -cameraX * 0.08') &&
  runtimeSource.includes('if (tile % 2 !== 0)') &&
  runtimeSource.includes('ctx.scale(-1, 1)') &&
  runtimeSource.includes('ctx.drawImage(image, 0, 0, tileW, HEIGHT)') &&
  runtimeSource.includes('ctx.drawImage(image, x, 0, tileW, HEIGHT)') &&
  runtimeSource.includes('drawSkyWallpaper();') &&
  !runtimeSource.includes("drawImageLayer(images.sky, 0.08"),
  'sky wallpaper must use original viewport-sized tiles, alternate mirrored copies, and retain parallax');

assert.ok(runtimeSource.includes('var FLYING_PIG_COLUMNS = 5') &&
  runtimeSource.includes('var FLYING_PIG_ROWS = 4') &&
  runtimeSource.includes('var FLYING_PIG_FRAMES = 20') &&
  runtimeSource.includes('var FLYING_PIG_RENDER_WIDTH = 56') &&
  runtimeSource.includes('var FLYING_PIG_RENDER_HEIGHT = 44') &&
  runtimeSource.includes("} else if (enemy.type === 'pigeon') {") &&
  runtimeSource.includes('function isolateFlyingPigFrames(image)') &&
  runtimeSource.includes('var cullMargin = enemy.type') &&
  runtimeSource.includes('ctx.scale(-1, 1)'),
  'flying pigs must crop 5x4 frames and draw at double pigeon size, including mirrored flight');

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
  /function render\(time\)\s*\{\s*ctx\.clearRect\(0, 0, WIDTH, HEIGHT\);\s*ctx\.fillStyle = '#0078fb';\s*ctx\.fillRect\(0, 0, WIDTH, HEIGHT\);\s*ctx\.save\(\);\s*ctx\.translate\(0, Math\.round\(cameraY\)\);\s*drawWorld\(\);\s*drawCoins\(time\);\s*drawSecretCoins\(time\);\s*drawObjects\(\);[\s\S]*?drawGraffbotFires\(runElapsedMs\);\s*drawEnemies\(runElapsedMs\);\s*drawParachuteRats\(time\);\s*drawPlayer\(\);\s*ctx\.restore\(\);\s*drawSpeedrunHud\(runElapsedMs\);\s*drawSecretNotification\(runElapsedMs\);\s*drawRewardNotification\(runElapsedMs\);\s*drawBalloonRewardNotification\(runElapsedMs\);\s*drawOverlay\(\);/.test(runtimeSource),
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

// Hold Down to look below, then release to restore the ordinary framing.
// This view-only input must not change physics, score, or start a waiting run.
await page.keyboard.press('ArrowDown');
assert.equal(await page.evaluate(() => window.NBGLevel1State.running), false,
  'look-below alone must not start gameplay');
await page.keyboard.down('ArrowRight');
await page.waitForFunction(() => window.NBGLevel1State.running === true);
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(170);
const beforeLook = await page.evaluate(() => ({
  y: window.NBGLevel1State.cameraY, x: window.NBGLevel1State.player.x,
  xp: window.NBGLevel1State.xp
}));
await page.keyboard.down('ArrowDown');
await page.waitForFunction(() => window.NBGLevel1State.cameraY < -50, null, { timeout: 3000 });
const lookingBelow = await page.evaluate(() => ({
  y: window.NBGLevel1State.cameraY, x: window.NBGLevel1State.player.x,
  xp: window.NBGLevel1State.xp
}));
assert.ok(lookingBelow.y < beforeLook.y - 45,
  'hold Down must shift the view to expose scenery below the player');
assert.ok(Math.abs(lookingBelow.x - beforeLook.x) < 3,
  'looking below must not steer or drop the player beyond residual running inertia');
assert.equal(lookingBelow.xp, beforeLook.xp, 'camera look must not award XP');
// Inspect actual rendered pixels, not just cameraY: previously the negative
// pan exposed the blue clear color below the finite-height street artwork.
const belowPixel = await page.evaluate(() => {
  const canvas = document.getElementById('game');
  return Array.from(canvas.getContext('2d').getImageData(25, canvas.height - 3, 1, 1).data);
});
assert.notDeepEqual(belowPixel.slice(0, 3), [0, 118, 252],
  'looking below must paint the bottom of the viewport instead of blue void');
await page.keyboard.up('ArrowDown');
await page.waitForFunction(() => window.NBGLevel1State.cameraY > -15, null, { timeout: 3000 });
// Touch look uses the same render-only control; release restores the camera.
await page.evaluate(() => window.NBGLevel1Runtime.setTouchControl('look', true));
await page.waitForFunction(() => window.NBGLevel1State.cameraY < -50, null, { timeout: 3000 });
await page.evaluate(() => window.NBGLevel1Runtime.setTouchControl('look', false));
await page.waitForFunction(() => window.NBGLevel1State.cameraY > -15, null, { timeout: 3000 });
await page.evaluate(() => window.NBGLevel1Runtime.reset());
// Both terminal branches must restore normal camera framing even if the
// player holds Down when completion/game-over stops the animation loop.
assert.match(runtimeSource, /if \(gameOver\)\s*\{\s*cameraY = 0;/,
  'fatal-hit terminal render must reset a held-down camera');
assert.match(runtimeSource, /if \(!running\) cameraY = 0;/,
  'completed run must reset a held-down camera');

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

// The third jump must use every official 4x4 backflip frame exactly once as
// one row-major animation run. Exercise desktop/right and mobile-touch/left
// against the real canvas renderer, not a mocked animation helper.
for (const flipCase of [
  { label: 'desktop-right', pageOptions: { viewport: { width: 960, height: 540 } }, facing: 1 },
  { label: 'mobile-left', pageOptions: { viewport: { width: 390, height: 700 }, isMobile: true, hasTouch: true }, facing: -1 }
]) {
  const flipPage = await browser.newPage(flipCase.pageOptions);
  try {
    await flipPage.goto(url, { waitUntil: 'networkidle' });
    await flipPage.waitForFunction(() => window.NBGLevel1State?.assetsLoaded, null,
      { timeout: 10000 });
    await flipPage.evaluate((facing) => {
      const state = window.NBGLevel1State;
      const ctx = document.getElementById('game').getContext('2d');
      window.__backflipOriginalDraw = ctx.drawImage;
      window.__backflipDraws = [];
      state.player.facing = facing;
      ctx.drawImage = function (image, ...args) {
        if (image === state.playerAnimations.backflip.image && args.length === 8) {
          const transform = this.getTransform();
          window.__backflipDraws.push({
            frame: Math.round(args[1] / 128) * 4 + Math.round(args[0] / 128),
            sourceX: args[0], sourceY: args[1],
            sourceWidth: args[2], sourceHeight: args[3],
            renderWidth: args[6], renderHeight: args[7],
            flipped: transform.a < 0
          });
        }
        return window.__backflipOriginalDraw.call(this, image, ...args);
      };
    }, flipCase.facing);

    const pressJump = async () => {
      if (flipCase.pageOptions.hasTouch) {
        await flipPage.evaluate(() => {
          window.NBGLevel1Runtime.setTouchControl('jump', true);
          window.NBGLevel1Runtime.setTouchControl('jump', false);
        });
      } else {
        await flipPage.keyboard.press('KeyW');
      }
    };

    await pressJump();
    await flipPage.waitForFunction(() => window.NBGLevel1State.jumpsUsed === 1);
    assert.equal(await flipPage.evaluate(() => window.NBGLevel1State.player.anim), 'jump',
      flipCase.label + ' first jump must retain the normal jump animation');
    await flipPage.waitForTimeout(125);
    await pressJump();
    await flipPage.waitForFunction(() => window.NBGLevel1State.jumpsUsed === 2);
    assert.equal(await flipPage.evaluate(() => window.NBGLevel1State.player.anim), 'jump',
      flipCase.label + ' second jump must retain the normal jump animation');
    await flipPage.waitForTimeout(125);
    await pressJump();
    await flipPage.waitForFunction(() => window.NBGLevel1State.jumpsUsed === 3 &&
      window.NBGLevel1State.backflipActive &&
      window.NBGLevel1State.player.anim === 'backflip');
    await flipPage.waitForFunction(() =>
      window.__backflipDraws.some(draw => draw.frame === 15), null, { timeout: 1800 });
    await flipPage.waitForFunction(() => !window.NBGLevel1State.backflipActive, null,
      { timeout: 1800 });

    const evidence = await flipPage.evaluate(() => ({
      draws: window.__backflipDraws.slice(),
      grounded: window.NBGLevel1State.player.grounded,
      anim: window.NBGLevel1State.player.anim,
      velocity: window.NBGLevel1State.player.vy
    }));
    const frameSequence = evidence.draws
      .map(draw => draw.frame)
      .filter((frame, index, frames) => index === 0 || frame !== frames[index - 1]);
    assert.deepEqual(frameSequence, Array.from({ length: 16 }, (_, index) => index),
      flipCase.label + ' must render official backflip frames 0-15 once in row-major order');
    assert.ok(evidence.draws.every(draw =>
      draw.sourceWidth === 128 && draw.sourceHeight === 128 &&
      draw.renderWidth === 72 && draw.renderHeight === 86),
    flipCase.label + ' must crop one 128px cell and render with the established player footprint');
    assert.ok(evidence.draws.every(draw => draw.flipped === (flipCase.facing < 0)),
      flipCase.label + ' must preserve movement facing through the full flip');
    assert.ok(['jump', 'fall'].includes(evidence.anim) || evidence.grounded,
      flipCase.label + ' must leave the final frame for an appropriate movement animation');

    await flipPage.waitForFunction(() => window.NBGLevel1State.player.grounded, null,
      { timeout: 2500 });
    assert.ok(['idle', 'run'].includes(await flipPage.evaluate(() =>
      window.NBGLevel1State.player.anim)),
    flipCase.label + ' landing must restore a grounded animation');

    await flipPage.evaluate(() => window.NBGLevel1Runtime.reset());
    assert.deepEqual(await flipPage.evaluate(() => ({
      active: window.NBGLevel1State.backflipActive,
      anim: window.NBGLevel1State.player.anim,
      frame: window.NBGLevel1State.player.frame
    })), { active: false, anim: 'idle', frame: 0 },
    flipCase.label + ' reset must clear all backflip state');
  } finally {
    await flipPage.close();
  }
}

// Damage must immediately interrupt the one-shot flip rather than allowing
// ordinary airborne selection to restart it later.
const flipDamagePage = await browser.newPage({ viewport: { width: 960, height: 540 } });
try {
  await flipDamagePage.goto(url, { waitUntil: 'networkidle' });
  await flipDamagePage.waitForFunction(() => window.NBGLevel1State?.assetsLoaded);
  for (let press = 0; press < 3; press++) {
    await flipDamagePage.keyboard.press('KeyW');
    if (press < 2) await flipDamagePage.waitForTimeout(125);
  }
  await flipDamagePage.waitForFunction(() => window.NBGLevel1State.backflipActive);
  await flipDamagePage.evaluate(() => {
    const state = window.NBGLevel1State;
    const hazard = state.hazards[0];
    state.player.invuln = 0;
    state.player.x = hazard.x;
    state.player.y = hazard.y;
    state.player.vx = 0;
    state.player.vy = 0;
  });
  await flipDamagePage.waitForFunction(() =>
    window.NBGLevel1State.player.anim === 'hurt');
  assert.equal(await flipDamagePage.evaluate(() =>
    window.NBGLevel1State.backflipActive), false,
  'damage must interrupt and clear the backflip one-shot state');
} finally {
  await flipDamagePage.close();
}

// Assert actual flying-pig canvas output in both directions, including the
// 14px sprite overhang beyond the unchanged 28px collision box.
const pigPage = await browser.newPage({viewport:{width:960,height:540}});
try {
  await pigPage.goto(url, {waitUntil:'networkidle'});
  await pigPage.waitForFunction(() => window.NBGLevel1State?.assetsLoaded, null, {timeout:10000});
  await pigPage.keyboard.down('KeyD');
  await pigPage.waitForFunction(() => window.NBGLevel1State.running, null, {timeout:3000});
  await pigPage.keyboard.up('KeyD');
  await pigPage.evaluate(() => {
    const state = window.NBGLevel1State;
    state.player.x = 64;
    state.player.invuln = 120000;
    const enemy = state.enemies.find(item => item.type === 'pigeon');
    enemy.x = 180; enemy.y = 128; enemy.vx = 0.001;
    enemy.min = -200; enemy.max = 1200;
    const ctx = document.getElementById('game').getContext('2d');
    window.__pigOriginalDraw = ctx.drawImage;
    window.__pigDrawCalls = [];
    window.__pigCanvasIds = new WeakMap();
    window.__pigNextCanvasId = 1;
    ctx.drawImage = function (img, ...args) {
      if (img instanceof HTMLCanvasElement && img.width === 156 && img.height === 156) {
        if (!window.__pigCanvasIds.has(img))
          window.__pigCanvasIds.set(img, window.__pigNextCanvasId++);
        const transform = this.getTransform();
        window.__pigDrawCalls.push({
          id:window.__pigCanvasIds.get(img),
          x:transform.a < 0 ? transform.e - args[6] : args[4],
          width:args[6], height:args[7], flipped:transform.a < 0,
          srcWidth:args[2], srcHeight:args[3],
          cornerAlpha:img.getContext('2d').getImageData(0,0,1,1).data[3]
        });
      }
      return window.__pigOriginalDraw.call(this, img, ...args);
    };
  });
  await pigPage.waitForFunction(() => window.__pigDrawCalls.length > 2, null, {timeout:2000});
  await pigPage.waitForTimeout(260);
  const initial = await pigPage.evaluate(() => window.__pigDrawCalls.slice());
  assert.ok(initial.every(call => call.width === 56 && call.height === 44 &&
    call.srcWidth === 156 && call.srcHeight === 156 && call.cornerAlpha === 0),
    'pig frames must use isolated transparent padded canvases drawn at exactly 56x44');
  assert.ok(new Set(initial.map(call=>call.id)).size >= 2,
    'flying pig must actually animate through more than one isolated frame');
  for (const scenario of [
    {x:481,vx:0.001,flipped:false,expectedX:467},
    {x:-29,vx:-0.001,flipped:true,expectedX:-43}
  ]) {
    await pigPage.evaluate(({x,vx}) => {
      const enemy = window.NBGLevel1State.enemies.find(item=>item.type==='pigeon');
      enemy.x=x;enemy.vx=vx;
      window.__pigDrawCalls.length=0;
    }, scenario);
    await pigPage.waitForFunction(() => window.__pigDrawCalls.length>0, null, {timeout:1500});
    const drawn = await pigPage.evaluate(() => window.__pigDrawCalls[0]);
    assert.equal(drawn.flipped, scenario.flipped,
      'left-facing flying pig must be horizontally mirrored');
    assert.ok(Math.abs(drawn.x-scenario.expectedX)<=2,
      'pig visual must stay centered and render smoothly beyond screen edges');
    assert.equal(drawn.width,56,'enlarged pig draw must preserve double pigeon width');
  }
} finally {
  await pigPage.close();
}

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
assert.equal(state.enemyCount, 58, 'course must retain all section enemies plus one finite balloon enemy');

assert.equal(
  new URL(state.assetStatus.pigeon?.src || '', url).pathname,
  '/game/assets/enemies/PIGFLY-iji.png',
  'loaded flying enemy must display the approved flying pig sheet'
);
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
  const loadedSheetSize = await page.evaluate(animationKey => {
    const image = window.NBGLevel1State.playerAnimations[animationKey].image;
    return {width: image.naturalWidth ?? image.width,
      height: image.naturalHeight ?? image.height};
  }, key);
  const expectedAnimation = expectedAnimations[key];
  assert.deepEqual(loadedSheetSize, {
    width: expectedAnimation.columns * expectedAnimation.sourceFrameWidth,
    height: Math.ceil(expectedAnimation.frames / expectedAnimation.columns) *
      expectedAnimation.sourceFrameHeight
  }, `browser runtime must load expected-size player ${key} image or canvas`);
}

assert.deepEqual(await page.evaluate(() => {
  const state = window.NBGLevel1State;
  const size = key => {
    const image = state.objectImages[key];
    return [image.naturalWidth ?? image.width, image.naturalHeight ?? image.height];
  };
  return {
    speedBox: size('speedBox'),
    botFire: size('botFire'),
    balloonWalk: size('balloonWalk'),
    balloonRelease: size('balloonRelease'),
    paths: Object.fromEntries(['speedBox','botFire','balloonWalk','balloonRelease'].map(key => [
      key, new URL(state.assetStatus[key].src, location.href).pathname
    ]))
  };
}), {
  speedBox: [81,81],
  botFire: [512,512],
  balloonWalk: [512,512],
  balloonRelease: [512,512],
  paths: {
    speedBox: '/game/assets/objects/SPEEDBOX.png',
    botFire: '/game/assets/objects/Pixel%20Flame%20Jet%20Burst-spritesheet.png',
    balloonWalk: '/game/assets/objects/bber-walk-v2.png',
    balloonRelease: '/game/assets/objects/bber-sdgd-v1.png'
  }
}, 'PR4 assets must load independently with their audited native dimensions');

assert.ok(
  runtimeSource.includes('var speedBoxes = [875, 5685, 10935, 16185].map(function (x) {') &&
  runtimeSource.includes('var GRAFFBOT_FIRE_COLUMNS = 4') &&
  runtimeSource.includes('var GRAFFBOT_FIRE_FRAMES = 16') &&
  runtimeSource.includes('var GRAFFBOT_FIRE_MOUTH_OFFSET_Y = -17') &&
  runtimeSource.includes('GRAFFBOT_FIRE_RENDER_SIZE / 2 + GRAFFBOT_FIRE_MOUTH_OFFSET_Y') &&
  runtimeSource.includes('var SPEEDRUN_HUD_WIDTH = 104') &&
  runtimeSource.includes("var timerText = formatRunTime(runElapsedMs) + '/3:00'") &&
  runtimeSource.includes("ctx.fillText('TIME', panelX + 4, 11)") &&
  runtimeSource.includes("var SPEEDRUN_HUD_HEIGHT = 21") &&
  gameCssSource.includes('flex: 0 1 50%') &&
  !runtimeSource.includes('ctx.fillRect(WIDTH - 165, 44, 160, 20)') &&
  gameCssSource.includes('right: 23%') &&
  gameCssSource.includes('flex-wrap: nowrap') &&
  gameCssSource.includes('font: 800 clamp(8px, 1.2vw, 10px)/1.05') &&
  runtimeSource.includes('var BALLOON_WALK_FRAMES = 14') &&
  runtimeSource.includes('var BALLOON_RELEASE_FRAMES = 16') &&
  runtimeSource.includes('var SPEED_BOOST_MAX_SPEED = 6') &&
  runtimeSource.includes('var SPEED_BOOST_DURATION_MS = 6000') &&
  runtimeSource.includes("balloonRewardNotificationText = '+' + earnedXp.toLocaleString('en-US') + ' XP'"),
  'audited independent frame counts, conservative boost and visible balloon XP must remain explicit'
);

// Real canvas/gameplay evidence on desktop and touch/mobile. Intercept the
// actual drawImage calls so every approved flame/balloon frame is proven,
// not merely loaded.
await page.keyboard.up('ArrowRight');
for (const mechanicMode of [
  {label:'desktop',options:{viewport:{width:960,height:540}},touch:false},
  {label:'mobile',options:{viewport:{width:390,height:700},isMobile:true,hasTouch:true},touch:true}
]) {
  const mechanicPage = await browser.newPage(mechanicMode.options);
  try {
    await mechanicPage.goto(url,{waitUntil:'networkidle'});
    await mechanicPage.waitForFunction(() => window.NBGLevel1State?.assetsLoaded === true);
    await mechanicPage.evaluate(() => {
      window.__pr4DrawEvidence={flameFrames:[],flameFacings:[],flameTopYs:[],flameInsetChecks:[],botTopYs:[],balloonFrames:[],walkFrames:[],speedBoxDraws:0,defeats:[]};
      window.addEventListener('nbg-enemy-defeated',event => {
        if(event.detail?.type==='balloon') window.__pr4DrawEvidence.defeats.push({...event.detail});
      });
      const contextPrototype=CanvasRenderingContext2D.prototype;
      const original=contextPrototype.drawImage;
      contextPrototype.drawImage=function(image,...args){
        const state=window.NBGLevel1State;
        if(image===state.objectImages.speedBox) window.__pr4DrawEvidence.speedBoxDraws++;
        if(args.length===8 && (image===state.objectImages.bot || image===state.objectImages.botKick || image===state.objectImages.botHurt)){
          const botTransform=this.getTransform();
          window.__pr4DrawEvidence.botTopYs.push(Math.round(botTransform.f+args[5]*botTransform.d));
        }
        if(args.length===8 && image===state.objectImages.botFire){
          const sourceW=(image.naturalWidth||image.width)/4;
          const sourceH=(image.naturalHeight||image.height)/4;
          window.__pr4DrawEvidence.flameFrames.push(Math.round(args[0]/sourceW)+Math.round(args[1]/sourceH)*4);
          const flameTransform=this.getTransform();
          const baseX=flameTransform.a<0?flameTransform.e:flameTransform.e+args[4];
          window.__pr4DrawEvidence.flameInsetChecks.push(state.enemies.some(enemy =>
            enemy.type==='bot' && Math.abs(baseX-Math.round(enemy.x-state.cameraX+
              (flameTransform.a<0?12:enemy.w-12)))<0.01));
          window.__pr4DrawEvidence.flameFacings.push(flameTransform.a<0?-1:1);
          window.__pr4DrawEvidence.flameTopYs.push(Math.round(flameTransform.f+args[5]*flameTransform.d));
        }
        if(args.length===8 && image===state.objectImages.balloonRelease){
          const sourceW=(image.naturalWidth||image.width)/4;
          const sourceH=(image.naturalHeight||image.height)/4;
          window.__pr4DrawEvidence.balloonFrames.push(Math.round(args[0]/sourceW)+Math.round(args[1]/sourceH)*4);
        }
        if(args.length===8 && image===state.objectImages.balloonWalk){
          const sourceW=(image.naturalWidth||image.width)/4;
          const sourceH=(image.naturalHeight||image.height)/4;
          window.__pr4DrawEvidence.walkFrames.push(Math.round(args[0]/sourceW)+Math.round(args[1]/sourceH)*4);
        }
        return original.call(this,image,...args);
      };
      const initialState=window.NBGLevel1State;
      initialState.speedBoxes[0].x=initialState.player.x+120;
    });
    if(mechanicMode.touch) await holdRunnerRight(mechanicPage);
    else await mechanicPage.keyboard.press('KeyD');
    await mechanicPage.waitForFunction(() => window.NBGLevel1State.running === true);
    await mechanicPage.waitForFunction(() => window.__pr4DrawEvidence.speedBoxDraws>0);
    const compactHud=await mechanicPage.evaluate(() => {
      const stage=document.getElementById('game-stage').getBoundingClientRect();
      const strip=document.querySelector('.hud-strip').getBoundingClientRect();
      const boxes=[...document.querySelectorAll('.hud-strip span')].map(element => {
        const rect=element.getBoundingClientRect();
        return {top:rect.top,right:rect.right,bottom:rect.bottom,left:rect.left,height:rect.height};
      });
      return {
        sameLine:Math.max(...boxes.map(box=>box.top))-Math.min(...boxes.map(box=>box.top))<=1,
        nonOverlapping:boxes.every((box,index)=>index===boxes.length-1||box.right<=boxes[index+1].left+0.5),
        maxHeight:Math.max(...boxes.map(box=>box.height)),
        reservedRight:strip.right<=stage.left+stage.width*0.78
      };
    });
    assert.deepEqual(compactHud,{sameLine:true,nonOverlapping:true,
      maxHeight:compactHud.maxHeight,reservedRight:true},
    mechanicMode.label+' XP, coins, health, state and player HUD boxes must share one compact non-overlapping row');
    assert.ok(compactHud.maxHeight<=20,
      mechanicMode.label+' top HUD boxes must stay compact');

    // Collect the in-world box and prove fixed speed, expiry and reset.
    assert.ok(await mechanicPage.evaluate(() => window.__pr4DrawEvidence.speedBoxDraws)>0,
      mechanicMode.label+' must render the supplied SPEEDBOX image in-world');
    await mechanicPage.evaluate(() => {
      const state=window.NBGLevel1State;
      const box=state.speedBoxes[0];
      state.player.x=box.x;
      state.player.y=214-state.player.h;
      state.player.vx=0;
    });
    await mechanicPage.waitForFunction(() => window.NBGLevel1State.speedBoostActive === true);
    assert.equal(await mechanicPage.evaluate(() => window.NBGLevel1State.speedBoostActive),true,
      mechanicMode.label+' speed box must activate in live gameplay');
    await mechanicPage.evaluate(() => window.NBGLevel1Runtime.setTouchControl('right',true));
    await mechanicPage.waitForFunction(() => {
      const vx=window.NBGLevel1State.player.vx;
      return vx>4.2&&vx<=6;
    });
    const boosted=await mechanicPage.evaluate(() => ({
      vx:window.NBGLevel1State.player.vx,
      draws:window.__pr4DrawEvidence.speedBoxDraws,
      collected:window.NBGLevel1State.speedBoxes[0].collected
    }));
    await mechanicPage.evaluate(() => window.NBGLevel1Runtime.setTouchControl('right',false));
    assert.ok(boosted.vx>4.2&&boosted.vx<=6,
      mechanicMode.label+' boost must increase speed without unlimited stacking');
    assert.equal(boosted.collected,true,mechanicMode.label+' box must remain collected');
    await mechanicPage.waitForFunction(() => window.NBGLevel1State.speedBoostActive === false,
      null,{timeout:8000});
    assert.equal(await mechanicPage.evaluate(() => window.NBGLevel1State.speedBoostActive),false,
      mechanicMode.label+' boost must expire back to normal speed');
    await mechanicPage.clock.pauseAt(Date.now()+100);

    await mechanicPage.evaluate(() => window.NBGLevel1Runtime.reset());
    assert.deepEqual(await mechanicPage.evaluate(() => ({
      active:window.NBGLevel1State.speedBoostActive,
      boxes:window.NBGLevel1State.speedBoxes.map(box=>box.collected)
    })),{active:false,boxes:[false,false,false,false]},
    mechanicMode.label+' fresh reset must restore boxes and clear boost');

    if(mechanicMode.touch) await holdRunnerRight(mechanicPage);
    else await mechanicPage.keyboard.press('KeyD');
    await mechanicPage.waitForFunction(() => window.NBGLevel1State.running === true);
    await mechanicPage.evaluate(() => {
      const state=window.NBGLevel1State;
      const bot=state.enemies.find(enemy=>enemy.type==='bot');
      state.player.x=bot.x-70;
      state.player.y=214-state.player.h;
      state.player.vx=0;
      state.player.invuln=0;
      bot.nextFireAt=0;
      bot.fireUntil=0;
    });
    await mechanicPage.clock.runFor(920);
    const leftFire=await mechanicPage.evaluate(() => {
      const state=window.NBGLevel1State;
      const bot=state.enemies.find(enemy=>enemy.type==='bot');
      return {health:state.player.health,rect:state.graffbotFireRect(bot),
        botY:bot.y,cameraY:state.cameraY,
        fireStartedAt:bot.fireStartedAt,fireUntil:bot.fireUntil,nextFireAt:bot.nextFireAt,
        frames:[...new Set(window.__pr4DrawEvidence.flameFrames)].sort((a,b)=>a-b),
        facings:[...new Set(window.__pr4DrawEvidence.flameFacings)].sort(),
        topYs:[...window.__pr4DrawEvidence.flameTopYs],
        botTopYs:[...window.__pr4DrawEvidence.botTopYs]};
    });
    assert.ok(leftFire.health<3,mechanicMode.label+' Graffbot fire must damage only after visible contact');
    assert.deepEqual(leftFire.frames,Array.from({length:16},(_,index)=>index),
      mechanicMode.label+' flame must render all 16 frames in order');
    assert.ok(leftFire.facings.includes(-1),
      mechanicMode.label+' leftward flame must mirror the native right-facing sheet');
    assert.ok(leftFire.topYs.length>0&&leftFire.botTopYs.length>0&&
      leftFire.topYs.every(topY=>leftFire.botTopYs.some(botTopY=>
        Math.abs((topY+48)-(botTopY+16))<=1)),
      mechanicMode.label+' flame sheet must retain the requested 7px higher placement');
    assert.equal(leftFire.nextFireAt-leftFire.fireUntil,2400,
      mechanicMode.label+' Graffbot cooldown must begin after the flame sequence ends');

    await mechanicPage.evaluate(() => {
      const state=window.NBGLevel1State;
      const bot=state.enemies.find(enemy=>enemy.type==='bot');
      state.player.x=bot.x+62;
      state.player.y=214-state.player.h;
      state.player.vx=0;
      state.player.invuln=999999;
      bot.vx=0;
    });
    await mechanicPage.clock.runFor(2200);
    assert.equal(await mechanicPage.evaluate(() => {
      const bot=window.NBGLevel1State.enemies.find(enemy=>enemy.type==='bot');
      return bot.fireStartedAt;
    }),leftFire.fireStartedAt,
    mechanicMode.label+' Graffbot must not fire again before the full post-flame cooldown');
    await mechanicPage.clock.runFor(260);
    const repeatedFire=await mechanicPage.evaluate(() => {
      const bot=window.NBGLevel1State.enemies.find(enemy=>enemy.type==='bot');
      return {fireStartedAt:bot.fireStartedAt,
        facings:[...new Set(window.__pr4DrawEvidence.flameFacings)]};
    });
    assert.ok(repeatedFire.fireStartedAt>leftFire.fireStartedAt,
      mechanicMode.label+' Graffbot must naturally fire again after the cooldown without a timer reset');
    assert.ok(repeatedFire.facings.includes(1),
      mechanicMode.label+' rightward flame must use the native sheet orientation');
    assert.ok(await mechanicPage.evaluate(() =>
      window.__pr4DrawEvidence.flameInsetChecks.length>0 &&
      window.__pr4DrawEvidence.flameInsetChecks.every(Boolean)),
      mechanicMode.label+' both flame facings must sit 8 game pixels further into the bot');
    await mechanicPage.clock.runFor(900);
    assert.equal(await mechanicPage.evaluate(() => {
      const state=window.NBGLevel1State;
      const bot=state.enemies.find(enemy=>enemy.type==='bot');
      return state.graffbotFireRect(bot);
    }),null,mechanicMode.label+' flame hitbox must disappear with the animation');

    await mechanicPage.evaluate(() => window.NBGLevel1Runtime.reset());
    if(mechanicMode.touch) await holdRunnerRight(mechanicPage);
    else await mechanicPage.keyboard.press('KeyD');
    await mechanicPage.waitForFunction(() => window.NBGLevel1State.running === true);
    await mechanicPage.evaluate(() => {
      const state=window.NBGLevel1State;
      const balloon=state.enemies.find(enemy=>enemy.type==='balloon');
      state.player.x=balloon.x-250;
      state.player.y=214-state.player.h;
      state.player.vx=0;
      state.player.invuln=999999;
    });
    await mechanicPage.clock.runFor(3800);
    await mechanicPage.evaluate(() => {
      const state=window.NBGLevel1State;
      const balloon=state.enemies.find(enemy=>enemy.type==='balloon');
      window.__pr4DrawEvidence.walkFrames=[];
      balloon.vx=0;
      state.player.x=balloon.x-120;
      state.player.vx=0;
    });
    await mechanicPage.clock.runFor(1600);
    const balloonCycles=await mechanicPage.evaluate(() => {
      const state=window.NBGLevel1State;
      const balloon=state.enemies.find(enemy=>enemy.type==='balloon');
      return {
        cycles:balloon.balloonCycles,
        mode:balloon.balloonState,
        releaseFrames:[...new Set(window.__pr4DrawEvidence.balloonFrames)].sort((a,b)=>a-b),
        walkFrames:[...new Set(window.__pr4DrawEvidence.walkFrames)].sort((a,b)=>a-b)
      };
    });
    assert.equal(balloonCycles.cycles,2,mechanicMode.label+' balloon enemy must complete exactly two cycles');
    assert.equal(balloonCycles.mode,'walk',mechanicMode.label+' balloon enemy must return to walking');
    assert.deepEqual(balloonCycles.releaseFrames,Array.from({length:16},(_,index)=>index),
      mechanicMode.label+' balloon release/burst must render all 16 approved frames');
    assert.deepEqual(balloonCycles.walkFrames,Array.from({length:14},(_,index)=>index),
      mechanicMode.label+' walk animation must render 14 valid frames and skip two blank cells');
    await mechanicPage.clock.runFor(4000);
    assert.equal(await mechanicPage.evaluate(() =>
      window.NBGLevel1State.enemies.find(enemy=>enemy.type==='balloon').balloonCycles),2,
      mechanicMode.label+' must never release a third balloon');

    const beforeBalloonXp=await mechanicPage.evaluate(() => {
      const state=window.NBGLevel1State;
      const balloon=state.enemies.find(enemy=>enemy.type==='balloon');
      state.player.x=balloon.x-34;
      state.player.y=214-state.player.h;
      state.player.facing=1;
      state.player.invuln=999999;
      return state.xp;
    });
    if(mechanicMode.touch) {
      await mechanicPage.locator('[data-control="spray"]').first().dispatchEvent('pointerdown',{
        pointerId:8,pointerType:'touch',isPrimary:true,bubbles:true
      });
      await mechanicPage.clock.runFor(180);
      await mechanicPage.locator('[data-control="spray"]').first().dispatchEvent('pointerup',{
        pointerId:8,pointerType:'touch',isPrimary:true,bubbles:true
      });
    } else {
      await mechanicPage.keyboard.down('KeyS');
      await mechanicPage.clock.runFor(180);
      await mechanicPage.keyboard.up('KeyS');
    }
    const balloonDefeat=await mechanicPage.evaluate(() => {
      const state=window.NBGLevel1State;
      const balloon=state.enemies.find(enemy=>enemy.type==='balloon');
      return {defeated:balloon.defeated,reward:balloon.balloonRewardXp,xp:state.xp,
        events:window.__pr4DrawEvidence.defeats,
        notice:state.balloonRewardNotificationText};
    });
    assert.equal(balloonDefeat.defeated,true,mechanicMode.label+' balloon enemy must remain killable');
    assert.ok(Number.isInteger(balloonDefeat.reward)&&balloonDefeat.reward>=10&&balloonDefeat.reward<=10000,
      mechanicMode.label+' balloon reward must be one integer from 10 through 10,000');
    assert.equal(balloonDefeat.xp-beforeBalloonXp,balloonDefeat.reward,
      mechanicMode.label+' balloon XP must enter only the current run total');
    assert.equal(balloonDefeat.events.length,1,mechanicMode.label+' defeat must award exactly once');
    assert.equal(balloonDefeat.notice,'+'+balloonDefeat.reward.toLocaleString('en-US')+' XP',
      mechanicMode.label+' actual random XP must appear on screen');
    await mechanicPage.clock.runFor(500);
    assert.deepEqual(await mechanicPage.evaluate(() => ({
      xp:window.NBGLevel1State.xp,
      events:window.__pr4DrawEvidence.defeats.length
    })),{xp:balloonDefeat.xp,events:1},
    mechanicMode.label+' duplicate ticks must never reroll or re-award balloon XP');

    await mechanicPage.evaluate(() => window.NBGLevel1Runtime.reset());
    assert.deepEqual(await mechanicPage.evaluate(() => {
      const state=window.NBGLevel1State;
      const balloon=state.enemies.find(enemy=>enemy.type==='balloon');
      return {cycles:balloon.balloonCycles,reward:balloon.balloonRewardXp||null,
        awarded:balloon.balloonRewardAwarded,defeated:Boolean(balloon.defeated)};
    }),{cycles:0,reward:null,awarded:false,defeated:false},
    mechanicMode.label+' fresh run must restore balloon cycles and reward state');
  } finally {
    await mechanicPage.clock.resume().catch(()=>{});
    await mechanicPage.close();
  }
}

await page.keyboard.down('ArrowRight');
const beforeMoveX = await page.evaluate(() => window.NBGLevel1State.player.x);
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
assert.equal(state.renderWidth, 164, 'left-boundary spray pose must retain its slightly reduced visual width');
assert.equal(state.visualMarginX, 70, 'left-boundary visual clamp must account for the adjusted spray sheet');
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

// Movement and rendering checks must not supply a damaged checkpoint fixture.
// Reset through the public runtime API and drive exact frames so wall-clock
// delays cannot add enemy hits between setup, fall and respawn assertions.
await page.evaluate(() => window.NBGLevel1Runtime.reset());
await page.clock.install();
await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
await page.evaluate(() => {
  window.__checkpointHits = [];
  window.__checkpointHitListener = event => window.__checkpointHits.push(event.detail);
  window.addEventListener('nbg-player-hit', window.__checkpointHitListener);
});
assert.equal(await page.evaluate(() => window.NBGLevel1State.player.health), 3,
  'fresh checkpoint run must start with full health');
await page.keyboard.press('ArrowRight');
await page.clock.runFor(32);
await page.evaluate(() => {
  const player = window.NBGLevel1State.player;
  player.x = 1242;
  player.y = 166;
  player.vx = 0;
  player.vy = 0;
});
await page.clock.runFor(144);
state = await page.evaluate(() => ({
  checkpointActive: window.NBGLevel1State.checkpoint.active,
  xp: window.NBGLevel1State.xp,
  health: window.NBGLevel1State.player.health,
  hits: window.__checkpointHits
}));
assert.equal(state.checkpointActive, true, 'checkpoint must activate when player reaches it');
assert.equal(state.xp, 250, 'checkpoint must award exactly 250 XP in a fresh run');
assert.equal(state.health, 3, 'checkpoint activation must preserve health');
assert.deepEqual(state.hits, [], 'checkpoint fixture must have no earlier damage');

async function forceCheckpointFall() {
  await page.evaluate(() => { window.NBGLevel1State.player.y = 380; });
  await page.clock.runFor(128);
  return page.evaluate(() => ({
    x: window.NBGLevel1State.player.x,
    y: window.NBGLevel1State.player.y,
    health: window.NBGLevel1State.player.health,
    xp: window.NBGLevel1State.xp,
    hits: window.__checkpointHits,
    gameOver: window.NBGLevel1State.gameOver,
    running: window.NBGLevel1State.running
  }));
}
state = await forceCheckpointFall();
assert.equal(state.x, 1240, 'checkpoint respawn must restore player x to checkpoint');
assert.equal(state.y, 180, 'checkpoint respawn must restore player to playable height');
assert.equal(state.health, 2, 'checkpoint respawn fall damage must reduce health once');
assert.deepEqual(state.hits, [{ health: 2, enemy: 'fall' }],
  'one fall must dispatch exactly one damage event');
assert.equal(state.xp, 250, 'respawning must not duplicate checkpoint XP');

state = await forceCheckpointFall();
assert.equal(state.health, 2, 'a fall during respawn protection must not cause more damage');
assert.equal(state.hits.length, 1, 'respawn protection must suppress duplicate hit events');
assert.equal(state.x, 1240, 'protected falls must still restore the checkpoint');
await page.clock.runFor(1024);
state = await forceCheckpointFall();
assert.equal(state.health, 1, 'a later fall must deduct one health from an already damaged player');
assert.deepEqual(state.hits, [{ health: 2, enemy: 'fall' }, { health: 1, enemy: 'fall' }],
  'each unprotected fall must cause exactly one hit');
assert.equal(state.xp, 250, 'repeated respawns must preserve checkpoint XP');
assert.equal(state.gameOver, false, 'one remaining health must keep the run playable');
assert.equal(state.running, true, 'nonlethal checkpoint falls must keep gameplay running');
await page.evaluate(() => {
  window.removeEventListener('nbg-player-hit', window.__checkpointHitListener);
  delete window.__checkpointHitListener;
  delete window.__checkpointHits;
  window.NBGLevel1State.player.invuln = 0;
});
await page.clock.resume();

// Double jump is edge-triggered and resets on landing, respawn and restart.
assert.ok(
  runtimeSource.includes('var DOUBLE_JUMP_VELOCITY = -12.8') &&
  runtimeSource.includes('var DOUBLE_JUMP_SIDE_SPEED = 5.4') &&
  runtimeSource.includes('var pendingJumpPresses = 0') &&
  runtimeSource.includes("getControlForCode(e.code) === 'jump'") &&
  runtimeSource.includes('var queuedJump = jumpTapReady()') &&
  runtimeSource.includes('var jumpPressed = queuedJump ||') &&
  runtimeSource.includes('if (jumpPressed && player.grounded)') &&
  runtimeSource.includes('else if (jumpPressed && !player.grounded && jumpsUsed === 1)') &&
  runtimeSource.includes('player.vy = DOUBLE_JUMP_VELOCITY') &&
  runtimeSource.includes('player.vx = left ? -DOUBLE_JUMP_SIDE_SPEED : DOUBLE_JUMP_SIDE_SPEED') &&
  runtimeSource.includes('jumpsUsed = 2') &&
  runtimeSource.includes('jumpsUsed = 3') &&
  runtimeSource.includes('var TRIPLE_JUMP_VELOCITY = -12.8') &&
  runtimeSource.includes('jumpsUsed = 0'),
  'triple jump must require a fresh third press and reset on landing'
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
await page.waitForFunction(() => window.NBGLevel1State.jumpsUsed === 3,
  null, { timeout: 1200 });
assert.equal(await page.evaluate(() => window.NBGLevel1State.jumpsUsed), 3,
  'third tap must consume the final boost even when queued before its frame');
await page.keyboard.down('Space');
await page.waitForTimeout(50);
await page.keyboard.up('Space');
assert.equal(await page.evaluate(() => window.NBGLevel1State.jumpsUsed), 3,
  'fourth midair press must not grant another jump');


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

// Forty-two hidden rewards run across the full course without affecting regular coin count.
state = await page.evaluate(() => ({
  secretCount: window.NBGLevel1State.secretCoins.length,
  secretValues: window.NBGLevel1State.secretCoins.map((coin) => coin.xp),
  secretHeights: window.NBGLevel1State.secretCoins.map((coin) => coin.y),
  secretPositions: window.NBGLevel1State.secretCoins.map((coin) => coin.x),
  regularCount: window.NBGLevel1State.coins.length,
  regularHud: document.getElementById('hud-coins').textContent,
  xp: window.NBGLevel1State.xp
}));
assert.equal(state.secretCount, 42, 'opening six and two secrets in each of 18 sections');
assert.deepEqual(state.secretValues, Array(42).fill(500), 'each secret coin must award 500 XP');
assert.ok(state.secretHeights.every((y) => y < 0), 'each secret reward must sit above the regular gameplay viewport');
assert.deepEqual([...new Set(state.secretPositions.filter(x => x >= 2200)
  .map(x => Math.floor((x - 2200) / 1050)))].sort((a,b) => a - b),
  Array.from({ length: 18 }, (_, i) => i),
  'hidden rewards must cover all 18 generated sections through the finish');
const secretStartingXp = state.xp;
const regularHudBeforeSecrets = state.regularHud;
for (let index = 0; index < 42; index += 1) {
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
assert.equal(state.xp, secretStartingXp + 21000, 'all 42 secrets must add exactly 21000 XP');
assert.equal(state.taken, 42, 'secret coins must remain collected during the run');
assert.equal(state.banner, 'SECRET FOUND +500 XP', 'secret collection must display discovery notification');
assert.ok(state.bannerUntil > 0, 'secret discovery notification must have an expiry time');
assert.equal(state.hud, regularHudBeforeSecrets, 'secret collection must not change normal coin HUD counts');
await page.waitForTimeout(120);
assert.equal(await page.evaluate(() => window.NBGLevel1State.xp), secretStartingXp + 21000, 'secret cannot be collected twice');
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

// Rapid keyboard/touch taps between animation frames must remain three
// distinct boosts, not collapse into one or all fire on adjacent frames.
// The recorded replay masks must match the same spaced browser physics.
for (const mode of ['keyboard', 'touch']) {
  const rapid = await browser.newPage({
    viewport: { width: 480, height: 320 },
    hasTouch: mode === 'touch'
  });
  try {
    await rapid.goto(url, { waitUntil: 'domcontentloaded' });
    await rapid.waitForFunction(() => window.NBGLevel1State?.assetsLoaded, null,
      { timeout: 20000 });
    if (mode === 'keyboard') {
      await rapid.evaluate(() => {
        for (let i = 0; i < 4; i++) {
          window.dispatchEvent(new KeyboardEvent('keydown',
            { key: 'w', code: 'KeyW', bubbles: true, cancelable: true }));
          window.dispatchEvent(new KeyboardEvent('keyup',
            { key: 'w', code: 'KeyW', bubbles: true, cancelable: true }));
        }
      });
    } else {
      await rapid.evaluate(() => {
        for (let i = 0; i < 4; i++) {
          window.NBGLevel1Runtime.setTouchControl('jump', true);
          window.NBGLevel1Runtime.setTouchControl('jump', false);
        }
      });
    }
    await rapid.waitForFunction(() => window.NBGLevel1State.running &&
      window.NBGLevel1State.jumpsUsed === 3, null, { timeout: 1800 });
    const flight = await rapid.evaluate(() => ({
      used: window.NBGLevel1State.jumpsUsed,
      pending: window.NBGLevel1State.pendingJumpPresses,
      vertical: window.NBGLevel1State.player.vy,
      elapsed: window.NBGLevel1State.runElapsedMs,
      replay: window.NBGLevel1State.recordedReplay
    }));
    assert.equal(flight.used, 3, mode + ' must use three distinct boosts');
    assert.equal(flight.pending, 0, mode + ' fourth tap must not queue a phantom jump');
    assert.ok(flight.vertical < 0, mode + ' final boost must send the player upward');
    assert.ok(flight.elapsed >= 2 * 115,
      mode + ' successive boosts must be visually spaced instead of compressed');
    assert.equal(flight.replay?.version, 1,
      mode + ' should expose an encoded version-one input replay');
    assert.equal(flight.replay?.course_version, 6,
      mode + ' must retain the independently simulated Level 1 course');
    const bytes = Buffer.from(flight.replay.frames, 'base64');
    assert.equal(bytes.length % 5, 0, 'input replay frames must remain five bytes each');
    const jumpTimes = [];
    let elapsed = 0;
    for (let i = 0; i < bytes.length; i += 5) {
      elapsed += bytes.readUInt16LE(i + 2) / 10;
      if (bytes[i + 4] & 4) jumpTimes.push(elapsed);
    }
    assert.equal(jumpTimes.length, 3,
      mode + ' must emit exactly three Jump masks for three actual boosts');
    assert.ok(jumpTimes[1] - jumpTimes[0] >= 100 &&
      jumpTimes[2] - jumpTimes[1] >= 100,
      mode + ' encoded replay Jump masks must preserve boost pacing');
    const inspected = await verifyNbgLondonReplay({
      runId: '00000000-0000-4000-8000-000000000001',
      replay: flight.replay,
      startedAtMs: 1000000,
      now: 1000000 + Math.round(elapsed),
      debug: true
    });
    assert.equal(inspected.debug?.jumps, 3,
      mode + ' independently simulated Worker must consume all three Jump masks');
  } finally {
    await rapid.close();
  }
}

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

// Parachuting rats: one start-area encounter per fresh run, with no timer,
// distance or checkpoint replenishment. Existing glide, combat and landing remain.
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
  runtimeSource.includes('if (parachuteSpawnCount === 0)') &&
  runtimeSource.includes('PARACHUTE_GLIDE_SPEED + Math.sin(') &&
  runtimeSource.includes('enemies.push({') &&
  runtimeSource.includes("damagePlayer('parachute-rat', rat.x)"),
  'one parachute rat must glide, attack on contact and convert to a walker when grounded'
);
await page.keyboard.down('KeyD');
await page.waitForFunction(() => window.NBGLevel1State.running === true, null, { timeout: 3000 });
await page.keyboard.up('KeyD');
await page.waitForFunction(() => window.NBGLevel1State.parachuteSpawnCount === 1, null, { timeout: 1500 });
let chuteState = await page.evaluate(() => ({
  count: window.NBGLevel1State.parachuteRats.length,
  spawns: window.NBGLevel1State.parachuteSpawnCount,
  first: window.NBGLevel1State.parachuteRats[0] ? { ...window.NBGLevel1State.parachuteRats[0] } : null
}));
assert.equal(chuteState.count, 1, 'exactly one aerial rat must spawn in a fresh run');
assert.ok(chuteState.first.x >= 350 && chuteState.first.x <= 430,
  'the only aerial rat must appear visibly in the starting section');
const beforeGlideY = chuteState.first.y;
await page.waitForTimeout(120);
chuteState = await page.evaluate(() => ({
  y: window.NBGLevel1State.parachuteRats[0]?.y,
  x: window.NBGLevel1State.parachuteRats[0]?.x
}));
assert.ok(chuteState.y > beforeGlideY && chuteState.y - beforeGlideY < 75,
  'the single parachute rat must descend visibly without teleporting');

// The naturally spawned rat must retain harmful contact and landing behavior.
const beforeParachuteHit = await page.evaluate(() => {
  const state = window.NBGLevel1State;
  const rat = state.parachuteRats[0];
  state.enemies.forEach(enemy => { enemy.defeated = true; });
  state.player.x = rat.x;
  state.player.y = rat.y;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.invuln = 0;
  return state.player.health;
});
await page.waitForFunction((health) => window.NBGLevel1State.player.health === health - 1,
  beforeParachuteHit, { timeout: 1500 });
await page.waitForFunction(() => window.NBGLevel1State.parachuteRats.length === 0,
  null, { timeout: 1500 });
assert.ok(await page.evaluate(() => window.NBGLevel1State.enemies.some(enemy =>
  enemy.spawnedByParachute && !enemy.defeated)),
  'a contacting parachute rat must damage the player and continue as a live walker after landing');

// Activating and respawning at a checkpoint must not create another aerial rat.
await page.evaluate(() => {
  const state = window.NBGLevel1State;
  state.player.x = 1242;
  state.player.y = 166;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.invuln = 5000;
});
await page.waitForFunction(() => window.NBGLevel1State.checkpoint.active, null, { timeout: 1500 });
await page.evaluate(() => {
  const state = window.NBGLevel1State;
  state.player.invuln = 0;
  state.player.y = 380;
});
await page.waitForFunction(() => window.NBGLevel1State.player.x === 1240, null, { timeout: 1500 });
assert.deepEqual(await page.evaluate(() => ({
  spawns: window.NBGLevel1State.parachuteSpawnCount,
  active: window.NBGLevel1State.parachuteRats.length
})), { spawns: 1, active: 0 },
  'checkpoint respawn must preserve the consumed one-rat spawn state');

// Travelling far into the course and waiting beyond the old recurring window
// must not produce a second rat. Playwright's clock keeps this deterministic.
await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
await page.evaluate(() => {
  const state = window.NBGLevel1State;
  state.player.x = 14500;
  state.player.y = 214 - state.player.h;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.invuln = 20000;
});
await page.clock.runFor(12000);
assert.equal(await page.evaluate(() => window.NBGLevel1State.parachuteSpawnCount), 1,
  'elapsed time and course distance must never spawn another parachute rat');
await page.clock.resume();

// A fresh run restores one rat; defeating it must consume the run's only spawn.
await page.evaluate(() => window.NBGLevel1Runtime.reset());
assert.deepEqual(await page.evaluate(() => ({
  active: window.NBGLevel1State.parachuteRats.length,
  spawns: window.NBGLevel1State.parachuteSpawnCount,
  enemies: window.NBGLevel1State.enemies.length
})), { active: 0, spawns: 0, enemies: 58 },
  'fresh reset must restore the one-rat spawn state and original enemy roster');
await page.keyboard.press('KeyD');
await page.waitForFunction(() => window.NBGLevel1State.parachuteSpawnCount === 1, null, { timeout: 1500 });
await page.evaluate(() => {
  const state = window.NBGLevel1State;
  const rat = state.parachuteRats[0];
  state.player.x = 400;
  state.player.y = 214 - state.player.h;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.grounded = true;
  state.player.facing = 1;
  state.player.invuln = 5000;
  rat.x = state.player.x + 58;
  rat.y = 150;
  window.__singleRunRat = rat;
});
await page.keyboard.down('KeyS');
await page.waitForFunction(() => window.__singleRunRat?.defeated === true, null, { timeout: 1500 });
await page.keyboard.up('KeyS');
await page.waitForTimeout(300);
assert.deepEqual(await page.evaluate(() => ({
  spawns: window.NBGLevel1State.parachuteSpawnCount,
  active: window.NBGLevel1State.parachuteRats.length,
  xp: window.NBGLevel1State.xp
})), { spawns: 1, active: 0, xp: 75 },
  'the original flying rat must be defeatable for existing mid-air XP without respawning');
await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
await page.clock.runFor(12000);
assert.equal(await page.evaluate(() => window.NBGLevel1State.parachuteSpawnCount), 1,
  'a defeated flying rat must never respawn in the same run');
await page.clock.resume();
await page.evaluate(() => { delete window.__singleRunRat; return window.NBGLevel1Runtime.reset(); });
await page.keyboard.press('KeyD');
await page.waitForFunction(() => window.NBGLevel1State.parachuteSpawnCount === 1, null, { timeout: 1500 });
assert.equal(await page.evaluate(() => window.NBGLevel1State.parachuteRats.length), 1,
  'a completely fresh run must restore exactly one new flying rat');
await page.evaluate(() => window.NBGLevel1Runtime.reset());

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
  runtimeSource.includes('(ratAttacking ? 2.45 : 1.55)') &&
  runtimeSource.includes('var ratFootY = y + enemy.h') &&
  runtimeSource.includes('(ratAttacking ? 34 : 18)') &&
  runtimeSource.includes('var ratDrawY = ratFootY - ratDrawHeight + brownFootPadding'),
  'brown parachute rats must use enlarged walk/punch poses with one grounded foot baseline'
);

// Brown and turquoise landed parachute rats must actually DISPLAY their
// attack sprites, not merely update their attack state. In particular, attack
// time is runElapsedMs while requestAnimationFrame supplies performance.now().
await page.evaluate(() => window.NBGLevel1Runtime.reset());
await page.keyboard.down('KeyD');
await page.waitForFunction(() => window.NBGLevel1State.running, null, { timeout: 2500 });
await page.keyboard.up('KeyD');
for (const variant of [
  { type: 'brownRat', image: 'dfgdf-punch_fast_with_lightning_bolts.png' },
  { type: 'turquoiseRat', image: 'ggdf-' }
]) {
  await page.evaluate(({ type }) => {
    const state = window.NBGLevel1State;
    state.player.x = 390;
    state.player.y = 214 - state.player.h;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.invuln = 5000;
    state.enemies.push({
      type, x: state.player.x + 48, y: 214 - 42,
      w: 28, h: 42, vx: 0, min: state.player.x + 48,
      max: state.player.x + 48, spawnedByParachute: true,
      spawnedAt: state.runElapsedMs,
      nextAttackAt: type === 'brownRat' ? state.runElapsedMs + 450 : 0
    });
    const context = document.getElementById('game').getContext('2d');
    if (!window.__nbgDrawImageOriginal) {
      window.__nbgDrawImageOriginal = context.drawImage;
      window.__nbgAttackDrawSources = [];
      window.__nbgBrownDraws = [];
      context.drawImage = function (image, ...args) {
        if (image && image.src) {
          window.__nbgAttackDrawSources.push(image.src);
          if (image.src.includes('/dfgdf-') && args.length === 8)
            window.__nbgBrownDraws.push({
              src: image.src, x: args[4], y: args[5],
              w: args[6], h: args[7]
            });
        }
        return window.__nbgDrawImageOriginal.call(this, image, ...args);
      };
    }
  }, variant);
  await page.waitForFunction(({ type, image }) => {
    const state = window.NBGLevel1State;
    const rat = state.enemies.find(enemy => enemy.type === type &&
      enemy.spawnedByParachute && !enemy.defeated);
    return rat && rat.attackUntil > state.runElapsedMs &&
      window.__nbgAttackDrawSources.some(src =>
        image === 'ggdf-' ?
          (src.includes('/ggdf-kick.png') || src.includes('/ggdf-punch.png')) :
          src.includes(image));
  }, variant, { timeout: 4000 });
  const evidence = await page.evaluate(({ type }) => {
    const state = window.NBGLevel1State;
    const rat = state.enemies.find(enemy => enemy.type === type &&
      enemy.spawnedByParachute && !enemy.defeated);
    return {attackType:rat?.attackType, attacking:rat?.attackUntil > state.runElapsedMs};
  }, variant);
  assert.ok(evidence.attacking && evidence.attackType,
    variant.type + ' must render its attack pose while the attack timer is active');
  if (variant.type === 'brownRat') {
    const brownDraws = await page.evaluate(() => window.__nbgBrownDraws);
    const walk = brownDraws.find(draw => draw.src.includes('/dfgdf-walk.png'));
    const punch = brownDraws.find(draw => draw.src.includes('/dfgdf-punch_fast_with_lightning_bolts.png'));
    assert.ok(walk && punch, 'both enlarged brown poses must actually render');
    assert.ok(walk.w >= 75 && walk.h >= 90,
      'brown walking artwork must be significantly larger than the original 50x60');
    assert.ok(punch.w > walk.w && punch.h > walk.h,
      'padded brown punch frames need a larger draw box than walk frames');
    // Their transparent bottom padding is different. Align the visible
    // artwork's feet rather than the bottoms of padded draw rectangles.
    const walkVisibleFootY = walk.y + walk.h - 18;
    const punchVisibleFootY = punch.y + punch.h - 34;
    assert.equal(walkVisibleFootY, punchVisibleFootY,
      'brown walk and punch visible feet must share the same ground baseline');
    assert.equal(Math.round(walkVisibleFootY),
      Math.round(214 + 38),
      'brown rat visible feet should be grounded on the street, not floating');
  }
  await page.evaluate(({ type }) => {
    const state = window.NBGLevel1State;
    const rat = state.enemies.find(enemy => enemy.type === type &&
      enemy.spawnedByParachute && !enemy.defeated);
    state.enemies.splice(state.enemies.indexOf(rat), 1);
    window.__nbgAttackDrawSources.length = 0;
  }, variant);
}
await page.evaluate(() => {
  const context = document.getElementById('game').getContext('2d');
  context.drawImage = window.__nbgDrawImageOriginal;
  delete window.__nbgDrawImageOriginal;
  delete window.__nbgAttackDrawSources;
  delete window.__nbgBrownDraws;
  window.NBGLevel1Runtime.reset();
});

// Platform feet and combat geometry regression: exercise the rendered canvas and
// the real animation loop, not only source-level helper assertions.
await page.evaluate(() => window.NBGLevel1Runtime.reset());
await page.keyboard.down('KeyD');
await page.waitForFunction(() => window.NBGLevel1State.running === true, null, { timeout: 2500 });
await page.keyboard.up('KeyD');
const platformDraw = await page.evaluate(async () => {
  const state = window.NBGLevel1State;
  const platform = state.platforms[0];
  const player = state.player;
  player.x = platform.x + 50;
  player.y = platform.y - player.h;
  player.vx = 0;
  player.vy = 0;
  player.grounded = true;
  player.anim = 'idle';
  player.frame = 0;
  player.frameTime = 0;
  const context = document.getElementById('game').getContext('2d');
  const original = context.drawImage;
  const draws = [];
  context.drawImage = function (image, ...args) {
    const source = String((image && (image.__nbgSpraySource || image.src)) || '');
    if (source.includes('/player/animations/idle.png') ||
        source.includes('/objects/BRICK1.png')) {
      draws.push({ source, y: args[5], width: args[6], height: args[7] });
    }
    return original.call(this, image, ...args);
  };
  await new Promise(resolve => setTimeout(resolve, 90));
  context.drawImage = original;
  const idle = draws.find(draw => draw.source.includes('/player/animations/idle.png'));
  const brick = draws.find(draw => draw.source.includes('/objects/BRICK1.png'));
  return {
    grounded: player.grounded,
    physicsFeet: player.y + player.h,
    platformTop: platform.y,
    playerDrawY: idle && idle.y,
    platformDrawY: brick && brick.y,
    playerDrawHeight: idle && idle.height
  };
});
assert.equal(platformDraw.grounded, true, 'player must remain grounded on a floating platform');
assert.equal(platformDraw.physicsFeet, platformDraw.platformTop,
  'player physics feet must resolve exactly to the platform top');
assert.ok(Number.isFinite(platformDraw.playerDrawY) && Number.isFinite(platformDraw.platformDrawY),
  'browser render must capture both player and platform draw coordinates');
const renderedIdleFoot = platformDraw.playerDrawY + (119 / 128) * platformDraw.playerDrawHeight;
assert.ok(Math.abs(renderedIdleFoot - platformDraw.platformDrawY) <= 1,
  'opaque player feet must render on the visible platform surface');
await page.keyboard.press('Space');
await page.waitForFunction(() => {
  const state = window.NBGLevel1State;
  return !state.player.grounded && state.player.y + state.player.h <
    state.platforms[0].y - 2;
}, null, { timeout: 1500 });
assert.equal(await page.evaluate(() => window.NBGLevel1State.player.grounded), false,
  'player must jump cleanly away from a platform without sticking');

// Spray every supported on-course class and each parachuting-rat artwork.
await page.evaluate(() => window.NBGLevel1Runtime.reset());
await page.keyboard.down('KeyD');
await page.waitForFunction(() => window.NBGLevel1State.running === true, null, { timeout: 2500 });
await page.keyboard.up('KeyD');
await page.evaluate(() => {
  const state = window.NBGLevel1State;
  state.player.invuln = 10000;
  window.__pr1Defeats = [];
  window.__pr1DefeatListener = event => window.__pr1Defeats.push(event.detail);
  window.addEventListener('nbg-enemy-defeated', window.__pr1DefeatListener);
});
for (const type of ['rat', 'pigeon', 'bot']) {
  await page.evaluate((enemyType) => {
    const state = window.NBGLevel1State;
    const target = state.enemies.find(enemy => enemy.type === enemyType && !enemy.defeated);
    state.player.x = 400;
    state.player.y = 214 - state.player.h;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.grounded = true;
    state.player.facing = 1;
    target.x = state.player.x + 58;
    target.y = 214 - target.h;
    target.vx = 0.001;
    target.min = target.x - 1;
    target.max = target.x + 1;
    window.__pr1Target = target;
  }, type);
  await page.keyboard.down('KeyS');
  await page.waitForFunction(() => window.__pr1Target?.defeated === true, null, { timeout: 1200 });
  await page.keyboard.up('KeyS');
  await page.waitForTimeout(260);
}
for (const variant of ['parachuteRatA', 'parachuteRatB', 'parachuteRatC']) {
  await page.evaluate((ratVariant) => {
    const state = window.NBGLevel1State;
    state.player.x = 400;
    state.player.y = 214 - state.player.h;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.grounded = true;
    state.player.facing = 1;
    const target = { x: state.player.x + 58, y: 150, w: 28, h: 42,
      variant: ratVariant, swayPhase: 0, vx: 0, age: 0 };
    state.parachuteRats.push(target);
    window.__pr1Target = target;
  }, variant);
  await page.keyboard.down('KeyS');
  await page.waitForFunction((ratVariant) => window.__pr1Defeats.some(
    event => event.type === ratVariant && event.reason === 'spray'
  ), variant, { timeout: 2000 });
  await page.keyboard.up('KeyS');
  await page.waitForTimeout(260);
}
const sprayedTypes = await page.evaluate(() => window.__pr1Defeats.map(event => event.type));
for (const type of ['rat', 'pigeon', 'bot', 'parachuteRatA', 'parachuteRatB', 'parachuteRatC']) {
  assert.ok(sprayedTypes.includes(type), 'spray must defeat supported enemy type: ' + type);
}
await page.evaluate(() => {
  window.removeEventListener('nbg-enemy-defeated', window.__pr1DefeatListener);
  delete window.__pr1DefeatListener;
  delete window.__pr1Defeats;
  delete window.__pr1Target;
});

// Range boundaries must be strict, while a descending foot crossing must stomp.
await page.evaluate(() => window.NBGLevel1Runtime.reset());
await page.keyboard.down('KeyD');
await page.waitForFunction(() => window.NBGLevel1State.running === true, null, { timeout: 2500 });
await page.keyboard.up('KeyD');
const outOfRangeHealth = await page.evaluate(() => {
  const state = window.NBGLevel1State;
  state.enemies.forEach(enemy => { enemy.defeated = true; });
  const target = state.enemies.find(enemy => enemy.type === 'rat');
  target.defeated = false;
  target.x = 700;
  target.y = 214 - target.h;
  target.vx = 0.001;
  target.min = 699;
  target.max = 701;
  state.player.x = 400;
  state.player.y = 214 - state.player.h;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.grounded = true;
  state.player.facing = 1;
  state.player.invuln = 0;
  window.__pr1Target = target;
  return state.player.health;
});
await page.keyboard.down('KeyS');
await page.waitForTimeout(80);
await page.keyboard.up('KeyS');
await page.waitForTimeout(180);
assert.equal(await page.evaluate(() => window.__pr1Target.defeated), false,
  'spray outside the visible attack rectangle must not damage an enemy');
assert.equal(await page.evaluate(() => window.NBGLevel1State.player.health), outOfRangeHealth,
  'enemy outside its collision rectangle must not damage the player');
await page.evaluate(() => {
  const state = window.NBGLevel1State;
  const target = window.__pr1Target;
  target.x = 500;
  target.y = 214 - target.h;
  target.vx = 0.001;
  target.min = 499;
  target.max = 501;
  state.player.x = 500;
  state.player.y = state.enemyCombatRect(target).y - state.player.h - 4;
  state.player.vx = 0;
  state.player.vy = 5;
  state.player.grounded = false;
  state.player.invuln = 5000;
});
await page.waitForFunction(() => window.__pr1Target.defeated === true, null, { timeout: 1200 });
assert.ok(await page.evaluate(() => window.NBGLevel1State.player.vy < 0),
  'valid stomp must defeat the enemy and apply the existing bounce');

// A dropped frame may carry the feet past the enemy's entire upper body. The
// swept foot segment must still preserve the top-down stomp instead of turning
// it into contact damage.
await page.evaluate(() => {
  const state = window.NBGLevel1State;
  const target = window.__pr1Target;
  target.defeated = false;
  target.x = 500;
  target.y = 214 - target.h;
  target.vx = 0.001;
  state.player.x = 500;
  state.player.y = state.enemyCombatRect(target).y - state.player.h - 4;
  state.player.vx = 0;
  state.player.vy = 70;
  state.player.grounded = false;
  state.player.invuln = 5000;
});
await page.waitForFunction(() => window.__pr1Target.defeated === true, null, { timeout: 1200 });
assert.ok(await page.evaluate(() => window.NBGLevel1State.player.vy < 0),
  'a one-tick descent through the enemy must still defeat it and bounce');

// Harmful contact and an active rat strike both use sprite-aligned hitboxes.
await page.evaluate(() => window.NBGLevel1Runtime.reset());
await page.keyboard.down('KeyD');
await page.waitForFunction(() => window.NBGLevel1State.running === true, null, { timeout: 2500 });
await page.keyboard.up('KeyD');
await page.evaluate(() => {
  const state = window.NBGLevel1State;
  state.enemies.forEach(enemy => { enemy.defeated = true; });
  const bot = state.enemies.find(enemy => enemy.type === 'bot');
  bot.defeated = false;
  bot.x = 650;
  bot.y = 214 - bot.h;
  bot.vx = 0.001;
  bot.min = 649;
  bot.max = 651;
  state.player.x = 400;
  state.player.y = 214 - state.player.h;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.invuln = 0;
  window.__pr1Target = bot;
});
await page.waitForTimeout(120);
assert.equal(await page.evaluate(() => window.NBGLevel1State.player.health), 3,
  'enemy outside its visible body must not cause phantom damage');
await page.evaluate(() => {
  const state = window.NBGLevel1State;
  const bot = window.__pr1Target;
  bot.x = state.player.x + 18;
});
await page.waitForFunction(() => window.NBGLevel1State.player.health === 2, null, { timeout: 1200 });
assert.equal(await page.evaluate(() => window.NBGLevel1State.player.anim), 'hurt',
  'direct harmful contact must apply health, knockback and hurt state');
await page.waitForFunction(() => window.NBGLevel1State.player.invuln > 0, null, { timeout: 500 });

await page.evaluate(() => {
  const state = window.NBGLevel1State;
  state.player.health = 3;
  state.player.invuln = 0;
  state.player.x = 548;
  state.player.y = 214 - state.player.h;
  state.player.vx = 0;
  state.player.vy = 0;
  state.enemies.forEach(enemy => { enemy.defeated = true; });
  const rat = state.enemies.find(enemy => enemy.type === 'rat');
  rat.defeated = false;
  rat.x = 600;
  rat.y = 214 - rat.h;
  rat.vx = 0.001;
  rat.min = 599;
  rat.max = 601;
  rat.attackFacing = -1;
  rat.attackStartedAt = state.runElapsedMs;
  rat.attackUntil = state.runElapsedMs + 600;
  rat.nextAttackAt = state.runElapsedMs + 1700;
  const playerRect = state.playerCombatRect;
  const bodyRect = state.enemyCombatRect(rat);
  if (!(playerRect.x + playerRect.w <= bodyRect.x)) {
    throw new Error('rat strike fixture must not overlap the rat body');
  }
});
await page.waitForFunction(() => window.NBGLevel1State.player.health === 2, null, { timeout: 1200 });
assert.equal(await page.evaluate(() => window.NBGLevel1State.player.invuln > 0), true,
  'active rat attack hitbox must apply the normal invulnerability cooldown');
await page.evaluate(() => { delete window.__pr1Target; });

// Long-running survival regression: enemies must be defeatable, limited, and resettable.
assert.ok(
  runtimeSource.includes('if (parachuteSpawnCount === 0)') &&
  runtimeSource.includes('landedCount < 1') &&
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

// The spray sequence is visual-only, but must complete within the existing
// 230ms attack window at 30/40/60 Hz rather than wrapping away from the
// final spray artwork. This simulates the real frame-time accumulation and
// validates both controlled one-shot runtime branches with a source-level guard.
assert.ok(runtimeSource.includes("player.anim !== 'spray' && player.anim !== 'backflip'"),
  'spray and backflip must use controlled non-looping progression while ordinary poses loop');
for (const frameDt of [1000 / 60, 25, 33]) {
  let frame = 0, remainder = 0, hasRenderedLast = false;
  for (let elapsed = frameDt; elapsed < 230; elapsed += frameDt) {
    remainder += frameDt;
    while (remainder >= expectedAnimations.spray.frameMs && frame < 24) {
      frame++;
      remainder -= expectedAnimations.spray.frameMs;
    }
    if (frame === 24) hasRenderedLast = true;
  }
  assert.ok(hasRenderedLast,
    `one 230ms spray must render its final frame at ${frameDt}ms tick cadence`);
}

// The final 5x5 spray sheet must be visibly rendered during a grounded
// player attack and must retain the existing server-simulated spray kill.
await page.evaluate(() => window.NBGLevel1Runtime.reset());
await page.keyboard.down('KeyD');
await page.waitForFunction(() => window.NBGLevel1State.running, null, { timeout: 3000 });
await page.keyboard.up('KeyD');
const sprayBaseline = await page.evaluate(() => {
  const state = window.NBGLevel1State;
  const player = state.player;
  player.x = 405;
  player.y = 214 - player.h;
  player.vx = 0;
  player.vy = 0;
  player.grounded = true;
  player.facing = 1;
  player.invuln = 5000;
  const rat = { type: 'brownRat', x: 459, y: 214 - 42,
    w: 28, h: 42, vx: 0, min: 459, max: 459,
    spawnedByParachute: true, spawnedAt: state.runElapsedMs };
  state.enemies.push(rat);
  const ctx = document.getElementById('game').getContext('2d');
  window.__finalSprayOriginalDraw = ctx.drawImage;
  window.__finalSprayFrames = [];
  ctx.drawImage = function (image, ...args) {
    if (image && (image.__nbgSpraySource || image.src || '').includes('NBG%20Runner%20Final-spray.png')) {
      window.__finalSprayFrames.push({ sourceX: args[0],
        sourceY: args[1], width: args[6], height: args[7] });
    }
    return window.__finalSprayOriginalDraw.call(this, image, ...args);
  };
  window.__sprayDefeats = [];
  window.__sprayDefeatListener = (event) => window.__sprayDefeats.push(event.detail);
  window.addEventListener('nbg-enemy-defeated', window.__sprayDefeatListener);
  const sprayImage = state.playerAnimations.spray.image;
  const painted = sprayImage.getContext('2d').getImageData(0, 0, 1, 1).data;
  if (painted[3] !== 0) throw new Error('final spray sheet white page border must be transparent');
  return { xp: state.xp, health: player.health };
});
await page.keyboard.down('KeyS');
await page.waitForFunction(() => window.__sprayDefeats.some(
  event => event.type === 'brownRat' && event.reason === 'spray'
), null, { timeout: 1500 });
// A single spray lasts 230ms. At 9ms/frame the entire 5x5 sheet reaches
// its final row before sprayTimer clears, even at normal 60fps rendering.
await page.waitForFunction(() => window.__finalSprayFrames.some(frame =>
  frame.width === 164 && frame.height === 164 &&
  frame.sourceY === 1024 && frame.sourceX >= 768
), null, { timeout: 1500 });
await page.keyboard.up('KeyS');
const standingSpray = await page.evaluate(() => {
  const state = window.NBGLevel1State;
  const result = { grounded: state.player.grounded,
    xp: state.xp, health: state.player.health,
    frames: window.__finalSprayFrames.slice(),
    defeats: window.__sprayDefeats.slice() };
  const ctx = document.getElementById('game').getContext('2d');
  ctx.drawImage = window.__finalSprayOriginalDraw;
  window.removeEventListener('nbg-enemy-defeated', window.__sprayDefeatListener);
  delete window.__finalSprayOriginalDraw;
  delete window.__finalSprayFrames;
  delete window.__sprayDefeats;
  delete window.__sprayDefeatListener;
  return result;
});
assert.ok(expectedAnimations.spray.renderWidth < 176 &&
  expectedAnimations.spray.renderHeight < 176 &&
  expectedAnimations.spray.renderOffsetY === 45,
  'final spray pose should stay 164px wide and be raised approximately 7 percent');
assert.equal(standingSpray.grounded, true,
  'spray must kill from standing without requiring a jump or stomp');
assert.equal(standingSpray.xp, sprayBaseline.xp + 100,
  'grounded spray kill on a parachute rat must award existing XP exactly once');
assert.equal(standingSpray.health, sprayBaseline.health,
  'spraying a rat while standing must not damage the player');
assert.ok(standingSpray.defeats.some(event => event.reason === 'spray' &&
  event.type === 'brownRat' && event.earnedXp === 100),
  'spray kill must emit the existing enemy-defeated event with the right reason');
assert.ok(standingSpray.frames.length > 0 &&
  standingSpray.frames.every(frame => frame.width === 164 && frame.height === 164),
  'the final spray sheet must draw enlarged frames while spraying');
const sprayCells = new Set(standingSpray.frames.map(frame =>
  `${frame.sourceX},${frame.sourceY}`));
assert.ok(sprayCells.size >= 5,
  'a single spray attack must traverse at least five distinct source cells, even under slow CI frame scheduling');
assert.ok(standingSpray.frames.some(frame => frame.sourceY === 0) &&
  standingSpray.frames.some(frame => frame.sourceY === 1024) &&
  standingSpray.frames.some(frame => [256, 512, 768].includes(frame.sourceY)),
  'the spray must start on row zero, advance through the sheet and reach the final row despite dropped browser frames');
assert.ok(standingSpray.frames.some(frame => frame.sourceY === 1024 &&
  frame.sourceX >= 768),
  'one grounded spray attack must reach the final artwork frames before expiring');
await page.evaluate(() => window.NBGLevel1Runtime.reset());
await page.keyboard.down('KeyD');
await page.waitForFunction(() => window.NBGLevel1State.running, null, { timeout: 3000 });
await page.keyboard.up('KeyD');

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
assert.equal(await page.evaluate(() => window.NBGLevel1State.enemies.length), 58,
  '100 expired parachute walkers must be removed without affecting the 57 legacy fixed enemies plus one balloon enemy');

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
  active: 0, spawned: 0, enemies: 58, defeated: 0
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

// Fresh isolated browser per input type: no prior game-over, Scores focus,
// or reset state can interfere with the queued three-press contract.
for (const mode of ['keyboard', 'touch']) {
  const queuedPage = await browser.newPage({
    viewport: { width: 480, height: 320 },
    hasTouch: mode === 'touch'
  });
  try {
    await queuedPage.goto(url, { waitUntil: 'domcontentloaded' });
    await queuedPage.waitForFunction(() => window.NBGLevel1State?.assetsLoaded,
      null, { timeout: 20000 });
    await queuedPage.evaluate(() => {
      // Gameplay keyboard handlers intentionally ignore presses while Scores
      // drawer is open; isolate this test with the drawer closed.
      const drawer = document.getElementById('nbg-record-drawer');
      if (drawer) drawer.hidden = true;
      // This is a SIGNED-player preplay regression. With guest identity the
      // runtime correctly cancels an owner-bound wait on every new input.
      // Supply one stable mock owner so presses exercise the real queue.
      window.MOONBOYS_IDENTITY = {
        ...window.MOONBOYS_IDENTITY,
        getTelegramId: () => 'nbg-queued-jump-test-owner',
        isTelegramLinked: () => true,
      };
      window.__nbgOriginalQueuedStart = window.NBGLondonBeforeQueuedRun;
      window.NBGLondonBeforeQueuedRun = () => new Promise(resolve => {
        window.__nbgReleaseQueuedStart = resolve;
      });
    });
    let immediateQueued;
    if (mode === 'keyboard') {
      // Read the actual window handler counter synchronously before blur
      // or other browser lifecycle processing can clear held game inputs.
      immediateQueued = await queuedPage.evaluate(() => {
        const counts = [];
        for (let press = 0; press < 4; press++) {
          window.dispatchEvent(new KeyboardEvent('keydown',
            { key: 'w', code: 'KeyW', bubbles: true, cancelable: true }));
          counts.push(window.NBGLevel1State.pendingJumpPresses);
          window.dispatchEvent(new KeyboardEvent('keyup',
            { key: 'w', code: 'KeyW', bubbles: true, cancelable: true }));
        }
        return counts;
      });
    } else {
      await queuedPage.evaluate(() => {
        for (let press = 0; press < 4; press++) {
          window.NBGLevel1Runtime.setTouchControl('jump', true);
          window.NBGLevel1Runtime.setTouchControl('jump', false);
        }
      });
    }
    await queuedPage.waitForFunction(() =>
      typeof window.__nbgReleaseQueuedStart === 'function');
    const queued = await queuedPage.evaluate(() => ({
      running: window.NBGLevel1State.running,
      pending: window.NBGLevel1State.pendingJumpPresses,
      waiting: window.NBGLevel1State.waitingForFirstInput,
      scoresHidden: document.getElementById('nbg-record-drawer')?.hidden,
      gameOver: window.NBGLevel1State.gameOver,
      complete: window.NBGLevel1State.complete
    }));
    assert.equal(queued.running, false, mode + ' cannot start before server handshake');
    if (mode === 'keyboard') assert.deepEqual(immediateQueued, [1,2,3,3],
      'keyboard handler must retain first three distinct press edges');
    assert.equal(queued.pending, 3,
      mode + ' should store three distinct Jump presses: ' +
      JSON.stringify({ ...queued, immediateQueued }));
    await queuedPage.evaluate(() => window.__nbgReleaseQueuedStart());
    await queuedPage.waitForFunction(() => window.NBGLevel1State.running &&
      window.NBGLevel1State.jumpsUsed === 3 &&
      window.NBGLevel1State.parachuteSpawnCount === 1, null, { timeout: 1800 });
    assert.equal(await queuedPage.evaluate(() =>
      window.NBGLevel1State.parachuteRats.length), 1,
      mode + ' fresh run must create exactly one flying rat');
  } finally {
    await queuedPage.close();
  }
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
