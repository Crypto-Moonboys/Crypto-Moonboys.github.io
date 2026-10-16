import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Test the production IIFE and event handlers without requiring the game loop.
const listeners = new Map();
let domReady;
const elements = new Map();
function element() {
  return {
    textContent: '', children: [], dataset: {},
    setAttribute() {},
    appendChild(child) { this.children.push(child); },
    replaceChildren(...children) { this.children = children; },
  };
}
for (const id of [
  'nbg-record-status', 'nbg-record-account', 'nbg-record-personal',
  'nbg-record-rows', 'nbg-prize-rows', 'nbg-prize-cutoff', 'nbg-hud-player',
  'nbg-record-ranking',
]) elements.set(id, element());
const document = {
  readyState: 'loading',
  getElementById(id) { return elements.get(id); },
  querySelectorAll() { return []; },
  createElement() { return element(); },
  addEventListener(type, fn) {
    if (type === 'DOMContentLoaded') domReady = fn;
  },
};
const calls = [];
let telegramId = null;
let linked = false;
let nextAuth = async () => null;
const gate = {
  getTelegramId() { return telegramId; },
  isTelegramLinked() { return linked; },
  async getFreshTelegramAuth() { return nextAuth(); },
};
const window = {
  MOONBOYS_IDENTITY: gate,
  MOONBOYS_API: { getLeaderboardUrl: () => 'https://leaderboard.test' },
  addEventListener(type, fn) { listeners.set(type, fn); },
};
async function fetch(url, options = {}) {
  const pathname = new URL(url).pathname;
  const body = options.body ? JSON.parse(options.body) : null;
  calls.push({ pathname, body });
  const data = pathname.endsWith('/leaderboard')
    ? { ok: true, records: [] }
    : pathname.endsWith('/competition')
      ? { ok: true, end_ms: Date.now() + 86400000, payout_enabled: false, standings: [] }
      : pathname.endsWith('/me')
        ? { ok: true, player: '@server', records: null }
        : pathname.endsWith('/run/start')
          ? { ok: true, run_id: '00000000-0000-0000-0000-000000000001', player: '@server' }
          : { ok: true, player: '@server', time_ms: 120000, xp: 200 };
  return { ok: true, async json() { return data; } };
}
const source = readFileSync('game/nbg-london-leaderboards.js', 'utf8');
vm.runInNewContext(source, { window, document, fetch, URL, Date, String, Number, Promise, Object, Array, console });
assert.equal(typeof domReady, 'function');
domReady();
async function flush() {
  await new Promise(resolve => setImmediate(resolve));
}
async function emit(type, detail) {
  assert.equal(typeof listeners.get(type), 'function', 'missing event ' + type);
  listeners.get(type)({ detail });
  await flush();
}
function auth(id) { return { id, hash: 'signed-' + id, auth_date: '1800000000' }; }
function requests(path) { return calls.filter(call => call.pathname.endsWith(path)); }
assert.match(elements.get('nbg-record-account').textContent, /Guest/, 'initial guest status is visible');

// A fresh-auth restore can adopt another tab's account. The run remains unranked.
telegramId = '100'; linked = true;
let resolveAuth;
nextAuth = () => new Promise(resolve => { resolveAuth = resolve; });
await emit('nbg-level-started');
telegramId = '200';
resolveAuth(auth('200'));
await flush();
assert.equal(requests('/run/start').length, 0,
  'a run begun under A cannot create its server session as B after renewal');

// Successful A start, then switching to B before finish must not use B's identity.
telegramId = '100';
nextAuth = async () => auth('100');
await emit('nbg-level-started');
assert.equal(requests('/run/start').length, 1, 'same-account run starts normally');
telegramId = '200';
nextAuth = async () => auth('200');
await emit('nbg-level-complete', { timeMs: 120000, xp: 200, coins: 12, secretCoins: 0 });
assert.equal(requests('/run/finish').length, 0,
  'run started as A cannot be submitted under B after an account switch');

// The real identity-change signal must invalidate a pending authenticated run.
telegramId = '100';
const finishResolvers = [];
nextAuth = async () => auth('100');
await emit('nbg-level-started');
assert.equal(requests('/run/start').length, 2);
nextAuth = () => new Promise(resolve => { finishResolvers.push(resolve); });
await emit('nbg-level-complete', { timeMs: 120000, xp: 200, coins: 12, secretCoins: 0 });
assert.equal(finishResolvers.length, 1);
telegramId = '200';
await emit('moonboys:identity-change');
finishResolvers.forEach(resolve => resolve(auth('200')));
await flush();
assert.equal(requests('/run/finish').length, 0,
  'logout or account change during finish authentication blocks submission');

console.log('[PASS] NBG London start/finish Telegram account-race protection');
