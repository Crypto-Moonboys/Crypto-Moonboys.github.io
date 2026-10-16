import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyTelegramMiniAppInitData } from '../workers/moonboys-api/pets/mini-app-auth.js';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  PILOT_REPROJECT_SQL, syncCloutPilotForVerifiedOwner,
} from '../workers/moonboys-api/championship/clout-pilot.js';
import {
  CLOUT_POLICY_VERSION, projectCloutDay,
} from '../workers/moonboys-api/championship/clout-policy.js';

const DAY = '2026-10-17';
const START = DAY + 'T00:00:00.000Z';
const EARLY = DAY + 'T00:00:00.000Z';
const NOON = DAY + 'T12:00:00.000Z';
const NOW = new Date(DAY + 'T13:00:00.000Z');
const OWNER = '100';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec([
    'PRAGMA foreign_keys=ON;',
    'CREATE TABLE telegram_users(telegram_id TEXT PRIMARY KEY,xp INTEGER DEFAULT 0);',
    'CREATE TABLE telegram_anticheat_state(telegram_id TEXT PRIMARY KEY,is_blocked INTEGER DEFAULT 0);',
    'CREATE TABLE telegram_xp_log(id INTEGER PRIMARY KEY,telegram_id TEXT,action TEXT,reference_id TEXT,xp_change INTEGER,created_at TEXT);',
    'CREATE TABLE telegram_community_xp_awards(telegram_id TEXT,action TEXT,claim_key TEXT,reference_id TEXT,xp_change INTEGER,season_id INTEGER,earned_at TEXT,settlement_token TEXT,PRIMARY KEY(telegram_id,action,claim_key));',
    'CREATE TABLE telegram_pet_season_slots(pet_id TEXT,telegram_id TEXT,season_key TEXT,slot_number INTEGER,PRIMARY KEY(pet_id,telegram_id,season_key));',
    'CREATE TABLE telegram_pet_instances(pet_id TEXT,telegram_id TEXT,season_key TEXT,slot_number INTEGER,PRIMARY KEY(pet_id,telegram_id,season_key));',
    'CREATE TABLE telegram_pet_growth_marks(mark_id TEXT PRIMARY KEY,pet_id TEXT,telegram_id TEXT,season_key TEXT,milestone_type TEXT,evidence_key TEXT,earned_day TEXT,earned_at TEXT);',
    'CREATE TABLE telegram_pet_daily_journey_receipts(receipt_id TEXT PRIMARY KEY,growth_mark_id TEXT,telegram_id TEXT,pet_id TEXT,season_key TEXT,utc_day TEXT,status TEXT,reason TEXT,completed_objectives INTEGER);',
    'CREATE TABLE telegram_pet_weekly_crests(crest_id TEXT PRIMARY KEY,pet_id TEXT,telegram_id TEXT,season_key TEXT,qualification_week INTEGER,objective_id TEXT,evidence_key TEXT,earned_at TEXT);',
    'CREATE TABLE telegram_pet_weekly_journey_receipts(receipt_id TEXT PRIMARY KEY,crest_id TEXT,telegram_id TEXT,pet_id TEXT,season_key TEXT,qualification_week INTEGER,status TEXT,reason TEXT,completed_objectives INTEGER);',
    "INSERT INTO telegram_users VALUES ('100',25),('200',75);",
  ].join('\n'));
  sql.exec(readFileSync('workers/moonboys-api/migrations/100_championship_clout_foundation.sql', 'utf8'));
  const db = {
    prepare(query) {
      const st = sql.prepare(query);
      return {
        bind(...args) {
          return {
            async first() { return st.get(...args) ?? null; },
            async all() { return { success: true, results: st.all(...args) }; },
            async run() {
              const outcome = st.run(...args);
              return { success: true, meta: { changes: Number(outcome.changes) } };
            },
          };
        },
      };
    },
    async batch(items) {
      sql.exec('BEGIN');
      try {
        const outcomes = [];
        for (const item of items) outcomes.push(await item.run());
        sql.exec('COMMIT');
        return outcomes;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { sql, db, close: () => sql.close() };
}

function addDaily(f, { owner = OWNER, day = DAY, earnedAt = NOON, withLog = true } = {}) {
  f.sql.prepare('INSERT INTO telegram_community_xp_awards VALUES (?,?,?,?,?,?,?,?)')
    .run(owner, 'daily_claim', day, day, 12, null, earnedAt, 'settled-token');
  if (withLog) f.sql.prepare('INSERT INTO telegram_xp_log(telegram_id,action,reference_id,xp_change,created_at) VALUES (?,?,?,?,?)')
    .run(owner, 'daily_claim', day, 12, earnedAt);
}

function addPet(f, { owner = OWNER, pet = 'pet-1', season = 'pet-s2026-004' } = {}) {
  f.sql.prepare('INSERT INTO telegram_pet_season_slots VALUES (?,?,?,?)').run(pet, owner, season, 1);
  f.sql.prepare('INSERT INTO telegram_pet_instances VALUES (?,?,?,?)').run(pet, owner, season, 1);
}

function addMark(f, { owner = OWNER, pet = 'pet-1', season = 'pet-s2026-004', day = DAY,
  status = 'accepted', reason = 'daily_journey_qualified', count = 3 } = {}) {
  const markId = 'growth:' + pet + ':' + season + ':daily_moon_run_milestone:daily-run:' + day + ':3-of-5';
  f.sql.prepare('INSERT INTO telegram_pet_growth_marks VALUES (?,?,?,?,?,?,?,?)')
    .run(markId, pet, owner, season, 'daily_moon_run_milestone', 'daily-run:' + day + ':3-of-5', day, day + 'T00:00:00.000Z');
  f.sql.prepare('INSERT INTO telegram_pet_daily_journey_receipts VALUES (?,?,?,?,?,?,?,?,?)')
    .run('journey:' + markId, markId, owner, pet, season, day, status, reason, count);
}

function addCrest(f, { owner = OWNER, pet = 'pet-1', season = 'pet-s2026-004',
  status = 'accepted', reason = 'weekly_journey_qualified', count = 5 } = {}) {
  const id = 'crest:' + pet + ':' + season + ':42:weekly_journey';
  f.sql.prepare('INSERT INTO telegram_pet_weekly_crests VALUES (?,?,?,?,?,?,?,?)')
    .run(id, pet, owner, season, 42, 'weekly_journey', 'weekly-journey:' + season + ':42:5-of-5', EARLY);
  f.sql.prepare('INSERT INTO telegram_pet_weekly_journey_receipts VALUES (?,?,?,?,?,?,?,?,?)')
    .run('journey:' + id, id, owner, pet, season, 42, status, reason, count);
}

async function sync(f, owner = OWNER, opts = {}) {
  return syncCloutPilotForVerifiedOwner(f.db, owner, {
    enabled: true, startAt: START, now: NOW, ...opts,
  });
}
const count = (f, table) => f.sql.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n;

test('pilot is dark by default; invalid owner/launch never writes', async () => {
  const f = fixture();
  try {
    assert.deepEqual(await syncCloutPilotForVerifiedOwner(f.db, OWNER), { state: 'disabled' });
    await assert.rejects(sync(f, 'hacker'), /invalid_owner/);
    await assert.rejects(sync(f, OWNER, { startAt: 'yesterday' }), /launch_boundary_required/);
    assert.deepEqual(await sync(f, OWNER, { now: new Date('2026-10-16T20:00:00Z') }), { state: 'prelaunch' });
    assert.equal(count(f, 'championship_clout_sources'), 0);
  } finally { f.close(); }
});

test('Telegram /daily requires its matching accepted award AND xp log; newcomer needs no pet', async () => {
  const f = fixture();
  try {
    addDaily(f, { withLog: false });
    assert.equal((await sync(f)).state, 'no_qualifying_receipts');
    assert.equal(count(f, 'championship_clout_effects'), 0);
    f.sql.prepare('INSERT INTO telegram_xp_log(telegram_id,action,reference_id,xp_change,created_at) VALUES (?,?,?,?,?)')
      .run(OWNER, 'daily_claim', DAY, 12, NOON);
    const result = await sync(f);
    assert.equal(result.state, 'recorded');
    assert.equal(result.total_points, 5);
    assert.equal(count(f, 'championship_clout_sources'), 1);
    assert.equal(count(f, 'championship_clout_effects'), 1);
    assert.equal((await sync(f)).total_points, 5, 'retries cannot farm Clout');
    assert.equal(count(f, 'championship_clout_sources'), 1);
    assert.equal(f.sql.prepare('SELECT xp FROM telegram_users WHERE telegram_id=?').get(OWNER).xp, 25,
      'Community XP must not be credited again');
    assert.equal(count(f, 'telegram_xp_log'), 1, 'source XP log remains unmodified');
  } finally { f.close(); }
});

test('Moonpet Daily 3/5 and Weekly 5/5 require saved qualified receipts and owned pet', async () => {
  const f = fixture();
  try {
    addDaily(f);
    addPet(f);
    addMark(f);
    addCrest(f);
    const result = await sync(f);
    assert.equal(result.total_points, 25, '5 Community + 5 Daily + 10 Weekly + 5 unique Moonpet variety');
    assert.equal(count(f, 'championship_clout_sources'), 3);
    assert.equal(count(f, 'championship_clout_effects'), 5);
    assert.equal((await sync(f)).total_points, 25);
    assert.equal(count(f, 'championship_clout_effects'), 5);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM championship_clout_effects WHERE game_key=?').get('moonpet').n, 2);
    assert.equal(f.sql.prepare('SELECT xp FROM telegram_users WHERE telegram_id=?').get(OWNER).xp, 25);
    assert.equal(count(f, 'telegram_pet_growth_marks'), 1);
    assert.equal(count(f, 'telegram_pet_weekly_crests'), 1);
  } finally { f.close(); }
});

test('rejected, unowned and cross-owner achievements cannot mint Clout', async () => {
  for (const mode of ['rejected-daily', 'rejected-weekly', 'unowned', 'cross-owner']) {
    const f = fixture();
    try {
      if (mode !== 'unowned') addPet(f);
      if (mode === 'rejected-daily') addMark(f, { status: 'rejected' });
      if (mode === 'rejected-weekly') addCrest(f, { status: 'rejected' });
      if (mode === 'unowned') addMark(f);
      if (mode === 'cross-owner') addMark(f, { owner: '200' });
      assert.equal((await sync(f)).state, 'no_qualifying_receipts', mode);
      assert.equal(count(f, 'championship_clout_effects'), 0, mode);
    } finally { f.close(); }
  }
});

test('banned account, missing user, future launch and wrong UTC day fail closed', async () => {
  const f = fixture();
  try {
    addDaily(f);
    f.sql.prepare('INSERT INTO telegram_anticheat_state VALUES (?,?)').run(OWNER, 1);
    assert.equal((await sync(f)).state, 'ineligible');
    assert.equal((await sync(f, '999')).state, 'ineligible');
    assert.equal(count(f, 'championship_clout_effects'), 0);
    f.sql.prepare('UPDATE telegram_anticheat_state SET is_blocked=0 WHERE telegram_id=?').run(OWNER);
    assert.equal((await sync(f, OWNER, { now: new Date('2026-10-18T13:00:00.000Z') })).state, 'no_qualifying_receipts');
    assert.equal(count(f, 'championship_clout_sources'), 0);
  } finally { f.close(); }
});

test('source day cannot be moved across midnight and source timestamp cannot be future', async () => {
  const f = fixture();
  try {
    addDaily(f, { earnedAt: '2026-10-18T00:00:00.000Z' });
    assert.equal((await sync(f)).state, 'no_qualifying_receipts', 'award date mismatch excludes source');
    f.sql.prepare('UPDATE telegram_community_xp_awards SET earned_at=?').run(NOON);
    f.sql.prepare('UPDATE telegram_xp_log SET created_at=?').run(NOON);
    assert.equal((await sync(f)).total_points, 5);
    assert.equal(count(f, 'championship_clout_sources'), 1);
  } finally { f.close(); }
});

test('SQL daily reprojection matches versioned deterministic skill policy', async () => {
  const f = fixture();
  try {
    addDaily(f);
    for (const [i, game, rating] of [[1, 'snake', 80], [2, 'dead-run', 60], [3, 'moonpet', 40]]) {
      const id = 'preverified-' + i;
      f.sql.prepare('INSERT INTO championship_clout_sources VALUES (?,?,?,?,?,?,?,?,?)').run(
        'verified_game', id, CLOUT_POLICY_VERSION, OWNER, DAY,
        Date.parse(NOON), Date.parse(NOON), 'server_receipt', Date.parse(NOON),
      );
      f.sql.prepare([
        'INSERT INTO championship_clout_effects(source_system,source_event_id,',
        'effect_kind,policy_version,telegram_id,verification_kind,earned_at_ms,',
        'verified_at_ms,day_key,game_key,normalized_skill,recorded_at_ms)',
        'VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      ].join(' ')).run(
        'verified_game', id, 'skill', CLOUT_POLICY_VERSION, OWNER, 'server_receipt',
        Date.parse(NOON), Date.parse(NOON), DAY, game, rating, Date.parse(NOON),
      );
    }
    const expected = projectCloutDay([
      ...[['snake',80],['dead-run',60],['moonpet',40]].map(([game, rating], index) => ({
        source_system: 'verified_game', source_event_id: 'preverified-' + (index + 1),
        effect_kind: 'skill', telegram_id: OWNER, policy_version: CLOUT_POLICY_VERSION,
        verification_kind: 'server_receipt', earned_at_ms: Date.parse(NOON),
        verified_at_ms: Date.parse(NOON), day_key: DAY, game_key: game,
        normalized_skill: rating, fixed_points: null,
      })),
      {
        source_system: 'telegram_daily', source_event_id: 'daily:' + OWNER + ':' + DAY,
        effect_kind: 'community', telegram_id: OWNER, policy_version: CLOUT_POLICY_VERSION,
        verification_kind: 'server_receipt', earned_at_ms: Date.parse(NOON),
        verified_at_ms: Date.parse(NOON), day_key: DAY, fixed_points: 5,
      },
    ]);
    const recorded = await sync(f);
    const projected = f.sql.prepare('SELECT * FROM championship_clout_daily WHERE telegram_id=?').get(OWNER);
    assert.equal(recorded.total_points, expected.total_points);
    assert.equal(projected.skill_points, expected.skill_points);
    assert.deepEqual(JSON.parse(projected.game_keys_json), JSON.parse(expected.game_keys_json));
    assert.equal(projected.total_points, 40, 'skill 35 plus community 5');
    assert.ok(PILOT_REPROJECT_SQL.includes('ON CONFLICT'));
  } finally { f.close(); }
});

test('PR2 must not expose a browser write route, economy mutation or enabled default', () => {
  const entry = readFileSync('workers/moonboys-api/worker-phase5-final.js', 'utf8');
  const pilot = readFileSync('workers/moonboys-api/championship/clout-pilot.js', 'utf8');
  assert.match(entry, /verifyTelegramWebhookSecret\(request, env\)/);
  assert.match(entry, /ctx\.waitUntil\(projectCloutForAuthenticatedWebhook\(env, body, response\)\)/);
  assert.match(entry, /ctx\.waitUntil\(projectCloutForAuthenticatedMiniApp\(env, body, response\)/);
  assert.doesNotMatch(entry, /await\s+projectCloutForAuthenticated(?:Webhook|MiniApp)\(/,
    'Clout source reads and projection must never block the completed gameplay response');
  assert.match(entry, /typeof ctx\?\.waitUntil === 'function'/,
    'Cloudflare execution context must own background Clout projection lifecycle');
  assert.match(entry, /CHAMPIONSHIP_CLOUT_PILOT_ENABLED === 'true'/,
    'no optional Clout work should be scheduled while the pilot is disabled');
  assert.match(entry, /CHAMPIONSHIP_CLOUT_PILOT_ENABLED !== 'true'/);
  assert.match(entry, /isMiniAppPetAction && body && response\.ok/);
  assert.match(entry, /verifyTelegramMiniAppInitData\(/);
  assert.match(entry, /projectCloutForAuthenticatedMiniApp\(env, body, response\)/);
  assert.doesNotMatch(entry, /\/championship\/clout\/pilot\/sync/);
  assert.doesNotMatch(pilot, /UPDATE arcade_xp_wallets|UPDATE telegram_users SET xp|INSERT INTO telegram_xp_log/);
});

test('Mini App signature binds the actor: tampered owner cannot authorize a Clout sync', async () => {
  const botToken = 'bot-token-for-test-only';
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: Number(OWNER), first_name: 'Fixture' }),
  });
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + '=' + value).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  const verified = await verifyTelegramMiniAppInitData(params.toString(), botToken);
  assert.equal(verified.ok, true);
  assert.equal(verified.telegramId, OWNER);
  params.set('user', JSON.stringify({ id: 200, first_name: 'Attacker' }));
  assert.equal((await verifyTelegramMiniAppInitData(params.toString(), botToken)).ok, false);
});
