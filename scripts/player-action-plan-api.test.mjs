import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createReadOnlyActionPlanDb, isReadOnlyActionPlanSql } from '../workers/moonboys-api/player-action-plan/read-only-db.js';
import { ACTION_PLAN_SOURCE_REGISTRY, buildPlayerActionPlanSources } from '../workers/moonboys-api/player-action-plan/sources.js';
import { handlePlayerActionPlanRoute } from '../workers/moonboys-api/routes/player-action-plan.js';
import { isoWeek, nextUtcDay, paginateActionPlan } from '../workers/moonboys-api/player-action-plan/schema.js';

function fakeDb(options = {}) {
  const calls = [];
  const tables = options.tables || null;
  const ownedPets = [
    {
      pet_id: 'pet-secret-123', season_key: '2026-Q4', slot_number: 1, stage: 'hatched', level: 4,
      pet_xp: options.bossReady ? 640 : 90, hunger: 20, happiness: 70, cleanliness: 60, energy: 55, health: 80,
      status: 'active', created_at: '2026-10-01T00:00:00.000Z', last_decay_at: options.idleCare ? '2026-10-16T12:00:00.000Z' : '2026-10-17T11:59:40.000Z', journey_clock: 'legacy_quarter', is_active: 1, lifecycle_phase: 'young',
    },
    {
      pet_id: 'pet-secret-456', season_key: '2026-Q4', slot_number: 2, stage: 'hatched', level: 3,
      pet_xp: 50, hunger: 75, happiness: 70, cleanliness: 65, energy: 55, health: 80,
      status: 'active', created_at: '2026-10-02T00:00:00.000Z', last_decay_at: '2026-10-17T11:59:40.000Z', journey_clock: 'legacy_quarter', is_active: 0, lifecycle_phase: 'young',
    },
    {
      pet_id: 'pet-secret-789', season_key: '2026-Q4', slot_number: 3, stage: 'hatched', level: 5,
      pet_xp: 150, hunger: 60, happiness: 65, cleanliness: 70, energy: 75, health: 85,
      status: 'active', created_at: '2026-10-03T00:00:00.000Z', last_decay_at: '2026-10-17T11:59:40.000Z', journey_clock: 'legacy_quarter', is_active: 0, lifecycle_phase: 'young',
    },
  ];
  for (const pet of ownedPets) pet.ownership_created_at = pet.created_at;
  if (options.ownershipClock) {
    ownedPets[0].journey_clock = 'created_at';
    ownedPets[0].ownership_created_at = '2026-10-15T00:00:00.000Z';
  }
  return {
    calls,
    prepare(sql) {
      const statement = { sql, params: [] };
      return {
        bind(...params) {
          statement.params = params;
          return {
            async first() {
              calls.push({ method: 'first', ...statement });
              if (/sqlite_master/u.test(sql)) {
                // Distinguish a missing D1 table from a failed sqlite_master read.
                if (options.tableErrors?.has(String(params[0]))) {
                  throw new Error('simulated_d1_table_probe_timeout');
                }
                const present = !tables || tables.has(String(params[0]));
                return present ? { name: params[0] } : null;
              }
              return null;
            },
            async all() {
              calls.push({ method: 'all', ...statement });
              if (/FROM telegram_users/u.test(sql)) return { success: true, results: [{ telegram_id: params[0] }] };
              if (/FROM telegram_faction_members/u.test(sql)) return { success: true, results: [{ faction_id: 2, name: 'graffpunks' }] };
              if (/FROM arcade_progression_state/u.test(sql)) return { success: true, results: [{ arcade_xp_total: 1200 }] };
              if (/FROM player_daily_mission_state/u.test(sql)) return { success: true, results: options.savedMissions
                ? [{ mission_id: 'gp_chaos_3', progress: 2, completed: 0 },
                   { mission_id: 'gp_combo_x3', progress: 3, completed: 1 }] : [] };
              if (/FROM telegram_pet_instances/u.test(sql)) return { success: true, results: options.noPets ? [] : options.threePets ? ownedPets : ownedPets.slice(0, 1) };
              if (/telegram_community_xp_awards/u.test(sql)) return { success: true, results: [] };
              if (/daily_opportunity_state/u.test(sql)) return { success: true, results: [{ chain_depth: 2, updated_at: '2026-10-17T01:00:00Z' }] };
              if (/FROM daily_wtf_events e/u.test(sql)) return { success: true, results: [{
                event_id: 'hidden-event', starts_at: '2026-10-17T11:00:00Z', ends_at: '2026-10-17T13:00:00Z',
                player_status: options.wtfState || null,
                checked_in_at: options.wtfState === 'checked_in' ? '2026-10-17T11:30:00Z' : null,
                completed_at: options.wtfState === 'completed' ? '2026-10-17T11:45:00Z' : null,
                missed_at: null,
              }] };
              if (/FROM telegram_pet_daily_completion/u.test(sql)) {
                if (/COUNT\(\*\)/u.test(sql)) return { success: true, results: [{
                  total: options.manyPending ? 137 : options.savedOldClaims ? 1 : 0,
                }] };
                if (/utc_day<>\?/u.test(sql)) {
                  if (options.manyPending) return { success: true, results: Array.from({ length: 100 }, (_, i) => ({
                    utc_day: new Date(Date.UTC(2026, 9, 16-i)).toISOString().slice(0,10),
                    progress_bits: 255, claimed_at: null, pet_id: 'pet-secret-123',
                  })) };
                  return { success: true, results: options.savedOldClaims
                    ? [{ utc_day: '2026-10-16', progress_bits: 255, claimed_at: null, pet_id: 'pet-secret-123' }] : [] };
                }
                return { success: true, results: [{ utc_day: '2026-10-17',
                  progress_bits: options.savedOldClaims || options.manyPending ? 137 : 255,
                  claimed_at: null, pet_id: 'pet-secret-123' }] };
              }
              if (/FROM telegram_pet_activity_sessions/u.test(sql) && (options.savedStates || options.activityEndsAt || options.malformedMetadata)) return { success: true, results: [{
                status: 'active', started_at: options.activityStartsAt || '2026-10-17T11:50:00Z',
                ends_at: options.activityEndsAt || '2026-10-17T13:50:00Z',
                claimed_at: null,
                metadata: options.malformedMetadata ? '{bad-json' : '{"pet_id":"pet-secret-123"}',
              }] };
              if (/FROM telegram_pet_runs/u.test(sql) && options.savedStates) return { success: true, results: [{ source_id: 'source-run-789', pet_id: 'pet-secret-789', status: 'extractable', updated_at: '2026-10-17T11:55:00Z' }] };
              if (/FROM telegram_pet_contracts/u.test(sql) && (options.savedStates || options.pendingContracts)) return { success: true, results: options.pendingContracts
                ? [{ source_id: 'source-contract-456', pet_id: 'pet-secret-456', status: 'completed', reward_xp: 20, reward_settled: 0, updated_at: '2026-10-16T11:54:00Z' }]
                : [{ source_id: 'source-contract-456', pet_id: 'pet-secret-456', status: 'active', updated_at: '2026-10-17T11:54:00Z' }] };
              if (/FROM telegram_pet_weekly_boss_victories_by_pet v\s+LEFT JOIN telegram_pet_weekly_boss_events a/su.test(sql)
                  && options.bossVictoryBeforePetWeek) {
                return { success: true, results: [{ pet_id: 'pet-secret-123', season_key: '2026-Q4',
                  defeated_at: '2026-10-13T12:00:00Z',
                  victory_day: options.bossVictoryDay || '2026-10-13' }] };
              }
              if (/FROM telegram_pet_weekly_boss_victories_by_pet v\s+JOIN telegram_pet_weekly_boss_progress p/su.test(sql) && options.pendingBossRewards) {
                return { success: true, results: [{ pet_id: 'pet-secret-456', season_key: '2026-Q3',
                  week_key: '2026-W32', boss_id: 'boss-1' }] };
              }
              if (/FROM telegram_pet_events\s+WHERE telegram_id=\? AND status='accepted'/su.test(sql) && options.bossParticipation) {
                return { success: true, results: [{ pet_id: 'pet-secret-123', season_key: '2026-Q4' }] };
              }
              if (/event_type='weekly_boss'.*reason='weekly_boss_attempt'/su.test(sql) && options.bossAttempt) return { success: true, results: [{ event_id: 'attempt-1' }] };
              if (/FROM dead_run_sessions.*status='active'/su.test(sql)) return { success: true, results: options.deadRunActive ? [{ session_id: 'active-run' }] : [] };
              if (/FROM dead_run_sessions.*status='finished'.*ranked=1/su.test(sql)) return { success: true, results: options.deadRunVerified ? [{ score: 4321, ended_at: '2026-10-17T11:00:00Z' }] : [] };
              if (/championship_clout_daily/u.test(sql)) return { success: true, results: [{ total_points: 18, recalculated_at_ms: 1792195200000 }] };
              if (/nbg_london_records/u.test(sql)) return { success: true, results: [{ fastest_ms: 50000, best_xp: 30 }] };
              if (/COUNT\(\*\)/u.test(sql)) return { success: true, results: [{ total: 0 }] };
              return { success: true, results: [] };
            },
            async run() { throw new Error('mutation attempted'); },
          };
        },
      };
    },
  };
}

