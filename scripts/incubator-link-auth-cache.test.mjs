import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('js/incubator-link.js', 'utf8');
const AUTH_KEY = 'MOONBOYS_TELEGRAM_AUTH';
const LEGACY_KEY = 'moonboys_tg_auth';
const CACHED_AUTH = JSON.stringify({ id: 42, first_name: 'Cached', hash: 'cached_hash' });

function makeElement() {
  return {
    textContent: '',
    classList: {
      values: new Set(),
      add(value) { this.values.add(value); },
      remove(...values) { values.forEach((value) => this.values.delete(value)); },
      toggle(value, enabled) { enabled ? this.values.add(value) : this.values.delete(value); },
    },
  };
}

async function runIncubator(hash, options = {}) {
  const storage = new Map([
    [AUTH_KEY, CACHED_AUTH],
    [LEGACY_KEY, CACHED_AUTH],
  ]);
  const removals = [];
  const writes = [];
  const syncEvents = [];
  const elements = {
    'incubator-sync-state': makeElement(),
    'incubator-sync-identity': makeElement(),
    'incubator-sync-message': makeElement(),
  };

  const location = {
    href: `https://cryptomoonboys.com/gkniftyheads-incubator.html${hash || ''}`,
    hash: hash || '',
    pathname: '/gkniftyheads-incubator.html',
    search: '',
  };

  const context = {
    URL,
    URLSearchParams,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail || {};
      }
    },
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    console: { log() {}, debug() {} },
    setTimeout,
    clearTimeout,
    document: {
      readyState: 'complete',
      getElementById(id) { return elements[id] || null; },
      addEventListener() {},
    },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) {
        writes.push([key, value]);
        storage.set(key, value);
      },
      removeItem(key) {
        removals.push(key);
        storage.delete(key);
      },
    },
    fetch: options.fetch || (async () => ({ ok: false, status: 500, json: async () => ({ ok: false }) })),
  };

  context.window = {
    MOONBOYS_API: { BASE_URL: 'https://api.example.test' },
    MOONBOYS_IDENTITY: options.identity || {
      isTelegramLinked: () => false,
    },
    MOONBOYS_ARCADE_SYNC: {
      syncPendingArcadeProgress: async () => ({}),
    },
    location,
    history: {
      replaceState(_state, _title, nextUrl) {
        location.replacedWith = nextUrl;
      },
    },
    dispatchEvent(event) {
      syncEvents.push(event);
    },
  };
  context.globalThis = context;

  vm.runInNewContext(source, context, { filename: 'js/incubator-link.js' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  return { storage, removals, writes, elements, syncEvents, location };
}

function assertCachePreserved(result, label) {
  assert.equal(result.storage.get(AUTH_KEY), CACHED_AUTH, `${label}: current auth cache preserved`);
  assert.equal(result.storage.get(LEGACY_KEY), CACHED_AUTH, `${label}: legacy auth cache preserved`);
  assert.deepEqual(result.removals, [], `${label}: no cached auth removal calls`);
}

const direct = await runIncubator('');
assertCachePreserved(direct, 'direct visit');
assert.equal(
  direct.elements['incubator-sync-message'].textContent,
  'Use /gklink in the Telegram bot to connect your account.',
  'direct visit shows neutral link instructions',
);

const emptyEquals = await runIncubator('#telegram_auth=');
assertCachePreserved(emptyEquals, '#telegram_auth=');
assert.match(
  emptyEquals.elements['incubator-sync-message'].textContent,
  /Telegram link payload was missing\./,
  '#telegram_auth= shows missing payload callback message',
);

const emptyBare = await runIncubator('#telegram_auth');
assertCachePreserved(emptyBare, '#telegram_auth');
assert.match(
  emptyBare.elements['incubator-sync-message'].textContent,
  /Telegram link payload was missing\./,
  '#telegram_auth shows missing payload callback message',
);

const malformed = await runIncubator('#telegram_auth=not-json-or-base64');
assertCachePreserved(malformed, 'malformed callback');
assert.equal(
  malformed.elements['incubator-sync-message'].textContent,
  'Invalid link. Use /gklink again.',
  'malformed callback shows invalid link instructions',
);

const verifyFailed = await runIncubator('#telegram_auth=%7B%22id%22%3A99%2C%22hash%22%3A%22bad%22%7D', {
  fetch: async () => ({ ok: false, status: 401, json: async () => ({ ok: false, error: 'verification failed' }) }),
});
assertCachePreserved(verifyFailed, 'verification failure');
assert.equal(
  verifyFailed.elements['incubator-sync-message'].textContent,
  'verification failed',
  'verification failure shows worker-provided error',
);

const validPayload = { id: 99, first_name: 'Fresh', hash: 'fresh_hash' };
const valid = await runIncubator(`#telegram_auth=${encodeURIComponent(JSON.stringify(validPayload))}`, {
  fetch: async (_url, request) => {
    assert.equal(request.method, 'POST', 'valid callback posts to confirmation endpoint');
    assert.deepEqual(JSON.parse(request.body), validPayload, 'valid callback posts parsed payload');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        telegram_id: 99,
        telegram_name: 'Fresh User',
        telegram_auth: { id: 99, first_name: 'Fresh', hash: 'fresh_hash_confirmed' },
      }),
    };
  },
  identity: {
    saveTelegramIdentity() {},
    setTelegramLinked: () => true,
  },
});
assert.deepEqual(valid.removals, [], 'valid callback does not remove cached auth before refresh');
assert.equal(
  valid.storage.get(AUTH_KEY),
  JSON.stringify({ id: 99, first_name: 'Fresh', hash: 'fresh_hash_confirmed' }),
  'valid callback stores refreshed current auth payload',
);
assert.equal(
  valid.storage.get(LEGACY_KEY),
  JSON.stringify({ id: 99, first_name: 'Fresh', hash: 'fresh_hash_confirmed' }),
  'valid callback stores refreshed legacy auth payload',
);
assert.equal(
  valid.elements['incubator-sync-message'].textContent,
  'Telegram linked successfully. XP and Block Topia progression are now sync-live.',
  'valid callback shows success status',
);

assert(
  !source.includes('localStorage.removeItem'),
  'incubator-link.js has no deliberate logout/reset cache-clearing path; malformed callbacks must preserve cache',
);

console.log('Incubator auth-cache preservation checks passed.');
