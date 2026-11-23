import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import {
  parseUnifiedQuery, readUnifiedLeaderboard, settleUnifiedLeaderboard,
} from '../workers/moonboys-api/shared/unified-leaderboard.js';

const migrations = ['019_daily_wtf_timed_events', '116_clan_operations', '125_clan_crew_rosters',
  '126_clan_period_rewards', '129_clan_leader_presence', '132_unified_leaderboard'];
function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync('workers/moonboys-api/schema.sql', 'utf8'));
  for (const migration of migrations) {
    sql.exec(readFileSync('workers/moonboys-api/migrations/' + migration + '.sql', 'utf8'));
  }
  sql.exec("UPDATE unified_leaderboard_epoch SET starts_at='2026-11-20T00:00:00.000Z'");
  const prepare = text => {
    const statement = sql.prepare(text);
    const numbered = [...text.matchAll(/\?(\d+)/g)].map(match => Number(match[1]));
    let args = [];
    function bind() {
      if (!numbered.length) return args;
      return [Object.fromEntries(numbered.map(index => ['?' + index, args[index - 1]]))];
    }
    return {
      bind(...values) { args = values; return this; },
      first() { return statement.get(...bind()) ?? null; },
      all() { return { success: true, results: statement.all(...bind()) }; },
      run() { return { success: true, meta: statement.run(...bind()) }; },
    };
  };
  const db = {
    prepare,
    async batch(statements) {
      sql.exec('BEGIN');
      try {
        const results = statements.map(statement => statement.run());
        sql.exec('COMMIT');
        return results;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { sql, db };
}

const options = params => parseUnifiedQuery(new URLSearchParams(params));
const read = (db, params, at = '2026-11-20T16:20:00.000Z') =>
  readUnifiedLeaderboard(db, options(params), new Date(at));
function insertActivity(sql) {
  sql.exec(`
    INSERT INTO telegram_users (telegram_id,username) VALUES ('101','Hopper'),('102','Ghost'),('103','Rival');
    INSERT INTO clan_crew_roster_entries VALUES ('2026-11-16','101','all-city-bulls'),('2026-11-16','103','nomad-bears');
    INSERT INTO telegram_seasons (name,start_date,end_date) VALUES
      ('Season A','2026-10-15T12:00:00Z','2026-11-21T12:00:00Z'),
      ('Season B','2026-11-21T12:00:00Z','2026-12-21T12:00:00Z');
    INSERT INTO arcade_progression_events (id,telegram_id,client_run_id,game,raw_score,normalized_points,xp_awarded,status,processed_at) VALUES
      ('1','101','run1','snake',1000,10,50,'accepted','2026-11-20T13:00:00Z'),
      ('2','101','run2','snake',1001,10,50,'accepted','2026-11-20T13:10:00Z'),
      ('3','101','run3','snake',1002,10,50,'accepted','2026-11-20T13:20:00Z'),
      ('4','101','run4','snake',1003,10,50,'accepted','2026-11-20T13:30:00Z'),
      ('5','102','run5','kaiju',125,8,10,'accepted','2026-11-20T13:20:00Z'),
      ('6','101','bad','snake',99999,100,50,'rejected','2026-11-20T13:20:00Z'),
      ('7','101','d1','dead-run',99,10,50,'accepted','2026-11-20T13:20:00Z'),
      ('8','103','run8','snake',175,8,10,'accepted','2026-11-20T13:20:00Z');
    INSERT INTO telegram_community_xp_awards VALUES
      ('101','arcade_progress_sync','snake:run1',NULL,50,NULL,'2026-11-20T13:00:00Z','af'),
      ('102','wiki_mission_complete','wiki-one',NULL,100,NULL,'2026-11-20T13:01:00Z','wf');
    INSERT INTO nbg_london_runs VALUES
      ('n1','101',unixepoch('2026-11-20T12:00:00Z')*1000,unixepoch('2026-11-20T14:00:00Z')*1000,unixepoch('2026-11-20T13:00:00Z')*1000,'proof'),
      ('n2','101',unixepoch('2026-11-20T12:00:00Z')*1000,unixepoch('2026-11-20T14:00:00Z')*1000,NULL,NULL);
    INSERT INTO dead_run_sessions
      (session_id,telegram_id,day_key,status,ranked,seed,started_at,ended_at,score,xp_awarded,player_stats_applied,arcade_xp_applied,horde_applied)
      VALUES ('d1','101','2026-11-20','finished',1,1,'2026-11-20T13:00:00Z','2026-11-20T13:20:00Z',99,50,1,1,1);
    INSERT INTO telegram_pet_profiles (telegram_id) VALUES ('102');
    INSERT INTO telegram_pet_events (id,telegram_id,event_type,event_key,pet_xp_awarded,season_key,day_key,created_at)
      VALUES ('pet1','102','train','train:1',12,'A','2026-11-20','2026-11-20T15:39:00Z');
    INSERT INTO blocktopia_progression (telegram_id) VALUES ('102');
    INSERT INTO blocktopia_progression_events (id,telegram_id,action,action_type,score,xp_change,created_at)
      VALUES ('bw1','102','mini_game_win','battle',15,100,'2026-11-20 15:00:00'),
             ('bw2','102','arcade_score','kaiju',17,100,'2026-11-20 15:00:00');
    INSERT INTO tag_run_messages (chat_id,telegram_id,message_id,day_key,week_key,content_hash,points,message_unix)
      VALUES ('gk','102',1,'2026-11-20','2026-11-16','hash',8,unixepoch('2026-11-20T14:00:00Z'));
    INSERT INTO daily_wtf_player_events (telegram_id,event_id,utc_day,status,completed_at)
      VALUES ('101','wtf-noon','2026-11-20','completed','2026-11-20T12:30:00Z');
    INSERT INTO clan_period_results VALUES ('weekly','2026-11-09','2026-11-09','2026-11-16','2026-11-16T00:05:00Z',
       '[{"rank":2,"faction_id":"all-city-bulls","active_members":3,"roster_size":8,"scored_banks":4}]');
    INSERT INTO clan_leader_rounds VALUES
      ('all-city-bulls',unixepoch('2026-11-20T13:00:00Z'),'/games/snake-run/'),
      ('nomad-bears',unixepoch('2026-11-20T13:00:00Z'),'/games/chain-maze/');
    INSERT INTO clan_leader_slowdowns VALUES
      ('101','talk1','nomad-bears','talk','territory',unixepoch('2026-11-20T12:58:00Z'),
      unixepoch('2026-11-20T13:03:00Z'),unixepoch('2026-11-20T14:03:00Z'),1,NULL,0);
  `);
}

test('unified views aggregate verified receipts, cap activity, show native values and isolate NPC points', async t => {
  const { sql, db } = fixture();
  t.after(() => sql.close());
  insertActivity(sql);
  for (const kind of ['daily','weekly','monthly','seasonal']) {
    const global = await read(db, {period:kind});
    assert.deepEqual(global.rows.map(({name,points}) => [name, points]), [['Hopper',55],['Ghost',31],['Rival',10]]);
    const hopper = global.rows[0];
    assert.deepEqual(hopper.breakdown.snake, { points:30, events:4, best_score:1003, source_xp:200 });
    assert.equal(hopper.breakdown['dead-run'].events, 1);
    assert.equal(hopper.breakdown['nbg-london'].events, 1);
    assert.ok(!Object.hasOwn(hopper.breakdown, 'npc-rounds'));
    assert.ok(!Object.hasOwn(hopper.breakdown, 'community-mission'));
    assert.ok(!JSON.stringify(global).includes('telegram_id'));
  }
  const factions = await read(db, {scope:'factions'});
  assert.equal(factions.rows.length,9);
  assert.equal(factions.rows[0].points, 83);
  assert.equal(factions.rows[0].breakdown['npc-rounds'].points,12);
  assert.equal(factions.rows[0].breakdown['weekly-clan-boost'].points,16);
  assert.equal(factions.rows[1].points,10);
  assert.ok(!Object.hasOwn(factions.rows[1].breakdown, 'npc-rounds'));
  const games = await read(db, {scope:'games',category:'kaiju'});
  assert.deepEqual(games.rows.map(({name,points,global_rank}) => [name,points,global_rank]), [['Ghost',10,2]]);
  const clan = await read(db, {scope:'clan-players',category:'all-city-bulls'});
  assert.deepEqual(clan.rows.map(({name,points,global_rank}) => [name,points,global_rank]), [['Hopper',55,1]]);
  const none = await read(db, {scope:'no-clan'});
  assert.deepEqual(none.rows.map(({name,global_rank}) => [name,global_rank]), [['Ghost',2]]);
});

test('closed rankings freeze and award rank bonuses once into each matching next period', async t => {
  const { sql, db } = fixture();
  t.after(() => sql.close());
  insertActivity(sql);
  const settledAt = new Date('2026-11-21T00:16:00Z');
  await settleUnifiedLeaderboard(db, settledAt);
  const closed = await read(db,{period:'daily',window:'closed'});
  assert.deepEqual(closed.rows.map(row => row.award_points), [30,20,10]);
  sql.exec("UPDATE arcade_progression_events SET status='rejected' WHERE id='1'; DELETE FROM nbg_london_runs;");
  await settleUnifiedLeaderboard(db, settledAt);
  assert.deepEqual(await read(db,{period:'daily',window:'closed'}), closed);
  const active = await read(db,{period:'daily'},settledAt.toISOString());
  assert.deepEqual(active.rows.map(({base_points,bonus_points}) => [base_points,bonus_points]), [[0,60],[0,60],[0,60]]);
  assert.equal(active.rows[0].award_points,null);
  const game = await read(db,{period:'daily',scope:'games',category:'snake'},settledAt.toISOString());
  assert.deepEqual(game.rows.map(({bonus_points}) => bonus_points), [30,20]);
  await settleUnifiedLeaderboard(db,new Date('2026-11-22T00:16:00Z'));
  assert.deepEqual((await read(db,{period:'daily',window:'closed'},'2026-11-22T12:00:00Z')).rows.map(row => row.award_points), [0,0,0]);
  assert.equal((await read(db,{period:'daily'},'2026-11-22T12:00:00Z')).rows.length,0);
  const season = await read(db,{period:'seasonal'},'2026-11-22T12:00:00Z');
  assert.equal(season.period.starts_at, '2026-11-21T12:00:00.000Z');
  assert.equal(season.rows[0].bonus_points,60);
});

test('invalid scope and paging filters fail and a missing migration is unavailable', async () => {
  for (const params of [{scope:'bad'},{period:'alltime'},{scope:'games'},{scope:'global',category:'snake'},{page:'101'}]) {
    assert.equal(options(params),null);
  }
  const sql = new DatabaseSync(':memory:');
  try {
    await assert.rejects(read({prepare: statement => ({first: () => sql.prepare(statement).get()})},{}), /no such table/);
  } finally { sql.close(); }
});

test('weekly and monthly windows close once and changed rosters preserve historical clan activity', async t => {
  const { sql, db } = fixture();
  t.after(() => sql.close());
  insertActivity(sql);
  sql.exec(`
    INSERT INTO clan_crew_roster_entries VALUES ('2026-11-23','101','nomad-bears'),('2026-11-23','103','nomad-bears');
    INSERT INTO arcade_progression_events (id,telegram_id,client_run_id,game,raw_score,normalized_points,processed_at) VALUES
      ('new-house','101','run9','snake',500,1,'2026-11-23T01:00:00Z'),
      ('equal-score','103','run10','snake',911,1,'2026-11-23T02:00:00Z');
  `);
  const nextWeek = new Date('2026-11-23T02:16:00Z');
  await settleUnifiedLeaderboard(db, nextWeek);
  const closed = await read(db,{period:'weekly',scope:'clan-players',category:'all-city-bulls',window:'closed'},nextWeek.toISOString());
  assert.deepEqual(closed.rows.map(({name,points}) => [name,points]), [['Hopper',55]]);
  const next = await read(db,{period:'weekly',scope:'clan-players',category:'nomad-bears'},nextWeek.toISOString());
  assert.deepEqual(next.rows.map(({name,points,rank,global_rank}) => [name,points,rank,global_rank]),
    [['Rival',40,1,1],['Hopper',10,2,1]]);
  for (let i = 0; i < 7; i++) await settleUnifiedLeaderboard(db,new Date('2026-12-01T00:16:00Z'));
  const dec = await read(db,{period:'monthly'},'2026-12-01T12:00:00Z');
  assert.deepEqual(dec.rows.map(({bonus_points})=>bonus_points),[60,60,60]);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM unified_leaderboard_periods WHERE kind='monthly'").get().n,1);
});
