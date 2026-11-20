import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { handleClanOperations } from '../workers/moonboys-api/routes/clan-operations.js';
import { RENOWN_PER_TIER, advanceMine, dailyRouteIndex, describeMine } from '../workers/moonboys-api/shared/clan-mining.js';
import { advanceWall, describeWall } from '../workers/moonboys-api/shared/clan-graff.js';
import { advanceTrail, describeTrail } from '../workers/moonboys-api/shared/clan-nomad-trail.js';

const trailsMigration = readFileSync(new URL('../workers/moonboys-api/migrations/118_clan_nomad_bears.sql', import.meta.url), 'utf8');

const wallsMigration = readFileSync(new URL('../workers/moonboys-api/migrations/117_clan_graffpunks.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../workers/moonboys-api/migrations/116_clan_operations.sql', import.meta.url), 'utf8');

const factionTable = `
  CREATE TABLE blocktopia_progression (telegram_id TEXT PRIMARY KEY, faction TEXT, faction_xp INTEGER, gems INTEGER)
`;
const factionRows = `
  INSERT INTO blocktopia_progression VALUES ('101', 'rugpull-miners', 77, 8),
    ('102', 'all-city-bulls', 88, 9), ('103', 'rugpull-minors', 33, 2), ('104', 'graff-punks', 99, 4), ('105', 'nomad-bears', 60, 5)
`;

