import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const listeners = new Map();
let domReady;
function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, []);
  listeners.get(type).push(fn);
}
async function emit(type, detail) {
  for (const fn of listeners.get(type) || []) fn({ detail });
  await flush();
}
function element() {
  const events = new Map();
  return {
    textContent: '', hidden: false, children: [], dataset: {},
    setAttribute() {},
    appendChild(child) { this.children.push(child); },
    replaceChildren(...children) { this.children = children; },
    addEventListener(type, fn) { events.set(type, fn); },
    click() { events.get('click')?.({ preventDefault() {} }); },
    focus() {},
  };
}
const elements = new Map();
for (const id of [
  'nbg-record-status','nbg-record-account','nbg-record-personal',
  'nbg-record-rows','nbg-prize-rows','nbg-prize-cutoff','nbg-hud-player',
  'nbg-record-ranking','nbg-access-gate','nbg-access-gate-message',
  'nbg-access-recheck','nbg-access-login','nbg-access-group',
]) elements.set(id, element());
elements.get('nbg-access-gate').hidden = true;

const document = {
  readyState: 'loading',
  getElementById(id) { return elements.get(id) || null; },
  querySelectorAll() { return []; },
  createElement() { return element(); },
  addEventListener(type, fn) { if (type === 'DOMContentLoaded') domReady = fn; },
};
let telegramId = null;
let linked = false;
let membership = false;
let auth = null;
const gate = {
  getTelegramId() { return telegramId; },
  isTelegramLinked() { return linked; },
  async getFreshTelegramAuth() { return auth; },
};
const calls = [];
async function fetch(url, options = {}) {
  const parsed = new URL(url);
  const body = options.body ? JSON.parse(options.body) : null;
  calls.push({ pathname: parsed.pathname, body });
  if (parsed.pathname === '/telegram/group-membership') {
    return {
      ok: true,
      async json() {
        return { ok: true, member: membership,
          status: membership ? 'member' : 'left', group: '@gkniftyheads' };
      },
    };
  }
  if (parsed.pathname.endsWith('/leaderboard')) return { ok:true, async json(){return {ok:true,records:[]};} };
  if (parsed.pathname.endsWith('/competition')) return { ok:true, async json(){return {ok:true,end_ms:Date.now()+1000,payout_enabled:false,standings:[]};} };
  if (parsed.pathname.endsWith('/me')) return { ok:true, async json(){return {ok:true,player:'@fixture',records:null};} };
  if (parsed.pathname.endsWith('/run/start')) return { ok:true, async json(){return {ok:true,run_id:'00000000-0000-4000-8000-000000000001',player:'@fixture'};} };
  throw Error('unexpected fetch ' + url);
}
const stored = new Map();
const window = {
  MOONBOYS_IDENTITY: gate,
  MOONBOYS_API: {
    CONTEXT: { isProduction: true },
    getApiBase: () => 'https://api.test',
    getLeaderboardUrl: () => 'https://leaderboard.test',
  },
  localStorage: {
    getItem(key) { return stored.get(key) || null; },
    setItem(key,value) { stored.set(key,String(value)); },
    removeItem(key) { stored.delete(key); },
  },
  addEventListener: on,
  dispatchEvent() {},
};
const source = readFileSync('game/nbg-london-leaderboards.js','utf8');
vm.runInNewContext(source, {
  window, document, fetch, URL, Date, String, Number, Promise, Object, Array,
  Map, Set, JSON, console,
});
assert.equal(typeof domReady,'function');
domReady();

async function flush() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}
await flush();

assert.equal(elements.get('nbg-access-gate').hidden,false,
  'production guest must see the access gate');
assert.match(elements.get('nbg-access-gate-message').textContent,/Log in with Telegram/);
assert.equal(elements.get('nbg-access-group').hidden,true,
  'login is the first required action for an anonymous visitor');
assert.equal(calls.some(call => call.pathname === '/telegram/group-membership'),false,
  'anonymous visitor must not query membership with an unverified identity');
assert.deepEqual(await window.NBGLondonBeforeQueuedRun(),{allow:false},
  'guest cannot start the production simulation');

telegramId='123456789';linked=true;
auth={id:telegramId,first_name:'Fixture',auth_date:'1800000000',hash:'s1_'+'A'.repeat(43)};
membership=false;
await emit('moonboys:identity-change');
await flush();
assert.equal(calls.some(call => call.pathname === '/telegram/group-membership'),true);
assert.equal(elements.get('nbg-access-gate').hidden,false);
assert.match(elements.get('nbg-access-gate-message').textContent,/Join the GKniftyHEADS Telegram group/);
assert.equal(elements.get('nbg-access-login').hidden,true,
  'already-linked player is directed to group membership, not login');
assert.deepEqual(await window.NBGLondonBeforeQueuedRun(),{allow:false},
  'linked non-member cannot start NBG London');

membership=true;
elements.get('nbg-access-recheck').click();
await flush();
assert.equal(elements.get('nbg-access-gate').hidden,true,
  'verified group member unlocks the game stage');
assert.deepEqual(await window.NBGLondonBeforeQueuedRun(),{allow:true},
  'linked current group member can start production gameplay');

const level = readFileSync('game/nbg-level1.js','utf8');
const page = readFileSync('games/nbg-london/index.html','utf8');
assert.match(page,/data-nbg-access-gate="telegram-group"/);
assert.match(page,/id="nbg-access-gate"/);
assert.match(page,/https:\/\/t\.me\/gkniftyheads/);
assert.match(level,/accessGateRequired/);
assert.match(level,/access && access\.allow === false/);
assert.match(level,/waitingForFirstInput = true/);
assert.match(level,/pendingJumpPresses = 0/);
assert.match(level,/typeof beforePlay !== 'function'/,
  'missing access controller must also fail closed');

console.log('[PASS] NBG production access: guest blocked, linked non-member blocked, current group member allowed');