function sqliteD1(database) {
  return {
    prepare(sql) {
      const statement = database.prepare(sql);
      return {
        bind(...params) {
          return {
            async first() { return statement.get(...params) || null; },
            async all() { return { success: true, results: statement.all(...params) }; },
          };
        },
      };
    },
  };
}

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://example.test' } });
const err = (message, status = 400) => json({ error: message }, status);
const options = (overrides = {}) => ({
  json, err,
  verifyIdentity: async (body) => {
    const payload = body?.telegram_auth;
    if (!payload?.id || !payload?.auth_date || !payload?.hash) return { error: 'verified telegram_auth payload required', status: 401 };
    if (Date.now() / 1000 - Number(payload.auth_date) > 86400) return { error: 'Telegram auth data has expired', status: 401 };
    return { telegramId: String(payload.id) };
  },
  enforceRateLimit: async () => null,
  now: '2026-10-17T12:00:00.000Z',
  ...overrides,
});
const auth = (extra = {}) => ({ telegram_auth: { id: '123456', auth_date: String(Math.floor(Date.now() / 1000)), hash: '0'.repeat(64) }, ...extra });
const request = (body) => new Request('https://api.example.test/player/action-plan', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.test' }, body: JSON.stringify(body),
});

test('read-only facade rejects mutation-shaped SQL and never exposes run or batch', async () => {
  assert.equal(isReadOnlyActionPlanSql('SELECT 1'), true);
  assert.equal(isReadOnlyActionPlanSql('WITH x AS (SELECT 1) SELECT * FROM x'), true);
  assert.equal(isReadOnlyActionPlanSql('PRAGMA writable_schema=ON'), false);
  assert.equal(isReadOnlyActionPlanSql('UPDATE users SET x=1'), false);
  assert.equal(isReadOnlyActionPlanSql('WITH x AS (DELETE FROM users RETURNING *) SELECT * FROM x'), false);
  const db = createReadOnlyActionPlanDb(fakeDb(), { maxStatements: 1 });
  assert.equal(typeof db.run, 'undefined');
  await db.all('SELECT 1');
  await assert.rejects(() => db.all('SELECT 2'), /query_budget_exceeded/u);
  const hanging = { prepare: () => ({ bind: () => ({ all: () => new Promise(() => {}) }) }) };
  const timed = createReadOnlyActionPlanDb(hanging, { statementTimeoutMs: 10 });
  await assert.rejects(() => timed.all('SELECT 1'), /query_timeout/u);
});

