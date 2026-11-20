import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { handleClanOperations } from '../workers/moonboys-api/routes/clan-operations.js';
import { RENOWN_PER_TIER, advanceMine, dailyRouteIndex, describeMine } from '../workers/moonboys-api/shared/clan-mining.js';

const migration = readFileSync(new URL('../workers/moonboys-api/migrations/116_clan_operations.sql', import.meta.url), 'utf8');

const factionTable = `
  CREATE TABLE blocktopia_progression (telegram_id TEXT PRIMARY KEY, faction TEXT, faction_xp INTEGER, gems INTEGER)
`;
const factionRows = `
  INSERT INTO blocktopia_progression VALUES ('101', 'rugpull-miners', 77, 8),
    ('102', 'all-city-bulls', 88, 9), ('103', 'rugpull-minors', 33, 2)
`;

function fixture(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.exec(`${factionTable}; ${factionRows}; ${migration}`);
  const db = {
    prepare(statement) {
      const query = sql.prepare(statement);
      return {
        bind(...args) {
          return {
            first: async () => query.get(...args) ?? null,
          };
        },
      };
    },
  };
  return { ...requestFixture(db), sql };
}

function requestFixture(db) {
  const settings = { time: new Date('2026-11-20T12:00:00Z'), chance: 0, enabled: 'true' };
  async function request({ action, revision, day = '2026-11-20', id = '101', signed = true, method = 'POST' } = {}) {
    const path = `/clan-operations/${action ? 'move' : 'state'}`;
    const body = method === 'POST' ? JSON.stringify({
      telegram_auth: { id, auth_date: Math.floor(Date.now() / 1000), hash: 'a'.repeat(64) },
      action, revision, utc_day: day, renown: 99_999_999, telegram_id: '102', ore: 99,
    }) : undefined;
    const response = await handleClanOperations(new Request(`https://local.test${path}`, { method, body }),
      { DB: db, CLAN_OPERATIONS_ENABLED: settings.enabled }, {
        path,
        respond: (data, status = 200) => Response.json(data, { status }),
        verifyTelegramAuth: async () => signed,
        now: () => settings.time,
        roll: () => settings.chance,
      });
    return { status: response.status, data: await response.json() };
  }
  async function fill(data) {
    while (data.ore < data.mine.target) {
      const move = await request({ action: 'safe', revision: data.revision, day: data.utc_day });
      assert.equal(move.status, 200);
      data = move.data;
    }
    return data;
  }
  return { request, fill, settings };
}

test('feature is closed by default and a signed current miner is required', async t => {
  const { request, settings, sql } = fixture(t);
  settings.enabled = '';
  assert.deepEqual(await request({ method: 'GET' }), { status: 200, data: { ok: true, enabled: false } });
  assert.equal((await request()).status, 404);
  settings.enabled = 'true';
  assert.equal((await request({ signed: false })).status, 401);
  assert.equal((await request({ id: '102' })).data.error, 'faction_not_in_pilot');
  assert.equal((await request({ id: '999' })).data.error, 'join_faction');
  assert.equal((await request({ id: '103' })).status, 200, 'legacy faction alias');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM clan_operation_days').get().n, 0, 'state read is side-effect-free');
});

test('a lost chute can be cleared and braced before mining deep again', async t => {
  const { request } = fixture(t);
  assert.equal((await request({ action: 'bank', revision: 0 })).status, 409);
  const deep = await request({ action: 'deep', revision: 0 });
  assert.equal(deep.data.last_outcome, 'cave_in');
  assert.deepEqual(deep.data.mine.actions, ['recover']);
  const recovery = await request({ action: 'recover', revision: 1 });
  assert.equal(recovery.data.braced, true);
  const dig = await request({ action: 'deep', revision: 2 });
  assert.equal(dig.data.ore, 3);
  assert.equal(dig.data.renown_today, 0);
});

test('concurrent bank and stale replay settle once, with owner-scoped durable finds and UTC reset', async t => {
  const { request, fill, settings, sql } = fixture(t);
  let state = await fill((await request()).data);
  const bank = () => request({ action: 'bank', revision: state.revision });
  const double = await Promise.all([bank(), bank()]);
  assert.deepEqual(double.map(response => response.status).sort(), [200, 409]);
  assert.equal((await bank()).status, 409);
  state = double.find(response => response.status === 200).data;
  assert.equal(state.renown_today, RENOWN_PER_TIER);
  assert.equal(state.crew_banks, 1);
  assert.equal(state.collection[0].name, state.mine.finds[0]);
  assert.equal((await request({ id: '103' })).data.collection.length, 0);
  for (let tier = 2; tier <= 3; tier++) {
    state = await fill(state);
    state = (await bank()).data;
    assert.equal(state.renown_today, tier * RENOWN_PER_TIER);
  }
  assert.equal(state.status, 'complete');
  assert.deepEqual(state.mine.actions, []);
  assert.equal((await bank()).status, 409);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM clan_operation_awards').get().n, 3);
  assert.deepEqual(
    Array.from(Object.values(sql.prepare("SELECT faction_xp, gems FROM blocktopia_progression WHERE telegram_id = '101'").get())),
    [77, 8],
  );

  settings.time = new Date('2026-11-21T00:00:00Z');
  assert.equal((await request({ action: 'safe', revision: 0 })).status, 409);
  state = (await request()).data;
  assert.equal(state.renown_today, 0);
  assert.equal(state.renown_total, 3 * RENOWN_PER_TIER);
  assert.equal(state.collection.length, 3);
  assert.equal(state.resets_at, '2026-11-22T00:00:00.000Z');
  assert.equal((await request({ action: 'safe', revision: 0, day: state.utc_day })).data.ore, 1);
});

