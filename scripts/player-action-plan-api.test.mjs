import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createReadOnlyActionPlanDb, isReadOnlyActionPlanSql } from '../workers/moonboys-api/player-action-plan/read-only-db.js';
import { ACTION_PLAN_SOURCE_REGISTRY, buildPlayerActionPlanSources } from '../workers/moonboys-api/player-action-plan/sources.js';
import { handlePlayerActionPlanRoute } from '../workers/moonboys-api/routes/player-action-plan.js';
import { actionPlanSnapshotToken, isImmediateAction, isoWeek, nextUtcDay, paginateActionPlan, rankActionPlanTasks } from '../workers/moonboys-api/player-action-plan/schema.js';
import { getPetWeeklyBoss } from '../workers/moonboys-api/pets/player-expansion.js';
import { getPetDailyBounties } from '../workers/moonboys-api/pets/economy-expansion.js';
import { verifyTelegramIdentityFromBody } from '../workers/moonboys-api/blocktopia/auth.js';

function fakeDb(options = {}) {
  const calls = [];
  const tables = options.tables || null;
  const ownedPets = [
    {
      pet_id: 'pet-secret-123', season_key: '2026-Q4', slot_number: 1, stage: 'hatched', level: 4,
      pet_xp: options.bossReady ? 640 : 90, hunger: options.careHunger ?? 20, happiness: options.careHappiness ?? 70, cleanliness: options.careCleanliness ?? 60, energy: options.careEnergy ?? (options.fractionalBossEnergy ? 11.5 : 55), health: options.careHealth ?? 80,
      status: 'active', created_at: '2026-10-01T00:00:00.000Z', last_decay_at: options.idleCare ? '2026-10-16T12:00:00.000Z' : options.fractionalCare ? '2026-10-17T11:59:50.000Z' : '2026-10-17T11:59:40.000Z', journey_clock: 'legacy_quarter', is_active: 1, lifecycle_phase: 'young',
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
  for (const [index, pet] of ownedPets.entries()) {
    pet.ownership_created_at = pet.created_at;
    pet.permanent_slot_number = index + 1;
  }
  if (options.crossSeasonRoster) {
    // Permanent spaces can span several creation seasons. Their stored slot
    // numbers are 1,2,1, but the visible global positions must be 1,2,3.
    ownedPets[0].season_key = 'pet-s2026-003';
    ownedPets[1].season_key = 'pet-s2026-003';
    ownedPets[2].season_key = 'pet-s2026-004';
    ownedPets[2].slot_number = 1;
  }
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
              if (/FROM telegram_website_credentials c/u.test(sql)) {
                if (options.websiteSessionDelayMs) await new Promise(resolve => setTimeout(resolve, options.websiteSessionDelayMs));
                if (options.websiteSessionQueryFails) throw new Error('simulated_website_session_read_failed');
                return options.websiteSession ? {
                  telegram_id: '123456', username: 'verified-owner', first_name: 'Owner',
                  last_name: null, is_blocked: 0,
                } : null;
              }
              if (/sqlite_master/u.test(sql)) {
                if (options.probeGate) {
                  options.probeOnStart?.(params[0]);
                  await options.probeGate;
                }
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
              if (options.delayedAllMs) await new Promise(resolve => setTimeout(resolve, options.delayedAllMs));
              if (/FROM telegram_users/u.test(sql)) return { success: true, results: [{ telegram_id: params[0] }] };
              if (/FROM telegram_faction_members/u.test(sql)) return { success: true, results: [{ faction_id: 2, name: 'graffpunks' }] };
              if (/FROM arcade_progression_state/u.test(sql)) {
                if (options.failArcadeXp) throw new Error('arcade_lifetime_xp_unavailable');
                return { success: true, results: [{ arcade_xp_total: options.lowXp ? 200 : 1200 }] };
              }
              if (/FROM telegram_pet_profiles/u.test(sql)) return { success: true, results:
                options.legacyOwner ? [{ telegram_id: params[0] }] : [] };
              if (/FROM player_daily_mission_state/u.test(sql)) return { success: true, results: options.savedMissions
                ? [{ mission_id: 'gp_chaos_3', progress: 2, completed: 0 },
                   { mission_id: 'gp_combo_x3', progress: 3, completed: 1 }] : [] };
              if (/SELECT i.pet_id,i.season_key,i.slot_number/u.test(sql)) return { success: true, results: options.noPets ? [] : options.threePets ? ownedPets : ownedPets.slice(0, 1) };
              if (/FROM telegram_pet_events/u.test(sql) && /ROW_NUMBER\(\) OVER \(PARTITION BY event_type/u.test(sql)) {
                return { success: true, results: options.careEvents || [] };
              }
              if (/FROM telegram_pet_garden_plots/u.test(sql) && options.cropPlantedAt) {
                return { success: true, results: [{ pet_id: 'pet-secret-123',
                  crop_key: options.gardenWrongCrop ? 'broken_crop' : 'garden_veggies',
                  status: options.gardenBadStatus ? 'unknown' : 'growing',
                  planted_at: options.cropPlantedAt,
                  ready_at: options.gardenInvalidReady ? 'bad-timestamp'
                    : options.gardenInvalidOrder ? '2026-10-17T08:00:00Z' : '2026-10-17T18:00:00Z' }] };
              }
              if (/telegram_community_xp_awards/u.test(sql)) {
                if (options.failDailyAuthority === 'award') throw new Error('daily_receipt_source_unavailable');
                return { success: true, results: options.claimAward ? [{
                  telegram_id: '123456', action: 'daily_claim', claim_key: '2026-10-17',
                  reference_id: options.claimAward === 'bad_reference' ? 'wrong-day' : '2026-10-17',
                  xp_change: options.claimAward === 'zero' ? 0 : 20,
                  season_id: null, earned_at: '2026-10-17T11:50:00Z',
                  settlement_token: options.claimAward === 'missing_token' ? '' : 'settled-token',
                }] : [] };
              }
              if (/FROM telegram_xp_log/u.test(sql)) {
                if (options.failDailyAuthority === 'legacy') throw new Error('legacy_receipt_source_unavailable');
                return { success: true, results: options.legacyDailyClaim ? [{
                  id: 42, telegram_id: '123456', action: 'daily_claim',
                  reference_id: '2026-10-17', xp_change: 20, created_at: '2026-10-17 11:50:00',
                }] : [] };
              }
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
                    season_key: '2026-Q4', original_pet_verified: 1,
                  })) };
                  return { success: true, results: options.savedOldClaims
                    ? [{ utc_day: '2026-10-16', progress_bits: 255, claimed_at: null, pet_id: 'pet-secret-123',
                      season_key: '2026-Q4', original_pet_verified: 1 }] : [] };
                }
                return { success: true, results: [{ utc_day: '2026-10-17',
                  progress_bits: options.savedOldClaims || options.manyPending ? 137 : 255,
                  claimed_at: null, pet_id: options.completionPetNull ? null : 'pet-secret-123',
                  season_key: options.completionStaleSeason ? 'stale-season'
                    : options.completionSeasonMissing ? null : '2026-Q4',
                  original_pet_verified: options.completionStaleSeason || options.completionSeasonMissing ? 0 : 1 }] };
              }
              if (/FROM telegram_pet_activity_sessions/u.test(sql) && (options.savedStates || options.activityEndsAt || options.malformedMetadata)) return { success: true, results: [{
                session_id: options.jobSessionMissing ? null : options.jobSessionId || 'job-source-123',
                status: 'active', started_at: options.activityStartsAt || '2026-10-17T11:50:00Z',
                ends_at: options.activityEndsAt || '2026-10-17T13:50:00Z',
                claimed_at: null,
                metadata: options.malformedMetadata ? '{bad-json'
                  : options.noJobPetId ? '{}' : '{"pet_id":"pet-secret-123"}',
              }] };
              if (/FROM telegram_pet_runs r/u.test(sql) && (options.savedStates || options.invalidRun)) return { success: true, results: [{
                source_id: 'source-run-789',
                pet_id: options.invalidRun === 'null' ? null
                  : options.invalidRun === 'foreign' ? 'foreign-pet' : 'pet-secret-789',
                season_key: options.invalidRun ? 'foreign-season' : '2026-Q4',
                owner_verified: options.invalidRun ? 0 : 1,
                status: 'extractable', updated_at: '2026-10-17T11:55:00Z',
              }] };
              if (/FROM telegram_pet_contracts c/u.test(sql) && (options.savedStates || options.pendingContracts || options.invalidContract)) return { success: true, results: options.pendingContracts
                ? [{ source_id: 'source-contract-456', pet_id: 'pet-secret-456',
                  season_key: '2026-Q4', owner_verified: options.invalidContract ? 0 : 1,
                  status: 'completed', reward_xp: 20, reward_settled: 0, updated_at: '2026-10-16T11:54:00Z' }]
                : [{ source_id: 'source-contract-456', pet_id: options.invalidContract ? 'foreign-pet' : 'pet-secret-456',
                  season_key: options.invalidContract ? 'foreign-season' : '2026-Q4',
                  owner_verified: options.invalidContract ? 0 : 1,
                  status: 'active', updated_at: '2026-10-17T11:54:00Z' }] };
              if (/FROM telegram_pet_weekly_boss_victories_by_pet v\s+LEFT JOIN telegram_pet_weekly_boss_events a/su.test(sql)
                  && options.bossVictoryBeforePetWeek) {
                return { success: true, results: [{ pet_id: 'pet-secret-123', season_key: '2026-Q4',
                  boss_id: options.bossInvalidVictory ? 'wrong-boss' : getPetWeeklyBoss('2026-W42').boss_id,
                  defeated_at: '2026-10-13T12:00:00Z',
                  victory_day: options.bossVictoryDay || '2026-10-13' }] };
              }
              if (/FROM telegram_pet_weekly_boss_victories_by_pet v\s+JOIN telegram_pet_weekly_boss_progress p/su.test(sql) && options.pendingBossRewards) {
                return { success: true, results: [{ pet_id: 'pet-secret-456', season_key: '2026-Q3',
                  week_key: '2026-W32', boss_id: options.invalidBossId ? 'not_this_week_boss' : getPetWeeklyBoss('2026-W32').boss_id }] };
              }
              if (/SELECT e.pet_id,e.season_key FROM telegram_pet_events e/u.test(sql) && options.bossParticipation) {
                return { success: true, results: [{ pet_id: 'pet-secret-123', season_key: '2026-Q4' }] };
              }
              if (/FROM telegram_pet_weekly_boss_events\s+WHERE telegram_id=\? AND week_key=\? AND day_key=\?/su.test(sql))
                return { success: true, results: options.bossAttempt
                  ? [{ present: 1 }] : [] };
              if (/FROM dead_run_sessions.*status='active'/su.test(sql)) return { success: true, results: options.deadRunActive ? [{ session_id: options.deadRunSessionId || 'active-run' }] : [] };
              if (/FROM dead_run_sessions.*status='finished'.*ranked=1/su.test(sql)) return { success: true, results: options.deadRunVerified ? [{ score: 4321, ended_at: '2026-10-17T11:00:00Z' }] : [] };
              if (/championship_clout_daily/u.test(sql)) return { success: true, results: [{ total_points: 18, recalculated_at_ms: 1792195200000 }] };
              if (/nbg_london_records/u.test(sql)) return { success: true, results: [{ fastest_ms: 50000, best_xp: 30 }] };
              if (/SELECT 'event' AS record_type/u.test(sql)) return { success: true, results: [
                ...(options.bountyAcceptedEvents || []).map(row => ({
                  record_type: 'event', record_key: row.event_type, total: row.total,
                })),
                ...(options.bountyAwarded ? [{ record_type: 'receipt', record_key: 'awarded', total: options.bountyAwarded }] : []),
                ...(options.bountyPending ? [{ record_type: 'receipt', record_key: 'pending', total: options.bountyPending }] : []),
              ] };
              if (/FROM telegram_pet_reward_claims/u.test(sql)) return { success: true, results: [{ total: options.pendingClaimCount || 0 }] };
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
  for (const sql of [
    'SELECT 1; PRAGMA writable_schema=ON', 'SELECT 1; SELECT 2',
    'WITH a AS (SELECT 1) SELECT * FROM a; DROP TABLE users',
    'SELECT 1 -- UPDATE forbidden', 'SELECT 1 /* ignored */',
    'PRAGMA table_info(users)', 'BEGIN TRANSACTION', 'EXPLAIN SELECT 1',
    'SELECT 1; COMMIT',
  ]) assert.equal(isReadOnlyActionPlanSql(sql), false, sql);
  const rejected = createReadOnlyActionPlanDb(fakeDb());
  await assert.rejects(() => rejected.all('SELECT 1; PRAGMA writable_schema=ON'),
    /mutating_sql_rejected/u);
  assert.equal(rejected.stats().statement_count, 0);
  const db = createReadOnlyActionPlanDb(fakeDb(), { maxStatements: 1 });
  assert.equal(typeof db.run, 'undefined');
  await db.all('SELECT 1');
  await assert.rejects(() => db.all('SELECT 2'), /query_budget_exceeded/u);
  const hanging = { prepare: () => ({ bind: () => ({ all: () => new Promise(() => {}) }) }) };
  const timed = createReadOnlyActionPlanDb(hanging, { statementTimeoutMs: 10 });
  await assert.rejects(() => timed.all('SELECT 1'), /query_timeout/u);
});

