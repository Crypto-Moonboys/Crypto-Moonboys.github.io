import test from 'node:test';
import assert from 'node:assert/strict';
import { performanceFixture } from './moonpet-state-performance-fixture.mjs';
import { recoverPetRuntimeAwards } from '../workers/moonboys-api/pets/runtime-recovery.js';

function seedRun(f, id, index) {
  const petId = 'current-' + f.owner, season = 'pet-s2026-004';
  f.sql.prepare(`INSERT INTO telegram_pet_runs
    (id,run_id,telegram_id,pet_id,season_key,status,depth,current_room,
     max_depth,max_room,unbanked_pet_xp,unbanked_moon_gold)
    VALUES (?,?,?,?,?,'completed',1,1,100,100,0,0)`)
    .run(id,id,f.owner,petId,season);
  f.sql.prepare(`INSERT INTO telegram_pet_run_steps
    (id,run_id,telegram_id,pet_id,step_index,choice_key,choice_type,event_key,success,metadata)
    VALUES (?,?,?,?,1,'fight','fight',?,1,?)`)
    .run(id+'-step',id,f.owner,petId,'pet_run_step:'+id,
      JSON.stringify({source:'telegram_mini_app'}));
}

test('specific-run recovery excludes unrelated history without skipping matching source',async()=>{
  const f=await performanceFixture({warm:false});
  try {
    seedRun(f,'recovery-target-a');
    seedRun(f,'recovery-target-b');
    // Deliberately populate unrelated settled history to exercise the source
    // materialisation boundary on targeted retries.
    const insert=f.sql.prepare(`INSERT INTO telegram_pet_events
      (id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,metadata)
      VALUES (?,?,?,'feed',?,'pet-s2026-004','2026-10-20','2026-W43','accepted',?)`);
    for(let i=0;i<120;i++){
      insert.run('target-history-'+i,'current-'+f.owner,f.owner,'feed-history-'+i,
        JSON.stringify({source:'telegram_mini_app'}));
    }

    const statements=[],awarded=[];
    f.db.beforeAll=statement=>{
      if(statement.query.includes('WITH run_candidates AS MATERIALIZED')){
        statements.push({sql:statement.query,args:statement.args});
      }
    };
    await recoverPetRuntimeAwards(f.db,f.owner,
      async (_db,_owner,key,action,row)=>awarded.push({key,action,runId:row.run_id}),
      {run_id:'recovery-target-b',action:'run_step',
       event_key:'pet_run_step:recovery-target-b',limit:20});
    assert.equal(statements.length,1);
    assert.equal(statements[0].sql.match(/AND 0/g)?.length,6,
      'irrelevant run-extract, explore, care, combat and boss sources are pruned');
    assert.equal(statements[0].args.filter(value=>value==='recovery-target-b').length,6,
      'four run-source pushdown binds plus original final run predicates');
    assert.deepEqual(awarded,[{
      key:'runtime:mini:pet_run_step:recovery-target-b',
      action:'run_step',runId:'recovery-target-b'
    }]);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_specialist_events').get().n,0,
      'candidate discovery alone cannot write rewards');
  } finally {f.close();}
});

test('unfiltered rotating recovery does not prune historic source families',async()=>{
  const f=await performanceFixture({warm:false});
  try {
    const statements=[];
    f.db.beforeAll=statement=>{
      if(statement.query.includes('WITH run_candidates AS MATERIALIZED')){
        statements.push({sql:statement.query,args:statement.args});
      }
    };
    await recoverPetRuntimeAwards(f.db,f.owner,async()=>{}, {limit:2});
    assert.equal(statements.length,1);
    assert.doesNotMatch(statements[0].sql,/AND 0(?:\s|$)/);
    assert.equal(statements[0].args.filter(x=>x===f.owner).length,9,
      'all eight source arms plus owner join remain present');
  } finally {f.close();}
});

test('targeted care action suppresses run, explore, combat and boss scans',async()=>{
  const f=await performanceFixture({warm:false});
  try {
    const statements=[];
    f.db.beforeAll=statement=>{
      if(statement.query.includes('WITH run_candidates AS MATERIALIZED')){
        statements.push(statement.query);
      }
    };
    await recoverPetRuntimeAwards(f.db,f.owner,async()=>{}, {action:'feed',limit:1});
    assert.equal(statements.length,1);
    assert.equal(statements[0].match(/AND 0/g)?.length,7,
      'only the multipurpose care/activity candidate arm remains eligible');
    assert.doesNotMatch(statements[0],/AND r\.run_id=\?/,
      'action-only reads must not gain unintended run-id filters');
  } finally {f.close();}
});