test('runtime source manifest exactly matches the reviewed 28-source registry', () => {
  const registry = JSON.parse(fs.readFileSync(new URL('../data/player-action-plan-source-registry.v1.json', import.meta.url), 'utf8'));
  assert.deepEqual(ACTION_PLAN_SOURCE_REGISTRY.map((source) => source.key), registry.sources.map((source) => source.key));
});

test('all targeted source queries compile against the current D1 schema', async () => {
  const database = new DatabaseSync(':memory:');
  database.exec(fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8'));
  database.exec(`
    CREATE TABLE daily_wtf_events (event_id TEXT, utc_day TEXT, starts_at TEXT, ends_at TEXT);
    CREATE TABLE daily_wtf_player_events (
      telegram_id TEXT, utc_day TEXT, event_id TEXT, status TEXT,
      checked_in_at TEXT, completed_at TEXT, missed_at TEXT, reward_status TEXT
    );
    CREATE TABLE daily_missed_perks (telegram_id TEXT);
    CREATE TABLE daily_opportunity_state (telegram_id TEXT, utc_day TEXT, chain_depth INTEGER, updated_at TEXT);
    CREATE TABLE wiki_mission_completions (telegram_id TEXT, mission_window TEXT, created_at TEXT);
    CREATE TABLE telegram_pet_weekly_boss_progress (
      telegram_id TEXT, week_key TEXT, boss_id TEXT, defeated_at TEXT, reward_claimed_at TEXT
    );
    CREATE TABLE telegram_pet_weekly_boss_events (
      telegram_id TEXT, week_key TEXT, boss_id TEXT, event_key TEXT, day_key TEXT,
      action TEXT, damage INTEGER
    );
    CREATE TABLE telegram_pet_weekly_boss_victories_by_pet (
      telegram_id TEXT, week_key TEXT, boss_id TEXT, pet_id TEXT, season_key TEXT,
      victory_event_key TEXT, defeated_at TEXT
    );
    INSERT INTO telegram_users (telegram_id) VALUES ('schema-owner');
    INSERT INTO telegram_pet_profiles (telegram_id, stage) VALUES ('schema-owner', 'hatched');
    INSERT INTO telegram_pet_season_slots
      (pet_id, telegram_id, season_key, slot_number, acquisition_type, journey_clock)
      VALUES ('schema-pet', 'schema-owner', '2026-Q4', 1, 'free', 'legacy_quarter');
    INSERT INTO telegram_pet_instances
      (pet_id, telegram_id, season_key, slot_number, stage, level, source_profile_updated_at)
      VALUES ('schema-pet', 'schema-owner', '2026-Q4', 1, 'hatched', 4, '2026-10-01T00:00:00Z');
    INSERT INTO telegram_pet_active_slots (telegram_id, pet_id, season_key)
      VALUES ('schema-owner', 'schema-pet', '2026-Q4');
    INSERT INTO telegram_pet_season_slots
      (pet_id, telegram_id, season_key, slot_number, acquisition_type, journey_clock, status)
      VALUES ('historical-pet', 'schema-owner', '2026-Q3', 1, 'free', 'legacy_quarter', 'archived');
    INSERT INTO telegram_pet_instances
      (pet_id, telegram_id, season_key, slot_number, stage, level, status, source_profile_updated_at)
      VALUES ('historical-pet', 'schema-owner', '2026-Q3', 1, 'hatched', 9, 'archived', '2026-07-01T00:00:00Z');
  `);
  const db = createReadOnlyActionPlanDb(sqliteD1(database), { maxStatements: 80 });
  const projection = await buildPlayerActionPlanSources(db, 'schema-owner', { now: '2026-10-17T12:00:00Z' });
  assert.equal(Object.values(projection.source_status).some((status) => status.state === 'query_failed'), false,
    JSON.stringify(projection.source_status));
  assert.equal(projection.read_context.pet_count, 1);
  assert.ok(db.stats().statement_count <= 80);
  database.close();
});

test('authenticated endpoint covers every source, scopes pets opaquely, and is cache-proof', async () => {
  const db = fakeDb();
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })), { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store, private');
  assert.equal(response.headers.get('Pragma'), 'no-cache');
  assert.equal(response.headers.get('Vary'), 'Origin');
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.read_only, true);
  assert.equal(payload.source_coverage.registered, 28);
  assert.equal(payload.source_coverage.represented, 28);
  assert.ok(payload.query_budget.statement_count <= 80);
  assert.ok(payload.top_actions.length <= 3);
  assert.ok(payload.top_actions.every((entry) => ['ready', 'claim_ready', 'active'].includes(entry.status) && ['live','live_empty'].includes(entry.source_health) && !entry.blocking_reason_code));
  assert.ok(payload.top_actions.every((entry) => ['server_receipt', 'server_projection'].includes(entry.evidence.kind)));
  assert.deepEqual(new Set(Object.keys(payload.source_status)), new Set(ACTION_PLAN_SOURCE_REGISTRY.map((source) => source.key)));
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /123456/u);
  assert.doesNotMatch(serialized, /pet-secret-123/u);
  assert.match(serialized, /pap_[a-f0-9]{24}/u);
  assert.equal(db.calls.some((call) => !/^\s*(SELECT|WITH)\b/iu.test(call.sql)), false);
});

