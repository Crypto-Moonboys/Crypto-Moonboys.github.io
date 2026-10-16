import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyTelegramMiniAppInitData } from '../workers/moonboys-api/pets/mini-app-auth.js';
import { scoreRun, difficultyForPlayer } from '../workers/moonboys-api/routes/dead-run-core.js';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  PILOT_REPROJECT_SQL, syncCloutPilotForVerifiedOwner, normalizeDeadRunSkill,
  CLOUT_DEAD_RUN_MIDNIGHT_GRACE_MS,
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
    'CREATE TABLE arcade_progression_events(id TEXT PRIMARY KEY,telegram_id TEXT,client_run_id TEXT,game TEXT,raw_score INTEGER,xp_awarded INTEGER,status TEXT,reason TEXT,UNIQUE(telegram_id,client_run_id));',
  ].join('\n'));
  sql.exec(readFileSync('workers/moonboys-api/migrations/075_dead_run_gps_survival.sql', 'utf8'));
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

const DEAD_RUN_START = DAY + 'T11:30:00.000Z';
const DEAD_RUN_IDS = Object.freeze({
  a: '3196c5ac-556f-41b2-8e22-3ed1b9a9ef10',
  b: '4122c06e-3c7d-45c2-9f41-c51908891234',
  c: '5a7c8f22-3011-4c8a-92ab-7a71ac11ff00',
});

