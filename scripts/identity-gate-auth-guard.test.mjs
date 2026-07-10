import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('js/identity-gate.js', 'utf8');

function createDomStub() {
  const byId = new Map();

  function makeNode(tagName = 'div') {
    const listeners = new Map();
    const node = {
      tagName: String(tagName || 'div').toUpperCase(),
      id: '',
      className: '',
      style: {},
      attributes: {},
      innerHTML: '',
      children: [],
      parentNode: null,
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
      appendChild(child) {
        if (!child || typeof child !== 'object') return child;
        child.parentNode = this;
        this.children.push(child);
        if (child.id) byId.set(child.id, child);
        return child;
      },
      addEventListener(type, handler) {
        listeners.set(type, handler);
      },
      querySelector() {
        return {
          addEventListener() {},
          focus() {},
        };
      },
    };
    return node;
  }

  const document = {
    readyState: 'complete',
    head: makeNode('head'),
    body: makeNode('body'),
    createElement(tagName) {
      return makeNode(tagName);
    },
    getElementById(id) {
      return byId.get(id) || null;
    },
    addEventListener() {},
  };
  return { document, byId };
}

function createLocalStorage(seed = {}) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, String(v)]));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

async function bootstrapIdentity({ storageSeed, fetchImpl }) {
  const { document, byId } = createDomStub();
  const localStorage = createLocalStorage(storageSeed);
  const fetchCalls = [];
  const windowObj = {
    MOONBOYS_API: { BASE_URL: 'https://api.example.test' },
  };
  const context = {
    window: windowObj,
    document,
    localStorage,
    fetch: async function (...args) {
      fetchCalls.push(args);
      return fetchImpl(...args);
    },
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail || {};
      }
    },
    setTimeout,
    clearTimeout,
    console: { log() {}, warn() {}, error() {}, info() {} },
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'js/identity-gate.js' });
  return { api: windowObj.MOONBOYS_IDENTITY, byId, windowObj, fetchCalls };
}

async function waitTick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

{
  let allowed = false;
  const { api, byId } = await bootstrapIdentity({
    storageSeed: {
      moonboys_tg_id: '123',
      moonboys_tg_linked: '1',
    },
    fetchImpl: async () => {
      throw new Error('network_down');
    },
  });
  api.requireLinkedAccount(() => {
    allowed = true;
  });
  await waitTick();
  assert.equal(allowed, false, 'protected gate must fail closed when status check fails');
  const verifyModal = byId.get('tg-status-verify-modal');
  assert.ok(verifyModal, 'status verification failure modal should render');
  assert.ok(
    verifyModal.innerHTML.includes('Server check failed — try again.') &&
      verifyModal.innerHTML.includes('Telegram status could not be verified.'),
    'failure modal should include clear verification retry copy',
  );
}

{
  let allowed = false;
  const { api } = await bootstrapIdentity({
    storageSeed: {
      moonboys_tg_id: '123',
      moonboys_tg_linked: '1',
    },
    fetchImpl: async () => {
      throw new Error('network_down');
    },
  });
  api.requireLinkedAccount(() => {
    allowed = true;
  }, { mode: 'display' });
  await waitTick();
  assert.equal(allowed, true, 'display mode should permit non-protected fallback when status check fails');
}

{
  let allowed = false;
  const { api } = await bootstrapIdentity({
    storageSeed: {},
    fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
  });
  api.requireLinkedAccount(() => {
    allowed = true;
  }, { soft: true });
  await waitTick();
  assert.equal(allowed, true, 'soft mode should allow intentionally display-only views without Telegram link');
}

// protected mode + malformed JSON does not call onAllowed()
{
  let allowed = false;
  const { api, byId } = await bootstrapIdentity({
    storageSeed: {
      moonboys_tg_id: '123',
      moonboys_tg_linked: '1',
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
    }),
  });
  api.requireLinkedAccount(() => {
    allowed = true;
  });
  await waitTick();
  assert.equal(allowed, false, 'protected gate must fail closed when JSON parse fails');
  const verifyModal = byId.get('tg-status-verify-modal');
  assert.ok(verifyModal, 'status verification failure modal should render for malformed JSON');
}

