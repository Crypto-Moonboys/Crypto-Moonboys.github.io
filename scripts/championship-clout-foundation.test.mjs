import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  CLOUT_POLICY_VERSION, CLOUT_DAILY_MAX, cloutDayKey,
  getCloutPeriod, projectCloutDay, projectCloutLeaderboard,
  readCloutLeaderboard,
} from '../workers/moonboys-api/championship/clout-policy.js';

const moment = s => Date.parse(s);
const MID = moment('2026-10-16T10:00:00.000Z');
const base = {
  telegram_id: '100',
  policy_version: CLOUT_POLICY_VERSION,
  verification_kind: 'server_receipt',
  earned_at_ms: MID,
  verified_at_ms: MID + 500,
  day_key: cloutDayKey(MID),
};
const effect = (kind, sourceId, fields = {}) => ({
  ...base, source_system: 'moonpet',
  source_event_id: sourceId,
  effect_kind: kind,
  ...(kind === 'skill'
    ? { game_key: 'moonpet-contract', normalized_skill: 80, fixed_points: null }
    : kind === 'variety'
      ? { game_key: 'moonpet-contract', normalized_skill: null, fixed_points: null }
      : { game_key: null, normalized_skill: null, fixed_points: 5 }),
  ...fields,
});
const snapshot = (telegram_id, day_key, score, games = [], firstHour = 12) => ({
  telegram_id, day_key, policy_version: CLOUT_POLICY_VERSION,
  skill_points: score, mission_points: 0, variety_points: 0,
  community_points: 0, streak_points: 0, total_points: score,
  game_keys_json: JSON.stringify(games),
  first_earned_at_ms: moment(day_key + 'T00:00:00.000Z') + firstHour * 3600000,
});

test('UTC daily / ISO-Monday / calendar-quarter / annual boundaries, including New Year', () => {
  assert.deepEqual(getCloutPeriod('daily', moment('2026-10-16T23:59:59.999Z')), {
    kind: 'daily', key: '2026-10-16',
    start_ms: moment('2026-10-16T00:00:00Z'),
    end_ms: moment('2026-10-17T00:00:00Z'),
  });
  const sunday = getCloutPeriod('weekly', moment('2027-01-03T23:59:59Z'));
  const monday = getCloutPeriod('weekly', moment('2027-01-04T00:00:00Z'));
  assert.equal(sunday.key, '2026-12-28');
  assert.equal(monday.key, '2027-01-04');
  assert.equal(getCloutPeriod('quarterly', moment('2026-03-31T23:59:59.999Z')).key, '2026-Q1');
  assert.equal(getCloutPeriod('quarterly', moment('2026-04-01T00:00:00Z')).key, '2026-Q2');
  assert.equal(getCloutPeriod('annual', moment('2026-12-31T23:59:59.999Z')).end_ms,
    moment('2027-01-01T00:00:00Z'));
  assert.equal(getCloutPeriod('annual', moment('2028-02-29T12:00:00Z')).end_ms,
    moment('2029-01-01T00:00:00Z'));
  assert.throws(() => getCloutPeriod('seasonal', MID), /invalid_period_kind/);
});

test('100 non-spendable daily points; repeated games never farm Skill or Variety', () => {
  const data = [
    effect('skill', 'run-a', { normalized_skill: 100 }),
    effect('skill', 'run-b', { normalized_skill: 20 }),
    effect('variety', 'run-a'),
    effect('variety', 'run-b'),
    effect('variety', 'run-c', { game_key: 'dead-run' }),
    effect('variety', 'run-d', { game_key: 'nbg-london' }),
    effect('mission', 'journey', { fixed_points: 25 }),
    effect('community', 'daily', { fixed_points: 10 }),
    effect('streak', 'weekly', { fixed_points: 10 }),
  ];
  const result = projectCloutDay(data);
  assert.equal(result.variety_points, 15);
  assert.equal(result.mission_points, 25);
  assert.equal(result.community_points, 10);
  assert.equal(result.streak_points, 10);
  assert.ok(result.skill_points >= 0 && result.skill_points <= 40);
  assert.ok(result.total_points <= CLOUT_DAILY_MAX);
  assert.deepEqual(JSON.parse(result.game_keys_json), ['dead-run','moonpet-contract','nbg-london']);

  const onlyOneGame = projectCloutDay([effect('skill', 'solo', { normalized_skill: 100 })]);
  assert.equal(onlyOneGame.skill_points, 40, 'a newcomer has no three-game penalty');
  const blended = projectCloutDay([
    effect('skill', 'best', { normalized_skill: 80 }),
    effect('skill', 'medium', { game_key:'snake', normalized_skill:60 }),
    effect('skill', 'third', { game_key:'dead-run', normalized_skill:40 }),
  ]);
  assert.equal(blended.skill_points, 35,
    'top three game ratings produce monotonic best + 10% second + 5% third');
  assert.ok(blended.skill_points >= projectCloutDay([
    effect('skill', 'best', { normalized_skill:80 })
  ]).skill_points, 'extra verified titles never reduce Clout');
  assert.equal(onlyOneGame.total_points, 40);
  const repeatedLowerScore = projectCloutDay([
    effect('skill', 'solo', { normalized_skill: 100 }),
    effect('skill', 'repeated', { normalized_skill: 10 }),
  ]);
  assert.equal(repeatedLowerScore.skill_points, 40, 'a repeated lower score cannot lower the best');

  const extraLowerGame = projectCloutDay([
    effect('skill', 'solo', { normalized_skill: 90 }),
    effect('skill', 'another-game', { game_key: 'snake', normalized_skill: 20 }),
  ]);
  assert.ok(extraLowerGame.skill_points >= projectCloutDay([
    effect('skill', 'solo', { normalized_skill: 90 }),
  ]).skill_points, 'trying another game must not reduce official Clout');
});

