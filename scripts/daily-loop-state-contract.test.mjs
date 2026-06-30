import assert from 'node:assert/strict';
import fs from 'node:fs';
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

const workerSplitPlan = fs.readFileSync(new URL('../docs/WORKER_SPLIT_PLAN.md', import.meta.url), 'utf8');
const truthMap = fs.readFileSync(new URL('../docs/LIVE_DAILY_LOOP_TRUTH_MAP.md', import.meta.url), 'utf8');

assert.ok(
  workerSplitPlan.includes('call `/daily-loop/state` once per page load/session through a shared frontend singleton or state layer'),
  'Worker split plan must require daily-loop state to be consumed through one shared frontend singleton/state layer'
);
assert.ok(
  truthMap.includes('fetched once per page/session by a shared frontend state layer'),
  'Truth map must warn that /daily-loop/state is an aggregator, not a per-widget endpoint'
);

function makeDb({ existingTables = [], failPatterns = [], rows = {} } = {}) {
  const tables = new Set(existingTables);
  const calls = [];
  return {
    _calls: calls,
    prepare(sql) {
      return {
        bind(...params) {
          return makeStatement(sql, params, tables, failPatterns, rows, calls);
        },
        first() {
          return makeStatement(sql, [], tables, failPatterns, rows, calls).first();
        },
        all() {
          return makeStatement(sql, [], tables, failPatterns, rows, calls).all();
        },
        run() {
          calls.push({ method: 'run', sql, params: [] });
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

function countRows(rowsByTable, tableName, params) {
  const rows = rowsByTable[tableName] || [];
  if (tableName === 'daily_missed_perks' && params.length >= 2) {
    return rows.filter((row) => String(row.telegram_id) === String(params[0]) && String(row.utc_day) === String(params[1])).length;
  }
  if (tableName === 'daily_missed_perks' && params.length >= 1) {
    return rows.filter((row) => String(row.telegram_id) === String(params[0])).length;
  }
  return rows.length;
}

function firstRowForSql(sql, params, rowsByTable) {
  if (String(sql).includes('COUNT(*) AS total')) {
    return { total: countRows(rowsByTable, 'daily_missed_perks', params) };
  }
  if (String(sql).includes('COUNT(*) AS events_total')) {
    return { events_total: countRows(rowsByTable, 'daily_missed_perks', params) };
  }
  if (String(sql).includes('COALESCE(SUM(missed_xp_value)')) {
    return { xp_total: 0 };
  }
  if (String(sql).includes('FROM daily_opportunity_state') && String(sql).includes('utc_day < ?')) {
    return (rowsByTable.daily_opportunity_state_prior || [])[0] || null;
  }
  if (String(sql).includes('FROM daily_opportunity_state') && String(sql).includes('utc_day = ?')) {
    return (rowsByTable.daily_opportunity_state_today || rowsByTable.daily_opportunity_state || [])[0] || null;
  }
  const tableName = tableFromSql(sql);
  return (rowsByTable[tableName] || [])[0] || null;
}

function allRowsForSql(sql, rowsByTable) {
  if (String(sql).includes('PRAGMA table_info(daily_missed_perks)')) {
    return rowsByTable.__daily_missed_perks_columns || [];
  }
  const tableName = tableFromSql(sql);
  return rowsByTable[tableName] || [];
}

function makeStatement(sql, params, tables, failPatterns, rowsByTable, calls) {
  return {
    async first() {
      calls.push({ method: 'first', sql, params });
      if (shouldFail(sql, failPatterns)) throw new Error(`mock query failed: ${failPatterns[0]}`);
      if (sql.includes('sqlite_master')) {
        const tableName = params[0];
        return tables.has(tableName) ? { name: tableName } : null;
      }
      return firstRowForSql(sql, params, rowsByTable);
    },
    async all() {
      calls.push({ method: 'all', sql, params });
      if (shouldFail(sql, failPatterns)) throw new Error(`mock query failed: ${failPatterns[0]}`);
      return { results: allRowsForSql(sql, rowsByTable) };
    },
    async run() {
      calls.push({ method: 'run', sql, params });
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

const linkedDb = makeDb({
  existingTables: ALL_TABLES,
  rows: {
    telegram_faction_members: [{
      id: 7,
      name: 'hard-fork-rockers',
      description: 'Hard Fork Rockers',
      icon: 'bolt',
      role: 'member',
      joined_at: '2026-06-01T00:00:00.000Z',
    }],
    daily_opportunity_state_prior: [{ utc_day: '2026-06-27' }],
    daily_opportunity_state_today: [{
      telegram_id: '12345',
      utc_day: '2026-06-30',
      daily_seed: 'seed-12345',
      chain_depth: 0,
      activated_at: '2026-06-30T12:00:00.000Z',
      last_roll_at: null,
      created_at: '2026-06-30T12:00:00.000Z',
      updated_at: '2026-06-30T12:00:00.000Z',
    }],
  },
});

const linkedState = await buildDailyLoopState({
  DB: linkedDb,
}, {
  now: '2026-06-30T12:45:00.000Z',
  verified: {
    telegramId: '12345',
    user: { username: 'dailyloop' },
  },
});

assert.equal(linkedState.faction_state.faction_id, 'hard-fork-rockers');
assert.equal(linkedState.faction_state.faction_table_id, 7);
assert.equal(linkedState.arcade_daily_state.label, 'live');

const callIndex = (needle) => linkedDb._calls.findIndex((call) => String(call.sql).includes(needle));
const priorLookupIndex = callIndex('utc_day < ?');
const missedBackfillInsertIndex = callIndex('INSERT INTO daily_missed_perks');
const todayActivationInsertIndex = callIndex('INSERT INTO daily_opportunity_state');

assert.ok(priorLookupIndex >= 0, 'linked daily-loop state must look for prior active days');
assert.ok(missedBackfillInsertIndex >= 0, 'linked daily-loop state must backfill missed inactive UTC days');
assert.ok(todayActivationInsertIndex >= 0, 'linked daily-loop state must create or reuse today after backfill');
assert.ok(priorLookupIndex < todayActivationInsertIndex, 'prior-day backfill lookup must happen before today activation insert');
assert.ok(missedBackfillInsertIndex < todayActivationInsertIndex, 'missed-day backfill must run before today activation insert');

const failedArcadeDb = makeDb({
  existingTables: ALL_TABLES,
  failPatterns: ['FROM daily_opportunity_state WHERE telegram_id = ? AND utc_day < ?'],
});
const failedArcadeState = await buildDailyLoopState({
  DB: failedArcadeDb,
}, {
  now: '2026-06-30T12:45:00.000Z',
  verified: {
    telegramId: '12345',
    user: { username: 'dailyloop' },
  },
});

assert.equal(failedArcadeState.source_status.arcade_daily_state.state, 'query_failed');
assert.notEqual(failedArcadeState.source_status.arcade_daily_state.state, 'live');
assert.equal(
  failedArcadeDb._calls.some((call) => String(call.sql).includes('INSERT INTO daily_opportunity_state')),
  false,
  'daily-loop must not create today activation after missed-day backfill lookup fails'
);

console.log('daily-loop-state-contract tests passed');
