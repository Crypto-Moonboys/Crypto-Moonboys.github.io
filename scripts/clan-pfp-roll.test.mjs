import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { AVATAR_PRESETS } from '../js/avatar-builder-homepage-presets.mjs';
import { handleClanPfpRoll } from '../workers/moonboys-api/routes/clan-pfp-roll.js';
import { buildPfpRound, drawPfpRoll } from '../workers/moonboys-api/shared/clan-pfp-roll.js';
import { CANONICAL_FACTION_KEYS } from '../workers/moonboys-api/shared/faction-canon.js';

const files = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const day = '2026-11-21';
const statePath = '/clan-operations/pfp/state';
const rollPath = '/clan-operations/pfp/roll';

test('two full rotations use all saved builds, with one full match in 27 outcomes per target', async () => {
  const manifest = JSON.parse(files('data/avatar-builder-manifest.json'));
  const traits = new Map(manifest.traits.map(trait => [trait.id, trait]));
  const presets = new Map(AVATAR_PRESETS.map(preset => [preset.id, preset.stack]));
  assert.equal(presets.size, 20);
  const rounds = await Promise.all(Array.from({ length: 40 }, (_, i) =>
    buildPfpRound(new Date(Date.parse(day) + 86_400_000 * i).toISOString().slice(0, 10))));
  for (const cycle of [rounds.slice(0, 20), rounds.slice(20)]) {
    assert.equal(new Set(cycle.map(round => round.presetId)).size, presets.size);
    for (const round of cycle) {
      assert.deepEqual(round.target, presets.get(round.presetId));
      assert.equal(round.pools.length, 3);
      if (round.presetId === 'moonboy-16') {
        assert.deepEqual(round.pools.map(pool => pool.category), ['hat', 'chains', 'clothes']);
      }
      const results = [0, 0, 0, 0];
      for (let i = 0; i < 27; i++) {
        const indices = [i % 3, Math.floor(i / 3) % 3, Math.floor(i / 9)];
        const draw = drawPfpRoll(round, () => indices.shift());
        if (draw.stack.face) assert.notEqual(draw.stack.hat, 'hat-mb-hat-49');
        for (const [category, id] of Object.entries(draw.stack)) {
          if (!id) continue;
          const trait = traits.get(id);
          assert.equal(trait?.category, category);
          assert(existsSync(new URL('..' + (trait.layer ?? trait.thumbnail), import.meta.url)));
        }
        results[draw.matched.length]++;
        assert.equal(draw.xp, [0, 5, 15, 50][draw.matched.length]);
        if (draw.matched.length === 3) assert.deepEqual(draw.stack, round.target);
      }
      assert.deepEqual(results, [8, 12, 6, 1]);
    }
  }
  assert.deepEqual(rounds[0], await buildPfpRound(day));
});

async function fixture(t) {
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, compatibilityDate: '2026-04-12',
    script: 'export default {fetch(){return new Response()}}',
    d1Databases: { DB: 'clan-pfp-roll-test' },
  }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const schema = files('workers/moonboys-api/schema.sql');
  const tables = ['telegram_users', 'telegram_seasons', 'telegram_leaderboard', 'telegram_xp_log', 'telegram_community_xp_awards'];
  await db.batch([
    ...tables.map(table => schema.match(new RegExp('CREATE TABLE IF NOT EXISTS ' + table + ' \\(.*?;','s'))[0]),
    schema.match(/CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_leaderboard_unique_user_season.*?;/s)[0],
    'CREATE TABLE blocktopia_progression (telegram_id TEXT PRIMARY KEY, faction TEXT, faction_xp INTEGER DEFAULT 0)',
    ...files('workers/moonboys-api/migrations/128_clan_pfp_roll.sql').split(';').filter(sql => sql.trim()),
    "INSERT INTO telegram_seasons (id, start_date, end_date, is_active) VALUES (90, '2026-11-01', '2026-12-31', 1)",
  ].map(sql => db.prepare(sql)));
  const env = { DB: db, CLAN_OPERATIONS_ENABLED: 'true', CLAN_PFP_ROLL_ENABLED: 'true' };
  let time = new Date(day + 'T12:00:00Z');
  async function send(path, { id = '1001', method = 'POST', signed = true, pickIndex, ...body } = {}) {
    const response = await handleClanPfpRoll(new Request('https://test.local' + path, {
      method, ...(method === 'POST' ? {
        body: JSON.stringify({ telegram_auth: { id, hash: 'a'.repeat(64), auth_date: Math.floor(Date.now() / 1000) }, ...body }),
      } : {}),
    }), env, {
      path, pickIndex, now: () => time, verifyTelegramAuth: () => signed,
      respond: (value, status = 200) => Response.json(value, { status }),
      logApiFailure: (reason, detail) => t.diagnostic(reason + ' ' + detail.message),
    });
    return { status: response.status, data: await response.json() };
  }
  async function player(id, faction) {
    await db.batch([db.prepare('INSERT INTO telegram_users (telegram_id) VALUES (?)').bind(id),
      db.prepare('INSERT INTO blocktopia_progression (telegram_id, faction) VALUES (?, ?)').bind(id, faction)]);
  }
  return { db, env, send, player, setTime: date => { time = new Date(date); } };
}

