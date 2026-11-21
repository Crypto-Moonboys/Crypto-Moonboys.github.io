import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { handleClanOperations } from '../workers/moonboys-api/routes/clan-operations.js';
import worker from '../workers/moonboys-api/worker.js';
import { CANONICAL_FACTION_KEYS } from '../workers/moonboys-api/shared/faction-canon.js';
import { RENOWN_PER_TIER, advanceMine, dailyRouteIndex, describeMine } from '../workers/moonboys-api/shared/clan-mining.js';
import { advanceWall, describeWall } from '../workers/moonboys-api/shared/clan-graff.js';
import { advanceTrail, describeTrail } from '../workers/moonboys-api/shared/clan-nomad-trail.js';
import { advanceDistrict, describeDistrict } from '../workers/moonboys-api/shared/clan-bulls-district.js';
import { advanceSignal, describeSignal } from '../workers/moonboys-api/shared/clan-moongirls-signal.js';
import { advanceFork, describeFork, forkFinds } from '../workers/moonboys-api/shared/clan-rockers-fork.js';

import { advanceBurst, describeBurst, burstFinds } from '../workers/moonboys-api/shared/clan-furies-burst.js';

import { advanceSpotlight, describeSpotlight, spotlightFinds } from '../workers/moonboys-api/shared/clan-blockstars-spotlight.js';

import { advanceChaos, describeChaos, chaosFinds } from '../workers/moonboys-api/shared/clan-stoned-chaos.js';

import { rollCommunitySeason, selectCommunitySeason } from '../workers/moonboys-api/community-season-authority.js';
import { closeClanPeriods, readClanPeriodRewards, readClanPeriodResults } from '../workers/moonboys-api/shared/clan-period-rewards.js';
import { settleClanSignalXp } from '../workers/moonboys-api/shared/clan-signal-xp.js';

import { buildClanCampaign } from '../workers/moonboys-api/shared/clan-campaign-plan.js';
import { evaluateCampaignWindow } from '../workers/moonboys-api/shared/clan-campaign-scoring.js';
import { maintainClanCampaigns } from '../workers/moonboys-api/shared/clan-campaigns.js';
import { crewWeek } from '../workers/moonboys-api/shared/clan-crew-standings.js';

const newerMigration = number => readFileSync(new URL(`../workers/moonboys-api/migrations/${number}.sql`, import.meta.url), 'utf8');
const rosterMigration = readFileSync(new URL('../workers/moonboys-api/migrations/125_clan_crew_rosters.sql', import.meta.url), 'utf8');
const chaosMigration = readFileSync(new URL('../workers/moonboys-api/migrations/124_clan_crypto_stoned_boys.sql', import.meta.url), 'utf8');
const spotlightMigration = readFileSync(new URL('../workers/moonboys-api/migrations/123_clan_blockstars.sql', import.meta.url), 'utf8');
const burstMigration = readFileSync(new URL('../workers/moonboys-api/migrations/122_clan_blockchain_furies.sql', import.meta.url), 'utf8');
const forkMigration = readFileSync(new URL('../workers/moonboys-api/migrations/121_clan_hard_fork_rockers.sql', import.meta.url), 'utf8');
const signalMigration = readFileSync(new URL('../workers/moonboys-api/migrations/120_clan_crypto_moongirls.sql', import.meta.url), 'utf8');
const districtMigration = readFileSync(new URL('../workers/moonboys-api/migrations/119_clan_all_city_bulls.sql', import.meta.url), 'utf8');

const trailsMigration = readFileSync(new URL('../workers/moonboys-api/migrations/118_clan_nomad_bears.sql', import.meta.url), 'utf8');

const wallsMigration = readFileSync(new URL('../workers/moonboys-api/migrations/117_clan_graffpunks.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../workers/moonboys-api/migrations/116_clan_operations.sql', import.meta.url), 'utf8');

const factionTable = `
  CREATE TABLE blocktopia_progression (telegram_id TEXT PRIMARY KEY, faction TEXT, faction_xp INTEGER, gems INTEGER)
`;
const factionRows = `
  INSERT INTO blocktopia_progression VALUES ('101', 'rugpull-miners', 77, 8),
    ('102', 'all-city-bulls', 88, 9), ('103', 'rugpull-minors', 33, 2), ('104', 'graff-punks', 99, 4),
    ('105', 'nomad-bears', 60, 5), ('107', 'crypto-stoned-boys', 0, 0), ('108', 'crypto-moongirls', 77, 8),
    ('110', 'hard-fork-rockers', 55, 6), ('111', 'blockchain-furies', 46, 7), ('113', 'blockstars', 82, 5)
`;

