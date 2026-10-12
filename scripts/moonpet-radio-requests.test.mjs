import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { normalizeMoonpetRadioRequest, submitMoonpetRadioRequest } from '../workers/moonboys-api/pets/radio-requests.js';

class D1Fixture {
  constructor() {
    this.sql = new DatabaseSync(':memory:');
    this.sql.exec(`
      CREATE TABLE telegram_pet_instances (pet_id TEXT PRIMARY KEY, telegram_id TEXT, season_key TEXT, status TEXT);
      CREATE TABLE telegram_pet_active_slots (telegram_id TEXT PRIMARY KEY, pet_id TEXT, season_key TEXT);
      CREATE TABLE telegram_pet_system_events (
        id TEXT PRIMARY KEY,pet_id TEXT NOT NULL DEFAULT '',telegram_id TEXT NOT NULL,
        season_key TEXT NOT NULL DEFAULT '',system_key TEXT NOT NULL,action_key TEXT NOT NULL,
        period_key TEXT NOT NULL,status TEXT NOT NULL,payload_json TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (pet_id,telegram_id,season_key,system_key,action_key,period_key));
    `);
    this.sql.prepare("INSERT INTO telegram_pet_instances VALUES ('pet-one','user-one','season-one','active')").run();
    this.sql.prepare("INSERT INTO telegram_pet_active_slots VALUES ('user-one','pet-one','season-one')").run();
    this.sql.prepare("INSERT INTO telegram_pet_instances VALUES ('pet-two','user-two','season-two','active')").run();
    this.sql.prepare("INSERT INTO telegram_pet_active_slots VALUES ('user-two','pet-two','season-two')").run();
  }
}

test('only bounded, cleaned messages are accepted',()=>{
  assert.equal(normalizeMoonpetRadioRequest('  Artist — Track  '),'Artist — Track');
  assert.equal(normalizeMoonpetRadioRequest('song\n\r request'),'song request');
  for(const value of ['', 'a', 'abc', 24, null, 'x'.repeat(161)]) assert.equal(normalizeMoonpetRadioRequest(value),null);
  assert.equal(normalizeMoonpetRadioRequest('x'.repeat(160)).length,160);
});
test('radio messages persist privately one per account/UTC day with safe duplicate acknowledgment',async()=>{
  const fixture = new D1Fixture();
  const db = {
    prepare(query) {
      const stmt=fixture.sql.prepare(query);
      let args=[];
      return {bind(...v){args=v;return this;},
        async first(){return stmt.get(...args)||null;},
        async run(){return {meta:{changes:Number(stmt.run(...args).changes)}};}};
    }
  };
  const day = new Date('2026-10-11T12:00:00.000Z');
  assert.equal((await submitMoonpetRadioRequest(db,'user-one','pet-one','Tune: GraffPUNKS',day)).accepted,true);
  const rows=()=>fixture.sql.prepare("SELECT * FROM telegram_pet_system_events ORDER BY telegram_id,period_key").all();
  assert.equal(rows().length,1);
  assert.equal(rows()[0].pet_id,'');
  assert.equal(rows()[0].system_key,'radio_request');
  assert.equal(rows()[0].status,'completed');
  assert.equal(JSON.parse(rows()[0].payload_json).message,'Tune: GraffPUNKS');
  assert.equal(JSON.parse(rows()[0].payload_json).telegram_group_delivery,undefined,'legacy request stays private');
  const dup=await submitMoonpetRadioRequest(db,'user-one','pet-one','Different request',day);
  assert.equal(dup.accepted,true);assert.equal(dup.duplicate,true);
  assert.equal(JSON.parse(rows()[0].payload_json).message,'Tune: GraffPUNKS','second request must not overwrite the first');
  assert.equal((await submitMoonpetRadioRequest(db,'user-two','pet-two','Second account',day)).accepted,true);
  assert.equal((await submitMoonpetRadioRequest(db,'user-one','pet-one','Next day song',new Date('2026-10-12T00:00:00.000Z'))).accepted,true);
  assert.equal(rows().length,3);
  const optedIn=await submitMoonpetRadioRequest(db,'user-two','pet-two','Share on group',new Date('2026-10-12T12:00:00.000Z'),true);
  assert.equal(optedIn.accepted,true);
  assert.equal(JSON.parse(rows().find(row=>row.telegram_id==='user-two'&&row.period_key==='2026-10-12').payload_json).telegram_group_delivery,'pending');
  assert.equal((await submitMoonpetRadioRequest(db,'user-one','wrong-pet','Future request',new Date('2026-10-13T12:00:00.000Z'))).accepted,false);
  assert.equal(rows().length,3);
  fixture.sql.close();
});
test('resolved D1 write failures never claim a request was saved',async()=>{
  const fixture=new D1Fixture();
  const db={prepare(query){const stmt=fixture.sql.prepare(query);let args=[];return {
    bind(...v){args=v;return this;},
    async first(){return stmt.get(...args)||null;},
    async run(){return {success:false,error:'db_down',meta:{changes:1}};}
  }}};
  await assert.rejects(()=>submitMoonpetRadioRequest(db,'user-one','pet-one','Play my track',new Date('2026-10-11T12:00:00.000Z')),/pet_state_write_unavailable/);
  assert.equal(fixture.sql.prepare('SELECT COUNT(*) n FROM telegram_pet_system_events').get().n,0);
  fixture.sql.close();
});