function fixture(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.exec(`${factionTable}; ${factionRows}; ${migration} ${wallsMigration} ${trailsMigration}`);
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
  async function request({ action, revision, day = '2026-11-20', id = '101', signed = true, method = 'POST', faction, operation_ui = 'wall-v1', expedition_ui = 'trail-v1' } = {}) {
    const path = `/clan-operations/${action ? 'move' : 'state'}`;
    const body = method === 'POST' ? JSON.stringify({
      telegram_auth: { id, auth_date: Math.floor(Date.now() / 1000), hash: 'a'.repeat(64) },
      action, revision, operation_ui, expedition_ui, operation_faction: faction, utc_day: day, renown: 99_999_999, telegram_id: '102', ore: 99,
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
    const alterEnd = wallsMigration.indexOf(';') + 1;
    await db.batch([wallsMigration.slice(0, alterEnd), wallsMigration.slice(alterEnd)].map(sql => db.prepare(sql)));
    await db.prepare(trailsMigration).run();
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

test('GraffPUNKS layers grant one print and the same Renown cap through D1', { timeout: 30_000 }, async t => {
  const db = await localD1(t);
  const { request, settings } = requestFixture(db);
  const account = { id: '104', faction: 'graffpunks' };
  const getWall = () => request(account);
  for (const action of [undefined, 'paint-0']) {
    const cachedClient = await request({ ...account, action, revision: 0, operation_ui: null });
    assert.equal(cachedClient.status, 409);
    assert.equal(cachedClient.data.error, 'operation_unavailable');
  }
  const cachedMiner = await request({ id: '101', operation_ui: null });
  assert.equal(cachedMiner.status, 200);
  assert.ok(cachedMiner.data.mine);
  const move = (state, action) => request({ ...account, day: state.utc_day, revision: state.revision, action });
  assert.equal((await request({ id: '101', faction: 'graffpunks' })).data.error, 'wrong_operation_faction');
  let state = (await getWall()).data;
  const initialWall = state.wall.name;
  assert.equal(state.faction_id, 'graffpunks');
  assert.equal(state.renown_today, 0);
  assert.equal((await move(state, 'bank')).status, 409);
  assert.equal((await move(state, 'deep')).status, 400);
  const beforeCombo = state.wall.panels.map(panel => panel.shade);
  const first = await move(state, 'blend-0');
  assert.equal(first.status, 200);
  state = first.data;
  assert.equal(state.wall.panels.filter((panel, i) => panel.shade !== beforeCombo[i]).length, 2);
  assert.deepEqual((await getWall()).data.wall.panels, state.wall.panels, 'wall survives a reload');

  for (let tier = 1; tier <= 3; tier++) {
    for (const panel of [0, 1, 2]) {
      for (let turn = 0; turn < 2 && !state.wall.panels[panel].matched; turn++) {
        const painted = await move(state, `paint-${panel}`);
        assert.equal(painted.status, 200);
        state = painted.data;
      }
    }
    assert.ok(state.wall.panels.every(panel => panel.matched));
    const banks = await Promise.all([move(state, 'bank'), move(state, 'bank')]);
    assert.deepEqual(banks.map(result => result.status).sort(), [200, 409]);
    state = banks.find(result => result.status === 200).data;
    assert.equal(state.tier, tier);
    assert.equal(state.renown_today, tier * RENOWN_PER_TIER);
    assert.equal(state.crew_banks, tier);
    assert.equal(state.collection.length, tier);
    assert.ok(state.collection.every(entry => entry.specimen_key.startsWith('wall-v2-')));
  }
  assert.equal(state.status, 'complete');
  assert.equal((await move(state, 'bank')).status, 409);
  assert.equal((await request()).data.crew_banks, 0, 'Miners have their own crew count');

  await db.prepare("UPDATE blocktopia_progression SET faction = 'rugpull-miners' WHERE telegram_id = '104'").run();
  const miners = { id: '104', faction: 'rugpull-miners' };
  assert.equal((await request(miners)).data.error, 'operation_faction_locked');
  assert.equal((await request({ ...miners, action: 'safe', revision: state.revision })).status, 409);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM clan_operation_awards').first()).n, 3);
  settings.time = new Date('2026-11-21T00:00:00Z');
  assert.equal((await request(miners)).data.mine.actions.includes('safe'), true);

  await db.prepare("UPDATE blocktopia_progression SET faction = 'graffpunks' WHERE telegram_id = '104'").run();
  state = (await getWall()).data;
  assert.notEqual(state.wall.name, initialWall);
  assert.equal(state.renown_today, 0);
  assert.equal(state.renown_total, 30_000);
  assert.equal(state.collection.length, 3);
});

test('each daily stencil has three solvable layers and combo moves shorten the route', () => {
  const names = new Set();
  const pairings = new Set();
  for (let route_index = 0; route_index < 3; route_index++) {
    let state = { route_index, tier: 0, operationState: {} };
    let count = 0;
    names.add(describeWall(route_index, 0).name);
    pairings.add(describeWall(route_index, 0).actions.filter(({ id }) => id.startsWith('blend')).map(({ label }) => label).join(','));
    while (state.tier < 3) {
      const wall = describeWall(route_index, state.tier, state.operationState.panels);
      const panel = wall.panels.findIndex(tile => !tile.matched);
      const next = advanceWall(state, panel < 0 ? 'bank' : `paint-${panel}`);
      assert.ok(next);
      state = { route_index, ...next };
      assert.ok(++count <= 18);
    }
    assert.equal(count, 18, 'every route has the same guaranteed single-panel effort');
    let combo = { route_index, tier: 2, operationState: {} };
    for (const action of ['blend-0', 'blend-1']) {
      combo = { route_index, ...advanceWall(combo, action) };
    }
    const unmatched = describeWall(route_index, 2, combo.operationState.panels).panels
      .reduce((indexes, panel, i) => panel.matched ? indexes : indexes.concat(i), []);
    assert.equal(unmatched.length, 2);
    combo = { route_index, ...advanceWall(combo, `paint-${unmatched[0]}`) };
    combo = { route_index, ...advanceWall(combo, `paint-${unmatched[1]}`) };
    assert.equal(advanceWall(combo, 'bank').tier, 3, 'four paint moves instead of six');
  }
  assert.equal(names.size, 3);
  assert.equal(pairings.size, 3);
});

test('migration 117 retains the saved Miners bank and supports the next one', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(migration);
    db.exec(`
      INSERT INTO clan_operation_days (telegram_id, utc_day, faction_id, rules_version, route_index, updated_at)
      VALUES ('101', '2026-11-20', 'rugpull-miners', 1, 0, '2026-11-20T12:00:00Z');
      UPDATE clan_operation_days SET tier = 1 WHERE telegram_id = '101';
    `);
    db.exec(wallsMigration);
    assert.equal(db.prepare("SELECT operation_state FROM clan_operation_days WHERE telegram_id = '101'").get().operation_state, '{}');
    db.exec("UPDATE clan_operation_days SET tier = 2 WHERE telegram_id = '101'");
    assert.deepEqual(db.prepare('SELECT specimen_key FROM clan_operation_awards ORDER BY tier').all().map(row => row.specimen_key),
      ['mine-v1-0-1', 'mine-v1-0-2']);
  } finally {
    db.close();
  }
});

function walkingPlan(routeIndex, tier) {
  const queue = [{ state: { route_index: routeIndex, tier, operationState: {} }, plan: [] }];
  const seen = new Set();
  while (queue.length) {
    const { state, plan } = queue.shift();
    const key = JSON.stringify(state.operationState);
    if (seen.has(key)) continue;
    seen.add(key);
    const trail = describeTrail(routeIndex, tier, state.operationState);
    for (const { id, label } of trail.actions) {
      if (id === 'bank') return [...plan, id];
      if (!label.startsWith('Walk to ')) continue;
      const next = advanceTrail(state, id);
      queue.push({ state: { ...next, route_index: routeIndex }, plan: [...plan, id] });
    }
  }
  assert.fail('No free walking route to camp');
}

test('every Nomad Bears expedition can bank all three routes without supplies', () => {
  for (let route = 0; route < 3; route++) {
    const moves = [0, 1, 2].map(tier => walkingPlan(route, tier).length);
    assert.ok(moves.every(n => n >= 4 && n <= 8), moves.join(', '));
    assert.ok(moves.reduce((sum, n) => sum + n, 0) <= 21, moves.join(', '));
  }
});

test('a missing Nomad Bears migration blocks signed play before any progress can be saved', async t => {
  const { request, sql } = fixture(t);
  sql.exec('DROP TRIGGER clan_operation_award_at_trail_bank');
  assert.equal((await request({ id: '105' })).status, 503);
  assert.equal((await request({ id: '105', revision: 0, action: 'travel-1' })).status, 503);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM clan_operation_days').get().n, 0);
});

test('Nomad Bears survey and bank three routes with one receipt per tier in D1', { timeout: 30_000 }, async t => {
  const db = await localD1(t);
  const { request, settings } = requestFixture(db);
  const account = { id: '105', faction: 'nomad-bears' };
  settings.time = new Date('2026-11-21T12:00:00Z');
  const route = dailyRouteIndex(settings.time);
  assert.equal(route, 0);
  const move = (state, action) => request({ ...account, day: state.utc_day, revision: state.revision, action });
  assert.equal((await request({ ...account, expedition_ui: null })).status, 409, 'cached clients receive a handled refresh response');
  let state = (await request(account)).data;
  assert.equal(state.trail.name, 'Frostline Traverse');
  assert.equal(state.trail.supplies, 2);
  assert.equal((await move(state, 'bank')).status, 409);
  assert.equal((await move(state, 'travel-5')).status, 409, 'cannot jump to a nonadjacent stop');

  for (const [stop, supplies] of [[2, 1], [4, 0], [5, 0]]) {
    const traveled = await move(state, 'travel-' + stop);
    assert.equal(traveled.status, 200);
    state = traveled.data;
    assert.equal(state.trail.supplies, supplies);
  }
  assert.equal(state.trail.position, 'North Camp');
  assert.equal((await move(state, 'bank')).status, 409, 'camp alone is insufficient');
  state = (await move(state, 'travel-4')).data;
  assert.equal((await move(state, 'travel-2')).status, 409, 'no supplies for the shortcut');
  const reloaded = (await request(account)).data;
  assert.deepEqual(reloaded.trail, state.trail);
  for (const stop of [3, 4, 5]) {
    const traveled = await move(state, 'travel-' + stop);
    assert.equal(traveled.status, 200);
    state = traveled.data;
  }

  for (let tier = 1; tier <= 3; tier++) {
    if (tier > 1) {
      assert.equal(state.trail.supplies, 2, 'supplies refill on the next route');
      for (const action of walkingPlan(route, tier - 1).slice(0, -1)) {
        const traveled = await move(state, action);
        assert.equal(traveled.status, 200);
        state = traveled.data;
      }
    }
    const banks = await Promise.all([move(state, 'bank'), move(state, 'bank')]);
    assert.deepEqual(banks.map(result => result.status).sort(), [200, 409]);
    state = banks.find(result => result.status === 200).data;
    assert.equal(state.tier, tier);
    assert.equal(state.renown_today, RENOWN_PER_TIER * tier);
    assert.equal(state.crew_banks, tier);
    assert.equal(state.collection.length, tier);
    assert.ok(state.collection.every(item => item.specimen_key.startsWith('trail-v3-')));
  }
  assert.equal(state.status, 'complete');
  assert.equal((await move(state, 'bank')).status, 409);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM clan_operation_awards').first()).n, 3);
  settings.time = new Date('2026-11-22T00:00:00Z');
  assert.equal((await move(state, 'travel-1')).status, 409, 'stale UTC day rejected');
  const tomorrow = (await request(account)).data;
  assert.notEqual(tomorrow.trail.name, state.trail.name);
  assert.equal(tomorrow.renown_today, 0);
  assert.equal(tomorrow.renown_total, 30_000);
});