function fixture(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.exec(`${factionTable}; ${factionRows}; ${migration} ${wallsMigration} ${trailsMigration} ${districtMigration} ${signalMigration} ${forkMigration} ${burstMigration} ${spotlightMigration} ${chaosMigration} ${rosterMigration}`);
  const db = {
    async batch(statements) {
      sql.exec('BEGIN');
      try {
        const results = await Promise.all(statements.map(statement => statement.run()));
        sql.exec('COMMIT');
        return results;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
    prepare(statement) {
      const query = sql.prepare(statement);
      return {
        all: async () => ({ success: true, results: query.all() }),
        bind(...args) {
          return {
            first: async () => query.get(...args) ?? null,
            run: async () => ({ ...query.run(...args), success: true }),
            all: async () => ({ success: true, results: query.all(...args) }),
          };
        },
      };
    },
  };
  return { ...requestFixture(db), sql, db };
}

function requestFixture(db) {
  const settings = { time: new Date('2026-11-20T12:00:00Z'), chance: 0, enabled: 'true' };
  async function request({
    action, revision, day = '2026-11-20', id = '101', signed = true, method = 'POST', faction, view, rateLimit, standings, crewEntry, weekStart, campaignRewards,
    operation_ui = 'wall-v1', expedition_ui = 'trail-v1', district_ui = 'district-v1', signal_ui = 'signal-v1', fork_ui = 'fork-v1', burst_ui = 'burst-v1', spotlight_ui = 'spotlight-v1', chaos_ui = 'chaos-v1',
  } = {}) {
    const path = `/clan-operations/${action ? 'move' : 'state'}`;
    const body = method === 'POST' ? JSON.stringify({
      telegram_auth: { id, auth_date: Math.floor(Date.now() / 1000), hash: 'a'.repeat(64) },
      action, revision, operation_ui, expedition_ui, district_ui, signal_ui, fork_ui, burst_ui, spotlight_ui, chaos_ui, operation_faction: faction,
      utc_day: day, crew_entry: crewEntry, week_start: weekStart, campaign_rewards_ui: campaignRewards, renown: 99_999_999, telegram_id: '102', ore: 99,
    }) : undefined;
    const response = await handleClanOperations(new Request(`https://local.test${path}${view ? '?view=' + view + (standings ? '&standings=1' : '') : ''}`, { method, body }),
      { DB: db, CLAN_OPERATIONS_ENABLED: settings.enabled, CLAN_PERIOD_REWARDS_FROM: settings.periodStart }, {
        path,
        respond: (data, status = 200) => Response.json(data, { status }),
        verifyTelegramAuth: async () => signed,
        rateLimit,
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
  assert.equal((await request({ id: '107' })).data.chaos.phase, 'scouting');
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
    await db.prepare(districtMigration).run();
    await db.prepare(signalMigration).run();
    await db.prepare(forkMigration).run();
    await db.prepare(burstMigration).run();
    await db.prepare(spotlightMigration).run();
    await db.prepare(chaosMigration).run();
    await db.prepare(rosterMigration).run();
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

test('signed Nomad Bears share a network and keep independent move budgets', { timeout: 30_000 }, async t => {
  const db = await localD1(t);
  await db.prepare("INSERT INTO blocktopia_progression VALUES ('106', 'nomad-bears', 0, 0)").run();
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-20T12:00:00Z') });
  const env = { DB: db, CLAN_OPERATIONS_ENABLED: 'true', TELEGRAM_BOT_TOKEN: '123456:test-token' };
  const secret = createHash('sha256').update(env.TELEGRAM_BOT_TOKEN).digest();
  const authDate = Math.floor(Date.now() / 1000);
  const network = '192.0.2.52';
  const accounts = ['105', '106'].map(id => ({
    id, auth_date: authDate,
    hash: createHmac('sha256', secret).update('auth_date=' + authDate + '\nid=' + id).digest('hex'),
  }));
  const request = (telegram_auth, path, body = {}, ip = network) => worker.fetch(
    new Request('https://local.test/clan-operations/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
      body: JSON.stringify({ telegram_auth, expedition_ui: 'trail-v1', ...body }),
    }), env,
  );
  const move = (auth, state, action, ip) => request(auth, 'move', {
    action, revision: state.revision, utc_day: state.utc_day, operation_faction: state.faction_id,
  }, ip);
  const states = [];
  for (const auth of accounts) {
    const response = await request(auth, 'state');
    assert.equal(response.status, 200);
    states.push(await response.json());
  }
  const route = dailyRouteIndex(new Date());
  assert.equal(states[0].trail.name, 'Rooftop Passage');
  const plan = [0, 1, 2].flatMap(tier => walkingPlan(route, tier));
  assert.ok(plan.length * accounts.length > 30, 'exercise the old shared IP ceiling');
  for (const action of plan) {
    const responses = await Promise.all(accounts.map((auth, i) => move(auth, states[i], action)));
    for (const [i, response] of responses.entries()) {
      assert.equal(response.status, 200, 'account ' + (i + 1) + ' / ' + action);
      states[i] = await response.json();
    }
  }
  for (const state of states) {
    assert.equal(state.renown_today, 30_000);
    assert.equal(state.collection.length, 3);
  }
  // A stale move spends verified request budget without changing settled progress.
  for (let attempt = plan.length; attempt < 30; attempt++) {
    assert.equal((await move(accounts[0], states[0], 'bank')).status, 409);
  }
  const limited = await move(accounts[0], states[0], 'bank', '192.0.2.53');
  assert.equal(limited.status, 429, 'the signed account budget follows the account across IPs');
  assert.equal(limited.headers.get('Retry-After'), '60');
  assert.equal((await move(accounts[1], states[1], 'bank')).status, 409, 'the other account can still submit moves');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM clan_operation_awards').first()).n, 6);
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

function districtPlan(route, tier, saved = {}) {
  const queue = [{ saved, plan: [] }];
  const seen = new Set();
  for (const { saved, plan } of queue) {
    const key = JSON.stringify(saved);
    if (seen.has(key)) continue;
    seen.add(key);
    for (const { id } of describeDistrict(route, tier, saved).actions) {
      if (id === 'bank') return [...plan, id];
      const next = advanceDistrict({ route_index: route, tier, operationState: saved }, id);
      queue.push({ saved: next.operationState, plan: [...plan, id] });
    }
  }
  assert.fail('No district hold can be banked');
}

test('all nine district holds can be completed with comparable move counts', () => {
  for (let route = 0; route < 3; route++) {
    const moves = [0, 1, 2].map(tier => districtPlan(route, tier).length);
    assert.ok(moves.every(count => count >= 5 && count <= 7), String(moves));
    assert.ok(moves.reduce((total, count) => total + count, 0) <= 21);
  }
});

test('district pressure penalizes a push and only the forecast point can be held', () => {
  const state = { route_index: 0, tier: 0, operationState: {} };
  assert.equal(advanceDistrict(state, 'bank'), null);
  assert.equal(advanceDistrict(state, 'hold-0'), null, 'cannot hold without control');
  const opening = advanceDistrict(state, 'push-1');
  assert.deepEqual(opening.operationState.control, [0, 2, 0]);
  const underPressure = { ...state, ...opening };
  assert.equal(advanceDistrict(underPressure, 'hold-0'), null, 'cannot hold off forecast');
  assert.deepEqual(advanceDistrict(underPressure, 'push-2').operationState.control, [0, 1, 2]);
  const held = advanceDistrict(underPressure, 'hold-1');
  assert.deepEqual(held.operationState.control, [0, 3, 0]);
  assert.equal(held.operationState.held, true);
  assert.equal(advanceDistrict({ ...state, operationState: { control: [2, 2, 2] } }, 'bank'), null);
});

test('Bulls fail closed before migration 119 while earlier operations remain available', async t => {
  const { request, sql } = fixture(t);
  sql.exec('DROP TRIGGER clan_operation_award_at_district_bank');
  assert.equal((await request({ id: '102' })).status, 503);
  assert.equal((await request({ id: '102', action: 'push-1', revision: 0 })).status, 503);
  assert.equal((await request({ id: '105' })).status, 200);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM clan_operation_days').get().n, 0);
});

test('Bulls bank three unique marks exactly once in D1 and reset district progress at UTC midnight', { timeout: 30_000 }, async t => {
  const db = await localD1(t);
  const { request, settings } = requestFixture(db);
  const account = { id: '102', faction: 'all-city-bulls' };
  assert.equal((await request({ ...account, district_ui: null })).status, 409, 'cached clients reject the new payload safely');
  assert.equal((await request({ ...account, signed: false })).status, 401);
  assert.equal((await request({ ...account, faction: 'nomad-bears' })).status, 403);
  const route = dailyRouteIndex(settings.time);
  let { data: state } = await request(account);
  const move = action => request({ ...account, action, revision: state.revision, day: state.utc_day });
  assert.equal((await move('bank')).status, 409, 'client-supplied Renown cannot bank an unsecured district');
  for (let tier = 0; tier < 3; tier++) {
    for (const action of districtPlan(route, tier).slice(0, -1)) {
      const response = await move(action);
      assert.equal(response.status, 200);
      state = response.data;
    }
    const refreshed = await request(account);
    assert.deepEqual(refreshed.data.district, state.district);
    const banks = await Promise.all([move('bank'), move('bank')]);
    assert.deepEqual(banks.map(response => response.status).sort(), [200, 409]);
    state = banks.find(response => response.status === 200).data;
    assert.equal(state.renown_today, RENOWN_PER_TIER * (tier + 1));
    assert.equal(state.crew_banks, tier + 1);
    assert.equal(state.collection.length, tier + 1);
  }
  assert.equal(state.status, 'complete');
  assert.deepEqual(state.collection.map(item => item.name), state.district.finds);
  assert.equal((await move('bank')).status, 409);
  assert.deepEqual(await db.prepare("SELECT faction_xp, gems FROM blocktopia_progression WHERE telegram_id = '102'").first(),
    { faction_xp: 88, gems: 9 });
  settings.time = new Date('2026-11-21T00:00:00Z');
  assert.equal((await move('push-1')).status, 409);
  const tomorrow = (await request(account)).data;
  assert.notEqual(tomorrow.district.name, state.district.name);
  assert.equal(tomorrow.renown_today, 0);
  assert.equal(tomorrow.renown_total, 30_000);
  assert.equal(tomorrow.collection.length, 3);
});

test('every signal target is verifiable and missed early locks recover', () => {
  for (let route = 0; route < 3; route++) {
    for (let tier = 0; tier < 3; tier++) {
      for (let channel = 0; channel < 8; channel++) {
        const day = '2026-11-20';
        const base = { route_index: route, tier, utc_day: day, operationState: { target: channel } };
        const move = (state, action) => ({ ...state, ...advanceSignal(state, action) });
        const view = state => describeSignal(route, tier, day, state.operationState);
        assert.equal(view(base).candidates.length, 8);
        assert.equal(advanceSignal(base, 'lock-0'), null);
        const band = move(base, 'scan-band');
        assert.equal(view(band).candidates.length, 4);
        assert.equal(advanceSignal(band, 'scan-band'), null);
        const two = move(band, 'scan-pulse');
        assert.equal(view(two).candidates.length, 2);
        const full = move(two, 'scan-phase');
        assert.equal(view(full).candidates.length, 1);
        const [target] = view(full).candidates;
        assert.equal(target.id, channel);
        const verified = 'lock-' + target.id;

        assert.equal(move(two, verified).outcome, 'signal_locked');
        assert.equal(advanceSignal(full, 'bank'), null);
        const wrong = view(two).candidates.find(channel => channel.id !== target.id);
        const missed = move(two, 'lock-' + wrong.id);
        assert.equal(missed.outcome, 'signal_misread');
        assert.deepEqual(view(missed).actions.map(action => action.id), ['recalibrate']);
        assert.equal(advanceSignal(missed, 'bank'), null);
        const ready = move(missed, 'recalibrate');
        assert.deepEqual(view(ready).measurements, view(two).measurements);
        assert.deepEqual(view(ready).actions.map(action => action.id), ['scan-phase']);
        const locked = move(move(ready, 'scan-phase'), verified);
        assert.equal(locked.outcome, 'signal_locked');
        assert.equal(advanceSignal(locked, 'bank').tier, tier + 1);
      }
    }
  }
});

test('an older v5 sweep keeps its observed signal on the next scan', () => {
  const day = '2026-11-20';
  const legacy = { route_index: 0, tier: 0, utc_day: day, operationState: { scans: ['band'] } };
  const before = describeSignal(0, 0, day, legacy.operationState);
  assert.deepEqual(before.measurements, [{ label: 'Band', value: 'High' }]);
  const next = advanceSignal(legacy, 'scan-pulse');
  assert.equal(next.operationState.target, 1);
  assert.deepEqual(describeSignal(0, 0, day, next.operationState).measurements[0], before.measurements[0]);
});

test('the first scan samples and saves a separate target per account and sweep in D1', { timeout: 30_000 }, async t => {
  const db = await localD1(t);
  await db.prepare("INSERT INTO blocktopia_progression VALUES ('109', 'crypto-moongirls', 0, 0)").run();
  const { request } = requestFixture(db);
  const draws = [0, 7, 3];
  let sampled = 0;
  t.mock.method(crypto, 'getRandomValues', bytes => {
    assert.ok(sampled < draws.length, 'only first scans should draw a target');
    bytes[0] = draws[sampled++];
    return bytes;
  });

  for (const id of ['108', '109']) {
    const start = await request({ id });
    assert.equal(start.status, 200);
    assert.equal(start.data.revision, 0);
    assert.equal(start.data.signal.candidates.length, 8);
  }
  assert.equal(sampled, 0);
  const move = async (id, action, revision) => {
    const result = await request({ id, action, revision });
    assert.equal(result.status, 200);
    assert.equal(Object.hasOwn(result.data.signal, 'target'), false);
    return result.data;
  };
  const a = await move('108', 'scan-band', 0);
  const b = await move('109', 'scan-band', 0);
  assert.equal(a.signal.name, b.signal.name, 'the daily relay is shared');
  assert.notDeepEqual(a.signal.measurements, b.signal.measurements);
  assert.deepEqual((await request({ id: '108' })).data.signal, a.signal);
  await move('108', 'scan-pulse', 1);
  const fullA = await move('108', 'scan-phase', 2);
  await move('109', 'scan-pulse', 1);
  const fullB = await move('109', 'scan-phase', 2);
  assert.deepEqual(fullA.signal.candidates.map(channel => channel.id), [0]);
  assert.deepEqual(fullB.signal.candidates.map(channel => channel.id), [7]);
  const locked = await move('108', 'lock-0', 3);
  const banked = await move('108', 'bank', locked.revision);
  assert.equal(banked.renown_today, RENOWN_PER_TIER);
  assert.equal(banked.signal.candidates.length, 8);
  assert.equal(sampled, 2);
  await move('108', 'scan-band', banked.revision);
  assert.equal(sampled, 3);
  const saved = await db.prepare(
    "SELECT json_extract(operation_state, '$.target') AS target FROM clan_operation_days WHERE telegram_id = '108'",
  ).first();
  assert.equal(saved.target, 3);
});

test('Moongirls fail closed before migration 120 while an earlier operation stays available', async t => {
  const { request, sql } = fixture(t);
  sql.exec('DROP TRIGGER clan_operation_award_at_signal_bank');
  assert.equal((await request({ id: '108' })).status, 503);
  assert.equal((await request({ id: '108', action: 'scan-band', revision: 0 })).status, 503);
  assert.equal((await request({ id: '102' })).status, 200);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM clan_operation_days').get().n, 0);
});

test('three Moongirls sweeps bank once each in D1 and reset at UTC midnight', { timeout: 30_000 }, async t => {
  const db = await localD1(t);
  const { request, settings } = requestFixture(db);
  const account = { id: '108', faction: 'crypto-moongirls' };
  assert.equal((await request({ ...account, signal_ui: null })).status, 409);
  assert.equal((await request({ ...account, signed: false })).status, 401);
  assert.equal((await request({ ...account, faction: 'all-city-bulls' })).status, 403);

  let { data: state } = await request(account);
  const act = action => request({ ...account, action, revision: state.revision, day: state.utc_day });
  const take = async action => {
    const response = await act(action);
    assert.equal(response.status, 200);
    state = response.data;
  };
  assert.equal((await act('bank')).status, 409, 'a submitted Renown amount cannot bank an unverified signal');
  for (let tier = 0; tier < 3; tier++) {
    for (const filter of ['band', 'pulse', 'phase']) await take('scan-' + filter);
    assert.equal(state.signal.candidates.length, 1);
    assert.deepEqual((await request(account)).data.signal, state.signal);
    await take(state.signal.actions[0].id);
    const banks = await Promise.all([act('bank'), act('bank')]);
    assert.deepEqual(banks.map(result => result.status).sort(), [200, 409]);
    state = banks.find(result => result.status === 200).data;
    assert.equal(state.renown_today, RENOWN_PER_TIER * (tier + 1));
    assert.equal(state.crew_banks, tier + 1);
  }

  assert.equal(state.status, 'complete');
  assert.deepEqual(state.collection.map(item => item.name), state.signal.finds);
  assert.equal((await act('bank')).status, 409);
  assert.deepEqual(await db.prepare("SELECT faction_xp, gems FROM blocktopia_progression WHERE telegram_id = '108'").first(),
    { faction_xp: 77, gems: 8 });
  settings.time = new Date('2026-11-21T00:00:00Z');
  assert.equal((await act('scan-band')).status, 409);
  const tomorrow = (await request(account)).data;
  assert.notEqual(tomorrow.signal.name, state.signal.name);
  assert.equal(tomorrow.renown_today, 0);
  assert.equal(tomorrow.renown_total, 30_000);
  assert.equal(tomorrow.collection.length, 3);
});

test('all nine Fork Runs can bank on either branch with one timed brace at most', () => {
  for (let route = 0; route < 3; route++) {
    for (let tier = 0; tier < 3; tier++) {
      const base = { route_index: route, tier, operationState: {} };
      assert.equal(advanceFork(base, 'bank'), null);
      assert.equal(advanceFork(base, 'cross'), null);
      for (const grade of ['stable', 'edge']) {
        let state = { ...base, ...advanceFork(base, 'choose-' + grade) };
        let braces = 0;
        for (let section = 0; section < 3; section++) {
          const view = describeFork(route, tier, state.operationState);
          if (!view.actions.some(action => action.id === 'cross')) {
            state = { ...state, ...advanceFork(state, 'brace') };
            braces++;
          }
          const move = advanceFork(state, 'cross');
          assert.ok(move);
          state = { ...state, ...move };
        }
        assert.equal(braces, grade === 'edge' ? 1 : 0);
        assert.equal(state.operationState.fork, grade);
        assert.equal(advanceFork(state, 'bank').tier, tier + 1);
      }
      assert.notEqual(forkFinds(route, 'stable')[tier], forkFinds(route, 'edge')[tier]);
    }
  }
});

test('spending the brace early stalls the Edge Fork and allows a fresh Stable Fork', () => {
  let state = { route_index: 0, tier: 0, operationState: {} };
  for (const action of ['choose-edge', 'cross', 'brace', 'cross']) {
    state = { ...state, ...advanceFork(state, action) };
  }
  const stalled = describeFork(0, 0, state.operationState);
  assert.equal(stalled.stalled, true);
  assert.equal(stalled.stability, 2);
  assert.deepEqual(stalled.actions.map(action => action.id), ['choose-stable']);
  assert.equal(advanceFork(state, 'bank'), null);
  const recovered = advanceFork(state, 'choose-stable');
  assert.equal(recovered.outcome, 'fork_recovered');
  assert.deepEqual(recovered.operationState, { fork: 'stable' });
  assert.equal(describeFork(0, 0, recovered.operationState).stability, 4);
});

test('Rockers fail closed before migration 121 while Moongirls remain available', async t => {
  const { request, sql } = fixture(t);
  sql.exec('DROP TRIGGER clan_operation_award_at_fork_bank');
  assert.equal((await request({ id: '110' })).status, 503);
  assert.equal((await request({ id: '110', action: 'choose-stable', revision: 0 })).status, 503);
  assert.equal((await request({ id: '108' })).status, 200);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM clan_operation_days').get().n, 0);
});

test('Rockers bank branch-specific fragments once in D1 with the shared daily cap', { timeout: 30_000 }, async t => {
  const db = await localD1(t);
  const { request, settings } = requestFixture(db);
  const account = { id: '110', faction: 'hard-fork-rockers' };
  assert.equal((await request({ ...account, fork_ui: null })).status, 409);
  assert.equal((await request({ ...account, signed: false })).status, 401);
  assert.equal((await request({ ...account, faction: 'crypto-moongirls' })).status, 403);
  let { data: state } = await request(account);
  const route = dailyRouteIndex(settings.time);
  const move = action => request({ ...account, action, revision: state.revision, day: state.utc_day });
  const take = async action => {
    const response = await move(action);
    assert.equal(response.status, 200);
    state = response.data;
  };
  assert.equal((await move('bank')).status, 409);
  const expected = [];
  for (const grade of ['edge', 'stable', 'edge']) {
    await take('choose-' + grade);
    for (let section = 0; section < 3; section++) {
      if (!state.fork.actions.some(action => action.id === 'cross')) await take('brace');
      await take('cross');
    }
    assert.deepEqual((await request(account)).data.fork, state.fork);
    const banks = await Promise.all([move('bank'), move('bank')]);
    assert.deepEqual(banks.map(result => result.status).sort(), [200, 409]);
    state = banks.find(result => result.status === 200).data;
    expected.push(forkFinds(route, grade)[state.tier - 1]);
    assert.equal(state.renown_today, RENOWN_PER_TIER * state.tier);
    assert.deepEqual(state.collection.map(item => item.name), expected);
    assert.ok(state.collection.at(-1).specimen_key.endsWith('-' + grade));
  }
  assert.equal(state.status, 'complete');
  assert.equal((await move('bank')).status, 409);
  assert.deepEqual(await db.prepare("SELECT faction_xp, gems FROM blocktopia_progression WHERE telegram_id = '110'").first(),
    { faction_xp: 55, gems: 6 });
  settings.time = new Date('2026-11-21T00:00:00Z');
  assert.equal((await move('choose-stable')).status, 409);
  const tomorrow = (await request(account)).data;
  assert.notEqual(tomorrow.fork.name, state.fork.name);
  assert.equal(tomorrow.renown_today, 0);
  assert.equal(tomorrow.renown_total, 30_000);
  assert.deepEqual(tomorrow.collection.map(item => item.name), expected);
});

test('Furies fail closed before migration 122 while Rockers remain available', async t => {
  const { request, sql } = fixture(t);
  sql.exec('DROP TRIGGER clan_operation_award_at_burst_bank');
  assert.equal((await request({ id: '111' })).status, 503);
  assert.equal((await request({ id: '111', action: 'prepare', revision: 0 })).status, 503);
  assert.equal((await request({ id: '110' })).status, 200);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM clan_operation_days').get().n, 0);
});

test('Furies bank clean and comeback emblems once in D1 with the same daily cap', { timeout: 30_000 }, async t => {
  const db = await localD1(t);
  const { request, settings } = requestFixture(db);
  const account = { id: '111', faction: 'blockchain-furies' };
  assert.equal((await request({ ...account, burst_ui: null })).status, 409);
  assert.equal((await request({ ...account, signed: false })).status, 401);
  assert.equal((await request({ ...account, faction: 'hard-fork-rockers' })).status, 403);

  let { data: state } = await request(account);
  const route = dailyRouteIndex(settings.time);
  const move = action => request({ ...account, action, revision: state.revision, day: state.utc_day });
  const take = async action => {
    const response = await move(action);
    assert.equal(response.status, 200, JSON.stringify(response));
    state = response.data;
  };
  assert.equal((await move('bank')).status, 409);
  const expected = [];
  for (const [tier, grade] of ['clean', 'comeback', 'clean'].entries()) {
    await take('prepare');
    const { cues, length } = state.burst;
    assert.equal(length, 3 + tier);
    assert.equal(cues.length, length);
    assert.equal((await move('prepare')).status, 409);
    assert.deepEqual((await request(account)).data.burst.cues, cues);
    await take('start');
    assert.equal(state.burst.phase, 'burst');
    assert.deepEqual(state.burst.cues, []);
    assert.deepEqual((await request(account)).data.burst.cues, []);
    assert.equal((await move('bank')).status, 409);
    const pads = new Map(state.burst.actions.map(({ label, id }) => [label, id]));
    let sequence = cues;
    if (grade === 'comeback') {
      const wrong = label => [...pads.entries()].find(([name]) => name !== label)[1];
      await take(wrong(cues[0]));
      assert.equal(state.last_outcome, 'burst_missed');
      assert.equal(state.burst.phase, 'comeback');
      sequence = state.burst.cues;
      assert.equal(sequence.length, 3);
      await take(pads.get(sequence[0]));
      await take(wrong(sequence[1]));
      assert.equal(state.last_outcome, 'comeback_missed');
      assert.equal(state.burst.step, 0);
      assert.deepEqual((await request(account)).data.burst.cues, sequence);
    }
    for (const cue of sequence) await take(pads.get(cue));
    assert.equal(state.burst.phase, 'bank');
    assert.deepEqual(state.burst.cues, []);
    const banks = await Promise.all([move('bank'), move('bank')]);
    assert.deepEqual(banks.map(result => result.status).sort(), [200, 409]);
    state = banks.find(result => result.status === 200).data;
    expected.push(burstFinds(route, grade)[tier]);
    assert.equal(state.renown_today, RENOWN_PER_TIER * (tier + 1));
    assert.deepEqual(state.collection.map(item => item.name), expected);
    assert.ok(state.collection.at(-1).specimen_key.endsWith('-' + grade));
  }
  assert.equal(state.status, 'complete');
  assert.deepEqual(state.burst.actions, []);
  assert.equal((await move('bank')).status, 409);
  assert.deepEqual(await db.prepare("SELECT faction_xp, gems FROM blocktopia_progression WHERE telegram_id = '111'").first(),
    { faction_xp: 46, gems: 7 });
  settings.time = new Date('2026-11-21T00:00:00Z');
  assert.equal((await move('prepare')).status, 409);
  const tomorrow = (await request(account)).data;
  assert.notEqual(tomorrow.burst.name, state.burst.name);
  assert.equal(tomorrow.burst.phase, 'idle');
  assert.equal(tomorrow.renown_today, 0);
  assert.equal(tomorrow.renown_total, 30_000);
  assert.deepEqual(tomorrow.collection.map(item => item.name), expected);
});

test('each Furies relay offers a different clean and comeback emblem in every tier', () => {
  const emblems = new Set();
  for (let route = 0; route < 3; route++) {
    for (const grade of ['clean', 'comeback']) {
      for (const name of burstFinds(route, grade)) emblems.add(name);
    }
  }
  assert.equal(emblems.size, 18);
  assert.equal(advanceBurst({ route_index: 0, tier: 3 }, 'prepare'), null);
  assert.equal(describeBurst(0, 3).phase, 'complete');
});

test('Blockstars refuse play until migration 123 while Furies remain available', async t => {
  const { request, sql } = fixture(t);
  sql.exec('DROP TRIGGER clan_operation_award_at_spotlight_bank');
  assert.equal((await request({ id: '113' })).status, 503);
  assert.equal((await request({ id: '113', action: 'book-headliner', revision: 0 })).status, 503);
  assert.equal((await request({ id: '111' })).status, 200);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM clan_operation_days').get().n, 0);
});

function spotlightLineup(spotlight, useThirdMove) {
  const moves = new Map(spotlight.actions.filter(move => move.id.startsWith('perform-'))
    .map(move => [move.label, move.id]));
  const cues = spotlight.beats.map(beat => beat.cue);
  const lineup = cues.map(cue => moves.get(cue));
  if (useThirdMove) {
    const repeat = cues.findIndex((cue, index) => cues.indexOf(cue) !== index);
    lineup[repeat] = [...moves.entries()].find(([label]) => !cues.includes(label))[1];
  }
  return lineup;
}

test('each Spotlight has two viable styles, and the Freestyle finale rewards using all three moves', () => {
  const posters = new Set();
  for (let route = 0; route < 3; route++) {
    for (const style of ['headliner', 'freestyle']) {
      for (let tier = 0; tier < 3; tier++) {
        let state = { route_index: route, tier, operationState: {} };
        state = { ...state, ...advanceSpotlight(state, 'book-' + style) };
        const view = describeSpotlight(route, tier, state.operationState);
        const perform = actions => actions.reduce((moveState, action) => ({
          ...moveState, ...advanceSpotlight(moveState, action),
        }), state);
        const target = style === 'freestyle' && tier === 2;
        if (target) {
          const crowdOnly = perform(spotlightLineup(view, false));
          const beforeRestart = describeSpotlight(route, tier, crowdOnly.operationState);
          assert.equal(beforeRestart.applause, 8);
          assert.equal(advanceSpotlight(crowdOnly, 'bank'), null);
          assert.equal(advanceSpotlight(crowdOnly, 'restart').outcome, 'spotlight_restarted');
        }
        const qualifying = perform(spotlightLineup(view, target));
        assert.equal(advanceSpotlight(qualifying, 'bank').tier, tier + 1);
        posters.add(spotlightFinds(route, style)[tier]);
      }
    }
  }
  assert.equal(posters.size, 18);
});

test('Blockstars recover and bank server-verified sets once per tier in D1', { timeout: 30_000 }, async t => {
  const db = await localD1(t);
  const { request, settings } = requestFixture(db);
  const account = { id: '113', faction: 'blockstars' };
  assert.equal((await request({ ...account, spotlight_ui: null })).status, 409);
  assert.equal((await request({ ...account, signed: false })).status, 401);
  assert.equal((await request({ ...account, faction: 'blockchain-furies' })).status, 403);

  let { data: state } = await request(account);
  assert.ok(state.spotlight.featured.path.startsWith('/games/'));
  const route = dailyRouteIndex(settings.time);
  const move = action => request({ ...account, action, revision: state.revision, day: state.utc_day });
  const take = async action => {
    const response = await move(action);
    assert.equal(response.status, 200, JSON.stringify(response));
    state = response.data;
  };
  assert.equal((await move('bank')).status, 409);
  await take('book-headliner');
  const absentMove = state.spotlight.actions.find(move => !state.spotlight.beats.some(beat => beat.cue === move.label));
  for (let beat = 0; beat < 4; beat++) await take(absentMove.id);
  assert.equal(state.spotlight.applause, 0);
  assert.equal((await move('bank')).status, 409);
  await take('restart');
  assert.equal(state.tier, 0);

  const expected = [];
  for (const [tier, style] of ['freestyle', 'headliner', 'freestyle'].entries()) {
    await take('book-' + style);
    const lineup = spotlightLineup(state.spotlight, style === 'freestyle');
    await take(lineup[0]);
    assert.deepEqual((await request(account)).data.spotlight, state.spotlight);
    assert.equal((await move('bank')).status, 409);
    for (const beat of lineup.slice(1)) await take(beat);
    assert.equal(state.spotlight.ready, true);
    const banks = await Promise.all([move('bank'), move('bank')]);
    assert.deepEqual(banks.map(result => result.status).sort(), [200, 409]);
    state = banks.find(result => result.status === 200).data;
    expected.push(spotlightFinds(route, style)[tier]);
    assert.equal(state.renown_today, RENOWN_PER_TIER * (tier + 1));
    assert.deepEqual(state.collection.map(item => item.name), expected);
    assert.ok(state.collection.at(-1).specimen_key.endsWith('-' + style));
  }
  assert.equal(state.status, 'complete');
  assert.deepEqual(state.spotlight.actions, []);
  assert.equal((await move('bank')).status, 409);
  assert.deepEqual(await db.prepare("SELECT faction_xp, gems FROM blocktopia_progression WHERE telegram_id = '113'").first(),
    { faction_xp: 82, gems: 5 });
  settings.time = new Date('2026-11-21T00:00:00Z');
  assert.equal((await move('book-headliner')).status, 409);
  const tomorrow = (await request(account)).data;
  assert.notEqual(tomorrow.spotlight.featured.path, state.spotlight.featured.path);
  assert.equal(tomorrow.renown_today, 0);
  assert.equal(tomorrow.renown_total, 30_000);
  assert.deepEqual(tomorrow.collection.map(item => item.name), expected);
});

test('all nine canonical factions have an operation while the pilot is enabled', async t => {
  const { request, sql } = fixture(t);
  for (const id of ['101', '102', '104', '105', '107', '108', '110', '111', '113']) {
    const { status, data } = await request({ id });
    assert.equal(status, 200, id);
    assert.equal(data.renown_per_tier, 10_000, id);
    assert.equal(data.tier, 0, id);
  }
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM clan_operation_days').get().n, 0);
});

test('Crypto Stoned Boys fail closed until migration 124 while Blockstars remain available', async t => {
  const { request, sql } = fixture(t);
  sql.exec('DROP TRIGGER clan_operation_award_at_chaos_bank');
  assert.equal((await request({ id: '107' })).status, 503);
  assert.equal((await request({ id: '107', action: 'shortcut', revision: 0 })).status, 503);
  assert.equal((await request({ id: '113' })).status, 200);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM clan_operation_days').get().n, 0);
});

test('Chaos odds match the cutoff and either route can bank on every tier', () => {
  const artifacts = new Set();
  for (let route = 0; route < 3; route++) {
    for (let tier = 0; tier < 3; tier++) {
      const start = { route_index: route, tier, operationState: { rerollUsed: true } };
      const take = (state, action, roll) => ({ ...state, ...advanceChaos(state, action, roll) });
      const inspect = state => describeChaos(route, tier, state.operationState);
      const odds = inspect(start).success_percent;
      const shortcut = take(start, 'shortcut', odds - 0.01);
      assert.equal(inspect(shortcut).grade, 'glitch');
      const jam = take(start, 'shortcut', odds);
      assert.equal(inspect(jam).phase, 'jammed');
      assert.equal(advanceChaos(jam, 'reroll', 0), null);
      const recovery = take(take(jam, 'vent'), 'salvage');
      assert.equal(inspect(recovery).grade, 'salvage');
      const scan = take(start, 'scan');
      const tuning = inspect(scan);
      const stable = take(scan, tuning.actions.find(move => move.label === 'Tune ' + tuning.target_signal).id);
      assert.equal(inspect(stable).grade, 'stable');
      for (const path of [shortcut, recovery, stable]) {
        const bank = advanceChaos(path, 'bank');
        assert.equal(bank.tier, tier + 1);
        assert.equal(bank.operationState.rerollUsed, true);
        artifacts.add(chaosFinds(route, inspect(path).grade)[tier]);
      }
    }
  }
  assert.equal(artifacts.size, 27);
});

test('Chaos banks different artifacts once in D1 and consumes one reroll per UTC day', { timeout: 30_000 }, async t => {
  const db = await localD1(t);
  const { request, settings } = requestFixture(db);
  const account = { id: '107', faction: 'crypto-stoned-boys' };
  assert.equal((await request({ ...account, chaos_ui: null })).status, 409);
  assert.equal((await request({ ...account, signed: false })).status, 401);
  assert.equal((await request({ ...account, faction: 'blockstars' })).status, 403);

  let { data: state } = await request(account);
  const route = dailyRouteIndex(settings.time);
  const move = action => request({ ...account, action, revision: state.revision, day: state.utc_day });
  const take = async action => {
    const response = await move(action);
    assert.equal(response.status, 200, JSON.stringify(response));
    state = response.data;
  };
  const expected = [];
  const bank = async grade => {
    assert.equal(state.chaos.grade, grade);
    const results = await Promise.all([move('bank'), move('bank')]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    state = results.find(result => result.status === 200).data;
    expected.push(chaosFinds(route, grade)[state.tier - 1]);
    assert.equal(state.renown_today, RENOWN_PER_TIER * state.tier);
    assert.deepEqual(state.collection.map(item => item.name), expected);
    assert.ok(state.collection.at(-1).specimen_key.endsWith('-' + grade));
  };
  assert.equal((await move('bank')).status, 409);
  assert.equal((await move('reroll')).status, 409);
  await take('scan');
  const target = 'Tune ' + state.chaos.target_signal;
  await take(state.chaos.actions.find(action => action.label !== target).id);
  assert.equal(state.last_outcome, 'chaos_wrong_signal');
  assert.equal(state.chaos.reroll_available, true);
  await take(state.chaos.actions.find(action => action.label === target).id);
  await bank('stable');

  settings.chance = 99;
  await take('shortcut');
  assert.equal(state.chaos.phase, 'jammed');
  const rerolls = await Promise.all([move('reroll'), move('reroll')]);
  assert.deepEqual(rerolls.map(result => result.status).sort(), [200, 409]);
  state = rerolls.find(result => result.status === 200).data;
  assert.equal(state.last_outcome, 'chaos_reroll_jammed');
  assert.equal((await move('reroll')).status, 409);
  assert.deepEqual((await request(account)).data.chaos, state.chaos);
  await take('vent');
  await take('salvage');
  await bank('salvage');
  assert.equal(state.chaos.reroll_available, false);

  settings.chance = 0;
  await take('shortcut');
  assert.equal(typeof state.chaos.effect, 'string');
  await bank('glitch');
  assert.equal(state.status, 'complete');
  assert.deepEqual(state.chaos.actions, []);
  assert.equal((await move('bank')).status, 409);
  assert.deepEqual(await db.prepare("SELECT faction_xp, gems FROM blocktopia_progression WHERE telegram_id = '107'").first(),
    { faction_xp: 0, gems: 0 });
  settings.time = new Date('2026-11-21T00:00:00Z');
  assert.equal((await move('shortcut')).status, 409);
  const tomorrow = (await request(account)).data;
  assert.notEqual(tomorrow.chaos.name, state.chaos.name);
  assert.equal(tomorrow.chaos.reroll_available, true);
  assert.equal(tomorrow.renown_today, 0);
  assert.equal(tomorrow.renown_total, 30_000);
  assert.deepEqual(tomorrow.collection.map(item => item.name), expected);
});

test('public crew progress respects the pilot flag, the IP limit and ledger availability', async t => {
  const { request, settings, sql } = fixture(t);
  const query = { method: 'GET', view: 'crew-progress', signed: false };
  settings.enabled = '';
  assert.deepEqual(await request(query), { status: 200, data: { ok: true, enabled: false } });
  settings.enabled = 'true';
  assert.deepEqual(await request({ ...query, view: undefined }), { status: 200, data: { ok: true, enabled: true } });
  assert.equal((await request({ ...query, rateLimit: owner => {
    assert.equal(owner, undefined);
    return Response.json({ error: 'rate_limited' }, { status: 429 });
  } })).status, 429);

  const zero = await request(query);
  assert.equal(zero.status, 200);
  assert.deepEqual(zero.data.crews, CANONICAL_FACTION_KEYS.map(faction_id => ({ faction_id, today_banks: 0, week_banks: 0 })));

  sql.exec('DROP TABLE clan_operation_awards');
  assert.deepEqual(await request(query), { status: 503, data: { error: 'crew_progress_unavailable' } });
});

test('crew progress counts only committed D1 banks within UTC day and week boundaries', { timeout: 30_000 }, async t => {
  const db = await localD1(t);
  const { request, settings, fill } = requestFixture(db);
  const query = { method: 'GET', view: 'crew-progress' };
  async function mine(date) {
    settings.time = new Date(date);
    const ready = await fill((await request()).data);
    const bank = () => request({ action: 'bank', revision: ready.revision, day: ready.utc_day });
    const outcomes = await Promise.all([bank(), bank()]);
    assert.deepEqual(outcomes.map(result => result.status).sort(), [200, 409]);
  }
  await mine('2026-11-15T23:59:59Z');
  await mine('2026-11-16T00:00:00Z');
  await mine('2026-11-22T23:59:58Z');
  const sunday = (await request(query)).data;
  assert.deepEqual(Object.keys(sunday).sort(), ['crews', 'enabled', 'ok', 'utc_day', 'week_start']);
  assert.equal(sunday.week_start, '2026-11-16');
  assert.deepEqual(sunday.crews.find(crew => crew.faction_id === 'rugpull-miners'),
    { faction_id: 'rugpull-miners', today_banks: 1, week_banks: 2 });

  settings.time = new Date('2026-11-23T00:00:00Z');
  const monday = (await request(query)).data;
  assert.equal(monday.week_start, '2026-11-23');
  assert.equal(monday.utc_day, '2026-11-23');
  assert.ok(monday.crews.every(crew => crew.week_banks === 0 && crew.today_banks === 0));
  const chaos = (await request({ id: '107' })).data;
  const act = (action, revision) => request({ id: '107', day: chaos.utc_day, action, revision });
  const shortcut = (await act('shortcut', 0)).data;
  assert.equal(shortcut.chaos.grade, 'glitch');
  assert.deepEqual((await request(query)).data.crews, monday.crews, 'a playable cache is not a bank');
  assert.equal((await act('bank', shortcut.revision)).status, 200);
  const changed = (await request(query)).data;
  assert.deepEqual(changed.crews.find(crew => crew.faction_id === 'crypto-stoned-boys'),
    { faction_id: 'crypto-stoned-boys', today_banks: 1, week_banks: 1 });

  const response = await worker.fetch(new Request('https://local.test/clan-operations/state?view=crew-progress', {
    headers: { 'CF-Connecting-IP': '192.0.2.61' },
  }), { DB: db, CLAN_OPERATIONS_ENABLED: 'true' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await response.json()).crews.length, CANONICAL_FACTION_KEYS.length);
});

test('weekly crew entry is signed, UTC-bound and keeps the original faction on retries', async t => {
  const { request, settings, sql } = fixture(t);
  settings.time = new Date('2026-11-22T23:59:59Z');
  const entry = { id: '104', crewEntry: 'join', weekStart: '2026-11-23' };
  assert.equal((await request({ ...entry, signed: false })).status, 401);
  assert.deepEqual((await request({ id: '104', crewEntry: 'status' })).data,
    { ok: true, week_start: '2026-11-23', entered_faction: null });
  assert.deepEqual((await request(entry)).data,
    { ok: true, week_start: '2026-11-23', entered_faction: 'graffpunks' });
  sql.exec("UPDATE blocktopia_progression SET faction = 'nomad-bears' WHERE telegram_id = '104'");
  assert.equal((await request(entry)).data.entered_faction, 'graffpunks');
  settings.time = new Date('2026-11-23T00:00:00Z');
  assert.equal((await request(entry)).data.error, 'crew_week_changed');
  assert.equal((await request({ ...entry, weekStart: '2026-11-30' })).data.entered_faction, 'nomad-bears');
  assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM clan_crew_roster_entries').get().count, 2);
});

test('crew ranking scores five best days, retains absent members, and ranks exact ties equally', async t => {
  const { request, settings, sql } = fixture(t);
  const week = '2026-11-16';
  settings.time = new Date('2026-11-22T23:59:59Z');
  const roster = sql.prepare('INSERT INTO clan_crew_roster_entries VALUES (?, ?, ?)');
  const bank = sql.prepare('INSERT INTO clan_operation_awards VALUES (?, ?, ?, ?, 10000, ?, ?)');
  const played = sql.prepare(`INSERT INTO clan_operation_days
    (telegram_id, utc_day, faction_id, rules_version, route_index, updated_at) VALUES (?, ?, ?, 1, 0, ?)`);
  function record(id, faction, days, tiers) {
    for (const day of days) {
      const date = '2026-11-' + day;
      const time = date + 'T12:00:00Z';
      played.run(id, date, faction, time);
      for (let tier = 1; tier <= tiers; tier++) bank.run(id, date, faction, tier, 'audit', time);
    }
  }
  const bears = 'nomad-bears';
  const graff = 'graffpunks';
  const miners = 'rugpull-miners';
  for (const id of ['1', '2', '3']) roster.run(week, id, bears);
  for (const id of ['4', '5', '6', '7']) roster.run(week, id, graff);
  for (const id of ['8', '9']) roster.run(week, id, miners);
  const days = [16, 17, 18, 19, 20, 21, 22];
  record('1', bears, days, 3);
  record('2', bears, days, 2);
  record('3', graff, [16], 3); // A faction switch does not move the roster entry.
  record('4', graff, days, 3);
  record('5', graff, days, 3);
  record('6', graff, [16], 3);
  record('7', graff, [15, 23], 3);
  record('8', miners, days, 3);
  record('9', miners, days, 3);
  record('10', bears, days, 3); // No competition entry.
  const get = () => request({ method: 'GET', view: 'crew-progress', standings: true });
  const find = (results, faction) => results.crews.find(row => row.faction_id === faction);
  const { data } = await get();
  assert.equal(data.competition.current.ranked, true);
  assert.deepEqual(find(data.competition.current, bears), {
    faction_id: bears, roster_size: 3, active_members: 2, scored_banks: 25, possible_banks: 45, rank: 1,
  });
  assert.deepEqual(find(data.competition.current, graff), {
    faction_id: graff, roster_size: 4, active_members: 3, scored_banks: 33, possible_banks: 60, rank: 2,
  });
  assert.equal(find(data.competition.current, miners).rank, null);
  assert.equal(find(data, bears).week_banks, 56);

  // Make the exact fractions equal with differing roster sizes (24/45 = 32/60).
  sql.exec("DELETE FROM clan_operation_awards WHERE utc_day = '2026-11-16' AND tier = 3 AND telegram_id = '6'");
  sql.exec("DELETE FROM clan_operation_awards WHERE utc_day >= '2026-11-20' AND tier = 2 AND telegram_id = '2'");
  const tied = (await get()).data.competition.current;
  assert.equal(find(tied, bears).scored_banks, 24);
  assert.equal(find(tied, graff).rank, 1);
  assert.equal(find(tied, bears).rank, 1);

  settings.time = new Date('2026-11-23T00:00:00Z');
  const next = (await get()).data.competition;
  assert.equal(next.current.ranked, false);
  assert.deepEqual(next.previous, tied);

  sql.exec('DROP TABLE clan_crew_roster_entries');
  const beforeMigration = await get();
  assert.equal(beforeMigration.status, 200);
  assert.equal(beforeMigration.data.competition, undefined);
  assert.equal(beforeMigration.data.crews.length, 9);
});


function bankReceipt(sql, owner, faction, at, tier = 1) {
  const day = at.slice(0, 10);
  sql.prepare(`INSERT OR IGNORE INTO clan_operation_days
    (telegram_id, faction_id, utc_day, rules_version, route_index, updated_at)
    VALUES (?, ?, ?, 1, 0, ?)`).run(owner, faction, day, at);
  sql.prepare(`INSERT INTO clan_operation_awards
    (telegram_id, utc_day, faction_id, tier, renown, specimen_key, awarded_at)
    VALUES (?, ?, ?, ?, 10000, 'mine-v1-0-1', ?)`).run(owner, day, faction, tier, at);
}

test('clan periods freeze UTC results and issue one entitlement per active winner', async t => {
  const { db, sql } = fixture(t);
  sql.exec(`${newerMigration('126_clan_period_rewards')}
    CREATE TABLE telegram_seasons (id INTEGER PRIMARY KEY, start_date TEXT, end_date TEXT);
    INSERT INTO telegram_seasons VALUES (12, '2026-11-01', '2026-12-01T01:00:00Z');
    INSERT INTO clan_crew_roster_entries VALUES
      ('2026-11-23', '1', 'nomad-bears'), ('2026-11-23', '2', 'nomad-bears'),
      ('2026-11-23', '3', 'nomad-bears'), ('2026-11-23', '4', 'graffpunks'),
      ('2026-11-23', '5', 'graffpunks'), ('2026-11-23', '6', 'graffpunks');`);
  const at = '2026-11-23T12:00:00.000Z';
  bankReceipt(sql, '1', 'nomad-bears', at);
  bankReceipt(sql, '4', 'graffpunks', at);
  bankReceipt(sql, '3', 'rugpull-miners', at);
  const from = '2026-11-01';
  await closeClanPeriods(db, from, new Date('2026-11-30T00:04:59Z'));
  assert.equal((await readClanPeriodResults(db)).some(x => x.period_key === '2026-11-23'), false);
  await closeClanPeriods(db, from, new Date('2026-12-01T00:10Z'));
  const frozen = await readClanPeriodResults(db);
  assert.deepEqual(frozen.map(x => x.kind), ['monthly', 'weekly']);
  assert.equal(frozen.every(x => x.crews.filter(crew => crew.rank === 1).length === 2), true);
  assert.deepEqual((await readClanPeriodRewards(db, '1')).map(x => x.kind), ['monthly', 'weekly']);
  assert.equal((await readClanPeriodRewards(db, '2')).length, 0, 'inactive roster members do not earn an award');
  assert.equal((await readClanPeriodRewards(db, '3')).length, 0, 'banks in a different faction do not count');
  bankReceipt(sql, '5', 'graffpunks', at);
  await Promise.all([closeClanPeriods(db, from, new Date('2026-12-01T01:10Z')), closeClanPeriods(db, from, new Date('2026-12-01T01:10Z'))]);
  const settled = await readClanPeriodResults(db);
  assert.deepEqual(settled.filter(x => x.kind !== 'seasonal'), frozen);
  assert.deepEqual(settled.find(x => x.kind === 'seasonal').crews.filter(crew => crew.rank === 1).map(crew => crew.faction_id), ['graffpunks']);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM clan_period_reward_receipts").get().n, 6);
});

test('a paid WTF window uses fresh bank receipts and credits Community XP at most once', async t => {
  const { db, sql } = fixture(t);
  sql.exec(`CREATE TABLE telegram_users (telegram_id TEXT PRIMARY KEY, xp INTEGER DEFAULT 0, level INTEGER DEFAULT 1, updated_at TEXT);
    CREATE TABLE telegram_seasons (id INTEGER PRIMARY KEY, start_date TEXT, end_date TEXT, is_active INTEGER);
    CREATE TABLE telegram_xp_log (id INTEGER PRIMARY KEY, telegram_id TEXT, action TEXT, reference_id TEXT, xp_change INTEGER, created_at TEXT);
    CREATE TABLE telegram_leaderboard (telegram_id TEXT, season_id INTEGER, xp INTEGER, updated_at TEXT, PRIMARY KEY (telegram_id, season_id));
    INSERT INTO telegram_users (telegram_id) VALUES ('101'), ('102');
    INSERT INTO telegram_seasons VALUES (1, '2026-11-01', '2026-12-01', 1);
    ${newerMigration('089_community_xp_award_receipts')}`);
  const from = '2026-11-23T08:00:00.000Z';
  bankReceipt(sql, '101', 'nomad-bears', '2026-11-23T04:00:00.000Z');
  bankReceipt(sql, '101', 'nomad-bears', from, 2);
  bankReceipt(sql, '101', 'nomad-bears', '2026-11-23T09:29:59.000Z', 3);
  bankReceipt(sql, '102', 'graffpunks', '2026-11-23T09:30:00.000Z');
  await settleClanSignalXp(db, from, new Date('2026-11-23T12:00Z'));
  await settleClanSignalXp(db, from, new Date('2026-11-24T12:00Z'));
  assert.equal(sql.prepare("SELECT xp FROM telegram_users WHERE telegram_id='101'").get().xp, 100);
  assert.equal(sql.prepare("SELECT xp FROM telegram_users WHERE telegram_id='102'").get().xp, 0);
  const row = sql.prepare('SELECT claim_key, earned_at, season_id FROM telegram_community_xp_awards').get();
  assert.equal(row.claim_key, '2026-11-23:wtf-morning-signal');
  assert.equal(row.earned_at, from);
  assert.equal(row.season_id, 1);
});


test('Community season rollover prepares a continuous successor exactly once', async t => {
  const { db, sql } = fixture(t);
  sql.exec(`CREATE TABLE telegram_seasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, start_date TEXT, end_date TEXT, is_active INTEGER
  );`);
  const clock = at => new Date(at);
  const roll = at => rollCommunitySeason(db, clock(at));
  const current = at => selectCommunitySeason(db, clock(at));
  const count = () => sql.prepare('SELECT COUNT(*) AS n FROM telegram_seasons').get().n;
  await roll('2026-12-15T00:00:00Z');
  assert.equal(count(), 0, 'an operator seeds the first season');
  sql.exec(`INSERT INTO telegram_seasons VALUES
    (12, 'Season 12', '2026-11-21T16:31:19.578Z', '2026-12-16T00:00:00.000Z', 1)`);
  await roll('2026-12-14T23:59:59Z');
  assert.equal(count(), 1);
  await Promise.all([roll('2026-12-15T00:00:00Z'), roll('2026-12-15T00:00:00Z')]);
  assert.equal(count(), 2);
  assert.equal((await current('2026-12-15T23:59:59Z')).id, 12);
  const next = await current('2026-12-16T00:00:00Z');
  assert.equal(next.id, 13);
  assert.equal(next.name, 'Season 13');
  assert.equal(next.end_date, '2027-03-16T00:00:00.000Z');
  await roll('2027-06-16T03:00:00Z');
  assert.equal((await current('2027-06-16T03:00:00Z')).id, 15, 'missed ticks can catch up');
  assert.equal((await current('2026-12-01T00:00:00Z')).id, 12, 'delayed awards can resolve their original season');
  sql.exec("UPDATE telegram_seasons SET is_active=0 WHERE id=15");
  await roll('2028-01-01T00:00:00Z');
  assert.equal(count(), 4, 'disabled seasons do not roll over');
});

const season13 = { id: 13, start_date: '2026-12-16T00:00:00.000Z', end_date: '2027-03-16T00:00:00.000Z' };
const season14 = { id: 14, start_date: season13.end_date, end_date: '2027-06-14T00:00:00.000Z' };
const campaignStart = '2026-11-21';

test('campaign picker selects 30 compatible parts and the first two seasons use all 60 without repeats', () => {
  const first = buildClanCampaign(season13);
  const second = buildClanCampaign(season14);
  const parts = campaign => [campaign.theme, ...campaign.acts, ...campaign.windows, ...campaign.collectibles];
  assert.equal(parts(first).length, 30);
  assert.equal(parts(second).length, 30);
  assert.equal(new Set([...parts(first), ...parts(second)].map(part => part.title)).size, 60);
  assert.deepEqual(buildClanCampaign(season13), first);
  assert.equal(buildClanCampaign({ ...season13, id: 12 }), null);
  assert.equal(first.windows[0].startsOn, '2026-12-16');
  for (const campaign of [first, second]) {
    assert.equal(campaign.acts[2].endsBefore, campaign.endsBefore);
    const finale = campaign.windows.find(window => window.kind === 'finale');
    assert.equal((Date.parse(finale.endsBefore) - Date.parse(finale.startsOn)) / 86_400_000, 7);
    assert.equal(finale.endsBefore, campaign.endsBefore);
    assert.equal(campaign.windows.filter(window => window.kind === 'objective').length, 12);
    assert.equal(campaign.windows.filter(window => window.kind === 'event').length, 8);
    assert.ok(campaign.collectibles.every(item => campaign.windows.some(window => window.id === item.earnedFrom)));
  }
  const remixes = Array.from({ length: 50 }, (_, i) => buildClanCampaign({ ...season13, id: 15 + i }));
  assert.ok(new Set(remixes.map(campaign => campaign.windows.map(window => window.title).join('|'))).size >= 45);
  for (const campaign of remixes) {
    assert.equal(new Set(parts(campaign).map(item => item.title)).size, 30);
    for (const window of campaign.windows) {
      const perfectRosters = CANONICAL_FACTION_KEYS.map(faction_id => ({ faction_id, size: 3 }));
      const gapDays = window.metric === 'recoveries' ? [0, 2, 4, 6] : [0, 1, 2, 3];
      const perfectBanks = perfectRosters.flatMap(({ faction_id }) => [1, 2, 3].flatMap((member, index) =>
        gapDays.filter(day => (window.metric !== 'handoff' || day >= index)).flatMap(day => [1, 2, 3].map(tier => ({
          faction_id, telegram_id: faction_id + member, tier, route_index: day % 3,
          specimen_key: (day % 3) + '-' + tier,
          utc_day: new Date(Date.parse(window.startsOn) + day * 86_400_000).toISOString().slice(0, 10),
        })))));
      const progress = evaluateCampaignWindow(window, perfectRosters, perfectBanks);
      assert.ok(progress.rows.every(row => row.points === progress.rows[0].points), window.title);
      assert.equal(progress.eligibleFactions.length, 9, window.title);
    }
  }
});

test('campaign endpoints hide future details, pin plans and grant only one collectible per verified contributor', async t => {
  const db = await localD1(t);
  const { settings, request } = requestFixture(db);
  const schema = new DatabaseSync(':memory:');
  schema.exec(`CREATE TABLE telegram_seasons (
    id INTEGER PRIMARY KEY, start_date TEXT, end_date TEXT, is_active INTEGER
  );
  ${newerMigration('127_clan_campaigns')}`);
  const objects = schema.prepare('SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid').all();
  await db.batch(objects.map(row => db.prepare(row.sql)));
  schema.close();
  await db.prepare('INSERT INTO telegram_seasons VALUES (?, ?, ?, 1), (?, ?, ?, 1)')
    .bind(13, season13.start_date, season13.end_date, 14, season14.start_date, season14.end_date).run();
  settings.periodStart = campaignStart;
  assert.equal((await request({ method: 'GET', view: 'campaign', rateLimit: () => Response.json({}, { status: 429 }) })).status, 429);
  const maintain = at => maintainClanCampaigns(db, campaignStart, new Date(at));
  settings.time = new Date('2026-12-15T12:00:00Z');
  await maintain(settings.time);
  const before = await request({ method: 'GET', view: 'campaign' });
  assert.equal(before.data.campaign, null);
  assert.deepEqual(before.data.upcoming, { seasonId: 13, startsOn: '2026-12-16', title: 'The Clout War' });
  const readPlan = () => db.prepare('SELECT plan_json FROM clan_campaigns WHERE season_id=13').first('plan_json');
  const snapshot = await readPlan();
  await maintain(settings.time);
  assert.equal(await readPlan(), snapshot);
  const plan = JSON.parse(snapshot);
  const window = plan.windows.find(item => item.id === 'objective-4');
  const openingWeek = crewWeek(new Date(window.startsOn)).start;
  await db.prepare('INSERT INTO clan_crew_roster_entries VALUES (?, ?, ?), (?, ?, ?)')
    .bind(openingWeek, '101', 'rugpull-miners', openingWeek, '102', 'all-city-bulls').run();
  const awards = plan.collectibles.find(item => item.earnedFrom === window.id);
  for (let day = 0; day < 7; day++) {
    const at = new Date(Date.parse(window.startsOn) + (day * 24 + 12) * 3_600_000).toISOString();
    if (window.metric === 'recoveries' && day % 2) continue;
    const utcDay = at.slice(0, 10);
    const route = day % 3;
    const statements = [];
    for (const [id, faction] of [['101', 'rugpull-miners'], ['102', 'nomad-bears'], ['105', 'nomad-bears']]) {
      statements.push(db.prepare(`INSERT INTO clan_operation_days
        (telegram_id, faction_id, utc_day, rules_version, route_index, updated_at)
        VALUES (?, ?, ?, 1, ?, ?)`).bind(id, faction, utcDay, route, at));
      for (const tier of [1, 2, 3]) {
        statements.push(db.prepare(`INSERT INTO clan_operation_awards
          (telegram_id, utc_day, faction_id, tier, renown, specimen_key, awarded_at)
          VALUES (?, ?, ?, ?, 10000, ?, ?)`).bind(id, utcDay, faction, tier, 'find-' + route + '-' + tier, at));
      }
    }
    await db.batch(statements);
  }
  settings.time = new Date(Date.parse(window.endsBefore) - 60_000);
  const visible = (await request({ method: 'GET', view: 'campaign' })).data.campaign;
  const active = visible.windows.find(item => item.id === window.id);
  assert.ok(active.progress.eligibleFactions.includes('rugpull-miners'));
  assert.equal(active.progress.rows.find(row => row.faction_id === 'nomad-bears').participants, 0);
  assert.ok(visible.windows.filter(item => item.status === 'upcoming').every(item => !Object.hasOwn(item, 'title')));
  assert.equal(JSON.stringify(visible).includes('telegram_id'), false);
  const look = async (id, signed = true) => request({ campaignRewards: 1, id, signed });
  assert.equal((await look('101', false)).status, 401);
  for (let i = 0; i < 8; i++) await maintain(window.endsBefore + 'T00:04:59.999Z');
  assert.equal((await look('101')).data.collectibles.some(item => item.collectible === awards.title), false);
  for (let i = 0; i < 8; i++) await Promise.all([
    maintain(window.endsBefore + 'T00:05:00.000Z'), maintain(window.endsBefore + 'T00:05:00.000Z'),
  ]);
  assert.equal((await look('101')).data.collectibles.filter(item => item.collectible === awards.title).length, 1);
  assert.deepEqual((await look('102')).data.collectibles, []);
  assert.deepEqual((await look('105')).data.collectibles, []);
});

test('the campaign finale normalizes crew size and the city assigns every faction equal capacity', () => {
  const window = { mode: 'ranked', metric: 'showdown', target: 1, startsOn: '2026-12-16', endsBefore: '2026-12-23' };
  const rosters = [
    { faction_id: 'rugpull-miners', size: 3 },
    { faction_id: 'nomad-bears', size: 6 },
  ];
  const receipt = (faction_id, telegram_id) =>
    ({ faction_id, telegram_id, utc_day: '2026-12-16', tier: 1, route_index: 0, specimen_key: 'find-1' });
  const oneThird = [
    receipt('rugpull-miners', '1'), receipt('nomad-bears', '2'), receipt('nomad-bears', '3'),
  ];
  let progress = evaluateCampaignWindow(window, rosters, oneThird);
  assert.deepEqual(progress.eligibleFactions.sort(), ['nomad-bears', 'rugpull-miners']);
  const highOneCrew = [...oneThird, receipt('nomad-bears', '4')];
  progress = evaluateCampaignWindow(window, rosters, highOneCrew);
  assert.deepEqual(progress.eligibleFactions, ['nomad-bears']);
  assert.deepEqual(evaluateCampaignWindow(window, rosters.slice(0, 1), oneThird).eligibleFactions, []);
  const city = evaluateCampaignWindow({ ...window, mode: 'city', metric: 'routes', target: 3, cityTarget: 10 }, rosters, oneThird);
  assert.equal(city.cityPoints, 246);
  assert.deepEqual(city.eligibleFactions, []);
});