test('table health checks dispatch concurrently instead of serial timeout per source', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const started = [];
  const db = createReadOnlyActionPlanDb(fakeDb({
    probeGate: gate,
    probeOnStart(tableName) { started.push(tableName); },
  }), { maxStatements: 80, statementTimeoutMs: 1000 });
  const projectionPromise = buildPlayerActionPlanSources(db, '123456', { now: '2026-10-17T12:00:00.000Z' });
  // Allow all concurrently dispatched calls to start before releasing D1.
  await new Promise(resolve => setImmediate(resolve));
  const concurrent = started.length;
  release();
  const projection = await projectionPromise;
  assert.ok(concurrent >= 15, 'all source-table probes should start within one request window');
  assert.equal(new Set(started).size, concurrent, 'each backing table is probed once');
  assert.equal(projection.source_status['moonpet.adoption-incubation'].state, 'live');
  assert.ok(db.stats().statement_count <= 80);
});

test('rounded care meters match the canonical player-facing bar thresholds', async () => {
  for (const [metrics, state, message] of [
    [{ careHunger: 74.5 }, 'ready', 'hunger 74.5 rounds to 75 (urgent)'],
    [{ careEnergy: 25.9 }, 'complete', 'energy 25.9 rounds to 26 (stable)'],
  ]) {
    const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
      { DB: fakeDb({ ...metrics, fractionalCare: true }), TELEGRAM_BOT_TOKEN: 'test' }, options());
    assert.equal(response.status, 200);
    const payload = await response.json();
    const care = payload.tasks.find(item => item.source_key === 'moonpet.care' && item.scope_ref);
    assert.equal(care.status, state, message);
  }
});

test('saved Moonpet activity task ID changes on new immutable session', async () => {
  const getTask = async jobSessionId => {
    const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
      { DB: fakeDb({ savedStates: true, jobSessionId }), TELEGRAM_BOT_TOKEN: 'test' }, options());
    const payload = await response.json();
    return payload.tasks.find(item => item.source_key === 'moonpet.jobs' && item.scope_ref);
  };
  const first = await getTask('job-A');
  const again = await getTask('job-A');
  const second = await getTask('job-B');
  assert.equal(first.task_id, again.task_id);
  assert.notEqual(first.task_id, second.task_id);
  assert.match(first.task_id, /pap_[a-f0-9]{24}$/u);
  assert.doesNotMatch(first.task_id, /job-A/u, 'raw session IDs must never escape');
});

