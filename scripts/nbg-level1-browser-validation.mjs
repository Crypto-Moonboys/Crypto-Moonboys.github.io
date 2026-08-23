import { strict as assert } from 'node:assert';
import { chromium } from 'playwright';

const url = process.env.NBG_LEVEL1_URL || 'http://127.0.0.1:4175/game/demo-launch.html';
const fallbackChromium = 'C:\\Users\\GOD\\AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe';

function averagePixelEnergy(buffer) {
  let total = 0;
  for (let i = 0; i < buffer.length; i += 4) {
    total += buffer[i] + buffer[i + 1] + buffer[i + 2];
  }
  return total / (buffer.length / 4);
}

let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  try {
    browser = await chromium.launch({ executablePath: fallbackChromium });
  } catch {
    throw error;
  }
}
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
  xp: window.NBGLevel1State.xp
}));

assert.equal(state.running, true, 'game loop must be running after START');
assert.equal(state.coinCount, 12, 'Level 1 must spawn 12 XP coins');
assert.equal(state.enemyCount, 3, 'Level 1 must spawn 3 enemies');
assert.equal(state.health, 3, 'player must spawn with health');

const beforeMoveX = state.x;
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(550);
await page.keyboard.up('ArrowRight');
state = await page.evaluate(() => ({
  x: window.NBGLevel1State.player.x,
  y: window.NBGLevel1State.player.y
}));
assert.ok(state.x > beforeMoveX + 8, 'player must move right');

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
  anim: window.NBGLevel1State.player.anim
}));
assert.ok(state.health < 3, 'enemy collision must damage player');
assert.equal(state.anim, 'hit', 'enemy collision must switch to hit animation');

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
  xp: window.NBGLevel1State.xp,
  hud: document.getElementById('hud-state').textContent
}));
assert.equal(state.complete, true, 'finish flag must complete the level');
assert.equal(state.running, false, 'game loop update state must stop after completion');
assert.ok(state.xp >= 600, 'finish must award leaderboard-ready XP');
assert.equal(state.hud, 'LEVEL COMPLETE', 'HUD must report completion');

const pixelEnergy = await page.evaluate(() => {
  const canvas = document.getElementById('game');
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  return Array.from(data);
}).then((data) => averagePixelEnergy(data));
assert.ok(pixelEnergy > 20, 'canvas must render nonblank pixels');

assert.deepEqual(errors, [], 'browser console must not report runtime errors');
await browser.close();

console.log('[PASS] NBG London Graffiti Run Level 1 browser validation');
