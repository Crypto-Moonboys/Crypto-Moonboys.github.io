import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import {
  handleNbgLondonRecords,
} from '../workers/leaderboard/nbg-london-records.js';
import { periodStart } from '../workers/leaderboard/nbg-london-prizes.js';
import {
  fingerprintNbgLondonReplay,
} from '../workers/leaderboard/nbg-london-replay.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const realNow = Date.now;
// Fix the test clock at 12:00 UTC on a future day. Using realNow()+2 days
// preserves the runner's hour/minute and silently crosses a daily boundary
// during the multi-run test when CI starts near midnight. UTC noon also
// guarantees SQLite's real wall clock precedes the source's frozen-period
// cutoff without overriding SQLite strftime (needed by migration 101).
const future = new Date(realNow() + 2 * 86400000);
let now = Date.UTC(
  future.getUTCFullYear(), future.getUTCMonth(), future.getUTCDate(), 12
);
const fixtureDayStart = periodStart(now, 'daily');
Date.now = () => now;
const submitDay = () => new Date(now).toISOString().slice(0,10);

function fixture({ migrated = true, codeGate = true } = {}) {
  const sql = new DatabaseSync(':memory:');
  sql.exec([
    'PRAGMA foreign_keys=ON;',
    'CREATE TABLE telegram_users(telegram_id TEXT PRIMARY KEY);',
    "INSERT INTO telegram_users(telegram_id) VALUES ('100'),('200');",
    'CREATE TABLE telegram_anticheat_state(telegram_id TEXT PRIMARY KEY,is_blocked INTEGER NOT NULL DEFAULT 0);',
  ].join('\n'));
  for(const name of [
    '098_nbg_london_records.sql','099_nbg_london_competition_prizes.sql',
    ...(migrated ? ['101_nbg_london_verified_run_receipts.sql'] : []),
  ]) {
    sql.exec(readFileSync('workers/moonboys-api/migrations/'+name,'utf8'));
  }
  let batchTail=Promise.resolve();
  const db={
    prepare(query) {
      const statement=sql.prepare(query);
      return {
        bind(...args) {
          return {
            async first(){return statement.get(...args)??null;},
            async all(){return {success:true,results:statement.all(...args)};},
            async run(){return {success:true,meta:{changes:Number(statement.run(...args).changes)}};},
          };
        },
      };
    },
    async batch(statements) {
      const previous=batchTail;
      let release;
      batchTail=new Promise(resolve=>{release=resolve;});
      await previous;
      try{
        sql.exec('BEGIN');
        try{
          const result=[];
          for(const statement of statements)result.push(await statement.run());
          sql.exec('COMMIT');
          return result;
        }catch(error){
          sql.exec('ROLLBACK');
          throw error;
        }
      }finally{release();}
    },
  };
  const blocked=new Set();
  const env={
    DB:db,
    NBG_VERIFIED_RUN_RECEIPTS_ENABLED:'true',
    LEADERBOARD:{get:async key=>blocked.has(key)?'blocked':null},
  };
  const signed=async body=>{
    const id=String(body?.telegram_auth?.id||'');
    if(!['100','200'].includes(id))return {ok:false,error:'telegram_link_required',status:403};
    return {ok:true,telegramId:id,linkedAccount:{username:id==='100'?'alpha':'bravo'}};
  };
  // Only a deterministic test hook. The REAL production call always injects
  // verifyNbgLondonReplay; never use HTTP body xp as a trusted scorer.
  const mockPhysicsVerifier=async({replay})=>{
    // Legacy gated-off NBG tests intentionally submit without a replay. The
    // verifier must tolerate that fixture; trusted mode explicitly requires
    // a real server-produced canonical action trace before writing receipt 101.
    const bytes=typeof replay?.frames === 'string'
      ? Buffer.from(replay.frames,'base64') : Buffer.alloc(0);
    return {
      valid:true,complete:true,time_ms:120000,xp:600,coins:10,secret_coins:1,
      effective_input_masks:Uint8Array.from(
        {length:bytes.length/5},(_,i)=>bytes[i*5+4]
      ),
    };
  };
  const deferred=[];
  const options={
    verifiedReceiptsReleased:codeGate,
    waitUntil(promise){deferred.push(promise);},
    async onVerifiedRun({db,telegramId,runId}){
      const proof=await db.prepare(
        'SELECT telegram_id,verified_xp FROM nbg_london_verified_runs WHERE run_id=?'
      ).bind(runId).first();
      assert.equal(String(proof?.telegram_id),telegramId);
      assert.equal(proof?.verified_xp,600);
    },
  };
  async function call(path,body,{owner='100',optionsOverride={}}={}){
    const request=new Request('https://moonboys-leaderboard.sercullen.workers.dev/nbg-london'+path,{
      method:body===undefined?'GET':'POST',
      headers:{Origin:'https://cryptomoonboys.com','Content-Type':'application/json'},
      body:body===undefined?undefined:JSON.stringify({telegram_auth:{id:owner},...body}),
    });
    const response=await handleNbgLondonRecords(
      request,env,signed,mockPhysicsVerifier,{...options,...optionsOverride}
    );
    return {status:response.status,...await response.json()};
  }
  return {
    sql,db,env,blocked,deferred,call,
    async start(owner='100'){
      const response=await call('/run/start',{}, {owner});
      assert.equal(response.status,200);
      assert.match(response.run_id,/^[0-9a-f-]{36}$/);
      return response.run_id;
    },
    async finish(runId,replay,owner='100'){
      return call('/run/finish',{run_id:runId,replay},{owner});
    },
    close(){sql.close();},
  };
}
function makeReplay(masks=[2,6,10,2,10],clock=33){
  const bytes=[];
  for(const mask of masks){
    const value=Math.round(clock*10);
    bytes.push(value&255,(value>>8)&255,value&255,(value>>8)&255,mask);
  }
  return {version:2,frames:Buffer.from(bytes).toString('base64')};
}
const replayA=makeReplay();
const replayATiming=makeReplay([2,6,10,2,10],32);
const replayB=makeReplay([2,6,10,2,8]);
const replayC=makeReplay([2,6,10,8,2]);
const count=(f,table)=>f.sql.prepare('SELECT COUNT(*) AS n FROM '+table).get().n;