test('recurring boss participation task ID rotates on pet ownership-week boundary', async () => {
  const getBoss = async at => {
    const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
      { DB: fakeDb({ ownershipClock: true, bossReady: true }), TELEGRAM_BOT_TOKEN: 'test' },
      options({ now: at }));
    const payload = await response.json();
    return payload.tasks.find(item => item.source_key === 'moonpet.bosses-combat' && item.scope_ref);
  };
  const before = await getBoss('2026-10-21T12:00:00.000Z');
  const after = await getBoss('2026-10-22T12:00:00.000Z');
  assert.ok(before && after);
  assert.notEqual(before.task_id, after.task_id);
  assert.match(before.task_id, /journey-week-1$/u);
  assert.match(after.task_id, /journey-week-2$/u);
});

test('unidentified job session is never advertised as a claimable new task', async () => {
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: fakeDb({ savedStates: true, jobSessionMissing: true }), TELEGRAM_BOT_TOKEN: 'test' }, options());
  const payload = await response.json();
  const task = payload.tasks.find(item => item.source_key === 'moonpet.jobs' && item.scope_ref);
  assert.equal(task.status, 'sync_unavailable');
  assert.ok(task.blocking_reason_code);
  assert.ok(!payload.top_actions.some(item => item.task_id === task.task_id));
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
      action TEXT, damage INTEGER, created_at TEXT
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

test('PR3 owner roster is redacted, stage-aware, selected, and read-only with no extra queries', async () => {
  const db = fakeDb({ threePets: true, savedStates: true });
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.owner.pet_count, 3);
  assert.equal(body.owner.pets.length, 3);
  assert.equal(body.owner.pets.filter(pet => pet.selected).length, 1);
  assert.deepEqual(body.owner.pets.map(pet => pet.slot_number), [1, 2, 3]);
  assert.deepEqual(body.owner.pets.map(pet => pet.lifecycle_phase), ['young', 'young', 'young']);
  assert.ok(body.owner.pets.every(pet => /^pap_[a-f0-9]{24}$/u.test(pet.pet_ref)));
  assert.equal(new Set(body.owner.pets.map(pet => pet.pet_ref)).size, 3);
  assert.equal(body.owner.pets[0].life_stage, 'hatched');
  assert.equal(body.owner.pets[0].pet_xp, 90);
  assert.equal(body.owner.pets[0].level > 0, true);
  assert.equal(body.owner.pets[0].evolution_stage, null, 'unknown evolution stages stay unknown');
  assert.equal(body.owner.faction.joined, true);
  assert.equal(body.owner.faction.name, 'graffpunks');
  assert.equal(body.owner.lifetime_arcade_xp, 1200);
  assert.ok(db.calls.every(call => /^\s*(SELECT|WITH)\b/iu.test(call.sql)), 'projection remains strictly read-only');
  assert.ok(body.query_budget.statement_count <= 80, 'roster reuse adds no D1 request budget');
  const serialized = JSON.stringify(body);
  for (const forbidden of ['123456','pet-secret-123','pet-secret-456','pet-secret-789',
    'telegram_auth','auth_date','hash']) {
    assert.ok(!serialized.includes(forbidden), forbidden + ' must not leak');
  }
  const savedRun = body.tasks.find(item => item.source_key === 'moonpet.saved-run' && item.status === 'claim_ready');
  assert.equal(savedRun.owner_scope, 'original_pet');
  assert.ok(body.owner.pets.some(pet => pet.pet_ref === savedRun.source_pet_ref),
    'source-pet attribution must not move to the selected pet');

  const empty = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: fakeDb({ noPets: true }), TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
  assert.deepEqual(empty.owner.pets, []);
  assert.equal(empty.owner.pet_count, 0);
  const failing = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: fakeDb({ tableErrors: new Set(['telegram_pet_instances']) }),
      TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
  assert.equal(failing.owner.pet_count, null);
  assert.equal(failing.owner.pets, null, 'roster failure cannot become an empty roster');
});

test('PR3 source task helper contains exactly one evidence property after Wrangler warning cleanup', () => {
  const source = fs.readFileSync(new URL('../workers/moonboys-api/player-action-plan/sources.js', import.meta.url), 'utf8');
  const taskHelper = source.slice(source.indexOf('function task(now, input) {'),
    source.indexOf('function genericTask(now, source, status, health, detail = {})'));
  assert.equal((taskHelper.match(/\bevidence:\s*\{/gu) || []).length, 1);
  assert.match(taskHelper, /evidence:\s*\{ kind: meta\.evidence, \.\.\.\(input\.evidence \|\| \{\}\) \}/u);
});

test('signed action-plan pagination rejects stale ranking snapshot without skipping saved claims', async () => {
  const ownerEnv = { DB: fakeDb({ manyPending: true }), TELEGRAM_BOT_TOKEN: 'test' };
  const firstResponse = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })), ownerEnv, options());
  assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json();
  assert.match(first.snapshot, /^pap2_[a-f0-9]{32}$/u);
  assert.ok(first.pagination.next_cursor, 'large saved claim backlog must paginate');

  const identical = await handlePlayerActionPlanRoute(request(auth({
    limit: 100, cursor: first.pagination.next_cursor, snapshot: first.snapshot,
  })), { DB: fakeDb({ manyPending: true }), TELEGRAM_BOT_TOKEN: 'test' }, options());
  assert.equal(identical.status, 200);
  const continued = await identical.json();
  assert.equal(continued.snapshot, first.snapshot, 'repeated source read remains at same ranked revision');
  assert.ok(continued.tasks.length > 0);
  const originalIds = new Set(first.tasks.map(task => task.task_id));
  assert.ok(continued.tasks.every(task => !originalIds.has(task.task_id)),
    'continuation must not duplicate the first page');

  // A newly claimable job or run can sort before an offset; a backend that
  // accepts the old offset silently skips the displaced task. Force a
  // different authoritative saved-state projection with the same owner/day.
  const changed = await handlePlayerActionPlanRoute(request(auth({
    limit: 100, cursor: first.pagination.next_cursor, snapshot: first.snapshot,
  })), { DB: fakeDb({ manyPending: true, savedStates: true }), TELEGRAM_BOT_TOKEN: 'test' }, options());
  assert.equal(changed.status, 409, 're-ranked source must restart rather than apply the stale offset');
  assert.equal((await changed.json()).error, 'action_plan_snapshot_changed');
  assert.equal(changed.headers.get('Cache-Control'), 'no-store, private');

  const missing = await handlePlayerActionPlanRoute(request(auth({
    limit: 100, cursor: first.pagination.next_cursor,
  })), ownerEnv, options());
  assert.equal(missing.status, 400, 'no unversioned offset bypass');
  const wrongOwner = await handlePlayerActionPlanRoute(request(auth({
    limit: 100, cursor: first.pagination.next_cursor, snapshot: first.snapshot,
  })), { DB: fakeDb({ manyPending: true }), TELEGRAM_BOT_TOKEN: 'test' },
  options({verifyIdentity: async () => ({telegramId: 'different-owner'})}));
  assert.equal(wrongOwner.status, 409, 'fingerprint is bound to verified owner, not submitted selectors');
  const resumed = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: fakeDb({ manyPending: true, savedStates: true }), TELEGRAM_BOT_TOKEN: 'test' }, options());
  assert.equal(resumed.status, 200);
  assert.notEqual((await resumed.json()).snapshot, first.snapshot);
});