// protected mode + missing API base does not call onAllowed(), shows unavailable copy
{
  let allowed = false;
  const { api, byId, windowObj } = await bootstrapIdentity({
    storageSeed: {
      moonboys_tg_id: '123',
      moonboys_tg_linked: '1',
    },
    fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
  });
  windowObj.MOONBOYS_API = {};
  api.requireLinkedAccount(() => {
    allowed = true;
  });
  await waitTick();
  assert.equal(allowed, false, 'protected gate must fail closed when API base is missing');
  const verifyModal = byId.get('tg-status-verify-modal');
  assert.ok(verifyModal, 'status verification unavailable modal should render when base is missing');
  assert.ok(
    verifyModal.innerHTML.includes('Status verification unavailable.'),
    'modal should say "Status verification unavailable." not "Server check failed" when base is missing',
  );
  assert.ok(
    verifyModal.innerHTML.includes('Refresh or reconnect Telegram.'),
    'modal body should instruct user to reconnect Telegram when config is missing',
  );
}

// display mode still allows fallback when JSON parse fails
{
  let allowed = false;
  const { api } = await bootstrapIdentity({
    storageSeed: {
      moonboys_tg_id: '123',
      moonboys_tg_linked: '1',
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
    }),
  });
  api.requireLinkedAccount(() => {
    allowed = true;
  }, { mode: 'display' });
  await waitTick();
  assert.equal(allowed, true, 'display mode should allow fallback even when JSON parse fails');
}

// valid not-blocked JSON still calls onAllowed()
{
  let allowed = false;
  const { api } = await bootstrapIdentity({
    storageSeed: {
      moonboys_tg_id: '123',
      moonboys_tg_linked: '1',
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ anticheat: { is_blocked: false } }),
    }),
  });
  api.requireLinkedAccount(() => {
    allowed = true;
  });
  await waitTick();
  assert.equal(allowed, true, 'valid not-blocked status response must call onAllowed()');
}

// shared fresh-auth helper restores linked auth and returns the signed payload
{
  const restoredAuth = { id: '123', hash: 'signed', auth_date: String(Math.floor(Date.now() / 1000)) };
  const { api } = await bootstrapIdentity({
    storageSeed: {
      moonboys_tg_id: '123',
      moonboys_tg_linked: '1',
      moonboys_tg_auth: JSON.stringify({ id: '123' }),
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        linked: true,
        telegram_id: '123',
        telegram_auth: restoredAuth,
      }),
    }),
  });
  const fresh = await api.getFreshTelegramAuth();
  assert.equal(fresh && fresh.id, restoredAuth.id, 'getFreshTelegramAuth should restore the expected Telegram id');
  assert.equal(fresh && fresh.hash, restoredAuth.hash, 'getFreshTelegramAuth should restore the expected signed hash');
  assert.equal(fresh && fresh.auth_date, restoredAuth.auth_date, 'getFreshTelegramAuth should restore the expected auth_date');
}

// shared fresh-auth helper fails closed when API base is missing
{
  const { api, windowObj } = await bootstrapIdentity({
    storageSeed: {
      moonboys_tg_id: '123',
      moonboys_tg_linked: '1',
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        linked: true,
        telegram_id: '123',
        telegram_auth: { id: '123', hash: 'signed', auth_date: String(Math.floor(Date.now() / 1000)) },
      }),
    }),
  });
  windowObj.MOONBOYS_API = {};
  const fresh = await api.getFreshTelegramAuth();
  assert.equal(fresh, null, 'getFreshTelegramAuth must fail closed when API config is missing');
}

// blocked JSON shows blocked modal and does not call onAllowed()
{
  let allowed = false;
  const { api, byId } = await bootstrapIdentity({
    storageSeed: {
      moonboys_tg_id: '123',
      moonboys_tg_linked: '1',
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        anticheat: { is_blocked: true, blocked_reason: 'Suspicious activity.' },
      }),
    }),
  });
  api.requireLinkedAccount(() => {
    allowed = true;
  });
  await waitTick();
  assert.equal(allowed, false, 'blocked account must not call onAllowed()');
  const blockedModal = byId.get('tg-blocked-gate-modal');
  assert.ok(blockedModal, 'blocked modal should render for blocked account');
}

// guest direct competitive route is blocked and opens the Telegram activation modal
{
  const { api, byId } = await bootstrapIdentity({
    storageSeed: {},
    fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
  });
  const result = await api.enforceCompetitiveArcadePageGate({ gameId: 'snake-run' });
  assert.equal(result.ok, false, 'guest direct route must be blocked');
  assert.equal(result.reason, 'not_linked', 'guest direct route should fail as not_linked');
  assert.ok(byId.get('tg-sync-gate-modal'), 'guest direct route should render the Telegram activation modal');
}