test('migration 101 has an immutable composite owner FK and two UNIQUE anti-replay hashes',()=>{
  const f=fixture();
  try{
    const details=f.sql.prepare("PRAGMA table_info('nbg_london_verified_runs')").all();
    assert.ok(details.some(x=>x.name==='verified_xp'));
    assert.ok(details.some(x=>x.name==='input_sha256'));
    const fks=f.sql.prepare("PRAGMA foreign_key_list('nbg_london_verified_runs')").all();
    assert.ok(fks.some(x=>x.from==='run_id'&&x.to==='run_id'));
    assert.ok(fks.some(x=>x.from==='telegram_id'&&x.to==='telegram_id'));
    assert.equal(f.sql.prepare('PRAGMA foreign_key_check').all().length,0);
    assert.equal(count(f,'nbg_london_verified_runs'),0);
  }finally{f.close();}
});

test('feature code gate OFF permits existing practice records even without migration 101',async()=>{
  const f=fixture({migrated:false,codeGate:false});
  try{
    const started=await f.start();
    now+=120000;
    const done=await f.finish(started,{complete:true,time_ms:120000,xp:600,coins:10,secret_coins:1});
    assert.equal(done.status,200);
    assert.equal(done.saved,true);
    assert.equal(done.verified_source_receipt,undefined);
    const period=periodStart(now,'daily');
    const snap=f.sql.prepare("SELECT total_xp,trusted_xp,run_count,verified_run_count FROM nbg_london_period_scores WHERE period_kind='daily' AND period_start_ms=? AND telegram_id='100'").get(period);
    assert.equal(snap.total_xp,600);
    assert.equal(snap.run_count,1);
    assert.equal(snap.trusted_xp,0);
    assert.equal(snap.verified_run_count,0);
    assert.equal(f.deferred.length,0);
  }finally{f.close();}
});

test('enabled but unmigrated code path fails CLOSED and does not consume a run or award score',async()=>{
  const f=fixture({migrated:false,codeGate:true});
  try{
    const id=await f.start();
    now+=120000;
    const response=await f.finish(id,replayA);
    assert.equal(response.status,503);
    assert.equal(response.ok,false);
    assert.equal(response.error,'records_unavailable',
      'missing schema must fail closed before consuming a run');
    assert.equal(f.sql.prepare('SELECT finished_at_ms FROM nbg_london_runs WHERE run_id=?').get(id).finished_at_ms,null);
    assert.equal(count(f,'nbg_london_records'),0);
    assert.equal(count(f,'nbg_london_period_scores'),0);
  }finally{f.close();}
});