test('ranked snapshot excludes volatile read timestamps but detects authority changes', async () => {
  const task = {
    task_id: 'moonpet.jobs:opaque-session', source_pet_ref: 'pap_' + 'f'.repeat(24),
    owner_scope: 'original_pet', status: 'waiting', priority: 510,
    source_health: 'live', evidence: {kind:'server_projection'}, expires_at: null,
    period: {kind:'saved_timer',key:'saved-session'},
  };
  const original = await actionPlanSnapshotToken([task], 'signed-owner', '2026-10-17:all');
  assert.match(original, /^pap2_[a-f0-9]{32}$/u);
  assert.equal(await actionPlanSnapshotToken([{...task,read_at:'2026-10-17T23:00:00Z'}],
    'signed-owner','2026-10-17:all'), original,
  'timestamp-only refresh must not invalidate stable pagination');
  for (const patch of [
    {status:'claim_ready'}, {priority:40}, {blocking_reason_code:'source_missing'},
    {expires_at:'2026-10-17T23:40:00Z'}, {source_pet_ref:'pap_' + 'e'.repeat(24)},
  ]) {
    assert.notEqual(await actionPlanSnapshotToken([{...task,...patch}],
      'signed-owner','2026-10-17:all'),original,JSON.stringify(patch));
  }
  assert.notEqual(await actionPlanSnapshotToken([task], 'different-owner','2026-10-17:all'),original);
  assert.notEqual(await actionPlanSnapshotToken([task], 'signed-owner','2026-10-18:all'),original);
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
  const careCooldownQuery = db.calls.find((call) =>
    /ROW_NUMBER\(\) OVER \(PARTITION BY event_type/u.test(call.sql));
  assert.ok(careCooldownQuery, 'care source reads per-action latest accepted timestamp');
  assert.match(careCooldownQuery.sql, /ORDER BY julianday\(created_at\) DESC/u);
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

test('roster probe failures fail only live-pet projections, not separately saved rewards', async () => {
  const db = fakeDb({ tableErrors: new Set(['telegram_pet_instances']), savedStates: true,
    pendingContracts: true, pendingBossRewards: true, pendingClaimCount: 2 });
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.owner.pet_count, null, 'unknown roster is not zero pets');
  for (const key of ['moonpet.adoption-incubation', 'moonpet.daily-journey',
    'moonpet.weekly-journey', 'moonpet.care', 'moonpet.jobs',
    'moonpet.garden-kitchen-gym', 'moonpet.evolution', 'onboarding.pet-entry']) {
    assert.equal(payload.source_status[key]?.state, 'query_failed', key);
    assert.ok(payload.tasks.filter(t => t.source_key === key).every(t =>
      t.status === 'sync_unavailable' && t.source_health === 'query_failed'), key);
    assert.ok(!payload.top_actions.some(t => t.source_key === key), key);
  }
  // Raw pending claim rows are not independently verified: they can be
  // internal wallet-recovery reservations, not a player-facing claim.
  const bounty = payload.tasks.find(t => t.source_key === 'moonpet.claimable-rewards');
  assert.notEqual(bounty.status, 'claim_ready');
  assert.ok(!payload.top_actions.some(t => t.source_key === 'moonpet.claimable-rewards'));
  for (const key of ['moonpet.seven-of-seven-claim',
    'moonpet.contracts', 'moonpet.saved-run', 'moonpet.bosses-combat']) {
    assert.notEqual(payload.source_status[key]?.state, 'query_failed', key);
    const saved = payload.tasks.filter(t => t.source_key === key && t.status === 'claim_ready');
    assert.ok(saved.length, key + ' must preserve independently verified saved claims');
    assert.ok(saved.every(t => t.source_health === 'live'),
      key + ' must retain saved original-pet claim evidence');
  }
  // The Top 3 contains the globally ranked eligible subset. A fourth
  // independent saved reward remains claim-ready without being in Top 3.
  assert.deepEqual(payload.top_actions.map(t => t.task_id),
    rankActionPlanTasks(payload.tasks, payload.generated_at).filter(isImmediateAction)
      .slice(0, 3).map(t => t.task_id));
  assert.equal(payload.source_status['moonpet.bosses-combat'].partial, true);
  assert.notEqual(payload.source_status['telegram.daily-claim'].state, 'query_failed');
});

test('actually missing pet roster table reports missing schema to dependent sources', async () => {
  const present = new Set([
    'daily_wtf_events','daily_missed_perks','daily_opportunity_state',
    'arcade_progression_events','telegram_pet_daily_completion',
    'telegram_pet_daily_journey_objectives','telegram_pet_weekly_journey_objectives',
    'telegram_pet_reward_claims','telegram_pet_runs','telegram_pet_contracts',
    'telegram_pet_activity_sessions','telegram_pet_weekly_boss_victories_by_pet',
    'telegram_pet_garden_plots','telegram_pet_evolutions_by_pet',
    'wiki_mission_completions','championship_clout_daily','dead_run_sessions',
    'nbg_london_records','player_daily_mission_state',
  ]);
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: fakeDb({ tables: present }), TELEGRAM_BOT_TOKEN: 'test' }, options());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.owner.pet_count, null);
  assert.equal(payload.source_status['moonpet.daily-journey'].state, 'migration_pending');
  assert.notEqual(payload.source_status['moonpet.contracts'].state, 'migration_pending',
    'a missing active-roster table must not masquerade as a missing contract source');
});

test('legacy profile owners already satisfy pet entry without new arcade XP', async () => {
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: fakeDb({ noPets: true, lowXp: true, legacyOwner: true }), TELEGRAM_BOT_TOKEN: 'test' }, options());
  assert.equal(response.status, 200);
  const data = await response.json();
  const entry = data.tasks.find(t => t.source_key === 'onboarding.pet-entry');
  assert.equal(entry.status, 'complete', 'existing owner is eligible despite 200 lifetime Arcade XP');
  assert.match(entry.title, /restore existing pet/u);
  assert.equal(entry.progress.current, 200, 'do not inflate historical XP receipts');
  assert.ok(!data.top_actions.some(t => t.source_key === 'onboarding.pet-entry'));
});

test('legacy ownership survives active roster lookup outages', async () => {
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: fakeDb({ tableErrors: new Set(['telegram_pet_instances']), lowXp: true,
      legacyOwner: true }), TELEGRAM_BOT_TOKEN: 'test' }, options());
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.owner.pet_count, null);
  assert.equal(data.tasks.find(t => t.source_key === 'onboarding.pet-entry').status, 'complete');
  assert.equal(data.source_status['onboarding.pet-entry'].state, 'live');
});

test('shared projection deadline prevents serial slow reads from accumulating', async () => {
  const db = fakeDb({ delayedAllMs: 35 });
  const before = Date.now();
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: db, TELEGRAM_BOT_TOKEN: 'test' },
    options({ statementTimeoutMs: 1000, projectionTimeoutMs: 120 }));
  const elapsed = Date.now() - before;
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(elapsed < 650, 'entire read must be bounded, not dozens of 1-second sequential timeouts');
  assert.equal(payload.query_budget.projection_timeout_ms, 120);
  assert.ok(payload.summary.unavailable_sources > 0, 'later reads must fail closed after budget runs out');
  assert.ok(db.calls.filter(c => c.method === 'all').length < 20,
    'deadline should stop starting new queries rather than queue many slow reads');
});

test('weekly boss gate mirrors SQLite ROUND of fractional pet energy', async () => {
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: fakeDb({ bossReady: true, fractionalBossEnergy: true }), TELEGRAM_BOT_TOKEN: 'test' }, options());
  assert.equal(response.status, 200);
  const data = await response.json();
  const boss = data.tasks.find(task => task.source_key === 'moonpet.bosses-combat' && task.scope_ref);
  assert.equal(boss?.status, 'ready', '11.5 energy rounds up to the canonical 12');
  assert.equal(boss?.blocking_reason_code, null);
});

test('untrusted or unassigned saved-run pets are never given original-pet references', async () => {
  for (const invalidRun of ['null', 'foreign']) {
    const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
      { DB: fakeDb({ invalidRun }), TELEGRAM_BOT_TOKEN: 'test' }, options());
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.source_status['moonpet.saved-run'].state, 'query_failed');
    const runs = data.tasks.filter(task => task.source_key === 'moonpet.saved-run');
    assert.ok(runs.length);
    assert.ok(runs.every(task => task.status === 'sync_unavailable'
      && task.source_pet_ref === null && task.scope_ref === null));
    assert.ok(!data.top_actions.some(task => task.source_key === 'moonpet.saved-run'));
  }
});