test('zero-pet response stays complete and blocks pet work without fabricating state', async () => {
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })), { DB: fakeDb({ noPets: true }), TELEGRAM_BOT_TOKEN: 'test' }, options());
  const payload = await response.json();
  assert.equal(payload.owner.pet_count, 0);
  assert.equal(payload.source_coverage.represented, 28);
  assert.ok(payload.tasks.filter((entry) => entry.source_key.startsWith('moonpet.') && entry.source_key !== 'moonpet.seven-of-seven-claim')
    .some((entry) => entry.blocking_reason_code === 'moonpet_required'));
});

test('three-pet saved state keeps jobs, runs, and contracts on opaque original-pet references', async () => {
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })), { DB: fakeDb({ threePets: true, savedStates: true }), TELEGRAM_BOT_TOKEN: 'test' }, options());
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.owner.pet_count, 3);
  const ownedRefs = new Set(payload.tasks.filter((entry) => entry.source_key === 'moonpet.adoption-incubation').map((entry) => entry.source_pet_ref));
  for (const key of ['moonpet.jobs', 'moonpet.saved-run', 'moonpet.contracts']) {
    const saved = payload.tasks.find((entry) => entry.source_key === key && ['active', 'waiting', 'claim_ready'].includes(entry.status));
    assert.ok(saved, `${key} should expose its saved action`);
    assert.ok(ownedRefs.has(saved.source_pet_ref), `${key} should retain an owned original-pet reference`);
  }
  assert.equal(payload.tasks.find((entry) => entry.source_key === 'moonpet.saved-run' && entry.status === 'claim_ready')?.owner_scope, 'original_pet');
  assert.doesNotMatch(JSON.stringify(payload), /pet-secret-(123|456|789)/u);
});

test('canonical care and boss gates do not advertise unavailable actions', async () => {
  let response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })), { DB: fakeDb({ threePets: true, bossReady: true }), TELEGRAM_BOT_TOKEN: 'test' }, options());
  let payload = await response.json();
  const careTasks = payload.tasks.filter((entry) => entry.source_key === 'moonpet.care');
  assert.equal(careTasks.filter((entry) => entry.status === 'ready').length, 1, 'hunger at 75 must be an urgent care need');
  const bossTasks = payload.tasks.filter((entry) => entry.source_key === 'moonpet.bosses-combat');
  assert.equal(bossTasks.filter((entry) => entry.status === 'ready').length, 1, 'only the selected eligible pet may be boss-ready');
  assert.equal(bossTasks.filter((entry) => entry.blocking_reason_code === 'active_moonpet_required').length, 2);

  response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })), { DB: fakeDb({ threePets: true, bossReady: true, bossAttempt: true }), TELEGRAM_BOT_TOKEN: 'test' }, options());
  payload = await response.json();
  assert.equal(payload.tasks.filter((entry) => entry.source_key === 'moonpet.bosses-combat' && entry.status === 'ready').length, 0);
  assert.ok(payload.tasks.some((entry) => entry.blocking_reason_code === 'moonpet_weekly_boss_daily_attempt_used'));
});