// Populate a genuine server-owned terminal Dead Run record. The separate
// Arcade receipt may be absent if UNIQUE(owner,client_run_id) was occupied by
// an earlier client-side sync. That collision must not invalidate a settled run.
function addDeadRun(f, options = {}) {
  const {
    owner = OWNER, id = DEAD_RUN_IDS.a, startedAt = DEAD_RUN_START,
    endedAt = NOON, ranked = 1, status = 'finished',
    suspicious = 0, distance = 2000, survival = 600, kills = 5,
    crates = 3, shoves = 1, scoreOverride = null, xpOverride = null,
    difficultyXpBasis = 0, difficultyBestBasis = 0, difficultyRunsBasis = 0,
    arcadeReceipt = true, arcadeReason = 'verified_gps_run',
    statsApplied = 1, arcadeApplied = 1, hordeApplied = 1,
    receiptOwner = owner, receiptRunId = id, receiptScore = null,
    receiptXp = null,
  } = options;
  const score = scoreRun({
    verified_distance_m: distance, survival_seconds: survival,
    kills, crates, shove_count: shoves,
  }, difficultyForPlayer({
    xp_total: difficultyXpBasis, best_survival_seconds: difficultyBestBasis,
    runs_total: difficultyRunsBasis,
  }));
  const finalScore = scoreOverride ?? score.score;
  const finalXp = xpOverride ?? Math.min(275, Math.floor(
    score.xp * (arcadeReason === 'verified_gps_horde_event' ? 1.1 : 1)
  ));
  f.sql.prepare('INSERT OR IGNORE INTO dead_run_players(telegram_id) VALUES (?)').run(owner);
  f.sql.prepare([
    'INSERT INTO dead_run_sessions(',
    'session_id,telegram_id,day_key,status,ranked,seed,started_at,ended_at,',
    'last_sample_at_ms,verified_distance_m,suspicious_points,survival_seconds,',
    'score,xp_awarded,kills,crates,shove_count,',
    'difficulty_xp_basis,difficulty_best_basis,difficulty_runs_basis,',
    'player_stats_applied,arcade_xp_applied,horde_applied',
    ') VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ].join(' ')).run(
    id,owner,startedAt.slice(0,10),status,ranked,123,startedAt,endedAt,
    Date.parse(endedAt) - 1000,distance,suspicious,survival,
    finalScore,finalXp,kills,crates,shoves,
    difficultyXpBasis,difficultyBestBasis,difficultyRunsBasis,
    statsApplied,arcadeApplied,hordeApplied,
  );
  if (arcadeReceipt) f.sql.prepare([
    'INSERT INTO arcade_progression_events',
    '(id,telegram_id,client_run_id,game,raw_score,xp_awarded,status,reason)',
    "VALUES(?,?,?,?,?,?,'accepted',?)",
  ].join(' ')).run(
    'dead_run:' + id, receiptOwner, receiptRunId, 'dead-run',
    receiptScore ?? finalScore, receiptXp ?? finalXp, arcadeReason,
  );
  return { score:finalScore, xp:finalXp };
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
  assert.match(entry, /else if \(isMiniAppPetAction && body\)/,
    'only completed Mini App responses may schedule Clout projection');
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


test('Dead Run skill normalization is deterministic and monotonic, not an XP conversion', () => {
  assert.equal(normalizeDeadRunSkill(0), 0);
  assert.equal(normalizeDeadRunSkill(5000), 50);
  assert.equal(normalizeDeadRunSkill(20000), 80);
  assert.equal(normalizeDeadRunSkill(1_000_000), 99);
  assert.ok([0,100,500,1000,5000,20000,600000].every((score,i,list) =>
    i===0 || normalizeDeadRunSkill(score)>=normalizeDeadRunSkill(list[i-1])));
  for (const invalid of [-1,1.5,NaN,Infinity,1_000_001,'5000']) {
    assert.throws(()=>normalizeDeadRunSkill(invalid),/score_out_of_range/);
  }
});

test('Dead Run source gate is separate from /daily and OFF by default', async () => {
  const f=fixture();
  try {
    addDeadRun(f);
    assert.equal((await sync(f)).state,'no_qualifying_receipts');
    assert.equal(count(f,'championship_clout_sources'),0);
    addDaily(f);
    assert.equal((await sync(f)).total_points,5,'newcomer /daily remains unchanged');
    assert.equal(count(f,'championship_clout_effects'),1);
  } finally {f.close();}
});

test('one source-owned finished and ranked Dead Run settlement produces immutable Skill and Variety', async () => {
  const f=fixture();
  try {
    const {score}=addDeadRun(f);
    addDaily(f);
    const rating=normalizeDeadRunSkill(score);
    const out=await sync(f,OWNER,{deadRunEnabled:true});
    assert.equal(out.state,'recorded');
    assert.equal(out.total_points,Math.floor(rating*0.4)+10);
    assert.equal(count(f,'championship_clout_sources'),2);
    assert.equal(count(f,'championship_clout_effects'),3);
    const skill=f.sql.prepare("SELECT * FROM championship_clout_effects WHERE source_system='dead_run' AND effect_kind='skill'").get();
    assert.equal(skill.source_event_id,DEAD_RUN_IDS.a);
    assert.equal(skill.verification_kind,'server_settlement');
    assert.equal(skill.normalized_skill,rating);
    assert.equal(skill.game_key,'dead-run');
    assert.equal(skill.fixed_points,null);
    assert.deepEqual(JSON.parse(f.sql.prepare("SELECT game_keys_json FROM championship_clout_daily WHERE telegram_id=?").get(OWNER).game_keys_json),['dead-run']);
    assert.equal((await sync(f,OWNER,{deadRunEnabled:true})).total_points,out.total_points,
      'retries cannot repeat Clout effects');
    assert.equal(count(f,'championship_clout_effects'),3);
    assert.equal(f.sql.prepare("SELECT xp FROM telegram_users WHERE telegram_id=?").get(OWNER).xp,25);
    assert.equal(f.sql.prepare("SELECT xp_total FROM dead_run_players WHERE telegram_id=?").get(OWNER).xp_total,0);
    assert.equal(count(f,'arcade_progression_events'),1);
  } finally {f.close();}
});

test('same title selects the best ranked result and upgrades on a better signed finish', async () => {
  const f=fixture();
  try {
    const first=addDeadRun(f,{id:DEAD_RUN_IDS.a,distance:1200,survival:300});
    const firstAward=await sync(f,OWNER,{deadRunEnabled:true});
    assert.equal(firstAward.total_points,Math.floor(normalizeDeadRunSkill(first.score)*0.4)+5);
    assert.equal(count(f,'championship_clout_sources'),1);
    const improvedScore=addDeadRun(f,{id:DEAD_RUN_IDS.b,startedAt:DAY+'T12:00:00.000Z',
      endedAt:DAY+'T12:50:00.000Z',distance:2200,survival:800});
    const second=await sync(f,OWNER,{deadRunEnabled:true});
    assert.equal(second.total_points,Math.floor(normalizeDeadRunSkill(improvedScore.score)*0.4)+5);
    assert.ok(second.total_points>=firstAward.total_points,'better run cannot subtract earned Clout');
    assert.equal(count(f,'championship_clout_sources'),2);
    assert.equal(count(f,'championship_clout_effects'),4);
    assert.equal(f.sql.prepare("SELECT variety_points FROM championship_clout_daily WHERE telegram_id=?").get(OWNER).variety_points,5);
    assert.equal((await sync(f,OWNER,{deadRunEnabled:true})).total_points,second.total_points,
      'latest best is idempotent');
    addPet(f);addMark(f);
    const mixed=await sync(f,OWNER,{deadRunEnabled:true});
    assert.equal(mixed.total_points,second.total_points+10,
      'Moonpet adds mission and distinct variety rather than repeating Dead Run');
    assert.deepEqual(JSON.parse(f.sql.prepare("SELECT game_keys_json FROM championship_clout_daily WHERE telegram_id=?").get(OWNER).game_keys_json),['dead-run','moonpet']);
  } finally {f.close();}
});

test('twenty ranked runs never exceed source projection budget; best alone is selected', async () => {
  const f=fixture();
  try {
    let best=0;
    let bestId='';
    for(let i=0;i<20;i++){
      const id='ae46c5ad-c113-4b12-8c55-'+i.toString(16).padStart(12,'0');
      const endedAt=new Date(Date.parse(NOON)+i*30_000).toISOString();
      const scored=addDeadRun(f,{id,startedAt:DEAD_RUN_START,endedAt,
        distance:1000+i*25,survival:200+i*15});
      if(scored.score>best){best=scored.score;bestId=id;}
    }
    const outcome=await sync(f,OWNER,{deadRunEnabled:true});
    assert.equal(outcome.qualifying_receipts,1,'bounded best-only query, not 11/20 rows');
    assert.equal(outcome.total_points,Math.floor(normalizeDeadRunSkill(best)*0.4)+5);
    assert.equal(count(f,'championship_clout_sources'),1);
    assert.equal(f.sql.prepare("SELECT source_event_id FROM championship_clout_sources").get().source_event_id,bestId);
    assert.equal((await sync(f,OWNER,{deadRunEnabled:true})).total_points,outcome.total_points);
  } finally {f.close();}
});

test('cross-owner, unfinished, unranked, rejected and incomplete receipts cannot mint Clout', async () => {
  const permutations=[
    {status:'active'},{status:'settling'},{ranked:0},{suspicious:6},
    {distance:39},{survival:19},{statsApplied:0},{arcadeApplied:0},
    {hordeApplied:0},
  ];
  for (const mode of permutations) {
    const f=fixture();
    try {
      addDeadRun(f,mode);
      assert.equal((await sync(f,OWNER,{deadRunEnabled:true})).state,
        'no_qualifying_receipts',JSON.stringify(mode));
      assert.equal(count(f,'championship_clout_effects'),0,JSON.stringify(mode));
    } finally {f.close();}
  }
  const f=fixture();
  try {
    addDeadRun(f,{owner:'200'});
    assert.equal((await sync(f,OWNER,{deadRunEnabled:true})).state,'no_qualifying_receipts');
    assert.equal((await sync(f,'200',{deadRunEnabled:true})).state,'recorded');
    assert.equal(f.sql.prepare("SELECT DISTINCT telegram_id FROM championship_clout_effects").get().telegram_id,'200');
  } finally {f.close();}
});

test('real Arcade client_run_id collision does not hide a trusted server-finished run', async () => {
  const f=fixture();
  try {
    const score=addDeadRun(f,{arcadeReceipt:false});
    // Existing schema prevents the canonical Arcade receipt being inserted
    // after this untrusted client-supplied claim consumed the unique run key.
    f.sql.prepare("INSERT INTO arcade_progression_events VALUES(?,?,?,?,?,?,?,?)")
      .run('untrusted-submission','100',DEAD_RUN_IDS.a,'snake',1_000_000,0,'accepted','client_score');
    assert.throws(()=>f.sql.prepare("INSERT INTO arcade_progression_events VALUES(?,?,?,?,?,?,?,?)")
      .run('dead_run:'+DEAD_RUN_IDS.a,'100',DEAD_RUN_IDS.a,'dead-run',score.score,score.xp,
        'accepted','verified_gps_run'),/UNIQUE constraint failed/,
      'fixture must enforce real UNIQUE(telegram_id,client_run_id) collision');
    const projected=await sync(f,OWNER,{deadRunEnabled:true});
    assert.equal(projected.total_points,Math.floor(normalizeDeadRunSkill(score.score)*0.4)+5);
    assert.equal(count(f,'championship_clout_sources'),1,
      'the independent Dead Run server settlement, not the colliding browser row, is authority');
    assert.equal((await sync(f,OWNER,{deadRunEnabled:true})).total_points,projected.total_points);
    assert.equal(count(f,'arcade_progression_events'),1,'Clout must not repair/change existing XP receipts');
  } finally {f.close();}
  const fake=fixture();
  try {
    fake.sql.prepare("INSERT INTO arcade_progression_events VALUES(?,?,?,?,?,?,?,?)")
      .run('dead_run:'+DEAD_RUN_IDS.a,OWNER,DEAD_RUN_IDS.a,'dead-run',1_000_000,275,
        'accepted','verified_gps_run');
    assert.equal((await sync(fake,OWNER,{deadRunEnabled:true})).state,
      'no_qualifying_receipts','forged Arcade event without Dead Run server finish earns no Clout');
  } finally {fake.close();}
});

test('whether a secondary Arcade receipt exists never confers or denies verified Dead Run status', async () => {
  for(const state of [
    {arcadeReceipt:false},{receiptOwner:'200'},{receiptRunId:DEAD_RUN_IDS.b},
    {receiptScore:17},{receiptXp:2},{arcadeReason:'client_score'},
  ]){
    const f=fixture();
    try{
      const score=addDeadRun(f,state);
      assert.equal((await sync(f,OWNER,{deadRunEnabled:true})).total_points,
        Math.floor(normalizeDeadRunSkill(score.score)*0.4)+5,JSON.stringify(state));
      assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM championship_clout_effects WHERE source_system='dead_run'").get().n,2);
    }finally{f.close();}
  }
});

test('independent scoreRun recomputation rejects forged score, XP and unsafe ranges', async () => {
  for (const mode of [{scoreOverride:12345},{xpOverride:275,scoreOverride:4000},
    {scoreOverride:1_000_001},{xpOverride:1}]) {
    const f=fixture();
    try {
      addDeadRun(f,mode);
      await assert.rejects(sync(f,OWNER,{deadRunEnabled:true}),
        /settlement_mismatch|score_out_of_range/);
      assert.equal(count(f,'championship_clout_effects'),0);
      assert.equal(count(f,'championship_clout_sources'),0);
    } finally {f.close();}
  }
});

test('finish day, not session start day, controls Clout; yesterday is never backfilled', async () => {
  const f=fixture();
  try {
    addDeadRun(f,{startedAt:'2026-10-16T23:56:00.000Z',endedAt:DAY+'T00:10:00.000Z'});
    assert.equal((await sync(f,OWNER,{deadRunEnabled:true})).state,'recorded');
    const row=f.sql.prepare("SELECT day_key,earned_at_ms FROM championship_clout_sources WHERE source_system='dead_run'").get();
    assert.equal(row.day_key,DAY);
    assert.equal(row.earned_at_ms,Date.parse(DAY+'T00:10:00.000Z'));
    assert.equal((await sync(f,OWNER,{deadRunEnabled:true,
      now:new Date('2026-10-18T12:00:00.000Z')})).state,'no_qualifying_receipts');
  } finally {f.close();}
});

test('failed second Clout effect must roll back parent and all earlier writes', async () => {
  const f=fixture();
  try {
    addDeadRun(f);
    f.sql.exec(
      "CREATE TRIGGER no_dead_run_variety BEFORE INSERT ON championship_clout_effects " +
      "WHEN NEW.source_system='dead_run' AND NEW.effect_kind='variety' " +
      "BEGIN SELECT RAISE(ABORT,'injected clout write failure'); END;"
    );
    await assert.rejects(sync(f,OWNER,{deadRunEnabled:true}),/injected clout write failure/);
    for(const table of ['championship_clout_sources','championship_clout_effects','championship_clout_daily'])
      assert.equal(count(f,table),0,'no partial Clout state on rollback: '+table);
    f.sql.exec('DROP TRIGGER no_dead_run_variety');
    assert.equal((await sync(f,OWNER,{deadRunEnabled:true})).state,'recorded');
  } finally {f.close();}
});

test('Dead Run Clout only reads signed accepted finishes and runs off the response path', () => {
  const worker=readFileSync('workers/moonboys-api/worker-phase5-final.js','utf8');
  const source=readFileSync('workers/moonboys-api/championship/clout-pilot.js','utf8');
  const config=readFileSync('workers/moonboys-api/wrangler.toml','utf8');
  assert.match(config,/CHAMPIONSHIP_CLOUT_PILOT_ENABLED = "false"/);
  assert.match(config,/CHAMPIONSHIP_CLOUT_DEAD_RUN_ENABLED = "false"/);
  assert.match(worker,/path === '\/api\/dead-run\/session\/finish'/);
  assert.match(worker,/cloutDeadRunFinish && deadRunResponse\.ok/);
  assert.match(worker,/saved\?\.result\?\.ranked !== true/);
  assert.match(worker,/verifyTelegramMiniAppInitData\(signed, env\.TELEGRAM_BOT_TOKEN/);
  assert.match(worker,/max_age_seconds: DEAD_RUN_MAX_SESSION_SECONDS \+ 900/);
  assert.match(worker,/session_id=\? AND telegram_id=\? AND status='finished' AND ranked=1/);
  assert.match(worker,/ctx\.waitUntil\(projectCloutForAcceptedDeadRunFinish/);
  assert.doesNotMatch(worker,/await\s+projectCloutForAcceptedDeadRunFinish\(/);
  assert.doesNotMatch(source,/JOIN arcade_progression_events/);
  assert.match(source,/s\.status='finished' AND s\.ranked=1/);
  assert.match(source,/s\.player_stats_applied=1 AND s\.arcade_xp_applied=1/);
  assert.match(source,/s\.horde_applied=1/);
  assert.match(source,/ORDER BY s\.score DESC,s\.ended_at ASC,s\.session_id ASC LIMIT 1/);
  assert.match(source,/scoreRun\(\{/);
  assert.doesNotMatch(source,/UPDATE\s+arcade_xp_wallets|UPDATE\s+telegram_users\s+SET\s+xp/i);
});