test('daily claims consult and validate modern and legacy authorities', async () => {
  for (const [scenario, expected] of [
    [{ legacyDailyClaim: true }, 'claimed'],
    [{ claimAward: 'valid' }, 'claimed'],
    [{ claimAward: 'zero' }, 'sync_unavailable'],
    [{ claimAward: 'bad_reference' }, 'sync_unavailable'],
    [{ claimAward: 'missing_token' }, 'sync_unavailable'],
    [{ failDailyAuthority: 'legacy', claimAward: 'valid' }, 'sync_unavailable'],
    [{ failDailyAuthority: 'award', legacyDailyClaim: true }, 'sync_unavailable'],
  ]) {
    const db = fakeDb(scenario);
    const result = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
      { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
    const claim = result.tasks.find(t => t.source_key === 'telegram.daily-claim');
    assert.equal(claim.status, expected, JSON.stringify(scenario));
    assert.equal(result.top_actions.some(t => t.source_key === 'telegram.daily-claim'), false,
      'legacy and unverified claims must not be newly recommended');
    const legacySql = db.calls.find(t => /FROM telegram_xp_log/u.test(t.sql));
    assert.match(legacySql.sql, /DATE\(created_at\)=\?/u);
    assert.equal(legacySql.params[0], '123456');
    if (expected === 'sync_unavailable') {
      assert.equal(result.source_status['telegram.daily-claim'].state, 'query_failed');
    } else {
      assert.equal(claim.evidence.verified_completion, true);
    }
  }
});

test('null-attribution earned completion requires an active valid source pet', async () => {
  for (const [opts, status] of [
    [{ completionPetNull: true, noPets: true }, 'blocked'],
    [{ completionPetNull: true, tableErrors: new Set(['telegram_pet_instances']) }, 'sync_unavailable'],
    [{ completionPetNull: true }, 'claim_ready'],
  ]) {
    const r = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
      { DB: fakeDb(opts), TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
    const task = r.tasks.find(t => t.source_key === 'moonpet.seven-of-seven-claim'
      && t.period.key === '2026-10-17');
    assert.equal(task.status, status, JSON.stringify([...Object.keys(opts)]));
    if (status !== 'claim_ready') assert.ok(!r.top_actions.some(t => t.task_id === task.task_id));
  }
});

test('boss claim SQL proves an accepted owner-specific source event or exact legacy proof', async () => {
  const db = fakeDb({ pendingBossRewards: true });
  await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options());
  const sql = db.calls.find(t => /SELECT DISTINCT v.pet_id,v.season_key,v.week_key,v.boss_id/u.test(t.sql))?.sql;
  assert.ok(sql);
  assert.match(sql, /e.status='accepted'/u);
  assert.match(sql, /e.pet_id=v.pet_id/u);
  assert.match(sql, /e.season_key=v.season_key/u);
  assert.match(sql, /pet_weekly_boss_backfill/u);
  assert.match(sql, /e.id IS NULL AND EXISTS/u);
  assert.match(sql, /b.event_key=v.victory_event_key/u);
});

test('malformed saved session pet metadata never falls back to current active pet', async () => {
  const r = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: fakeDb({ savedStates: true, noJobPetId: true }), TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
  assert.equal(r.source_status['moonpet.jobs'].state, 'query_failed');
  assert.equal(r.tasks.filter(t => t.source_key === 'moonpet.jobs'
    && t.status === 'claim_ready').length, 0);
});

test('saved contracts without verified original-pet and season are unavailable', async () => {
  const db = fakeDb({ invalidContract: true });
  const r = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
  assert.equal(r.source_status['moonpet.contracts'].state, 'query_failed');
  const c = r.tasks.filter(t => t.source_key === 'moonpet.contracts');
  assert.ok(c.length && c.every(t => t.status === 'sync_unavailable' && !t.source_pet_ref));
  const sql = db.calls.find(t => /FROM telegram_pet_contracts c/u.test(t.sql))?.sql;
  assert.match(sql, /LEFT JOIN telegram_pet_instances i/u);
  assert.match(sql, /LEFT JOIN telegram_pet_season_slots s/u);
  assert.match(sql, /i.season_key=c.season_key/u);
});

test('active Moonpet activity prevents sleep from entering Top actions', async () => {
  const r = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: fakeDb({ savedStates: true, careEnergy: 15 }), TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
  const care = r.tasks.find(t => t.source_key === 'moonpet.care' && t.scope_ref);
  assert.equal(care.status, 'waiting');
  assert.equal(care.blocking_reason_code, 'pet_activity_active');
  assert.ok(!r.top_actions.some(t => t.task_id === care.task_id));
});

test('roster and lifetime XP lookup errors do not taint unrelated source projections', async () => {
  const db = fakeDb({ tableErrors: new Set(['telegram_pet_instances']),
    lowXp: true, failArcadeXp: true, pendingClaimCount: 1 });
  const r = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
  assert.equal(r.source_status['onboarding.pet-entry'].state, 'query_failed');
  for (const key of ['arcade.daily-opportunity', 'arcade.roguelite-objectives',
    'moonpet.seven-of-seven-claim', 'moonpet.claimable-rewards']) {
    assert.notEqual(r.source_status[key].state, 'query_failed', key);
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

test('owner-wide cooldown blocks feed across pets without blocking other care actions', async () => {
  const recent = '2026-10-17T11:59:40Z';
  const db = fakeDb({ threePets: true, careHunger: 80, careHappiness: 25,
    careEvents: [{ event_type: 'feed', last_action_at: recent }] });
  const result = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
  const care = result.tasks.filter(item => item.source_key === 'moonpet.care' && item.scope_ref);
  const petOne = care.find(item => item.source_pet_ref ===
    result.tasks.find(t => t.source_key === 'moonpet.adoption-incubation' && t.status === 'complete').source_pet_ref);
  assert.equal(petOne.status, 'ready', 'play must remain available after feed on same pet');
  assert.match(petOne.title, /play now/u);
  const petTwo = care.find(t => t !== petOne && t.progress.current > 0);
  assert.equal(petTwo.status, 'waiting', 'owner feed cooldown also blocks another pet');
  assert.equal(petTwo.next_ready_at, '2026-10-17T12:00:25.000Z');
  const sql = db.calls.find(t => /FROM telegram_pet_events/u.test(t.sql) && /ROW_NUMBER\(\) OVER \(PARTITION BY event_type/u.test(t.sql));
  assert.ok(sql && /telegram_id=\?/u.test(sql.sql), 'cooldown query is owner scoped');
  assert.doesNotMatch(sql.sql, /GROUP BY pet_id/u);
  assert.match(sql.sql, /ORDER BY julianday\(created_at\) DESC/u);
});

test('care evidence uses chronological SQLite ordering across ISO and D1 timestamps', async () => {
  // An older T/ISO timestamp sorts *after* a newer space-form D1 timestamp
  // under MAX(created_at), although the instant is earlier. Exercise the
  // actual source SQL with mixed accepted receipts, not a mocked sorted list.
  const db = fakeDb();
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options());
  assert.equal(response.status, 200);
  const careQuery = db.calls.find(entry => /FROM telegram_pet_events/u.test(entry.sql)
    && /ROW_NUMBER\(\) OVER \(PARTITION BY event_type/u.test(entry.sql));
  assert.ok(careQuery, 'care read must select the latest event for each action by timestamp');
  assert.match(careQuery.sql, /ORDER BY julianday\(created_at\) DESC/u);
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(`CREATE TABLE telegram_pet_events (
        telegram_id TEXT, status TEXT, event_type TEXT, created_at TEXT, metadata TEXT
      );
      INSERT INTO telegram_pet_events VALUES
        ('123456','accepted','feed','2026-10-17T11:59:00Z',NULL),
        ('123456','accepted','feed','2026-10-17 11:59:40',NULL),
        ('123456','accepted','play','2026-10-17T11:58:30Z',NULL),
        ('other-owner','accepted','feed','2026-10-17 11:59:59',NULL),
        ('123456','rejected','feed','2026-10-17 11:59:58',NULL),
        ('123456','accepted','use_item','2026-10-17T11:58:00Z','{"consumed_item_key":"street_pizza"}'),
        ('123456','accepted','use_item','2026-10-17 11:59:30','{"consumed_item_key":"moon_burger"}'),
        ('123456','accepted','use_item','2026-10-17 11:59:55','{invalid}');`);
    const rows = sqlite.prepare(careQuery.sql).all('123456');
    const byAction = new Map(rows.map(row => [row.event_type, row.last_action_at]));
    assert.equal(byAction.get('feed'), '2026-10-17 11:59:40',
      'newer D1 space timestamp must win over older ISO/T timestamp');
    assert.equal(byAction.get('play'), '2026-10-17T11:58:30Z',
      'independent action must keep its own last receipt');
    assert.equal(byAction.get('use_item'), '2026-10-17 11:59:30',
      'safe metadata filter and shared meal window must use chronological time');
    assert.equal(rows.length, 3, 'exclude another owner, rejected actions and invalid meals');
    const derived = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
      { DB: fakeDb({ careHunger: 80, careEvents: rows }), TELEGRAM_BOT_TOKEN: 'test' }, options());
    const payload = await derived.json();
    const care = payload.tasks.find(t => t.source_key === 'moonpet.care' && t.scope_ref);
    assert.equal(care.status, 'waiting',
      'feed/meal cooldown must use the newest 11:59:40 receipt, not an older ISO row');
    assert.equal(care.next_ready_at, '2026-10-17T12:00:25.000Z');
  } finally {
    sqlite.close();
  }
});

test('account play cooldown never blocks a different feed or clean action', async () => {
  const result = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: fakeDb({ careHunger: 80,
      careEvents: [{ event_type: 'play', last_action_at: '2026-10-17T11:59:40Z' }] }), TELEGRAM_BOT_TOKEN: 'test' },
    options())).json();
  const care = result.tasks.find(t => t.source_key === 'moonpet.care' && t.scope_ref);
  assert.equal(care.status, 'ready');
  assert.match(care.title, /feed now/u);
});