test('Journey care, care cooldown, and Dead Run projections use canonical evidence', async () => {
  const db = fakeDb({ deadRunVerified: true });
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })), { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options());
  const payload = await response.json();
  const dailyJourneyQuery = db.calls.find((call) => /FROM telegram_pet_daily_journey_objectives o/u.test(call.sql));
  assert.match(dailyJourneyQuery.sql, /o\.event_key=substr\('care:'\|\|care\.event_key,1,180\)/u);
  const careCooldownQuery = db.calls.find((call) => /MAX\(created_at\) AS last_action_at/u.test(call.sql));
  assert.match(careCooldownQuery.sql, /'sleep'/u);
  assert.doesNotMatch(careCooldownQuery.sql, /'train'/u);
  const deadRun = payload.tasks.find((entry) => entry.source_key === 'games.dead-run');
  assert.deepEqual(deadRun.progress, { current: 4321, target: null, unit: 'verified_score' });
  const verifiedQuery = db.calls.find((call) => /FROM dead_run_sessions.*status='finished'/su.test(call.sql));
  assert.match(verifiedQuery.sql, /player_stats_applied=1 AND arcade_xp_applied=1 AND horde_applied=1/u);
});

test('contract view names remain accepted aliases', async () => {
  const env = { DB: fakeDb(), TELEGRAM_BOT_TOKEN: 'test' };
  for (const view of ['summary', 'tasks']) {
    const response = await handlePlayerActionPlanRoute(request(auth({ view })), env, options());
    assert.equal(response.status, 200, `${view} must remain contract-compatible`);
  }
});

test('concurrent identical reads remain deterministic and do not mutate state', async () => {
  const environments = Array.from({ length: 4 }, () => ({ DB: fakeDb({ threePets: true, savedStates: true }), TELEGRAM_BOT_TOKEN: 'test' }));
  const responses = await Promise.all(environments.map((env) => handlePlayerActionPlanRoute(request(auth({ limit: 100 })), env, options())));
  const payloads = await Promise.all(responses.map((response) => response.json()));
  for (const payload of payloads.slice(1)) assert.deepEqual(payload, payloads[0]);
  for (const env of environments) assert.equal(env.DB.calls.some((call) => call.method === 'run'), false);
});

test('missing tables degrade per source without collapsing the plan', async () => {
  const tables = new Set([
    'daily_missed_perks', 'daily_opportunity_state', 'arcade_progression_events', 'telegram_pet_instances',
    'telegram_pet_daily_completion', 'telegram_pet_daily_journey_objectives', 'telegram_pet_weekly_journey_objectives',
    'telegram_pet_reward_claims', 'telegram_pet_runs', 'telegram_pet_contracts', 'telegram_pet_activity_sessions',
    'telegram_pet_weekly_boss_victories_by_pet', 'telegram_pet_garden_plots', 'telegram_pet_evolutions_by_pet',
    'wiki_mission_completions', 'championship_clout_daily', 'dead_run_sessions', 'nbg_london_records',
  ]);
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })), { DB: fakeDb({ tables }), TELEGRAM_BOT_TOKEN: 'test' }, options());
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.source_status['battle.wtf-windows'].state, 'migration_pending');
  const affected = payload.tasks.find((entry) => entry.source_key === 'battle.wtf-windows');
  assert.equal(affected.status, 'sync_unavailable');
  assert.equal(affected.source_health, 'migration_pending');
  assert.ok(payload.tasks.some((entry) => entry.source_key === 'telegram.daily-claim' && entry.status === 'ready'));
});

test('table probe failures propagate as query_failed to all mapped sources', async () => {
  const db = fakeDb({ tableErrors: new Set(['telegram_pet_daily_completion']) });
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options());
  assert.equal(response.status, 200, 'unrelated sources still respond on a partial D1 outage');
  const payload = await response.json();
  for (const sourceKey of ['moonpet.daily-seven-missions', 'moonpet.seven-of-seven-claim']) {
    const status = payload.source_status[sourceKey];
    assert.equal(status.state, 'query_failed', sourceKey);
    assert.equal(status.error_code, 'simulated_d1_table_probe_timeout');
    const items = payload.tasks.filter(t => t.source_key === sourceKey);
    assert.ok(items.length > 0, 'source remains represented');
    assert.ok(items.every(t => t.status === 'sync_unavailable'
      && t.source_health === 'query_failed'
      && t.blocking_reason_code === 'source_projection_unavailable'),
      'no task can pretend completion, claimability or migration absence after a failed probe');
  }
  assert.notEqual(payload.source_status['moonpet.daily-journey'].state, 'query_failed',
    'other successfully queried tables must remain available');
  assert.ok(payload.summary.unavailable_sources >= 2);
  assert.ok(!payload.top_actions.some(t =>
    ['moonpet.daily-seven-missions', 'moonpet.seven-of-seven-claim'].includes(t.source_key)));
});

test('an actually missing table remains migration_pending rather than query_failed', async () => {
  const sourceTables = new Set([
    'telegram_pet_daily_completion', 'telegram_pet_instances',
    'telegram_pet_daily_journey_objectives', 'telegram_pet_weekly_journey_objectives',
    'daily_wtf_events', 'daily_missed_perks', 'daily_opportunity_state',
    'arcade_progression_events', 'telegram_pet_reward_claims', 'telegram_pet_runs',
    'telegram_pet_contracts', 'telegram_pet_activity_sessions',
    'telegram_pet_weekly_boss_victories_by_pet', 'telegram_pet_garden_plots',
    'telegram_pet_evolutions_by_pet', 'wiki_mission_completions',
    'championship_clout_daily', 'dead_run_sessions', 'nbg_london_records',
    'player_daily_mission_state',
  ]);
  sourceTables.delete('telegram_pet_daily_completion');
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: fakeDb({ tables: sourceTables }), TELEGRAM_BOT_TOKEN: 'test' }, options());
  assert.equal(response.status, 200);
  const payload = await response.json();
  for (const key of ['moonpet.daily-seven-missions', 'moonpet.seven-of-seven-claim']) {
    assert.equal(payload.source_status[key].state, 'migration_pending');
    assert.equal(payload.tasks.find(t => t.source_key === key).status, 'sync_unavailable');
  }
});