test('accepted signed, replay-scored run creates immutable unique proof and trusted/legacy parity',async()=>{
  const f=fixture();
  try{
    const run=await f.start();
    const before=now;
    now+=120000;
    const outcome=await f.finish(run,replayA);
    assert.equal(outcome.status,200);
    assert.equal(outcome.saved,true);
    assert.equal(outcome.verified_source_receipt,true);
    assert.equal(outcome.xp,600);
    assert.equal(f.deferred.length,1,'Clout callback is scheduled after DB commit');
    await Promise.all(f.deferred);
    assert.equal(count(f,'nbg_london_verified_runs'),1);
    const digest=await fingerprintNbgLondonReplay(replayA);
    const proof=f.sql.prepare('SELECT * FROM nbg_london_verified_runs WHERE run_id=?').get(run);
    assert.equal(proof.telegram_id,'100');
    assert.equal(proof.day_key,submitDay());
    assert.equal(proof.finished_at_ms,now);
    assert.equal(proof.time_ms,120000);
    assert.equal(proof.verified_xp,600);
    assert.equal(proof.replay_sha256,digest.replay_sha256);
    assert.equal(proof.input_sha256,digest.input_sha256);
    assert.equal(proof.authority,'server_replay');
    assert.equal(proof.replay_version,2);
    assert.ok(proof.finished_at_ms>before);
    for(const kind of ['daily','weekly','seasonal']){
      const snap=f.sql.prepare(
        'SELECT total_xp,trusted_xp,run_count,verified_run_count FROM nbg_london_period_scores WHERE period_kind=? AND period_start_ms=? AND telegram_id=?'
      ).get(kind,periodStart(now,kind),'100');
      assert.deepEqual({...snap},{total_xp:600,trusted_xp:600,run_count:1,verified_run_count:1});
    }
    const again=await f.finish(run,replayA);
    assert.equal(again.status,409);
    assert.equal(count(f,'nbg_london_verified_runs'),1);
    assert.equal(f.deferred.length,1);
  }finally{f.close();}
});

test('replay reuse by new sessions/other owners and timing-only edits are rejected',async()=>{
  const f=fixture();
  try{
    const first=await f.start();
    now+=120000;
    assert.equal((await f.finish(first,replayA)).status,200);
    const second=await f.start();
    now+=120000;
    const copy=await f.finish(second,replayA);
    assert.equal(copy.status,409);
    assert.equal(copy.error,'replay_already_accepted');
    assert.equal(f.sql.prepare('SELECT finished_at_ms FROM nbg_london_runs WHERE run_id=?').get(second).finished_at_ms,null);
    const timing=await f.finish(second,replayATiming);
    assert.equal(timing.status,409,'clock jitter cannot reuse the same controls');
    assert.equal(count(f,'nbg_london_verified_runs'),1);
    const other=await f.start('200');
    now+=120000;
    assert.equal((await f.finish(other,replayA,'200')).status,409,'cross-owner identical stream blocked');
    assert.equal((await f.finish(other,replayATiming,'200')).status,409,
      'cross-owner input-only clone blocked');
    // This verification fixture returns a fixed 120-second duration. A
    // finished run started 240 seconds ago must be rejected by validFinish.
    // Use a fresh server session so this separate-digest acceptance tests the
    // genuine timestamp contract, not a fabricated early/late finish.
    const fresh=await f.start('100');
    now+=120000;
    assert.equal((await f.finish(fresh,replayB)).status,200,
      'a distinct input sequence with a matching real-time session is eligible');
    assert.equal(count(f,'nbg_london_verified_runs'),2);
    assert.equal(periodStart(now,'daily'),fixtureDayStart,
      'five minutes of successive runs must not cross the pinned UTC noon day');
    const expectedTotal=f.sql.prepare(
      "SELECT total_xp,trusted_xp,run_count,verified_run_count FROM nbg_london_period_scores WHERE period_kind='daily' AND period_start_ms=? AND telegram_id='100'"
    ).get(fixtureDayStart);
    assert.deepEqual({...expectedTotal},{total_xp:1200,trusted_xp:1200,run_count:2,verified_run_count:2});
  }finally{f.close();}
});

test('explicit midnight rollover correctly separates daily trusted XP for distinct signed runs',async()=>{
  const priorClock=now;
  const pinnedDate=new Date(priorClock);
  now=Date.UTC(
    pinnedDate.getUTCFullYear(), pinnedDate.getUTCMonth(),
    pinnedDate.getUTCDate(), 23, 57, 0
  );
  const f=fixture();
  try{
    const beforeMidnight=await f.start();
    now+=120000; // 23:59 UTC
    assert.equal((await f.finish(beforeMidnight,replayA)).status,200);
    const firstDay=periodStart(now,'daily');
    const afterMidnight=await f.start();
    now+=120000; // 00:01 UTC on the following day
    assert.equal((await f.finish(afterMidnight,replayB)).status,200);
    const nextDay=periodStart(now,'daily');
    assert.equal(nextDay-firstDay,86400000);
    const rows=f.sql.prepare(
      "SELECT period_start_ms,total_xp,trusted_xp,run_count,verified_run_count FROM nbg_london_period_scores WHERE telegram_id='100' AND period_kind='daily' ORDER BY period_start_ms"
    ).all();
    assert.equal(rows.length,2);
    assert.deepEqual(rows.map(row=>({...row})),[
      {period_start_ms:firstDay,total_xp:600,trusted_xp:600,run_count:1,verified_run_count:1},
      {period_start_ms:nextDay,total_xp:600,trusted_xp:600,run_count:1,verified_run_count:1},
    ]);
    assert.equal(count(f,'nbg_london_verified_runs'),2);
  }finally{f.close();now=priorClock;}
});

