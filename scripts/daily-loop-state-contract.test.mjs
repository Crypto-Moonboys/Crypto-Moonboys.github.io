import assert from 'node:assert/strict';
import {
  buildDailyLoopState,
  getCurrentUtcDayStartedAt,
  getNextUtcResetTimestamp,
  getSecondsUntilReset,
  getUtcDay,
} from '../workers/moonboys-api/routes/daily-loop-state.js';

const ALL_TABLES = [
  'telegram_users',
  'telegram_faction_members',
  'telegram_factions',
  'player_faction_signal_state',
  'player_daily_mission_state',
  'wiki_mission_completions',
  'daily_opportunity_state',
  'battle_chamber_faction_clout',
  'battle_chamber_activity_log',
  'daily_wtf_events',
  'daily_wtf_player_events',
  'daily_wtf_chain_options',
  'daily_missed_perks',
  'telegram_daily_digest_log',
  'telegram_group_announcement_log',
];

const EXPECTED_SOURCE_KEYS = [
  'identity',
  'sam_status',
  'faction_state',
  'daily_missions',
  'wiki_missions',
  'arcade_daily_state',
  'battle_chamber_activity',
  'daily_wtf_status',
  'missed_opportunities',
  'telegram_digest_group_status',
];

function makeDb({ existingTables = [], failPatterns = [], rows = {} } = {}) {
  const tables = new Set(existingTables);
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return makeStatement(sql, params, tables, failPatterns, rows);
        },
        first() {
          return makeStatement(sql, [], tables, failPatterns, rows).first();
        },
        all() {
          return makeStatement(sql, [], tables, failPatterns, rows).all();
        },
        run() {
          return Promise.resolve({ success: true, meta: { changes: 0 } });
        },
      };
    },
  };
}

function shouldFail(sql, failPatterns) {
  return failPatterns.some((pattern) => String(sql).includes(pattern));
}

function tableFromSql(sql) {
  const match = String(sql).match(/\bFROM\s+([a-zA-Z0-9_]+)/i);
  return match ? match[1] : null;
}

function makeStatement(sql, params, tables, failPatterns, rowsByTable) {
  return {
    async first() {
      if (shouldFail(sql, failPatterns)) throw new Error(`mock query failed: ${failPatterns[0]}`);
      if (sql.includes('sqlite_master')) {
        const tableName = params[0];
        return tables.has(tableName) ? { name: tableName } : null;
      }
      const tableName = tableFromSql(sql);
      return (rowsByTable[tableName] || [])[0] || null;
    },
    async all() {
      if (shouldFail(sql, failPatterns)) throw new Error(`mock query failed: ${failPatterns[0]}`);
      const tableName = tableFromSql(sql);
      return { results: rowsByTable[tableName] || [] };
    },
    async run() {
      if (shouldFail(sql, failPatterns)) throw new Error(`mock query failed: ${failPatterns[0]}`);
      return { success: true, meta: { changes: 0 } };
    },
  };
}

assert.equal(getUtcDay(new Date('2026-06-30T23:59:59.999Z')), '2026-06-30');
assert.equal(getUtcDay(new Date('2026-07-01T00:00:00.000Z')), '2026-07-01');
assert.equal(getCurrentUtcDayStartedAt(new Date('2026-06-30T23:59:59.999Z')), '2026-06-30T00:00:00.000Z');
assert.equal(getNextUtcResetTimestamp(new Date('2026-06-30T23:59:59.999Z')), '2026-07-01T00:00:00.000Z');
assert.equal(getNextUtcResetTimestamp(new Date('2026-07-01T00:00:00.000Z')), '2026-07-02T00:00:00.000Z');
assert.equal(getSecondsUntilReset(new Date('2026-06-30T23:59:30.000Z')), 30);

const noTablesState = await buildDailyLoopState({
  DB: makeDb(),
}, {
  now: '2026-06-30T12:00:00.000Z',
});

assert.equal(noTablesState.utc_day, '2026-06-30');
assert.equal(noTablesState.current_utc_day_started_at, '2026-06-30T00:00:00.000Z');
assert.equal(noTablesState.next_utc_reset_at, '2026-07-01T00:00:00.000Z');
assert.equal(noTablesState.seconds_until_reset, 43200);
assert.deepEqual(Object.keys(noTablesState.source_status).sort(), EXPECTED_SOURCE_KEYS.sort());
for (const [key, status] of Object.entries(noTablesState.source_status)) {
  if (key === 'sam_status') assert.equal(status.state, 'live');
  else assert.equal(status.state, 'migration_pending');
}

const emptyTablesState = await buildDailyLoopState({
  DB: makeDb({ existingTables: ALL_TABLES }),
}, {
  now: '2026-06-30T12:45:00.000Z',
});

assert.equal(emptyTablesState.source_status.battle_chamber_activity.state, 'live_empty');
assert.equal(emptyTablesState.source_status.telegram_digest_group_status.state, 'live_empty');
assert.equal(emptyTablesState.source_status.daily_wtf_status.state, 'preview');
assert.equal(emptyTablesState.source_status.daily_wtf_status.source, 'server_schedule');
assert.equal(emptyTablesState.daily_wtf_status.label, 'preview');
assert.ok(emptyTablesState.daily_wtf_status.events.every((event) => event.source_label !== 'live'));

const midday = emptyTablesState.daily_wtf_status.events.find((event) => event.event_id === 'wtf-midday-rush');
const morning = emptyTablesState.daily_wtf_status.events.find((event) => event.event_id === 'wtf-morning-signal');
const evening = emptyTablesState.daily_wtf_status.events.find((event) => event.event_id === 'wtf-evening-burst');
assert.equal(midday.status, 'active');
assert.equal(morning.status, 'expired');
assert.equal(evening.status, 'upcoming');

const persistedWtfState = await buildDailyLoopState({
  DB: makeDb({
    existingTables: ALL_TABLES,
    rows: {
      daily_wtf_events: [{
        event_id: 'wtf-midday-rush',
        utc_day: '2026-06-30',
        event_type: 'faction_rush',
        title: 'Midday Faction Rush',
        description: 'Persisted row',
        starts_at: '2026-06-30T12:00:00.000Z',
        ends_at: '2026-06-30T13:30:00.000Z',
        required_action: 'complete_faction_or_battle_action',
        reward_key: 'wtf:2026-06-30:midday',
        xp_multiplier_display: '5x XP opportunity',
        theme: 'faction-overdrive',
      }],
    },
  }),
}, {
  now: '2026-06-30T12:45:00.000Z',
});

assert.equal(persistedWtfState.source_status.daily_wtf_status.state, 'live');
assert.equal(persistedWtfState.daily_wtf_status.events[0].source_label, 'live');
assert.equal(persistedWtfState.daily_wtf_status.events[0].status, 'active');

const failedWtfState = await buildDailyLoopState({
  DB: makeDb({
    existingTables: ALL_TABLES,
    failPatterns: ['FROM daily_wtf_events'],
  }),
}, {
  now: '2026-06-30T12:45:00.000Z',
});

assert.equal(failedWtfState.source_status.daily_wtf_status.state, 'query_failed');
assert.notEqual(failedWtfState.source_status.daily_wtf_status.state, 'live');
assert.ok(failedWtfState.daily_wtf_status.events.every((event) => event.source_label !== 'live'));

for (const [key, status] of Object.entries(failedWtfState.source_status)) {
  if (key !== 'sam_status' && status.state !== 'live') continue;
  if (key === 'daily_wtf_status') assert.fail('query_failed Daily WTF state must never be live');
}

console.log('daily-loop-state-contract tests passed');