test('authentication, owner selectors, rate limits and pagination fail closed', async () => {
  const env = { DB: fakeDb(), TELEGRAM_BOT_TOKEN: 'test' };
  let response = await handlePlayerActionPlanRoute(request({}), env, options());
  assert.equal(response.status, 401);
  response = await handlePlayerActionPlanRoute(request(auth({ pet_id: 'foreign-pet' })), env, options());
  assert.equal(response.status, 400);
  response = await handlePlayerActionPlanRoute(request(auth({ telegram_id: '999999' })), env, options());
  assert.equal(response.status, 400);
  response = await handlePlayerActionPlanRoute(request(auth({ cursor: 'bad' })), env, options());
  assert.equal(response.status, 400);
  response = await handlePlayerActionPlanRoute(request(auth()), env, options({ enforceRateLimit: async () => json({ error: 'rate_limited' }, 429) }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Cache-Control'), 'no-store, private');
});

test('account-level source evidence survives generic projection and enters top actions', async () => {
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })), { DB: fakeDb(), TELEGRAM_BOT_TOKEN: 'test' }, options());
  const result = await response.json();
  const claim = result.tasks.find(t => t.source_key === 'moonpet.seven-of-seven-claim' && t.status === 'claim_ready');
  assert.ok(claim, 'saved unclaimed award must be present');
  assert.equal(claim.evidence.kind, 'server_receipt', 'genericTask must not overwrite registry evidence kind');
  assert.ok(result.top_actions.some(t => t.task_id === claim.task_id), 'ready award should be prioritised');
});

test('the current daily eight source flags stay account-wide and partial progress remains exact', async () => {
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })), { DB: fakeDb({ threePets: true, savedOldClaims: true }), TELEGRAM_BOT_TOKEN: 'test' }, options());
  const result = await response.json();
  const tasks = result.tasks.filter(t => t.source_key === 'moonpet.daily-seven-missions');
  const flags = tasks.filter(t => t.task_id.includes('flag-'));
  assert.equal(flags.length, 8, 'readDailyCompletion uses eight flag bits');
  assert.equal(flags.filter(t => t.status === 'complete').length, 3, '0x89 sets feed, train and gold');
  assert.equal(result.tasks.filter(t => t.source_key === 'moonpet.seven-of-seven-claim' && t.status === 'claim_ready').length, 1,
    'old earned unclaimed rewards must survive a new UTC day');
  assert.ok(result.tasks.some(t => t.source_key === 'moonpet.seven-of-seven-claim' && t.period.key === '2026-10-16'));
  assert.equal(tasks.filter(t => t.task_id.endsWith(':current')).length, 1, 'one account-wide summary, not one per pet');
});

test('persisted faction mission IDs remain separate advisory tasks', async () => {
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })), { DB: fakeDb({ savedMissions: true }), TELEGRAM_BOT_TOKEN: 'test' }, options());
  const result = await response.json();
  const missions = result.tasks.filter(t => t.source_key === 'faction.daily-missions');
  assert.equal(missions.length, 2);
  assert.ok(missions.every(t => t.evidence.kind === 'client_mirror'));
  assert.ok(missions.every(t => t.evidence.verified_completion === false));
});

test('saved runs and contracts are keyed by immutable source IDs, not ordering', async () => {
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })), { DB: fakeDb({ threePets: true, savedStates: true }), TELEGRAM_BOT_TOKEN: 'test' }, options());
  const result = await response.json();
  const run = result.tasks.find(t => t.source_key === 'moonpet.saved-run' && t.status === 'claim_ready');
  const contract = result.tasks.find(t => t.source_key === 'moonpet.contracts' && t.status === 'active');
  assert.match(run.task_id, /pap_[a-f0-9]{24}$/u);
  assert.match(contract.task_id, /pap_[a-f0-9]{24}$/u);
  assert.doesNotMatch(run.task_id, /:0$/u);
});

test('weekly Journey requires event identity, accepted status and canonical legacy boss proof', async () => {
  const db = fakeDb({ threePets: true });
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })), { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options());
  assert.equal(response.status, 200);
  const sql = db.calls.find(c => /FROM telegram_pet_weekly_journey_objectives o/u.test(c.sql))?.sql;
  assert.ok(sql);
  assert.match(sql, /JOIN telegram_pet_events e/u);
  assert.doesNotMatch(sql, /LEFT JOIN telegram_pet_events/u);
  assert.match(sql, /o.objective_id=CASE e.event_type/u);
  assert.match(sql, /pet_weekly_boss_backfill/u);
});