test('the feature gate and signed faction checks apply to every preset roll', async t => {
  const { db, env, send, player } = await fixture(t);
  env.CLAN_PFP_ROLL_ENABLED = 'false';
  assert.equal((await send(statePath, { method: 'GET' })).data.enabled, false);
  assert.equal((await send(statePath)).status, 404);
  env.CLAN_PFP_ROLL_ENABLED = 'true';
  assert.equal((await send(statePath, { method: 'GET' })).data.enabled, true);
  assert.equal((await send(statePath, { signed: false })).status, 401);
  await player('1999', 'unaligned');
  assert.equal((await send(statePath, { id: '1999' })).status, 403);

  const states = [];
  for (const [i, faction] of CANONICAL_FACTION_KEYS.entries()) {
    const id = String(1001 + i);
    await player(id, faction);
    const { status, data } = await send(statePath, { id });
    assert.equal(status, 200);
    assert.equal(data.rolls_left, 5);
    states.push(data.preset_id);
  }
  assert.equal(new Set(states).size, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM clan_pfp_rounds').first()).n, 1);
});

test('D1 saves one portrait and XP receipt on replay, caps parallel rolls, and resets on UTC day change', async t => {
  const { db, send, player, setTime } = await fixture(t);
  await player('1001', 'graffpunks');
  const { data: round } = await send(statePath);
  const match = index => round.pools[index].choices.indexOf(round.target[round.pools[index].category]);
  const picker = wins => {
    let i = 0;
    return () => {
      const index = i++;
      return (match(index) + (index < wins ? 0 : 1)) % 3;
    };
  };
  const id = randomUUID();
  const exacts = await Promise.all(Array.from({ length: 2 }, () =>
    send(rollPath, { request_id: id, utc_day: day, pickIndex: picker(3), xp: 5000 })));
  assert(exacts.every(item => item.status === 200));
  assert.deepEqual(exacts[0].data.result, exacts[1].data.result);
  assert.equal(exacts[0].data.result.xp, 50);
  assert.deepEqual(exacts[0].data.result.stack, round.target);

  const mixed = await Promise.all(Array.from({ length: 8 }, () =>
    send(rollPath, { request_id: randomUUID(), utc_day: day, pickIndex: picker(0) })));
  assert.equal(mixed.filter(item => item.status === 200).length, 4);
  assert(mixed.filter(item => item.status !== 200).every(item => item.data.error === 'pfp_daily_limit'));
  const state = (await send(statePath)).data;
  assert.equal(state.rolls_left, 0);
  assert.equal(state.winner.request_id, id);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM telegram_community_xp_awards WHERE action = 'clan_pfp_roll'").first()).n, 5);
  assert.equal((await db.prepare("SELECT xp FROM telegram_users WHERE telegram_id = '1001'").first()).xp, 50);

  setTime('2026-11-22T00:00:00.000Z');
  assert.equal((await send(rollPath, { request_id: randomUUID(), utc_day: day })).data.error, 'pfp_day_changed');
  const replay = (await send(rollPath, { request_id: id, utc_day: day })).data;
  assert.deepEqual(replay.result, exacts[0].data.result);
  const next = (await send(statePath)).data;
  assert.equal(next.rolls_left, 5);
  assert.notEqual(next.preset_id, round.preset_id);
});

test('a failed roll receipt rolls back the XP and leaves the attempt available', async t => {
  const { db, send, player } = await fixture(t);
  await player('1001', 'graffpunks');
  await db.prepare(`CREATE TRIGGER reject_pfp_receipt BEFORE INSERT ON clan_pfp_rolls
    BEGIN SELECT RAISE(ABORT, 'fixture rejects receipt'); END;`).run();
  const { data: round } = await send(statePath);
  let index = 0;
  const response = await send(rollPath, { request_id: randomUUID(), utc_day: day, pickIndex: () => {
    const pool = round.pools[index++];
    return pool.choices.indexOf(round.target[pool.category]);
  } });
  assert.equal(response.status, 503);
  assert.equal((await send(statePath)).data.rolls_left, 5);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM telegram_community_xp_awards').first()).n, 0);
  assert.equal((await db.prepare("SELECT xp FROM telegram_users WHERE telegram_id = '1001'").first()).xp, 0);
});
