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
  const windowObj = {
    MOONBOYS_API: { BASE_URL: 'https://api.example.test' },
  };
  const context = {
    window: windowObj,
    document,
    localStorage,
    fetch: fetchImpl,
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
  return { api: windowObj.MOONBOYS_IDENTITY, byId, windowObj };
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

console.log('Identity gate auth guard regression checks passed.');
