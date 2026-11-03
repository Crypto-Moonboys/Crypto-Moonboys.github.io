import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { inspectSchemaTables } from '../workers/moonboys-api/shared/schema-preflight.js';

const PLAYER = ['player_modifier_state','player_daily_mission_state',
  'player_faction_signal_state','player_streak_state','player_game_mastery_state'];
const DIGEST = ['daily_missed_perks','telegram_daily_digest_log',
  'daily_opportunity_state'];

function fixture(t, existing = []) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const table of existing) {
    sqlite.exec('CREATE TABLE ' + table + ' (id INTEGER PRIMARY KEY)');
  }
  const calls = [];
  const db = {
    prepare(sql) {
      calls.push(sql);
      return {
        bind(...params) {
          return { async all() {
            return { success: true, results: sqlite.prepare(sql).all(...params) };
          } };
        },
      };
    },
  };
  return { sqlite, db, calls };
}

test('player schema: one SQLite catalog statement replaces five probes',async t=>{
  const f=fixture(t,PLAYER);
  const checked=await inspectSchemaTables(f.db,PLAYER);
  assert.equal(checked.ok,true);
  assert.deepEqual(checked.missing,[]);
  assert.deepEqual([...checked.present].sort(),[...PLAYER].sort());
  assert.equal(f.calls.length,1);
  assert.equal((f.calls[0].match(/\?/g)||[]).length,5);
});

test('digest schema: one statement replaces three probes and preserves first missing order',async t=>{
  const f=fixture(t,[DIGEST[0],DIGEST[2]]);
  const checked=await inspectSchemaTables(f.db,DIGEST);
  assert.equal(checked.ok,true);
  assert.deepEqual(checked.missing,[DIGEST[1]]);
  assert.equal(f.calls.length,1);
  assert.equal((f.calls[0].match(/\?/g)||[]).length,3);
});

test('schema inspection does not cache between D1 requests or database instances',async t=>{
  const f=fixture(t,[PLAYER[0]]);
  const before=await inspectSchemaTables(f.db,PLAYER);
  assert.equal(before.missing.length,4);
  f.sqlite.exec('CREATE TABLE '+PLAYER[1]+' (id INTEGER)');
  const after=await inspectSchemaTables(f.db,PLAYER);
  assert.equal(after.missing.length,3);
  assert.equal(after.present.has(PLAYER[1]),true);
  assert.equal(f.calls.length,2);
});

test('bad, missing, failed or mismatched D1 results fail closed',async()=>{
  for (const result of [
    null,{success:false,results:[]},{results:null},
    {success:true,results:[{name:'unrequested_table'}]},
    {success:true,results:[null]},
  ]) {
    const db={prepare(){return{bind(){return{async all(){return result;}};}};}};
    const checked=await inspectSchemaTables(db,PLAYER);
    assert.equal(checked.ok,false);
    assert.deepEqual(checked.missing,PLAYER);
    assert.equal(checked.present.size,0);
  }
  const db={prepare(){return{bind(){return{async all(){
    throw new Error('D1 unavailable');
  }};}};}};
  const checked=await inspectSchemaTables(db,PLAYER);
  assert.equal(checked.ok,false);
  assert.equal(checked.error,'D1 unavailable');
});

test('catalog only accepts trusted table identifiers; duplicates do not add round trips',async t=>{
  const f=fixture(t,[PLAYER[0]]);
  const checked=await inspectSchemaTables(f.db,[PLAYER[0],PLAYER[0]]);
  assert.equal(checked.ok,true);
  assert.deepEqual(checked.missing,[]);
  assert.equal(f.calls.length,1);
  assert.equal((f.calls[0].match(/\?/g)||[]).length,1);
  await assert.rejects(inspectSchemaTables(f.db,['users; DROP TABLE users']),
    /schema_preflight_invalid_table_names/);
  assert.equal(f.calls.length,1);
  const empty=await inspectSchemaTables(f.db,[]);
  assert.equal(empty.ok,true);
  assert.equal(f.calls.length,1);
});