test('concurrent finishes of same session claim and credit exactly once',async()=>{
  const f=fixture();
  try{
    const id=await f.start();
    now+=120000;
    const results=await Promise.all([f.finish(id,replayC),f.finish(id,replayC)]);
    assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
    assert.equal(count(f,'nbg_london_verified_runs'),1);
    assert.equal(count(f,'nbg_london_records'),1);
    const row=f.sql.prepare("SELECT total_xp,trusted_xp,run_count,verified_run_count FROM nbg_london_period_scores WHERE period_kind='daily' AND telegram_id='100'").get();
    assert.deepEqual({...row},{total_xp:600,trusted_xp:600,run_count:1,verified_run_count:1});
  }finally{f.close();}
});

test('injected period failure rolls back source claim and proof atomically',async()=>{
  const f=fixture();
  try{
    const id=await f.start();
    now+=120000;
    f.sql.exec("CREATE TRIGGER inject_failure BEFORE INSERT ON nbg_london_period_scores BEGIN SELECT RAISE(ABORT,'period boom'); END;");
    const failure=await f.finish(id,replayC);
    assert.equal(failure.status,503);
    assert.equal(count(f,'nbg_london_verified_runs'),0);
    assert.equal(count(f,'nbg_london_records'),0);
    assert.equal(count(f,'nbg_london_period_scores'),0);
    assert.equal(f.sql.prepare('SELECT finished_at_ms FROM nbg_london_runs WHERE run_id=?').get(id).finished_at_ms,null);
    f.sql.exec('DROP TRIGGER inject_failure');
    const success=await f.finish(id,replayC);
    assert.equal(success.status,200);
    assert.equal(count(f,'nbg_london_verified_runs'),1);
  }finally{f.close();}
});

test('blocked and cross-account submissions cannot create a run proof',async()=>{
  const f=fixture();
  try{
    const id=await f.start();
    now+=120000;
    assert.equal((await f.finish(id,replayB,'200')).status,409,
      'signed other owner cannot finalize a foreign session');
    f.blocked.add('anticheat:blocked:100');
    assert.equal((await f.finish(id,replayB)).status,403);
    f.blocked.clear();
    assert.equal((await f.finish(id,replayB)).status,200);
    assert.equal(count(f,'nbg_london_verified_runs'),1);
  }finally{f.close();}
});

test('release switches are independent; no prize payment, source-money mutation, or client authoring',()=>{
  const entry=readFileSync('workers/leaderboard/deployment-entry.js','utf8');
  const config=readFileSync('workers/leaderboard/wrangler.toml','utf8');
  const records=readFileSync('workers/leaderboard/nbg-london-records.js','utf8');
  for(const name of [
    'NBG_VERIFIED_RUN_RECEIPTS_ENABLED',
    'CHAMPIONSHIP_CLOUT_PILOT_ENABLED',
    'CHAMPIONSHIP_CLOUT_NBG_ENABLED',
  ]) assert.ok(config.includes(name+' = "false"'),'must remain hard off: '+name);
  assert.match(entry,/const NBG_VERIFIED_RUN_RECEIPTS_RELEASED = false/);
  assert.match(entry,/const NBG_LONDON_PRIZES_RELEASED = false/);
  assert.match(records,/trustedReceiptsEnabled = hasScoreAuthority/);
  assert.match(records,/options\.verifiedReceiptsReleased === true/);
  assert.match(records,/fingerprintNbgLondonReplay\(\s*body\?\.replay,\s*verified\.effective_input_masks\s*\)/, 'the canonical server action trace is mandatory');
  assert.match(records,/INSERT INTO nbg_london_verified_runs/);
  assert.match(records,/run_already_submitted/);
  assert.match(records,/options\.waitUntil\(Promise\.resolve\(\)/);
  assert.doesNotMatch(records,/UPDATE\s+arcade_xp_wallets|UPDATE\s+telegram_users SET xp/i);
});

test.after(()=>{Date.now=realNow;});