test('bad browser-like data, source reuse and fake timestamps fail closed', () => {
  assert.equal(projectCloutDay([]), null);
  assert.throws(() => projectCloutDay([effect('skill','a',{verification_kind:'browser'})]),
    /unverified_source/);
  assert.throws(() => projectCloutDay([effect('skill','a',{normalized_skill:1000000})]),
    /invalid_skill_rating/);
  assert.throws(() => projectCloutDay([effect('mission','m',{fixed_points:999999})]),
    /invalid_fixed_points/);
  assert.throws(() => projectCloutDay([effect('skill','a',{telegram_id:'200'}),effect('skill','b')]),
    /cross_owner_or_day/);
  assert.throws(() => projectCloutDay([effect('skill','a'),effect('skill','a')]),
    /duplicate_effect/);
  assert.throws(() => projectCloutDay([effect('skill','a',{
    day_key:'2026-10-15',
  })]), /earned_day_mismatch/);
  assert.throws(() => projectCloutDay([effect('variety','a',{fixed_points:100})]),
    /variety_must_be_derived/);
  assert.throws(() => projectCloutDay([effect('community','a',{verified_at_ms:MID-1})]),
    /invalid_verified_at/);
});

test('weekly / quarter / annual sums and tie breakers remain stable and deterministic', () => {
  const rows = [
    snapshot('200','2026-10-15',30,['snake']),
    snapshot('100','2026-10-15',30,['snake','dead-run']),
    snapshot('100','2026-10-16',15,['nbg-london']),
    snapshot('200','2026-10-16',15,['snake']),
    snapshot('300','2026-07-16',40,['moonpet-contract']),
  ];
  const quarter=projectCloutLeaderboard(rows,'quarterly',MID);
  assert.deepEqual(quarter.rows.map(r=>r.telegram_id), ['100','200']);
  assert.deepEqual(quarter.rows.map(r=>r.total_points), [45,45]); // July prior quarter excluded
  assert.equal(quarter.rows[0].distinct_games,3);
  assert.equal(quarter.rows[0].active_days,2);
  const week=projectCloutLeaderboard(rows,'weekly',MID);
  assert.equal(week.period.key,'2026-10-12');
  assert.deepEqual(week.rows.map(r=>r.telegram_id),['100','200']);
  assert.equal(week.rows[0].rank,1);
  assert.equal(projectCloutLeaderboard(rows,'annual',MID).rows.length,3);
  assert.throws(() => projectCloutLeaderboard([
    snapshot('100','2026-10-16',10),snapshot('100','2026-10-16',10),
  ],'daily',MID), /duplicate_daily_snapshot/);
  assert.throws(() => projectCloutLeaderboard([
    { ...snapshot('100','2026-10-16',10), total_points:10000 },
  ],'daily',MID), /invalid_snapshot_total/);
});

