import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const client = readFileSync('js/moonpet-mini-app.js', 'utf8');
const start = client.indexOf('  function tickSeasonDisplay() {');
const end = client.indexOf('  // TEST-EXPORT: seasonalStateRefresh:end', start);
assert.ok(start >= 0 && end > start, 'seasonal tick source must exist');
const ticker = client.slice(start, end);

test('season ticker keeps authoritative reconciliation without rebuilding Home every 30 seconds', () => {
  assert.match(ticker, /document\.hidden/);
  assert.match(ticker, /tickCooldownDom\(\)/);
  assert.match(ticker, /refreshSeasonSnapshot\(false\)/);
  assert.doesNotMatch(ticker, /\brender\s*\(/, 'unchanged Home must not be rebuilt by the timer');
  assert.doesNotMatch(ticker, /post\s*\(/, 'ticker must not add API requests');
});

test('authoritative seasonal refresh still renders after saved state is accepted', () => {
  const begin = client.indexOf('  async function refreshSeasonSnapshot(force) {');
  assert.ok(begin >= 0 && begin < start);
  const refresh = client.slice(begin, start);
  assert.match(refresh, /if \(!setStateSnapshot\(data\.state, requestGeneration\)\) return;/);
  assert.match(refresh, /render\(\)/);
  assert.match(refresh, /seasonRefreshBusy/);
});

test('one-second countdown updater stays active', () => {
  assert.match(client, /window\.setInterval\(tickCooldownDom, 1000\)/);
  assert.match(client, /window\.setInterval\(tickSeasonDisplay, 30000\)/);
});
