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
      pet_xp: 90, hunger: 20, happiness: 70, cleanliness: 60, energy: 55, health: 80,
      status: 'active', created_at: '2026-10-01T00:00:00.000Z', journey_clock: 'legacy_quarter', is_active: 1,
    },
    {
      pet_id: 'pet-secret-456', season_key: '2026-Q4', slot_number: 2, stage: 'hatched', level: 3,
      pet_xp: 50, hunger: 75, happiness: 70, cleanliness: 65, energy: 55, health: 80,
      status: 'active', created_at: '2026-10-02T00:00:00.000Z', journey_clock: 'legacy_quarter', is_active: 0,
    },
    {
      pet_id: 'pet-secret-789', season_key: '2026-Q4', slot_number: 3, stage: 'hatched', level: 5,
      pet_xp: 150, hunger: 60, happiness: 65, cleanliness: 70, energy: 75, health: 85,
      status: 'active', created_at: '2026-10-03T00:00:00.000Z', journey_clock: 'legacy_quarter', is_active: 0,
    },
  ];
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
              if (/FROM telegram_pet_instances/u.test(sql)) return { success: true, results: options.noPets ? [] : options.threePets ? ownedPets : ownedPets.slice(0, 1) };
              if (/telegram_community_xp_awards/u.test(sql)) return { success: true, results: [] };
              if (/daily_opportunity_state/u.test(sql)) return { success: true, results: [{ chain_depth: 2, updated_at: '2026-10-17T01:00:00Z' }] };
              if (/daily_wtf_events/u.test(sql)) return { success: true, results: [{ event_id: 'hidden-event', starts_at: '2026-10-17T11:00:00Z', ends_at: '2026-10-17T13:00:00Z' }] };
              if (/telegram_pet_daily_completion/u.test(sql)) return { success: true, results: [{ progress_bits: 255, claimed_at: null, pet_id: 'pet-secret-123' }] };
              if (/FROM telegram_pet_activity_sessions/u.test(sql) && options.savedStates) return { success: true, results: [{ status: 'active', started_at: '2026-10-17T11:50:00Z', ends_at: '2026-10-17T13:50:00Z', claimed_at: null, metadata: '{"pet_id":"pet-secret-123"}' }] };
              if (/FROM telegram_pet_runs/u.test(sql) && options.savedStates) return { success: true, results: [{ pet_id: 'pet-secret-789', status: 'extractable', updated_at: '2026-10-17T11:55:00Z' }] };
              if (/FROM telegram_pet_contracts/u.test(sql) && options.savedStates) return { success: true, results: [{ pet_id: 'pet-secret-456', status: 'active', updated_at: '2026-10-17T11:54:00Z' }] };
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
    CREATE TABLE daily_missed_perks (telegram_id TEXT);
    CREATE TABLE daily_opportunity_state (telegram_id TEXT, utc_day TEXT, chain_depth INTEGER, updated_at TEXT);
    CREATE TABLE wiki_mission_completions (telegram_id TEXT, created_at TEXT);
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
  `);
  const db = createReadOnlyActionPlanDb(sqliteD1(database), { maxStatements: 80 });
  const projection = await buildPlayerActionPlanSources(db, 'schema-owner', { now: '2026-10-17T12:00:00Z' });
  assert.equal(Object.values(projection.source_status).some((status) => status.state === 'query_failed'), false);
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
  assert.ok(payload.top_actions.every((entry) => ['ready', 'claim_ready', 'active'].includes(entry.status) && entry.source_health === 'live' && !entry.blocking_reason_code));
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
    const saved = payload.tasks.find((entry) => entry.source_key === key && ['active', 'claim_ready'].includes(entry.status));
    assert.ok(saved, `${key} should expose its saved action`);
    assert.ok(ownedRefs.has(saved.source_pet_ref), `${key} should retain an owned original-pet reference`);
  }
  assert.equal(payload.tasks.find((entry) => entry.source_key === 'moonpet.saved-run' && entry.status === 'claim_ready')?.owner_scope, 'original_pet');
  assert.doesNotMatch(JSON.stringify(payload), /pet-secret-(123|456|789)/u);
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
