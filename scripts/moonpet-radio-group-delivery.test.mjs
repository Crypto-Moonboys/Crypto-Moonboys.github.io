import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { forwardRadioRequestsToGroup,radioGroupMessage,RADIO_DELIVERY_QUERY } from '../workers/moonboys-api/pets/radio-group-delivery.js';

function fixture() {
  const sql=new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE telegram_pet_system_events(
    id TEXT PRIMARY KEY,period_key TEXT,status TEXT,system_key TEXT,
    action_key TEXT,payload_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  sql.exec(fs.readFileSync(new URL('../workers/moonboys-api/migrations/093_moonpet_radio_group_delivery_index.sql',import.meta.url),'utf8'));
  const put=(id,day,message,consented=true)=>{
    sql.prepare(`INSERT INTO telegram_pet_system_events(id,period_key,status,system_key,action_key,payload_json)
      VALUES (?,?, 'completed','radio_request','submission',?)`).run(id,day,JSON.stringify({message,moderation:'pending_host_review',...(consented?{telegram_group_delivery:'pending'}:{})}));
  };
  const db={prepare(query){const stmt=sql.prepare(query);let args=[];return{
    bind(...v){args=v;return this;},
    async all(){return {results:stmt.all(...args)};},
    async run(){return {meta:{changes:stmt.run(...args).changes}};}
  }}};
  const status=id=>JSON.parse(sql.prepare('SELECT payload_json FROM telegram_pet_system_events WHERE id=?').get(id).payload_json).telegram_group_delivery;
  const queryPlan=()=>sql.prepare('EXPLAIN QUERY PLAN '+RADIO_DELIVERY_QUERY).all(5).map(row=>row.detail).join(' ');
  return{sql,put,db,status,queryPlan,close:()=>sql.close()};
}
const config={bot_token:'test-token',chat_id:'-100999',message_thread_id:'21'};
test('HTML is escaped and player identity is not included in group message',()=>{
  const text=radioGroupMessage({message:'<b>PLAY & ROLL</b>'},'2026-10-12');
  assert.match(text,/&lt;b&gt;PLAY &amp; ROLL&lt;\/b&gt;/);
  assert.doesNotMatch(text,/telegram_id|source_pet_id/);
});
test('one saved request delivers once and respects Telegram topic',async()=>{
  const f=fixture();f.put('one','2026-10-12','Artist - Track');
  const sends=[];
  const send=async (...args)=>{sends.push(args);return{ok:true,status:200};};
  assert.equal((await forwardRadioRequestsToGroup(f.db,config,send)).sent,1);
  assert.equal(f.status('one'),'sent');
  assert.equal((await forwardRadioRequestsToGroup(f.db,config,send)).sent,0);
  assert.equal(sends.length,1);
  assert.equal(sends[0][1],'-100999');
  assert.equal(sends[0][3].message_thread_id,21);
  f.close();
});
test('do not dump older private requests or send when group config missing',async()=>{
  const f=fixture();f.put('old','2026-10-11','OLD SONG',false);
  let calls=0;const send=async()=>{calls++;return{ok:true};};
  assert.equal((await forwardRadioRequestsToGroup(f.db,{},send)).skipped,'group_not_configured');
  await forwardRadioRequestsToGroup(f.db,config,send);
  assert.equal(calls,0);
  assert.equal(f.status('old'),undefined);
  f.put('legacy-today','2026-10-12','Saved as private',false);
  await forwardRadioRequestsToGroup(f.db,config,send);
  assert.equal(calls,0);
  assert.equal(f.status('legacy-today'),undefined);
  f.close();
});
test('malformed payloads are skipped and the pending queue uses its partial ordering index',async()=>{
  const f=fixture();
  f.put('valid','2026-10-12','Safe request');
  f.sql.prepare(`INSERT INTO telegram_pet_system_events(id,period_key,status,system_key,action_key,payload_json)
    VALUES ('malformed','2026-10-12','completed','radio_request','submission','{bad json')`).run();
  const queryPlan=f.queryPlan();
  assert.match(queryPlan,/idx_pet_system_events_radio_delivery/);
  assert.doesNotMatch(queryPlan,/USE TEMP B-TREE/);
  const sends=[];
  assert.equal((await forwardRadioRequestsToGroup(f.db,config,async(...args)=>{sends.push(args);return{ok:true,status:200};})).sent,1);
  assert.equal(sends.length,1);
  assert.equal(f.sql.prepare('SELECT payload_json FROM telegram_pet_system_events WHERE id=?').get('malformed').payload_json,'{bad json');
  f.close();
});
test('definite HTTP failure retries, uncertain network failure stays held to avoid duplicates',async()=>{
  const f=fixture();f.put('fail','2026-10-12','Try again');
  assert.equal((await forwardRadioRequestsToGroup(f.db,config,async()=>({ok:false,status:403}))).failed,1);
  assert.equal(f.status('fail'),'pending');
  assert.equal((await forwardRadioRequestsToGroup(f.db,config,async()=>({ok:true,status:200}))).sent,1);
  f.put('unknown','2026-10-12','May have sent');
  assert.equal((await forwardRadioRequestsToGroup(f.db,config,async()=>{throw new Error('timeout')})).failed,1);
  assert.equal(f.status('unknown'),'sending');
  assert.equal((await forwardRadioRequestsToGroup(f.db,config,async()=>({ok:true}))).sent,0);
  f.close();
});
test('aged uncertain claims wait for operator reconciliation before a retry',async()=>{
  const f=fixture();
  for(const id of ['confirmed','missing','ambiguous']){
    f.put(id,'2026-10-12','Same request');
    f.sql.prepare(`UPDATE telegram_pet_system_events
      SET payload_json=json_set(payload_json,'$.telegram_group_delivery','sending'),
          updated_at=datetime('now','-20 minutes') WHERE id=?`).run(id);
  }
  const candidates=f.sql.prepare(`SELECT id,updated_at FROM telegram_pet_system_events
    WHERE system_key='radio_request' AND action_key='submission' AND status='completed'
      AND json_extract(CASE WHEN json_valid(payload_json) THEN payload_json ELSE '{}' END,'$.telegram_group_delivery')='sending'
      AND updated_at<datetime('now','-15 minutes')`).all();
  assert.deepEqual(candidates.map(row=>row.id).sort(),['ambiguous','confirmed','missing']);
  let calls=0;
  await forwardRadioRequestsToGroup(f.db,config,async()=>{calls++;return{ok:true};});
  assert.equal(calls,0,'stale claims must not be retried automatically');
  const reconcile=f.sql.prepare(`UPDATE telegram_pet_system_events
    SET payload_json=json_set(CASE WHEN json_valid(payload_json) THEN payload_json ELSE '{}' END,'$.telegram_group_delivery',?),
        updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND system_key='radio_request' AND action_key='submission' AND status='completed'
      AND json_extract(CASE WHEN json_valid(payload_json) THEN payload_json ELSE '{}' END,'$.telegram_group_delivery')='sending'
      AND updated_at<datetime('now','-15 minutes')`);
  assert.equal(reconcile.run('sent','confirmed').changes,1);
  assert.equal(reconcile.run('pending','missing').changes,1);
  assert.equal(f.status('ambiguous'),'sending','ambiguous matches stay held for review');
  assert.equal((await forwardRadioRequestsToGroup(f.db,config,async()=>{calls++;return{ok:true};})).sent,1);
  assert.equal(calls,1);
  assert.equal(f.status('missing'),'sent');
  f.close();
});
test('double scheduled calls cannot claim an already sending request',async()=>{
  const f=fixture();f.put('race','2026-10-12','Race protected');
  let release;const wait=new Promise(resolve=>{release=resolve;});
  let calls=0;
  const sender=async()=>{calls++;await wait;return{ok:true};};
  const first=forwardRadioRequestsToGroup(f.db,config,sender);
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  await forwardRadioRequestsToGroup(f.db,config,async()=>{calls++;return{ok:true};});
  release();await first;
  assert.equal(calls,1);
  assert.equal(f.status('race'),'sent');
  f.close();
});
test('scheduled worker wires existing Telegram group secrets without adding public route',()=>{
  const w=fs.readFileSync(new URL('../workers/moonboys-api/worker.js',import.meta.url),'utf8');
  assert.match(w,/forwardRadioRequestsToGroup\(env.DB/);
  assert.match(w,/message_thread_id: env.TELEGRAM_GROUP_THREAD_ID/);
  assert.match(w,/bot_token: env.TELEGRAM_BOT_TOKEN/);
});