test('bag meal use shares feed cooldown without blocking play', async () => {
  const result = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: fakeDb({ careHunger: 80, careHappiness: 25,
      careEvents: [{ event_type: 'use_item', last_action_at: '2026-10-17T11:59:40Z' }] }), TELEGRAM_BOT_TOKEN: 'test' },
    options())).json();
  const care = result.tasks.find(t => t.source_key === 'moonpet.care' && t.scope_ref);
  assert.equal(care.status, 'ready');
  assert.match(care.title, /play now/u);
});

test('garden task identities change for new planted crop and retain same crop ID', async () => {
  const getGarden = async cropPlantedAt => {
    const result = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
      { DB: fakeDb({ cropPlantedAt }), TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
    return result.tasks.find(t => t.source_key === 'moonpet.garden-kitchen-gym' && t.scope_ref);
  };
  const a = await getGarden('2026-10-17T09:00:00Z');
  const repeated = await getGarden('2026-10-17T09:00:00Z');
  const b = await getGarden('2026-10-17T10:00:00Z');
  assert.equal(a.task_id, repeated.task_id);
  assert.notEqual(a.task_id, b.task_id);
  assert.match(a.task_id, /pap_[a-f0-9]{24}$/u);
  assert.doesNotMatch(a.task_id, /2026-10-17T09:00:00Z/u);
});

test('active Dead Run task identities derive from saved session', async () => {
  const getRun = async deadRunSessionId => {
    const result = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
      { DB: fakeDb({ deadRunActive: true, deadRunSessionId }), TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
    return result.tasks.find(t => t.source_key === 'games.dead-run');
  };
  const a = await getRun('run-A');
  const repeat = await getRun('run-A');
  const b = await getRun('run-B');
  assert.equal(a.task_id, repeat.task_id);
  assert.notEqual(a.task_id, b.task_id);
  assert.match(a.task_id, /pap_[a-f0-9]{24}$/u);
  assert.doesNotMatch(a.task_id, /run-A/u);
});

test('historical boss claims require canonical boss for original ISO week', async () => {
  const getBoss = async invalidBossId => {
    const result = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
      { DB: fakeDb({ pendingBossRewards: true, invalidBossId }), TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
    return result.tasks.filter(t => t.source_key === 'moonpet.bosses-combat' && t.status === 'claim_ready');
  };
  assert.equal((await getBoss(false)).length, 1, 'valid canonical reward appears');
  assert.equal((await getBoss(true)).length, 0, 'unclaimable mismatched boss cannot appear in recommended claims');
});

test('historical completion eligibility counts only the current UTC day', async () => {
  const r = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: fakeDb({ savedOldClaims: true }), TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
  const history = r.tasks.find(t => t.source_key === 'moonpet.seven-of-seven-claim'
    && t.period.key === '2026-10-16' && t.status === 'claim_ready');
  assert.ok(history, 'historic reward remains accessible and claim-ready');
  const today = r.tasks.filter(t => t.period.kind === 'utc_day'
    && t.period.key === '2026-10-17'
    && !['blocked','preview','sync_unavailable'].includes(t.status)).length;
  assert.equal(r.summary.eligible_today, today);
  assert.ok(r.summary.claims_ready >= 1, 'historical claim still appears in overall inbox total');
});

test('a stale or absent saved completion season is never claim ready', async () => {
  for (const bad of [{completionSeasonMissing:true},{completionStaleSeason:true}]) {
    const r = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
      { DB: fakeDb(bad), TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
    const completion = r.tasks.find(t=>t.source_key==='moonpet.seven-of-seven-claim'
      && t.period.key==='2026-10-17');
    assert.equal(completion.status, 'blocked');
    assert.equal(completion.blocking_reason_code, 'saved_source_pet_season_unverified');
    assert.ok(!r.top_actions.some(t=>t.task_id===completion.task_id));
  }
  const db = fakeDb();
  await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options());
  const sql = db.calls.find(c=>/FROM telegram_pet_daily_completion WHERE telegram_id=\? AND utc_day=\?/u.test(c.sql)).sql;
  assert.match(sql,/telegram_pet_season_slots s/u);
  assert.match(sql,/telegram_pet_instances i/u);
  assert.match(sql,/original_pet_verified/u);
});

test('low health plus low energy retains usable care during a running job', async () => {
  const r = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: fakeDb({ savedStates:true, careEnergy:15, careHealth:35 }), TELEGRAM_BOT_TOKEN:'test' },
    options())).json();
  const care = r.tasks.find(t=>t.source_key==='moonpet.care' && t.scope_ref);
  assert.equal(care.status,'ready');
  assert.match(care.title,/(?:feed|clean|play) now/u);
  assert.equal(care.blocking_reason_code,null);
});

test('garden rejects malformed persisted crop state', async () => {
  for (const patch of [{gardenWrongCrop:true},{gardenBadStatus:true},
    {gardenInvalidReady:true},{gardenInvalidOrder:true}]) {
    const r = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
      { DB: fakeDb({cropPlantedAt:'2026-10-17T09:00:00Z', ...patch}),TELEGRAM_BOT_TOKEN:'test' },
      options())).json();
    const crop=r.tasks.find(t=>t.source_key==='moonpet.garden-kitchen-gym' && t.scope_ref);
    assert.equal(crop.status,'sync_unavailable',JSON.stringify(patch));
    assert.equal(crop.blocking_reason_code,'pet_garden_state_invalid');
    assert.ok(!r.top_actions.some(t=>t.task_id===crop.task_id));
  }
});