test('a database failure writing the award also rolls back the bank', async t => {
  const { request, fill, sql } = fixture(t);
  const state = await fill((await request()).data);
  sql.exec(`
    CREATE TRIGGER reject_test_bank BEFORE INSERT ON clan_operation_awards
    BEGIN SELECT RAISE(ABORT, 'failed receipt'); END;
  `);
  assert.equal((await request({ action: 'bank', revision: state.revision })).status, 503);
  const reread = (await request()).data;
  assert.equal(reread.revision, state.revision);
  assert.equal(reread.tier, 0);
  assert.equal(reread.renown_today, 0);
});

async function localD1(t) {
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, compatibilityDate: '2026-04-12',
    script: 'export default {fetch(){return new Response()}}',
    d1Databases: { DB: 'clan-mining-test' },
  }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  // Preserve the complete trigger body when loading the migration.
  const schema = new DatabaseSync(':memory:');
  try {
    schema.exec(migration);
    const objects = schema.prepare('SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid').all();
    await db.batch([factionTable, factionRows, ...objects.map(row => row.sql)].map(sql => db.prepare(sql)));
  } finally {
    schema.close();
  }
  return db;
}

test('concurrent banks on D1 return one success and one conflict with one receipt', { timeout: 30_000 }, async t => {
  const db = await localD1(t);
  const { request, fill } = requestFixture(db);
  const state = await fill((await request()).data);
  const bank = () => request({ action: 'bank', revision: state.revision });
  const responses = await Promise.all([bank(), bank()]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const winner = responses.find(response => response.status === 200).data;
  assert.equal(winner.tier, 1);
  assert.equal(winner.renown_today, RENOWN_PER_TIER);
  assert.equal(winner.collection.length, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM clan_operation_awards').first()).n, 1);
});

test('a D1 refresh overlapping the next bank returns one consistent snapshot', { timeout: 30_000 }, async t => {
  const db = await localD1(t);
  const { request, fill } = requestFixture(db);
  const first = await fill((await request()).data);
  const firstBank = await request({ action: 'bank', revision: first.revision });
  assert.equal(firstBank.status, 200);
  const before = await fill(firstBank.data);
  assert.equal(before.tier, 1);

  const read = Promise.withResolvers();
  const release = Promise.withResolvers();
  const refresh = requestFixture({
    prepare(sql) {
      const statement = db.prepare(sql);
      if (!/FROM clan_operation_days WHERE|LEFT JOIN clan_operation_days/.test(sql)) return statement;
      return {
        bind(...args) {
          const query = statement.bind(...args);
          return {
            async first() {
              const result = await query.first();
              read.resolve();
              await release.promise;
              return result;
            },
          };
        },
      };
    },
  }).request();
  try {
    await Promise.race([read.promise, refresh.then(response => {
      throw new Error(`Refresh returned before the snapshot pause: ${response.status}`);
    })]);
    const bank = await request({ action: 'bank', revision: before.revision });
    assert.equal(bank.status, 200);
  } finally {
    release.resolve();
  }
  const overlap = await refresh;
  assert.equal(overlap.status, 200);
  assert.equal(overlap.data.revision, before.revision);
  assert.equal(overlap.data.tier, 1);
  assert.equal(overlap.data.renown_today, RENOWN_PER_TIER);
  assert.equal(overlap.data.collection.length, 1);
  assert.equal(overlap.data.crew_banks, 1);
  const after = (await request()).data;
  assert.equal(after.tier, 2);
  assert.equal(after.renown_today, 2 * RENOWN_PER_TIER);
  assert.equal(after.collection.length, 2);
  assert.equal(after.crew_banks, 2);
});

test('all 30 daily routes offer three equally paid tiers with a safe route', () => {
  const routeNames = new Set();
  for (let day = 1; day <= 30; day++) {
    const date = new Date(Date.UTC(2026, 10, day));
    let state = { route_index: dailyRouteIndex(date), tier: 0, ore: 0, braced: 0, collapsed: 0 };
    routeNames.add(describeMine(state.route_index, state).name);
    let awards = 0;
    for (let move = 0; move < 18; move++) {
      const mine = describeMine(state.route_index, state);
      if (mine.actions.length === 0) break;
      const action = mine.actions.includes('bank') ? 'bank' : 'safe';
      if (action === 'bank') awards += mine.renown_per_tier;
      state = { ...state, ...advanceMine(state, action, 0) };
    }
    assert.equal(awards, 30_000);
    assert.equal(state.tier, 3);
  }
  assert.equal(routeNames.size, 3);
});
