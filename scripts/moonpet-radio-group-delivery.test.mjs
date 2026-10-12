import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { forwardRadioRequestsToGroup,radioGroupMessage } from '../workers/moonboys-api/pets/radio-group-delivery.js';

function fixture() {
  const sql=new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE telegram_pet_system_events(
    id TEXT PRIMARY KEY,period_key TEXT,status TEXT,system_key TEXT,
    action_key TEXT,payload_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
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
  return{sql,put,db,status,close:()=>sql.close()};
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
  const f=fixture();f.put('old','2026-10-11','OLD SONG');
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