test('weekly victory completion requires authoritative proof and canonical boss', async () => {
  const db = fakeDb({bossVictoryBeforePetWeek:true,bossReady:true,
    bossVictoryDay:'2026-10-16',ownershipClock:true});
  const r = await (await handlePlayerActionPlanRoute(request(auth({limit:100})),
    {DB:db,TELEGRAM_BOT_TOKEN:'test'},options())).json();
  assert.equal(r.tasks.find(t=>t.source_key==='moonpet.bosses-combat'&&t.scope_ref).status,'complete');
  const sql=db.calls.find(x=>/FROM telegram_pet_weekly_boss_victories_by_pet v\s+LEFT JOIN telegram_pet_weekly_boss_events a/su.test(x.sql)).sql;
  assert.match(sql,/e.status='accepted'/u);
  assert.match(sql,/e.reason='weekly_boss_attempt'/u);
  assert.match(sql,/pet_weekly_boss_backfill/u);
  assert.match(sql,/a.event_key=trim\(a.event_key\)/u);
  const stale=await (await handlePlayerActionPlanRoute(request(auth({limit:100})),
    {DB:fakeDb({bossVictoryBeforePetWeek:true,bossReady:true,
      bossVictoryDay:'2026-10-16',ownershipClock:true,bossInvalidVictory:true}),
    TELEGRAM_BOT_TOKEN:'test'},options())).json();
  assert.notEqual(stale.tasks.find(t=>t.source_key==='moonpet.bosses-combat'&&t.scope_ref).status,'complete');
});

test('owner and pet selector aliases are rejected before identity verification', async () => {
  for (const key of ['owner_ref','selected_pet_id','selected_pet_ref','pet_ref',
    'scope_ref','ownerId','petId','sourcePetRef','active_pet_key','user_id']) {
    const response=await handlePlayerActionPlanRoute(request({[key]:'attacker'}),
      {DB:fakeDb(),TELEGRAM_BOT_TOKEN:'test'},options());
    assert.equal(response.status,400,key);
  }
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
  // The API sorts verified claim-ready rows ahead of the advisory overflow.
  // Page through the full response to prove it is represented but not promoted.
  let overflow = result.tasks.find(t => t.source_key === 'moonpet.seven-of-seven-claim'
    && /37 more/u.test(t.title));
  let overflowCursor = result.pagination.next_cursor;
  while (!overflow && overflowCursor) {
    const next = await (await handlePlayerActionPlanRoute(request(auth({limit:100,cursor:overflowCursor,snapshot:result.snapshot})),
      {DB:fakeDb({manyPending:true}),TELEGRAM_BOT_TOKEN:'test'},options())).json();
    overflow = next.tasks.find(t => t.source_key === 'moonpet.seven-of-seven-claim'
      && /37 more/u.test(t.title));
    overflowCursor = next.pagination.next_cursor;
  }
  assert.equal(overflow?.status, 'preview', 'unread rows have no verified pet/season authority');
  assert.equal(overflow.blocking_reason_code, 'hidden_claim_authority_not_verified');
  assert.equal(result.top_actions.some(t => t.task_id === overflow.task_id), false);
  assert.equal(result.tasks.filter(t => t.source_key === 'moonpet.seven-of-seven-claim' && t.status === 'claim_ready').length, 100);
  let daily = result.tasks.find(t => t.source_key === 'moonpet.daily-seven-missions' && t.title === 'Daily Moonpet completion conditions');
  // The API deliberately pages at 100 tasks: the daily summary may be on a
  // later page when the member has 137 historic pending claim receipts.
  let cursor = result.pagination.next_cursor;
  while (!daily && cursor) {
    const next = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100, cursor, snapshot: result.snapshot })),
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
    [null, 'active'], ['upcoming', 'active'], ['checked_in', 'in_progress'], ['completed', 'complete'],
  ]) {
    const db = fakeDb({ wtfState: playerState });
    const result = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
      { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
    const window = result.tasks.find(t => t.source_key === 'battle.wtf-windows');
    assert.equal(window.status, expected, String(playerState));
    if (playerState && playerState !== 'upcoming')
      assert.ok(!result.top_actions.some(t => t.task_id === window.task_id));
    const wtfQuery = db.calls.find(t => /FROM daily_wtf_events e/u.test(t.sql));
    assert.match(wtfQuery.sql, /LEFT JOIN daily_wtf_player_events p/u);
    assert.equal(wtfQuery.params[0], '123456', 'signed owner must filter player participation');
    assert.equal(wtfQuery.params[1], '2026-10-17');
  }
});

test('persisted upcoming WTF state is waiting before its window and active during it', async () => {
  const db = fakeDb({ wtfState: 'upcoming' });
  for (const [at,expected] of [
    ['2026-10-17T10:30:00.000Z','waiting'],
    ['2026-10-17T12:00:00.000Z','active'],
  ]) {
    const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
      { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options({now:at}));
    assert.equal(response.status,200);
    const payload=await response.json();
    const task=payload.tasks.find(t=>t.source_key==='battle.wtf-windows');
    assert.equal(task.status,expected,at);
    assert.equal(payload.source_status['battle.wtf-windows'].state,'live');
  }
});

test('weekly boss daily-attempt read uses saved attack not optional generic event', async () => {
  const db = fakeDb({bossReady:true,bossAttempt:true});
  const response = await handlePlayerActionPlanRoute(request(auth({limit:100})),
    {DB:db,TELEGRAM_BOT_TOKEN:'test'},options());
  assert.equal(response.status,200);
  const data=await response.json();
  const boss=data.tasks.find(t=>t.source_key==='moonpet.bosses-combat'&&t.scope_ref);
  assert.equal(boss.status,'blocked');
  assert.equal(boss.blocking_reason_code,'moonpet_weekly_boss_daily_attempt_used');
  const q=db.calls.find(t=>/SELECT 1 AS present FROM telegram_pet_weekly_boss_events/u.test(t.sql));
  assert.ok(q);
  assert.equal(q.params[0],'123456');
  assert.equal(q.params[2],'2026-10-17');
  assert.equal(db.calls.some(t=>/SELECT 1 AS present FROM telegram_pet_events/u.test(t.sql)),false);
});

