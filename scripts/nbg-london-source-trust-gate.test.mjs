import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

// #1530 PR3B source audit. Intentionally has NO trusted score writer.
// A checked-in v2 verifier is not a promise of human input or a source for
// Clout, and a merge is NOT a D1 migration or a Worker deployment.
const read = path => readFileSync(path, 'utf8');
const source = read('workers/leaderboard/nbg-london-records.js');
const replay = read('workers/leaderboard/nbg-london-replay.js');
const entry = read('workers/leaderboard/deployment-entry.js');
const clout = read('workers/moonboys-api/championship/clout-pilot.js');

test('NBG v1 source remains server replay-scored, not raw client XP', () => {
  assert.match(entry, /const NBG_LONDON_REPLAY_VERIFIER = verifyNbgLondonReplay/);
  assert.match(replay, /export const NBG_REPLAY_VERSION = 1/);
  assert.match(source, /\/run\/start/);
  assert.match(source, /\/run\/finish/);
  assert.doesNotMatch(source, /INSERT INTO nbg_london_verified_runs/i,
    'a source-proof writer needs its own separately authorized release');
});

test('prizes and Championship Clout remain independent and locked', () => {
  assert.match(entry, /const NBG_LONDON_PRIZES_RELEASED = false/);
  assert.doesNotMatch(clout, /nbg_london_verified_runs|verified_nbg_replay_v1|verified_nbg_replay_v2|sourceKind === 'nbg_london'/,
    'v1 replay finishes must not silently promote to Championship sources');
  assert.doesNotMatch(source, /CHAMPIONSHIP_CLOUT_NBG_ENABLED|CHAMPIONSHIP_CLOUT_PILOT_ENABLED/,
    'an NBG game finish must not emit Clout without independently verified evidence');
  assert.doesNotMatch(source, /UPDATE\s+arcade_xp_wallets|UPDATE\s+telegram_users\s+SET\s+xp/i,
    'game-score XP is not spendable or community XP');
});

test('existing migration 098 sessions lack durable verified-run proof', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec("CREATE TABLE telegram_users(telegram_id TEXT PRIMARY KEY)");
    db.exec(read('workers/moonboys-api/migrations/098_nbg_london_records.sql'));
    const cols = db.prepare("PRAGMA table_info('nbg_london_runs')").all().map(c => c.name);
    assert.ok(cols.includes('run_id'));
    assert.ok(cols.includes('telegram_id'));
    assert.ok(cols.includes('finish_token'));
    assert.equal(cols.includes('verified_xp'), false);
    assert.equal(cols.includes('challenge_seed'), false);
    assert.equal(db.prepare(
      "SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='nbg_london_verified_runs'"
    ).get().n, 0);
  } finally {
    db.close();
  }
});

test('existing migration 099 keeps legacy totals separate from trusted proof', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec("PRAGMA foreign_keys=ON");
    db.exec("CREATE TABLE telegram_users(telegram_id TEXT PRIMARY KEY)");
    db.exec("INSERT INTO telegram_users(telegram_id) VALUES('100')");
    db.exec(read('workers/moonboys-api/migrations/098_nbg_london_records.sql'));
    db.exec(read('workers/moonboys-api/migrations/099_nbg_london_competition_prizes.sql'));
    db.prepare(
      'INSERT INTO nbg_london_period_scores ' +
      '(period_kind, period_start_ms, telegram_id, display_name, total_xp,' +
      'run_count, best_time_ms, updated_at_ms) VALUES(?,?,?,?,?,?,?,?)'
    ).run('daily', 1792195200000, '100', '@beta', 79615, 1, 86493, 1792195290000);
    const row = db.prepare(
      "SELECT total_xp, run_count, trusted_xp, verified_run_count " +
      "FROM nbg_london_period_scores WHERE telegram_id='100'"
    ).get();
    assert.equal(row.total_xp, 79615);
    assert.equal(row.run_count, 1);
    assert.equal(row.trusted_xp, 0,
      'historical leaderboard XP must never be promoted implicitly');
    assert.equal(row.verified_run_count, 0);
  } finally {
    db.close();
  }
});

test('the rejected draft v2 schema is not an approved production migration', () => {
  const contract = read('scripts/verify-d1-production-migrations.mjs');
  const manifest = read('deployments/d1-evidence-request.json');
  assert.match(contract, /100_championship_clout_foundation\.sql/);
  assert.doesNotMatch(contract, /101_nbg_london_verified_run_receipts\.sql/);
  assert.doesNotMatch(manifest, /101_nbg_london_verified_run_receipts\.sql/);
  assert.doesNotMatch(entry, /NBG_VERIFIED_RUN_RECEIPTS_RELEASED\s*=\s*true/);
});
