import assert from 'node:assert/strict';
import {
  buildDailyLoopState,
  getNextUtcResetTimestamp,
  getUtcDay,
} from '../workers/moonboys-api/routes/daily-loop-state.js';

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

function makeDb(existingTables = []) {
  const tables = new Set(existingTables);
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return makeStatement(sql, params, tables);
        },
        first() {
          return makeStatement(sql, [], tables).first();
        },
        all() {
          return makeStatement(sql, [], tables).all();
        },
        run() {
          return Promise.resolve({ success: true, meta: { changes: 0 } });
        },
      };
    },
  };
}

function makeStatement(sql, params, tables) {
  return {
    async first() {
      if (sql.includes('sqlite_master')) {
        const tableName = params[0];
        return tables.has(tableName) ? { name: tableName } : null;
      }
      return null;
    },
    async all() {
      return { results: [] };
    },
    async run() {
      return { success: true, meta: { changes: 0 } };
    },
  };
}

assert.equal(getUtcDay(new Date('2026-06-30T23:59:59.999Z')), '2026-06-30');
assert.equal(getUtcDay(new Date('2026-07-01T00:00:00.000Z')), '2026-07-01');
assert.equal(getNextUtcResetTimestamp(new Date('2026-06-30T23:59:59.999Z')), '2026-07-01T00:00:00.000Z');
assert.equal(getNextUtcResetTimestamp(new Date('2026-07-01T00:00:00.000Z')), '2026-07-02T00:00:00.000Z');

const noTablesState = await buildDailyLoopState({
  DB: makeDb([]),
}, {
  now: '2026-06-30T12:00:00.000Z',
});

assert.equal(noTablesState.utc_day, '2026-06-30');
assert.equal(noTablesState.next_utc_reset_at, '2026-07-01T00:00:00.000Z');
assert.deepEqual(Object.keys(noTablesState.source_status).sort(), EXPECTED_SOURCE_KEYS.sort());
for (const [key, status] of Object.entries(noTablesState.source_status)) {
  if (key === 'sam_status') assert.equal(status.state, 'live');
  else assert.notEqual(status.state, 'live');
}
assert.equal(noTablesState.source_status.sam_status.source, 'worker_api');

const allTablesExceptWtfRowsState = await buildDailyLoopState({
  DB: makeDb([
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
  ]),
}, {
  now: '2026-06-30T12:00:00.000Z',
});

assert.equal(allTablesExceptWtfRowsState.source_status.daily_wtf_status.state, 'preview');
assert.equal(allTablesExceptWtfRowsState.source_status.daily_wtf_status.source, 'server_schedule');
assert.equal(allTablesExceptWtfRowsState.daily_wtf_status.label, 'preview');
assert.ok(allTablesExceptWtfRowsState.daily_wtf_status.events.every((event) => event.source_label !== 'live'));

console.log('daily-loop-state-contract tests passed');
