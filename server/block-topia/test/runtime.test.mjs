import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Client } from '@colyseus/sdk';
import { BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP } from '../../../shared/block-topia/constants.js';

const directory = new URL('../', import.meta.url);
const waitFor = async (predicate, label) => {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
};

test('real server: HTTP protection, 2-player protocol, movement and warm reconnect', { timeout: 45000 }, async t => {
  const requests = [];
  const api = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    assert.equal(req.url, '/blocktopia/progression');
    const auth = JSON.parse(body).telegram_auth;
    requests.push(auth);
    res.setHeader('Content-Type', 'application/json');
    if (auth.id === 'invalid') { res.writeHead(401); res.end('{"ok":false}'); return; }
    res.end(JSON.stringify({ ok: true, progression: { arcade_xp_total: auth.id === 'low' ? BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP - 1 : BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP } }));
  });
  api.listen(0, '127.0.0.1'); await once(api, 'listening');
  t.after(() => { api.closeAllConnections(); return new Promise(resolve => api.close(resolve)); });
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: directory,
    env: { ...process.env, PORT: '0', NODE_ENV: 'production', MONITOR_USERNAME: 'test-admin', MONITOR_PASSWORD: 'local-test-password', MOONBOYS_API_BASE: `http://127.0.0.1:${api.address().port}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; let startError;
  child.on('error', error => { startError = error; });
  for (const pipe of [child.stdout, child.stderr]) pipe.on('data', chunk => { output += chunk; });
  const joined = [];
  t.after(async () => {
    for (const room of joined) {
      if (room.connection?.isOpen) room.connection.close();
    }
    if (child.exitCode === null && child.signalCode === null) {
      const exit = once(child, 'exit').catch(() => {});
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 1500);
      await exit; clearTimeout(force);
    }
  });
  await waitFor(() => startError || child.exitCode !== null || output.includes('persistent city room bootstrapped:'), 'server bootstrap');
  assert.ifError(startError);
  assert.equal(child.exitCode, null, output);
  const port = output.match(/server running on port (\d+)/)?.[1];
  assert.ok(port, output);
  const base = `http://127.0.0.1:${port}`;
  const client = new Client(base);
  const track = room => { room.reconnection.enabled = false; room.onMessage('*', () => {}); joined.push(room); return room; };

  const health = await fetch(`${base}/health`, { headers: { Origin: 'https://cryptomoonboys.com' } });
  assert.equal(health.headers.get('access-control-allow-origin'), 'https://cryptomoonboys.com');
  assert.equal((await health.json()).client_protocol, '0.17');
  assert.equal((await fetch(`${base}/health`, { headers: { Origin: 'https://untrusted.example' } })).headers.get('access-control-allow-origin'), null);
  for (const origin of ['https://cryptomoonboys.com', 'https://untrusted.example']) {
    const preflight = await fetch(`${base}/matchmake/join/city`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin.includes('untrusted') ? null : origin);
  }
  assert.equal((await fetch(`${base}/colyseus`)).status, 401);
  assert.equal((await fetch(`${base}/colyseus`, { headers: { Authorization: `Basic ${Buffer.from('test-admin:wrong').toString('base64')}` } })).status, 401);
  assert.equal((await fetch(`${base}/colyseus/`, { headers: { Authorization: `Basic ${Buffer.from('test-admin:local-test-password').toString('base64')}` } })).status, 200);
  const sdk = await fetch(`${base}/client/colyseus.js`);
  assert.equal(sdk.status, 200); assert.match(sdk.headers.get('content-type'), /javascript/);
  assert.match(await sdk.text(), /Colyseus/);
  const webhook = await fetch(`${base}/webhooks/sam`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'test', message: 'local only' }) });
  assert.equal((await webhook.json()).event.message, 'local only');
  assert.equal((await fetch(`${base}/webhooks/sam`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'x'.repeat(110000) }) })).status, 413);

  await assert.rejects(client.join('city'), /telegram_required/);
  await assert.rejects(client.join('city', { telegram_auth: { id: 'invalid' } }), /auth_invalid/);
  await assert.rejects(client.join('city', { telegram_auth: { id: 'low' } }), /xp_required/);
  const first = track(await client.join('city', { name: 'First', telegram_auth: { id: 'one' } }));
  const second = track(await client.join('city', { name: 'Second', telegram_auth: { id: 'two' } }));
  assert.equal(first.roomId, second.roomId, 'both clients join the server-created city');
  await waitFor(() => first.state?.players?.length === 2 && second.state?.players?.length === 2, 'two-player state');
  assert.equal(first.state.worldMode, 'duo-vs-npc');
  assert.equal(first.state.npcs.length, 14);
  await assert.rejects(client.join('city', { telegram_auth: { id: 'three' } }), /full|max.?client|no rooms found/i);
  const mine = room => room.state?.players?.find(player => player.id === room.sessionId);
  const position = { x: mine(first).x, y: mine(first).y };
  first.send('move', { x: position.x + 1, y: position.y });
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(mine(first).x, position.x, 'movement remains blocked until ready');
  first.send('ready');
  await waitFor(() => mine(first).ready, 'ready state');
  first.send('move', { x: 19, y: 19 });
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(mine(first).x, position.x, 'teleports remain rejected');
  first.send('move', { x: position.x + 1, y: position.y });
  await waitFor(() => mine(first).x === position.x + 1, 'authoritative adjacent move');
  await waitFor(() => second.state.players.find(player => player.id === first.sessionId).x === position.x + 1, 'peer state patch');

  const token = first.reconnectionToken;
  const snapshot = { id: first.sessionId, x: mine(first).x, y: mine(first).y, hp: mine(first).hp };
  const disconnected = new Promise(resolve => first.onLeave(resolve));
  first.connection.close(); await disconnected;
  await new Promise(resolve => setTimeout(resolve, 75));
  const reconnected = track(await client.reconnect(token));
  await waitFor(() => mine(reconnected)?.ready, 'warm reconnect restores state');
  assert.equal(reconnected.sessionId, snapshot.id);
  for (const key of ['x', 'y', 'hp']) assert.equal(mine(reconnected)[key], snapshot[key], `reconnect ${key}`);
  await reconnected.leave();
  await waitFor(() => second.state.players.length === 1, 'consented leave releases slot immediately');
  const replacement = track(await client.join('city', { telegram_auth: { id: 'three' } }));
  assert.equal(replacement.roomId, second.roomId);
  assert.ok(requests.some(auth => auth.id === 'low'));
  assert.ok(!output.includes('failed to pre-create city room'), output);
});