test('malformed activity metadata is guarded by CASE and cannot fabricate recovery', async () => {
  const db = fakeDb({ malformedMetadata: true });
  const r = await (await handlePlayerActionPlanRoute(request(auth({ limit: 100 })), { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options())).json();
  assert.equal(r.source_status['moonpet.jobs'].state, 'query_failed');
  assert.equal(r.tasks.find(t => t.source_key === 'moonpet.jobs' && t.scope_ref)?.status, 'sync_unavailable');
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
test('daily bounty claimability requires accepted progress and ignores unrelated recovery reservations', async () => {
  const day = '2026-10-17';
  const selected = getPetDailyBounties(day)[0];
  const completeEvidence = [{ event_type: selected.event_types[0], total: selected.required }];
  const scenarios = [
    { config: { pendingClaimCount: 9 }, ready: false },
    { config: { bountyAcceptedEvents: completeEvidence }, ready: true },
    { config: { bountyAcceptedEvents: completeEvidence, pendingClaimCount: 9 }, ready: true },
    { config: { bountyAcceptedEvents: completeEvidence, bountyAwarded: 7 }, ready: false },
    { config: { bountyAcceptedEvents: completeEvidence, bountyPending: 7 }, ready: false },
    { config: { bountyAcceptedEvents: completeEvidence, noPets: true }, ready: false },
  ];
  for (const { config, ready } of scenarios) {
    const db = fakeDb(config);
    const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
      { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options());
    assert.equal(response.status, 200);
    const plan = await response.json();
    const bounty = plan.tasks.find(t => t.source_key === 'moonpet.claimable-rewards');
    assert.equal(bounty.status === 'claim_ready', ready, JSON.stringify(config));
    assert.equal(plan.top_actions.some(t => t.task_id === bounty.task_id), ready &&
      plan.top_actions.some(t => t.source_key === 'moonpet.claimable-rewards'), JSON.stringify(config));
    const sql = db.calls.find(call => /SELECT 'event' AS record_type/u.test(call.sql));
    assert.ok(sql, 'bounty proof and settlement are read in one statement');
    assert.match(sql.sql, /status='accepted'/u);
    assert.match(sql.sql, /source='pet_bounty'/u);
    assert.match(sql.sql, /status IN \('pending','awarded'\)/u);
    assert.deepEqual(sql.params, ['123456', day, '123456', day]);
  }
});

test('unproven legacy boss participation never suppresses a current action', async () => {
  const db = fakeDb({ bossReady: true });
  const response = await handlePlayerActionPlanRoute(request(auth({ limit: 100 })),
    { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options());
  assert.equal(response.status, 200);
  const sqlCall = db.calls.find(entry => /SELECT e.pet_id,e.season_key FROM telegram_pet_events e/u.test(entry.sql));
  assert.ok(sqlCall, 'participation uses the source-event read');
  assert.match(sqlCall.sql, /e.event_key<>'' AND e.event_key=trim\(e.event_key\) AND length\(e.event_key\)<=180/u);
  assert.match(sqlCall.sql, /e.reason IN \('weekly_boss_attempt','weekly_boss_participation'\)/u);
  assert.match(sqlCall.sql, /pet_weekly_boss_backfill/u);
  assert.match(sqlCall.sql, /JOIN telegram_pet_weekly_boss_events legacy_b/u);
  // Execute that exact production SQL against an actual SQLite fixture.
  const sql = new DatabaseSync(':memory:');
  try {
    sql.exec(`
      CREATE TABLE telegram_pet_events (
        pet_id TEXT, telegram_id TEXT, season_key TEXT, status TEXT,
        event_type TEXT, event_key TEXT, day_key TEXT, reason TEXT,
        metadata TEXT, week_key TEXT
      );
      CREATE TABLE telegram_pet_weekly_boss_victories_by_pet (
        telegram_id TEXT, pet_id TEXT, season_key TEXT, week_key TEXT,
        victory_event_key TEXT, boss_id TEXT
      );
      CREATE TABLE telegram_pet_weekly_boss_events (
        telegram_id TEXT, week_key TEXT, boss_id TEXT, event_key TEXT,
        day_key TEXT, action TEXT, damage INTEGER
      );
    `);
    const makeEvent = (key, source, reason = 'weekly_boss_attempt') =>
      ['pet-secret-123','123456','2026-Q4','accepted','weekly_boss',key,'2026-10-17',reason,
        JSON.stringify({source,boss_id:'neon_titan',action:'strike',damage:15}), '2026-W42'];
    const addEvent = (...args) => sql.prepare(`INSERT INTO telegram_pet_events
      (pet_id,telegram_id,season_key,status,event_type,event_key,day_key,reason,metadata,week_key)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(...args);
    addEvent(...makeEvent(' untrimmed ', 'pet_weekly_boss'));
    addEvent(...makeEvent('unproven-backfill', 'pet_weekly_boss_backfill'));
    addEvent(...makeEvent('wrong-reason', 'pet_weekly_boss', 'random_event'));
    let rows = sql.prepare(sqlCall.sql).all(...sqlCall.params);
    assert.equal(rows.length, 0, 'untrimmed, wrong reason and unproven backfill are not accepted proof');
    addEvent(...makeEvent('valid-attack', 'pet_weekly_boss'));
    rows = sql.prepare(sqlCall.sql).all(...sqlCall.params);
    assert.deepEqual(rows.map(row => ({...row})), [{pet_id:'pet-secret-123', season_key:'2026-Q4'}]);
    sql.prepare(`DELETE FROM telegram_pet_events WHERE event_key='valid-attack'`).run();
    sql.prepare(`INSERT INTO telegram_pet_weekly_boss_victories_by_pet
      VALUES ('123456','pet-secret-123','2026-Q4','2026-W42','unproven-backfill','neon_titan')`).run();
    sql.prepare(`INSERT INTO telegram_pet_weekly_boss_events
      VALUES ('123456','2026-W42','neon_titan','unproven-backfill','2026-10-17','strike',15)`).run();
    rows = sql.prepare(sqlCall.sql).all(...sqlCall.params);
    assert.equal(rows.length, 1, 'exact legacy victory/attack proof is accepted');
  } finally {
    sql.close();
  }
});

test('nested selectors are rejected before authentication without rejecting verified credential IDs', async () => {
  let verifyCalls = 0;
  const verifyIdentity = async () => { verifyCalls++; return { telegramId: '123456' }; };
  for (const extra of [
    { filters: { selected_pet_id: 'foreign' } },
    { options: { owner_id: 'foreign' } },
    { filters: [{ sort: 'new' }, { selectedPetRef: 'foreign' }] },
    { options: { nested: { sourcePetRef: 'foreign' } } },
    { other: { payload: { scope_ref: 'foreign' } } },
    { telegram_auth: { id: '123456', auth_date: String(Math.floor(Date.now() / 1000)),
      hash: '0'.repeat(64), selected_pet_id: 'foreign' } },
  ]) {
    const db = fakeDb();
    const response = await handlePlayerActionPlanRoute(request(auth(extra)),
      { DB: db, TELEGRAM_BOT_TOKEN: 'test' }, options({verifyIdentity}));
    assert.equal(response.status, 400, JSON.stringify(extra));
    assert.equal(db.calls.length, 0, 'no D1 read before selector validation');
  }
  assert.equal(verifyCalls, 0, 'reject selectors before verifying credentials');
  const valid = await handlePlayerActionPlanRoute(request(auth({ filters: { group: 'all' } })),
    { DB: fakeDb(), TELEGRAM_BOT_TOKEN: 'test' }, options({verifyIdentity}));
  assert.equal(valid.status, 200);
  assert.equal(verifyCalls, 1);
});

test('website credentials share read-only statement and timeout budgets with projection', async () => {
  const realVerifier = (body, authEnv) =>
    verifyTelegramIdentityFromBody(body, authEnv, async () => true);
  const websiteAuth = auth({ telegram_auth: { id: '123456', hash: 's1_' + 'A'.repeat(43) } });
  const websiteDb = fakeDb({ websiteSession: true });
  const website = await handlePlayerActionPlanRoute(request(websiteAuth),
    { DB: websiteDb, TELEGRAM_BOT_TOKEN: 'test' }, options({verifyIdentity: realVerifier}));
  assert.equal(website.status, 200);
  const websiteBody = await website.json();
  const session = websiteDb.calls.find(call => /FROM telegram_website_credentials c/u.test(call.sql));
  assert.ok(session && session.method === 'first');
  assert.equal(session.params.length, 4);
  assert.equal(websiteBody.query_budget.statement_count, websiteDb.calls.length);
  const baselineDb = fakeDb();
  const baseline = await handlePlayerActionPlanRoute(request(auth()),
    { DB: baselineDb, TELEGRAM_BOT_TOKEN: 'test' }, options({verifyIdentity: realVerifier}));
  assert.equal(baseline.status, 200);
  const normalBody = await baseline.json();
  assert.equal(websiteBody.query_budget.statement_count, normalBody.query_budget.statement_count + 1);
  const slowDb = fakeDb({ websiteSession: true, websiteSessionDelayMs: 500 });
  const slow = await handlePlayerActionPlanRoute(request(websiteAuth),
    { DB: slowDb, TELEGRAM_BOT_TOKEN: 'test' },
    options({verifyIdentity: realVerifier, statementTimeoutMs: 15, projectionTimeoutMs: 300}));
  assert.equal(slow.status, 503, 'session read is capped by the same D1 statement timeout');
  assert.equal(slowDb.calls.filter(call => /FROM telegram_website_credentials c/u.test(call.sql)).length, 1);
  assert.equal(slowDb.calls.some(call => /FROM telegram_pet_instances i/u.test(call.sql)), false,
    'a failed auth read never starts owner projection');
  let sawUnsafePrepare = false;
  const unsafe = await handlePlayerActionPlanRoute(request(auth()),
    { DB: fakeDb(), TELEGRAM_BOT_TOKEN: 'test' }, options({verifyIdentity: async (_body, authEnv) => {
      sawUnsafePrepare = true;
      await authEnv.DB.prepare('UPDATE telegram_users SET xp=999').bind().first();
      return {telegramId: '123456'};
    }}));
  assert.ok(sawUnsafePrepare);
  assert.equal(unsafe.status, 503, 'auth cannot bypass the read-only SQL gate');
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