test('wiki mission reads must use canonical mission_window and persisted WTF windows have distinct IDs', async () => {
  const db = fakeDb();
  await handlePlayerActionPlanRoute(request(auth({ limit: 100 })), { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options());
  const wiki = db.calls.find(c => /FROM wiki_mission_completions/u.test(c.sql));
  assert.match(wiki.sql, /mission_window=\?/u);
  assert.doesNotMatch(wiki.sql, /substr\(created_at/u);
});

test('elapsed care decay flags hidden needs without writing to the pet', async () => {
  const db = fakeDb({ idleCare: true });
  const result = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })), { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
  const care = result.tasks.find(t => t.source_key === 'moonpet.care');
  assert.equal(care.status, 'ready', 'stored healthy-looking bars must preview elapsed hunger/energy decay');
  assert.ok(care.progress.current > 0);
  assert.equal(db.calls.some(call => call.method === 'run'), false);
  const petQuery = db.calls.find(call => /FROM telegram_pet_instances i/u.test(call.sql));
  assert.match(petQuery.sql, /i.last_decay_at/u);
});

test('historical pending claim backlog is explicit and never displaces current day', async () => {
  const db = fakeDb({ manyPending: true });
  const result = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })), { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
  const health = result.source_status['moonpet.seven-of-seven-claim'];
  assert.equal(health.partial, true);
  assert.equal(health.historical_pending_total, 137);
  assert.equal(health.historical_pending_not_listed, 37);
  assert.ok(result.tasks.some(t => t.source_key === 'moonpet.seven-of-seven-claim' && t.status === 'claim_ready'
    && /37 more/u.test(t.title)));
  assert.equal(result.tasks.filter(t => t.source_key === 'moonpet.seven-of-seven-claim' && t.status === 'claim_ready').length, 100);
  let daily = result.tasks.find(t => t.source_key === 'moonpet.daily-seven-missions' && t.title === 'Daily Moonpet completion conditions');
  // The API deliberately pages at 100 tasks: the daily summary may be on a
  // later page when the member has 137 historic pending claim receipts.
  let cursor = result.pagination.next_cursor;
  while (!daily && cursor) {
    const next = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100, cursor })),
      { DB: fakeDb({ manyPending: true }), TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
    daily = next.tasks.find(t => t.source_key === 'moonpet.daily-seven-missions'
      && t.title === 'Daily Moonpet completion conditions');
    cursor = next.pagination.next_cursor;
  }
  assert.ok(daily, 'source summary must remain accessible by pagination');
  assert.equal(daily.progress.current, 3);
  assert.ok(db.calls.some(call => /COUNT\(\*\) AS total FROM telegram_pet_daily_completion/u.test(call.sql)));
});

test('activity grace is based on saved end timestamp with inclusive 24h boundary', async () => {
  for (const [time, expected] of [
    ['2026-10-16T11:59:59Z', 'expired'],
    ['2026-10-16T12:00:00Z', 'claim_ready'],
    ['2026-10-17T12:30:00Z', 'claim_ready'],
  ]) {
    const db = fakeDb({ activityEndsAt: time });
    const r = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })), { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
    assert.equal(r.tasks.find(t => t.source_key === 'moonpet.jobs' && t.scope_ref)?.status, expected, time);
    if (expected === 'expired') assert.equal(r.top_actions.some(t => t.source_key === 'moonpet.jobs'), false);
  }
});


test('activity becomes claimable after the canonical five-minute minimum, not ends_at cap', async () => {
  const before = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: fakeDb({ activityStartsAt: '2026-10-17T11:58:00Z', activityEndsAt: '2026-10-17T14:00:00Z' }), TELEGRAM_BOT_TOKEN: 'test' },
    options())).json();
  const waiting = before.tasks.find(t => t.source_key === 'moonpet.jobs' && t.scope_ref);
  assert.equal(waiting.status, 'waiting');
  assert.equal(waiting.next_ready_at, '2026-10-17T12:03:00.000Z');
  const ready = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: fakeDb({ activityStartsAt: '2026-10-17T11:55:00Z', activityEndsAt: '2026-10-17T14:00:00Z' }), TELEGRAM_BOT_TOKEN: 'test' },
    options())).json();
  assert.equal(ready.tasks.find(t => t.source_key === 'moonpet.jobs' && t.scope_ref).status, 'claim_ready');
});

test('created_at pet Journey comes from ownership slot rather than repaired instance', async () => {
  const db = fakeDb({ ownershipClock: true, bossReady: true });
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options());
  assert.equal(response.status, 200);
  const result = await response.json();
  const weekly = result.tasks.find(t => t.source_key === 'moonpet.weekly-journey' && t.scope_ref);
  assert.equal(weekly.period.key, '1');
  assert.equal(weekly.expires_at, '2026-10-22T00:00:00.000Z');
  assert.match(db.calls.find(c => /FROM telegram_pet_instances i/u.test(c.sql)).sql, /s\.created_at AS ownership_created_at/u);
});