test('migration adds isolated tables, rejects duplicate/cross-owner source claims and invalid totals', () => {
  const db=new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE telegram_users (telegram_id TEXT PRIMARY KEY);');
    db.exec("INSERT INTO telegram_users VALUES ('100'), ('200');");
    db.exec(readFileSync('workers/moonboys-api/migrations/100_championship_clout_foundation.sql','utf8'));
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'championship_clout_%' AND type='table' ORDER BY name").all();
    assert.deepEqual(tables.map(x=>x.name),[
      'championship_clout_archives','championship_clout_daily',
      'championship_clout_effects','championship_clout_sources',
    ]);
    const addSource=db.prepare(
      'INSERT INTO championship_clout_sources (source_system,source_event_id,policy_version,telegram_id,day_key,earned_at_ms,verified_at_ms,verification_kind,recorded_at_ms) VALUES (?,?,?,?,?,?,?,?,?)'
    );
    addSource.run('moonpet','event-100',CLOUT_POLICY_VERSION,'100','2026-10-16',
      MID,MID+500,'server_receipt',MID+600);
    const insert=db.prepare(
      'INSERT INTO championship_clout_effects (source_system,source_event_id,effect_kind,policy_version,telegram_id,verification_kind,earned_at_ms,verified_at_ms,day_key,game_key,normalized_skill,recorded_at_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    );
    insert.run('moonpet','event-100','skill',CLOUT_POLICY_VERSION,'100','server_receipt',
      MID,MID+500,'2026-10-16','moonpet-contract',60,MID+600);
    assert.throws(()=>insert.run('moonpet','event-100','skill',CLOUT_POLICY_VERSION,'200','server_receipt',
      MID,MID+500,'2026-10-16','moonpet-contract',100,MID+600),/UNIQUE|constraint/i);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM championship_clout_effects').get().n,1);
    const anotherEffect=db.prepare(
      'INSERT INTO championship_clout_effects (source_system,source_event_id,effect_kind,policy_version,telegram_id,verification_kind,earned_at_ms,verified_at_ms,day_key,game_key,recorded_at_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    );
    anotherEffect.run('moonpet','event-100','variety',CLOUT_POLICY_VERSION,
      '100','server_receipt',MID,MID+500,'2026-10-16','moonpet-contract',MID+600);
    assert.throws(()=>anotherEffect.run('moonpet','event-100','variety',
      CLOUT_POLICY_VERSION,'200','server_receipt',MID,MID+500,
      '2026-10-16','moonpet-contract',MID+600),
      /FOREIGN KEY|constraint/i,'another effect kind cannot move receipt to another owner');
    assert.throws(()=>anotherEffect.run('moonpet','event-100','variety',
      CLOUT_POLICY_VERSION,'100','server_receipt',MID,MID+500,
      '2026-10-17','moonpet-contract',MID+600),
      /FOREIGN KEY|constraint/i,'a reused source cannot be attributed to a new UTC day');
    assert.throws(()=>addSource.run('moonpet','event-100',CLOUT_POLICY_VERSION,
      '200','2026-10-16',MID,MID+500,'server_receipt',MID+600),
      /UNIQUE|constraint/i,'the immutable source owner cannot be reassigned');
    assert.throws(()=>addSource.run('moonpet','bad-earned-day',CLOUT_POLICY_VERSION,
      '100','2026-10-17',MID,MID+500,'server_receipt',MID+600),
      /CHECK|constraint/i,'a source must be recorded against its actual earning day');
    assert.throws(()=>db.prepare(
      'DELETE FROM championship_clout_sources WHERE source_event_id=?'
    ).run('event-100'),/FOREIGN KEY|constraint/i,
      'a source supporting effects cannot be deleted silently');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[],
      'all effects retain a matching unique owner/day source receipt');
    const failForeign=()=>insert.run('moonpet','fake','skill',CLOUT_POLICY_VERSION,'999','server_receipt',
      MID,MID+500,'2026-10-16','moonpet-contract',100,MID+600);
    assert.throws(failForeign,/FOREIGN KEY|constraint/i);
    const daily=projectCloutDay([effect('skill','event-100',{normalized_skill:60})]);
    const insertDay=db.prepare(
      'INSERT INTO championship_clout_daily (telegram_id,day_key,policy_version,skill_points,mission_points,variety_points,community_points,streak_points,total_points,game_keys_json,first_earned_at_ms,recalculated_at_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    );
    insertDay.run(daily.telegram_id,daily.day_key,daily.policy_version,daily.skill_points,
      daily.mission_points,daily.variety_points,daily.community_points,
      daily.streak_points,daily.total_points,daily.game_keys_json,daily.first_earned_at_ms,MID+1000);
    assert.throws(()=>insertDay.run('200','2026-10-16',CLOUT_POLICY_VERSION,0,0,0,0,0,100,'[]',MID,MID+1000),/CHECK|constraint/i);
    assert.equal(db.prepare('SELECT total_points FROM championship_clout_daily WHERE telegram_id=?').get('100').total_points,daily.total_points);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='arcade_xp_wallets'").get().n,0,
      'Clout migration does not create or mutate the Arcade XP wallet');
  } finally {db.close();}
});

