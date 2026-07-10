import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createLocalStorage(seed = {}) {
  const store = new Map(Object.entries(seed).map(([key, value]) => [key, String(value)]));
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

globalThis.localStorage = createLocalStorage();
globalThis.window = { dispatchEvent() {}, MOONBOYS_API: {} };
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail || {};
  }
};

const { ArcadeSync } = await import(pathToFileURL(path.join(ROOT, 'js/arcade-sync.js')).href);

{
  const clientRunId = ArcadeSync.queuePendingProgress({ game: 'snake-run', raw_score: 1200, meta_points: 20 });
  assert.equal(clientRunId, null, 'competitive queue writes must be disabled');
  assert.equal(ArcadeSync.getPendingCount(), 0, 'disabled competitive queue must report zero pending runs');
  assert.equal(localStorage.getItem(ArcadeSync.PENDING_KEY), null, 'competitive queue key must not be persisted locally');
}

{
  localStorage.setItem(ArcadeSync.PENDING_KEY, JSON.stringify([
    { client_run_id: 'legacy-run', game: 'snake', raw_score: 1000, meta_points: 10, timestamp: Date.now() },
  ]));
  const pending = ArcadeSync.getPendingProgress();
  assert.deepEqual(pending, [], 'legacy local pending runs must be discarded instead of restored');
  assert.equal(localStorage.getItem(ArcadeSync.PENDING_KEY), null, 'legacy pending runs must be cleared from storage');
}

{
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return { ok: true, json: async () => ({ results: [] }) };
  };
  localStorage.setItem(ArcadeSync.PENDING_KEY, JSON.stringify([
    { client_run_id: 'pre-link-run', game: 'snake', raw_score: 1000, meta_points: 10, timestamp: Date.now() },
  ]));
  window.MOONBOYS_IDENTITY = {
    async getFreshTelegramAuth() {
      return { id: '123', hash: 'signed', auth_date: String(Math.floor(Date.now() / 1000)) };
    },
  };
  const summary = await ArcadeSync.syncPendingArcadeProgress();
  assert.equal(summary.skipped, true, 'legacy queued runs must not sync after later linking');
  assert.equal(summary.reason, 'no_local_pending_competitive_runs', 'legacy queued runs must be discarded with the hard-gate reason');
  assert.equal(fetchCalls, 0, 'pre-link competitive runs must never flush after later linking');
}

console.log('Arcade no-local-pending-runs checks passed.');