test('earlier same-ISO-week boss win does not complete a new pet ownership week', async () => {
  const db = fakeDb({ ownershipClock: true, bossReady: true, bossVictoryBeforePetWeek: true });
  const result = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
  const boss = result.tasks.find(t => t.source_key === 'moonpet.bosses-combat' && t.scope_ref);
  assert.equal(boss.status, 'ready', 'the pet has not participated since its new Thursday ownership-week boundary');
  const after = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: fakeDb({ ownershipClock: true, bossReady: true, bossVictoryBeforePetWeek: true, bossVictoryDay: '2026-10-16' }), TELEGRAM_BOT_TOKEN: 'test' },
    options())).json();
  assert.equal(after.tasks.find(t => t.source_key === 'moonpet.bosses-combat' && t.scope_ref).status, 'complete');
});

test('WTF windows use owner event truth for active, checked in and completed status', async () => {
  for (const [playerState, expected] of [
    [null, 'active'], ['checked_in', 'in_progress'], ['completed', 'complete'],
  ]) {
    const db = fakeDb({ wtfState: playerState });
    const result = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
      { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
    const window = result.tasks.find(t => t.source_key === 'battle.wtf-windows');
    assert.equal(window.status, expected, String(playerState));
    if (playerState) assert.ok(!result.top_actions.some(t => t.task_id === window.task_id));
    const wtfQuery = db.calls.find(t => /FROM daily_wtf_events e/u.test(t.sql));
    assert.match(wtfQuery.sql, /LEFT JOIN daily_wtf_player_events p/u);
    assert.equal(wtfQuery.params[0], '123456', 'signed owner must filter player participation');
    assert.equal(wtfQuery.params[1], '2026-10-17');
  }
});

test('malformed activity metadata is guarded by CASE and cannot fabricate recovery', async () => {
  const db = fakeDb({ malformedMetadata: true });
  const r = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })), { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
  assert.notEqual(r.source_status['moonpet.jobs'].state, 'query_failed');
  const sql = db.calls.find(call => /FROM telegram_pet_activity_sessions/u.test(call.sql)).sql;
  assert.match(sql, /json_extract\(CASE WHEN json_valid\(metadata\)/u);
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE activities (metadata TEXT); INSERT INTO activities VALUES (\'{bad-json\');');
  assert.equal(sqlite.prepare("SELECT json_extract(CASE WHEN json_valid(metadata) THEN metadata ELSE '{}' END,'$.claim_state') AS state FROM activities").get().state, null);
  sqlite.close();
});

test('pending source-pet contract bonuses and historic boss rewards remain visible', async () => {
  const db = fakeDb({ threePets: true, pendingContracts: true, pendingBossRewards: true });
  const r = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })), { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
  const contract = r.tasks.find(t => t.source_key === 'moonpet.contracts' && t.status === 'claim_ready');
  const boss = r.tasks.find(t => t.source_key === 'moonpet.bosses-combat' && t.status === 'claim_ready');
  assert.ok(contract, 'completed but unsettled contract must surface as claim_ready');
  assert.ok(boss, 'older defeated and unclaimed weekly boss must surface');
  assert.equal(contract.owner_scope, 'original_pet');
  assert.equal(boss.owner_scope, 'original_pet');
  assert.match(boss.task_id, /pap_[a-f0-9]{24}/u);
});

test('a saved boss victory stays claimable after the active pet roster is empty', async () => {
  const env = { DB: fakeDb({ noPets: true, pendingBossRewards: true }), TELEGRAM_BOT_TOKEN: 'test' };
  const result = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })), env, options())).json();
  const boss = result.tasks.find(t => t.source_key === 'moonpet.bosses-combat' && t.status === 'claim_ready');
  assert.ok(boss, 'original saved source pet reward must remain claimable');
  assert.equal(boss.source_health, 'live');
  assert.ok(result.top_actions.some(t => t.task_id === boss.task_id), 'historical payout is not gated on new roster');
});

test('per-pet accepted boss participation prevents duplicate readiness', async () => {
  const db = fakeDb({ threePets: true, bossReady: true, bossParticipation: true });
  const r = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })), { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
  const boss = r.tasks.filter(t => t.source_key === 'moonpet.bosses-combat');
  assert.ok(boss.some(t => t.status === 'complete'), 'recorded participation cannot be recommended again');
  assert.equal(boss.filter(t => t.status === 'ready').length, 0);
});
test('source-specific UTC clocks survive BST/GMT rollover and pagination is bounded', () => {
  assert.equal(nextUtcDay('2026-10-24T23:59:59Z'), '2026-10-25T00:00:00.000Z');
  assert.equal(nextUtcDay('2026-10-25T23:59:59Z'), '2026-10-26T00:00:00.000Z');
  assert.equal(isoWeek('2026-12-31T23:59:59Z'), '2026-W53');
  assert.equal(isoWeek('2027-01-01T00:00:00Z'), '2026-W53');
  const items = Array.from({ length: 150 }, (_, index) => ({ task_id: String(index) }));
  assert.equal(paginateActionPlan(items, null, 500).tasks.length, 100);
  assert.equal(paginateActionPlan(items, 'pap1-100', 100).tasks.length, 50);
  assert.throws(() => paginateActionPlan(items, 'pap2-0', 10), /cursor_invalid/u);
});