// Telegram auth without /gklink activation is blocked
{
  const { api, byId } = await bootstrapIdentity({
    storageSeed: {
      moonboys_tg_id: '123',
    },
    fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
  });
  const result = await api.enforceCompetitiveArcadePageGate({ gameId: 'pac-chain' });
  assert.equal(result.ok, false, 'Telegram-only identity must not pass competitive route gate');
  assert.equal(result.reason, 'not_linked', 'Telegram-only identity should still be treated as not_linked');
  assert.ok(byId.get('tg-sync-gate-modal'), 'Telegram-only identity should render the activation modal');
}

// fabricated localStorage identity cannot bypass server verification
{
  const { api, byId } = await bootstrapIdentity({
    storageSeed: {
      moonboys_tg_id: '123',
      moonboys_tg_linked: '1',
      moonboys_tg_auth: JSON.stringify({ id: '123', hash: 'signed', auth_date: String(Math.floor(Date.now() / 1000)) }),
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ linked: false, telegram_id: null, error: 'not_linked' }),
    }),
  });
  const result = await api.enforceCompetitiveArcadePageGate({ gameId: 'crystal-quest' });
  assert.equal(result.ok, false, 'fabricated local identity must not pass competitive route access');
  assert.equal(result.reason, 'not_linked', 'fabricated local identity should fail as not_linked when the server cannot confirm /gklink');
  assert.ok(byId.get('tg-sync-gate-modal'), 'fabricated local identity should render the Telegram activation modal');
}

// fresh local auth with failed server verification is still blocked
{
  const freshAuth = { id: '123', hash: 'signed', auth_date: String(Math.floor(Date.now() / 1000)) };
  const { api, byId } = await bootstrapIdentity({
    storageSeed: {
      moonboys_tg_id: '123',
      moonboys_tg_linked: '1',
      moonboys_tg_auth: JSON.stringify(freshAuth),
    },
    fetchImpl: async () => ({ ok: true, json: async () => ({ linked: true, telegram_id: '123' }) }),
  });
  const result = await api.enforceCompetitiveArcadePageGate({ gameId: 'invaders-3008' });
  assert.equal(result.ok, false, 'missing server-restored signed auth must still block the competitive route gate');
  assert.equal(result.reason, 'auth_restore_failed', 'missing server-restored signed auth must fail closed');
  assert.ok(byId.get('tg-sync-gate-modal'), 'failed server verification should render the Telegram activation modal');
}

// network/preflight failure blocks gameplay
{
  const freshAuth = { id: '123', hash: 'signed', auth_date: String(Math.floor(Date.now() / 1000)) };
  const { api, byId } = await bootstrapIdentity({
    storageSeed: {
      moonboys_tg_id: '123',
      moonboys_tg_linked: '1',
      moonboys_tg_auth: JSON.stringify(freshAuth),
    },
    fetchImpl: async () => {
      throw new Error('network_down');
    },
  });
  const result = await api.enforceCompetitiveArcadePageGate({ gameId: 'invaders-3008' });
  assert.equal(result.ok, false, 'preflight network failure must block gameplay');
  assert.equal(result.reason, 'auth_restore_failed', 'preflight network failure must fail closed');
  assert.ok(byId.get('tg-sync-gate-modal'), 'preflight network failure should render the Telegram activation modal');
}

// linked fresh auth is allowed only after server verification
{
  const freshAuth = { id: '123', hash: 'signed', auth_date: String(Math.floor(Date.now() / 1000)) };
  const { api, fetchCalls } = await bootstrapIdentity({
    storageSeed: {
      moonboys_tg_id: '123',
      moonboys_tg_linked: '1',
      moonboys_tg_auth: JSON.stringify(freshAuth),
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        linked: true,
        telegram_id: '123',
        telegram_auth: freshAuth,
        anticheat: { is_blocked: false },
      }),
    }),
  });
  const result = await api.enforceCompetitiveArcadePageGate({ gameId: 'invaders-3008' });
  assert.equal(result.ok, true, 'server-verified linked fresh-auth user must be allowed through the competitive route gate');
  assert.equal(result.telegram_auth && result.telegram_auth.id, '123', 'allowed route should return the server-verified signed auth payload');
  assert.equal(result.verified_by_server, true, 'allowed route should be marked as server-verified');
  assert.equal(fetchCalls.length, 1, 'competitive route gate must always hit the server preflight');
  const requestBody = JSON.parse(fetchCalls[0][1].body);
  assert.equal(requestBody.force, true, 'competitive route gate must force server-side verification');
}

console.log('Identity gate auth guard regression checks passed.');
