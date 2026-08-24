import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { chromium } from 'playwright';

const shouldServe = process.argv.includes('--serve');
const port = Number(process.env.NBG_LEVEL1_PORT || 4175);
const host = process.env.NBG_LEVEL1_HOST || '127.0.0.1';
const url = process.env.NBG_LEVEL1_URL || `http://${host}:${port}/game/demo-launch.html`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
let server;

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
  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
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

  fs.readFile(fullPath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'content-type': mimeTypes.get(path.extname(fullPath).toLowerCase()) || 'application/octet-stream'
    });
    response.end(data);
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

const expectedAnimations = {
  idle: { spriteSheet: 'player/animations/idle.png', frameWidth: 32, frameHeight: 48, frames: 4, frameMs: 145 },
  run: { spriteSheet: 'player/animations/run.png', frameWidth: 32, frameHeight: 48, frames: 6, frameMs: 88 },
  jump: { spriteSheet: 'player/animations/jump.png', frameWidth: 32, frameHeight: 48, frames: 1, frameMs: 145 },
  fall: { spriteSheet: 'player/animations/fall.png', frameWidth: 32, frameHeight: 48, frames: 1, frameMs: 145 },
  spray: { spriteSheet: 'player/animations/spray.png', frameWidth: 32, frameHeight: 48, frames: 4, frameMs: 110 },
  hurt: { spriteSheet: 'player/animations/hurt.png', frameWidth: 32, frameHeight: 48, frames: 2, frameMs: 120 },
  victory: { spriteSheet: 'player/animations/victory.png', frameWidth: 32, frameHeight: 48, frames: 2, frameMs: 145 }
};
const assetManifest = readJson('game/assets/asset-manifest.json');
const playerAnimationManifest = readJson('game/assets/player/nbg-runner-animation-manifest.json');

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
}
const runtimeSource = fs.readFileSync(path.resolve(process.cwd(), 'game/nbg-level1.js'), 'utf8');
const playerRendererSource = fs.readFileSync(path.resolve(process.cwd(), 'game/engine/player-sprite-renderer.js'), 'utf8');
const playerControllerSource = fs.readFileSync(path.resolve(process.cwd(), 'game/engine/player-animation-controller.js'), 'utf8');
const playerBindingSource = fs.readFileSync(path.resolve(process.cwd(), 'game/assets/player/nbg-runner-asset-binding.js'), 'utf8');
const assetRegistrySource = fs.readFileSync(path.resolve(process.cwd(), 'game/assets/asset-registry.js'), 'utf8');
const runtimeAssetLoaderSource = fs.readFileSync(path.resolve(process.cwd(), 'game/assets/runtime-asset-loader.js'), 'utf8');
const level1RenderBridgeSource = fs.readFileSync(path.resolve(process.cwd(), 'game/engine/level1-render-bridge.js'), 'utf8');
const levelRenderPipelineSource = fs.readFileSync(path.resolve(process.cwd(), 'game/engine/level-render-pipeline.js'), 'utf8');
const playerAnimationRuntimeSource = fs.readFileSync(path.resolve(process.cwd(), 'game/level1/level1-player-animation-runtime.js'), 'utf8');
const playerSpawnRuntimeSource = fs.readFileSync(path.resolve(process.cwd(), 'game/level1/level1-player-spawn-runtime.js'), 'utf8');
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
  runtimeSource.includes('var ASSETS ='),
  false,
  'standalone Level 1 runtime must resolve required assets from asset-manifest.json'
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
  levelRenderPipelineSource.includes('manifest?.world?.layerNames'),
  true,
  'render pipeline layer names must come from asset-manifest.json'
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

page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.goto(url, { waitUntil: 'networkidle' });
await assert.doesNotReject(() => page.waitForSelector('#start', { state: 'visible', timeout: 3000 }), 'START button must be visible');

await page.click('#start');
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
  playerAnimations: window.NBGLevel1State.playerAnimations
}));

assert.equal(state.running, true, 'game loop must be running after START');
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
assert.deepEqual(
  Object.fromEntries(Object.entries(state.playerAnimations).map(([key, animation]) => [
    key,
    {
      spriteSheet: animation.spriteSheet,
      frameWidth: animation.frameWidth,
      frameHeight: animation.frameHeight,
      frames: animation.frames,
      frameMs: animation.frameMs
    }
  ])),
  expectedAnimations,
  'browser runtime must expose the AutoSprite animation metadata from the player manifest'
);
for (const key of Object.keys(expectedAnimations)) {
  assert.equal(state.assetStatus[`player.${key}`]?.loaded, true, `browser runtime must load player ${key} animation sheet`);
}

const beforeMoveX = state.x;
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(550);
await page.keyboard.up('ArrowRight');
state = await page.evaluate(() => ({
  x: window.NBGLevel1State.player.x,
  y: window.NBGLevel1State.player.y
}));
assert.ok(state.x > beforeMoveX + 8, 'player must move right');

const beforeTouchMoveX = state.x;
await page.locator('[data-control="right"]').dispatchEvent('pointerdown', {
  pointerId: 1,
  pointerType: 'touch',
  isPrimary: true,
  bubbles: true
});
await page.waitForTimeout(360);
await page.locator('[data-control="right"]').dispatchEvent('pointerup', {
  pointerId: 1,
  pointerType: 'touch',
  isPrimary: true,
  bubbles: true
});
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
  player.x = 2052;
  player.y = 178;
});
await page.waitForTimeout(180);
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

const pixelEnergy = await page.evaluate(() => {
  const canvas = document.getElementById('game');
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  return Array.from(data);
}).then((data) => averagePixelEnergy(data));
assert.ok(pixelEnergy > 20, 'canvas must render nonblank pixels');

assert.deepEqual(errors, [], 'browser console must not report runtime errors');

console.log('[PASS] NBG London Graffiti Run Level 1 browser validation');
} finally {
  if (browser) {
    await browser.close().catch(() => {});
  }
  await stopServer();
}