test('targeted Explore recovers completed timed Explore activity claims and adventure',async()=>{
  const f=await performanceFixture({warm:false});
  try {
    const petId='current-'+f.owner,season='pet-s2026-004';
    f.sql.prepare(`INSERT INTO telegram_pet_activity_sessions
      (id,telegram_id,activity_type,ends_at,claimed_at,status)
      VALUES (?,?,'explore','2026-10-20 13:00:00',
        '2026-10-20 13:02:00','completed')`)
      .run('timed-explore-session',f.owner);
    f.sql.prepare(`INSERT INTO telegram_pet_events
      (id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,metadata)
      VALUES (?,?,?,'activity_claim',? ,?,'2026-10-20','2026-W43','accepted',?)`)
      .run('timed-explore-receipt',petId,f.owner,'explore-session-claim',season,
        JSON.stringify({context:{session_id:'timed-explore-session',activity_type:'explore'}}));
    f.sql.prepare(`INSERT INTO telegram_pet_events
      (id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,metadata)
      VALUES (?,?,?,'adventure',?,?,'2026-10-20','2026-W43','accepted',?)`)
      .run('explore-adventure',petId,f.owner,'explore-adventure-key',season,
        JSON.stringify({context:{source:'telegram_mini_app'}}));
    f.sql.prepare(`INSERT INTO telegram_pet_events
      (id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status,metadata)
      VALUES (?,?,?,'feed',?,?,'2026-10-20','2026-W43','accepted',?)`)
      .run('unrelated-feed',petId,f.owner,'unrelated-feed-key',season,
        JSON.stringify({source:'telegram_mini_app'}));
    const before=f.sql.prepare('SELECT * FROM telegram_pet_events ORDER BY id').all();
    const targeted=[],background=[];
    const sourceSql=[];
    f.db.beforeAll=statement=>{
      if(statement.query.includes('WITH run_candidates AS MATERIALIZED')){
        sourceSql.push(statement.query);
      }
    };
    await recoverPetRuntimeAwards(f.db,f.owner,async (_db,_owner,key,action,row)=>{
      targeted.push({key,action,runId:row.run_id});
    },{action:'explore',limit:20});
    assert.equal(sourceSql.length,1);
    // Adventure and timed Explore can both yield action=explore: neither
    // source may be excluded by the constant-false planning predicates.
    assert.equal(sourceSql[0].match(/AND 0/g)?.length,6,
      'four run branches plus combat and boss are pruned; Explore and care stay');
    assert.deepEqual(targeted.map(x=>x.key).sort(),[
      'runtime:activity:timed-explore-session',
      'runtime:mini:explore-adventure-key'
    ].sort());
    assert(targeted.every(x=>x.action==='explore' && x.runId===''));
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM telegram_pet_specialist_events').get().n,0);
    await recoverPetRuntimeAwards(f.db,f.owner,async (_db,_owner,key,action)=>{
      background.push({key,action});
    },{limit:20});
    for(const item of targeted){
      assert(background.some(x=>x.key===item.key && x.action===item.action),
        'targeted evidence must also be available in background recovery');
    }
    assert.deepEqual(f.sql.prepare('SELECT * FROM telegram_pet_events ORDER BY id').all(),before,
      'read-only candidate discovery must not rewrite accepted gameplay receipts');
  } finally {f.close();}
});

test('targeted action does not advance unrelated background recovery cursor',async()=>{
  const f=await performanceFixture({warm:false});
  try {
    seedRun(f,'targeted-no-cursor');
    await recoverPetRuntimeAwards(f.db,f.owner,async()=>{},
      {run_id:'targeted-no-cursor',action:'run_step',
       event_key:'pet_run_step:targeted-no-cursor'});
    const row=f.sql.prepare(`SELECT setting_value FROM telegram_pet_recovery_cursors
      WHERE telegram_id=? AND setting_key='moonpet:recovery:runtime'`).get(f.owner);
    assert.equal(row,undefined);
  } finally {f.close();}
});
