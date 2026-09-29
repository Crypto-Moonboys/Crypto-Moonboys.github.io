import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const indexHtml = await fs.readFile(new URL('games/block-topia/index.html', root), 'utf8');
const imports = [...indexHtml.matchAll(/import\("(\.\/network\.js[^\"]*)"\)/g)].map(match => match[1]);
assert.ok(imports.length >= 2 && imports.every(path => path === './network.js?v=20260929-colyseus17'), 'join and reconnect use the same fresh network module');
let child; let browser; let output = '';
const front = http.createServer(async (req, res) => {
  if (req.url === '/blocktopia/progression') {
    for await (const chunk of req) { /* drain local fixture body */ }
    res.setHeader('Content-Type', 'application/json');
    return res.end('{"ok":true,"progression":{"arcade_xp_total":100000}}');
  }
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><title>Local multiplayer check</title>'); }
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (!/^\/(games|shared)\/block-topia\/[a-z-]+\.(mjs|js)$/.test(pathname)) { res.writeHead(404); return res.end(); }
  try { res.setHeader('Content-Type', 'text/javascript'); res.end(await fs.readFile(new URL(pathname.slice(1), root))); }
  catch { res.writeHead(404); res.end(); }
});

try {
  front.listen(0, '127.0.0.1'); await once(front, 'listening');
  const origin = `http://127.0.0.1:${front.address().port}`;
  child = spawn(process.execPath, ['src/index.js'], {
    cwd: new URL('server/block-topia/', root),
    env: { ...process.env, PORT: '0', NODE_ENV: 'production', CORS_ORIGIN: origin, MOONBOYS_API_BASE: origin, MONITOR_PASSWORD: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => { clearInterval(poll); reject(new Error(output || 'Server bootstrap timeout')); }, 10000);
    const poll = setInterval(() => {
      if (output.includes('persistent city room bootstrapped:')) { clearTimeout(deadline); clearInterval(poll); resolve(); }
      else if (child.exitCode !== null) { clearTimeout(deadline); clearInterval(poll); reject(new Error(output)); }
    }, 25);
  });
  const endpoint = `http://127.0.0.1:${output.match(/server running on port (\d+)/)[1]}`;
  assert.equal((await fetch(`${endpoint}/colyseus`)).status, 404, 'production monitor stays disabled without credentials');
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errors = []; const scripts = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); });
  await page.goto(origin);
  await page.evaluate(async ({ endpoint, networkUrl }) => {
    window.BLOCK_TOPIA_SERVER = endpoint;
    window.gameNetwork = await import(networkUrl);
    window.statuses = []; window.players = [];
    await gameNetwork.connectMultiplayer({ playerName: 'Browser', telegramAuth: { id: 'browser' }, onStatus: value => statuses.push(value), onPlayers: value => { window.players = value; } });
  }, { endpoint, networkUrl: new URL(imports[0], `${origin}/games/block-topia/`).href });
  await page.waitForFunction(() => players.length === 1 && gameNetwork.isConnected());
  assert.ok(scripts.includes(`${endpoint}/client/colyseus.js`), 'browser loads the installed server SDK');
  assert.ok(!scripts.some(url => url.includes('unpkg.com')), 'upgraded server never loads the old CDN SDK');
  assert.equal(await page.evaluate(() => gameNetwork.getRoom().reconnection.enabled), false);
  assert.equal(await page.evaluate(() => gameNetwork.sendReady()), true);
  await page.waitForFunction(() => players[0]?.ready);
  const before = await page.evaluate(() => ({ id: gameNetwork.getRoom().sessionId, x: players[0].x, y: players[0].y }));
  await page.evaluate(({ x, y }) => gameNetwork.sendMovement(x + 1, y), before);
  await page.waitForFunction(x => players[0]?.x === x + 1, before.x);
  await page.evaluate(() => gameNetwork.getRoom().connection.close());
  await page.waitForFunction(id => gameNetwork.isConnected() && statuses.filter(s => s.joined).length >= 2 && gameNetwork.getRoom().sessionId === id, before.id);
  await page.waitForFunction(x => players[0]?.ready && players[0]?.x === x + 1, before.x);
  assert.deepEqual(errors, []);
  await page.close();

  // Verify a Pages-first deploy still selects the legacy SDK, and a failed
  // health read cannot silently choose the legacy protocol.
  const legacy = await browser.newPage();
  await legacy.route(`${origin}/health`, route => route.fulfill({ json: { status: 'ok', service: 'block-topia-server' } }));
  let oldLoads = 0;
  await legacy.route('https://unpkg.com/colyseus.js@0.16.22/dist/colyseus.js', route => { oldLoads++; return route.fulfill({ contentType: 'text/javascript', body: 'window.Colyseus={Client:class LegacyClient{}};' }); });
  await legacy.goto(origin);
  assert.equal(await legacy.evaluate(async endpoint => (await (await import('/games/block-topia/colyseus-client.mjs')).loadColyseusClient(endpoint)).Client.name, origin), 'LegacyClient');
  assert.equal(oldLoads, 1);
  await legacy.route(`${origin}/health`, route => route.fulfill({ status: 503, body: 'Unavailable' }));
  assert.equal(await legacy.evaluate(async endpoint => {
    try { await (await import('/games/block-topia/colyseus-client.mjs')).loadColyseusClient(endpoint); return false; }
    catch { return true; }
  }, origin), true);
  assert.equal(oldLoads, 1, 'failed health read does not reload or downgrade the SDK');
  await legacy.close();
  console.log('Block Topia browser passed: protocol selection, real join/state/movement, warm reconnect, legacy rollout and failed health read.');
} finally {
  await browser?.close();
  if (child && child.exitCode === null && child.signalCode === null) {
    const exit = once(child, 'exit'); child.kill('SIGTERM');
    const force = setTimeout(() => child.kill('SIGKILL'), 1500); await exit; clearTimeout(force);
  }
  front.closeAllConnections(); await new Promise(resolve => front.close(resolve));
}
