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
let authError = false;
let membershipHandler = null;
const gate = {
  getTelegramId() { return telegramId; },
  isTelegramLinked() { return linked; },
  async getFreshTelegramAuth() { if (authError) throw Error('auth unavailable'); return auth; },
};
const calls = [];
async function fetch(url, options = {}) {
  const parsed = new URL(url);
  const body = options.body ? JSON.parse(options.body) : null;
  calls.push({ pathname: parsed.pathname, body });
  if (parsed.pathname === '/telegram/group-membership') {
    if (membershipHandler) return membershipHandler(body);
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
  location: { hostname: 'cryptomoonboys.com', protocol: 'https:' },
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
  Map, Set, JSON, console, AbortSignal,
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
assert.equal((await window.NBGLondonBeforeQueuedRun()).allow,false,
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
assert.equal((await window.NBGLondonBeforeQueuedRun()).allow,false,
  'linked non-member cannot start NBG London');

membership=true;
elements.get('nbg-access-recheck').click();
await flush();
assert.equal(elements.get('nbg-access-gate').hidden,true,
  'verified group member unlocks the game stage');
assert.equal((await window.NBGLondonBeforeQueuedRun()).allow,true,
  'linked current group member can start production gameplay');

// A config-script failure on the live host cannot enable guest play.
const config = window.MOONBOYS_API;
window.MOONBOYS_API = null;
telegramId = null; linked = false;
await emit('moonboys:identity-change');
assert.equal((await window.NBGLondonBeforeQueuedRun()).allow, false,
  'missing production config must fail closed');
window.MOONBOYS_API = config;

// A delayed response for A must neither unlock B nor cancel B's current check.
const pendingMembership = [];
membershipHandler = body => new Promise(resolve => {
  pendingMembership.push({ id: String(body.telegram_auth.id), resolve });
});
function reply(member) {
  return { ok: true, status: 200, async json() {
    return { ok: true, member, status: member ? 'member' : 'left' };
  } };
}
function selectOwner(id) {
  telegramId = id; linked = true;
  auth = { id, first_name:'Fixture', auth_date:'1800000000', hash:'s1_'+'A'.repeat(43) };
}
selectOwner('111');
await emit('moonboys:identity-change');
selectOwner('222');
await emit('moonboys:identity-change');
assert.equal(pendingMembership.length, 2);
pendingMembership[0].resolve(reply(true));
await flush();
assert.equal(elements.get('nbg-access-gate').hidden, false,
  'old member A cannot hide the lock while owner B is checking');
const ownerBStart = window.NBGLondonBeforeQueuedRun();
await flush();
assert.equal(pendingMembership.length, 2,
  'A completion must not clear or duplicate B pending request');
pendingMembership[1].resolve(reply(false));
assert.equal((await ownerBStart).allow, false);
assert.match(elements.get('nbg-access-gate-message').textContent, /Join the GKniftyHEADS/);

// Conversely, a stale denial must not relock a newly verified member.
pendingMembership.length = 0;
selectOwner('333');
await emit('moonboys:identity-change');
selectOwner('444');
await emit('moonboys:identity-change');
pendingMembership[1].resolve(reply(true));
await flush();
assert.equal(elements.get('nbg-access-gate').hidden, true);
pendingMembership[0].resolve(reply(false));
await flush();
assert.equal(elements.get('nbg-access-gate').hidden, true,
  'old non-member response cannot relock current member');
assert.equal((await window.NBGLondonBeforeQueuedRun()).allow, true);

// A forced recheck must revoke the previous cached grant even if auth throws.
membershipHandler = null;
authError = true;
elements.get('nbg-access-recheck').click();
await flush();
assert.equal(elements.get('nbg-access-gate').hidden, false);
assert.equal((await window.NBGLondonBeforeQueuedRun()).allow, false,
  'cached permission cannot survive a failed recheck');
authError = false;
membership = true;
elements.get('nbg-access-recheck').click();
await flush();
assert.equal((await window.NBGLondonBeforeQueuedRun()).allow, true);

// Each reset invalidates permission before the next start.
membership = false;
await emit('nbg-level-reset');
assert.equal((await window.NBGLondonBeforeQueuedRun()).allow, false,
  'leaving the group prevents the next run, even within the cache window');

// The normal expired-credential response must show a login recovery action.
membershipHandler = async () => ({
  ok: false, status: 401, async json() { return { ok:false, error:'website_session_expired' }; },
});
elements.get('nbg-access-recheck').click();
await flush();
assert.equal(elements.get('nbg-access-login').hidden, false);
assert.match(elements.get('nbg-access-gate-message').textContent, /Log in with Telegram again/);

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

// Execute the real game start function with only its simulation dependencies
// stubbed. These checks assert running/input state, rather than source text.
const beginSource = level.slice(level.indexOf('    function beginGameplay(control)'),
  level.indexOf("    window.addEventListener('moonboys:identity-change', cancelQueuedStartIfOwnerChanged);"));
assert.ok(beginSource.startsWith('    function beginGameplay(control)'));
function startHarness(controller, required = true) {
  const window = {
    NBGLevel1State: {},
    NBGLondonBeforeQueuedRun: controller,
    MOONBOYS_IDENTITY: { getTelegramId: () => '444', isTelegramLinked: () => true },
  };
  return vm.runInNewContext(`
    var running = false, assetsLoaded = true, complete = false, gameOver = false;
    var runSequence = 0, pendingRunStartPromise = null, pendingRunOwner = null;
    var pendingJumpPresses = 1, pendingInitialInput = {control:'jump'};
    var initialInputReplay = null, waitingForFirstInput = true, starts = 0;
    function clearInput() { pendingInitialInput = null; }
    function updateHud() {}
    function cancelQueuedStartIfOwnerChanged() {}
    function startSimulation() {
      running = true; waitingForFirstInput = false; starts++; runSequence++;
      return Promise.resolve(window.NBGLevel1State);
    }
    ${beginSource}
    ({
      start: beginGameplay,
      reset() {
        running = false; runSequence++;
        pendingRunStartPromise = null; pendingRunOwner = null;
        pendingJumpPresses = 1; pendingInitialInput = {control:'jump'};
        waitingForFirstInput = true;
      },
      controller(fn) { window.NBGLondonBeforeQueuedRun = fn; },
      state() { return {running, waitingForFirstInput, pendingJumpPresses, starts,
        pending: !!pendingRunStartPromise}; }
    })
  `, {
    window, Promise,
    document: { getElementById: () => ({
      getAttribute: () => required ? 'telegram-group' : null,
    }) },
  });
}
for (const controller of [
  undefined,
  () => undefined,
  () => ({ allow:false }),
  () => ({}),
  () => { throw Error('controller failure'); },
  () => Promise.resolve(undefined),
  () => Promise.resolve({}),
  () => Promise.reject(Error('async controller failure')),
]) {
  const game = startHarness(controller);
  await game.start('jump');
  assert.equal(game.state().running, false, 'invalid access never starts production physics');
  assert.equal(game.state().pendingJumpPresses, 0, 'denied jump input is discarded');
  assert.equal(game.state().pending, false, 'denied checks remain retryable');
}
for (const controller of [() => ({allow:true}), () => Promise.resolve({allow:true})]) {
  const game = startHarness(controller);
  await game.start('jump');
  assert.equal(game.state().starts, 1, 'explicit permission starts exactly once');
}
const local = startHarness(undefined, false);
await local.start('jump');
assert.equal(local.state().starts, 1, 'ungated local gameplay remains available');

for (const rejectOld of [false, true]) {
  let resolveOld, rejectPrevious;
  const game = startHarness(() => new Promise((resolve,reject) => {
    resolveOld = resolve; rejectPrevious = reject;
  }));
  const oldStart = game.start('jump');
  game.reset();
  let resolveNew;
  game.controller(() => new Promise(resolve => { resolveNew = resolve; }));
  const newStart = game.start('jump');
  if (rejectOld) rejectPrevious(Error('stale network failure'));
  else resolveOld({allow:false});
  await oldStart;
  assert.equal(game.state().pending, true, 'stale result cannot cancel the new start');
  assert.equal(game.state().pendingJumpPresses, 1, 'stale result cannot erase new jump input');
  resolveNew({allow:true});
  await newStart;
  assert.equal(game.state().starts, 1);
  assert.equal(game.state().waitingForFirstInput, false);
}
console.log('[PASS] NBG start gate: invalid controllers blocked and stale requests cannot change new runs');