test('read-side D1 query excludes bans and never writes awards', async () => {
  const db=new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE telegram_users (telegram_id TEXT PRIMARY KEY);');
    db.exec("INSERT INTO telegram_users VALUES ('100'),('200');");
    db.exec('CREATE TABLE telegram_anticheat_state (telegram_id TEXT PRIMARY KEY,is_blocked INTEGER DEFAULT 0);');
    db.exec("INSERT INTO telegram_anticheat_state VALUES ('200',1);");
    db.exec(readFileSync('workers/moonboys-api/migrations/100_championship_clout_foundation.sql','utf8'));
    const insert=db.prepare('INSERT INTO championship_clout_daily (telegram_id,day_key,policy_version,skill_points,mission_points,variety_points,community_points,streak_points,total_points,game_keys_json,first_earned_at_ms,recalculated_at_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    for(const x of [snapshot('100','2026-10-16',30,['moonpet-contract']),
       snapshot('200','2026-10-16',40,['dead-run'])]){
      insert.run(x.telegram_id,x.day_key,x.policy_version,x.skill_points,x.mission_points,
        x.variety_points,x.community_points,x.streak_points,x.total_points,
        x.game_keys_json,x.first_earned_at_ms,MID+1000);
    }
    // Exact D1-like read adapter with zero mutation functions exposed.
    const readOnly={
      prepare(sql) {
        assert.match(sql,/^WITH eligible AS/u,
          'the official period selector aggregates before LIMIT');
        const st=db.prepare(sql);
        return {bind(...params){return {async all(){return {success:true,results:st.all(...params)}}}}};
      },
    };
    const leaderboard=await readCloutLeaderboard(readOnly,'daily',MID);
    assert.deepEqual(leaderboard.rows.map(r=>r.telegram_id),['100']);
    assert.equal(leaderboard.rows[0].total_points,30);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM championship_clout_daily').get().n,2);
    await assert.rejects(()=>readCloutLeaderboard({
      prepare(){return {bind(){return {async all(){return {success:false,results:[]}}}}}},
    },'daily',MID),/daily_read_unavailable/);
  } finally {db.close();}
});


test('annual read aggregates more than 50,000 daily snapshots without truncating the winners', async () => {
  const db=new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE telegram_users (telegram_id TEXT PRIMARY KEY);');
    db.exec('CREATE TABLE telegram_anticheat_state (telegram_id TEXT PRIMARY KEY,is_blocked INTEGER DEFAULT 0);');
    db.exec(readFileSync('workers/moonboys-api/migrations/100_championship_clout_foundation.sql','utf8'));
    const addPlayer=db.prepare('INSERT INTO telegram_users (telegram_id) VALUES (?)');
    const addDay=db.prepare(
      'INSERT INTO championship_clout_daily (telegram_id,day_key,policy_version,skill_points,mission_points,variety_points,community_points,streak_points,total_points,game_keys_json,first_earned_at_ms,recalculated_at_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    );
    const leapStart=moment('2028-01-01T00:00:00Z');
    db.exec('BEGIN');
    for(let player=0;player<140;player++){
      const id=String(player+1000);
      addPlayer.run(id);
      for(let day=0;day<366;day++){
        const earnedDay=leapStart+day*86_400_000;
        const dayKey=new Date(earnedDay).toISOString().slice(0,10);
        const points=player===0?2:1;
        addDay.run(id,dayKey,CLOUT_POLICY_VERSION,points,0,0,0,0,points,
          JSON.stringify(player%2?['snake']:['snake','nbg-london']),
          earnedDay+12*3600000,earnedDay+13*3600000);
      }
    }
    db.exec('COMMIT');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM championship_clout_daily').get().n,140*366);
    const readOnly={prepare(sql){
      assert.match(sql,/^WITH eligible AS/u);
      const stmt=db.prepare(sql);
      return {bind(...args){return {async all(){return {success:true,results:stmt.all(...args)}}}}};
    }};
    const result=await readCloutLeaderboard(readOnly,'annual',moment('2028-08-01T12:00:00Z'),100);
    assert.equal(result.rows.length,100);
    assert.equal(result.rows[0].telegram_id,'1000');
    assert.equal(result.rows[0].total_points,732);
    assert.equal(result.rows[0].active_days,366);
    assert.equal(result.rows[0].distinct_games,2);
    assert.equal(result.rows[1].total_points,366);
    assert.equal(result.rows[1].distinct_games,2,
      'distinct game count must be a set across all 366 days, not a sum');
    assert.equal(result.rows[99].rank,100);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM championship_clout_daily').get().n,140*366,
      'read-side annual aggregation does not rewrite stored results');
  } finally {db.close();}
});
