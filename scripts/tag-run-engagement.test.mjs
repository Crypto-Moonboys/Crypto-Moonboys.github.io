import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import assert from 'node:assert/strict';
import {missionFor,missionProgress,weeklyAwardWinners,exactQuantity,publishEngagement,
  runTagRunEngagement} from '../workers/moonboys-api/tag-run/engagement.js';

test('missions are stable per user/day, capped and require credited evidence',()=>{
  assert.equal(missionFor('2026-11-13','9'),missionFor('2026-11-13','9'));
  assert.equal(missionProgress('steady',{posts:30,first:1,last:500}).complete,false);
  assert.equal(missionProgress('steady',{posts:3,first:1,last:601}).complete,true);
  assert.equal(missionProgress('conversation',{targets:1}).complete,false);
  assert.equal(missionProgress('conversation',{targets:2}).complete,true);
});
test('weekly titles use gains, contiguous days, distinct targets and true newcomers',()=>{
  const rows=[
    {telegram_id:'10',day_key:'2026-11-02',points:100,display_name:'Older',first_day:'2026-10-01'},
    {telegram_id:'10',day_key:'2026-11-09',points:100,targets:3,display_name:'Older',first_day:'2026-10-01'},
    {telegram_id:'10',day_key:'2026-11-10',points:100,display_name:'Older',first_day:'2026-10-01'},
    {telegram_id:'9',day_key:'2026-11-09',points:200,targets:2,display_name:'New',first_day:'2026-11-09'}
  ];
  const result=weeklyAwardWinners(rows,'2026-11-09');
  assert.equal(result.find(r=>r.title==='Top Tagger').telegramId,'9');
  assert.equal(result.find(r=>r.title==='Biggest Climber').telegramId,'10');
  assert.equal(result.find(r=>r.title==='Best Streak').value,2);
  assert.equal(result.find(r=>r.title==='Community Helper').telegramId,'10');
  assert.equal(result.find(r=>r.title==='Newcomer of the Week').telegramId,'9');
  assert.deepEqual(weeklyAwardWinners([],'2026-11-09'),[]);
});
test('token quantities retain exact precision above safe integer range',()=>{
  assert.equal(exactQuantity('90071992547409931234',8),'900719925474.09931234');
  assert.equal(exactQuantity('1',8),'0.00000001');
  assert.throws(()=>exactQuantity('bad',4));
});
function postingEnv() {
  const events=new Map();
  const DB={prepare(sql) { return {bind(...args){return {
    async run(){
      if(sql.startsWith('INSERT')) {
        const key=args[0]+':'+args[1];
        if(events.has(key)) return {success:true,meta:{changes:0}};
        events.set(key,'attempted');return {success:true,meta:{changes:1}};
      }
      events.set(args[1]+':'+args[2],args[0]);
      return {success:true,meta:{changes:1}};
    }
  };}};}};
  return {env:{DB,TELEGRAM_GROUP_CHAT_ID:'-1001234567890',TELEGRAM_BOT_TOKEN:'fake',
    TELEGRAM_GROUP_THREAD_ID:'123'},events};
}
test('concurrent posts claim once and route to the configured group topic',async()=>{
  const {env}=postingEnv();let sent=0;
  const fetchImpl=async(url,options)=>{
    sent++;
    assert.equal(JSON.parse(options.body).message_thread_id,123);
    return {ok:true,json:async()=>({ok:true})};
  };
  await Promise.all([publishEngagement(env,'recap:2026-11-13','hello',fetchImpl),
    publishEngagement(env,'recap:2026-11-13','hello',fetchImpl)]);
  assert.equal(sent,1);
});
test('ambiguous Telegram delivery cannot trigger duplicate retries',async()=>{
  const {env,events}=postingEnv();let sent=0;
  const fetchImpl=async()=>{sent++;throw new Error('timeout after delivery');};
  assert.equal(await publishEngagement(env,'winner:abc','hello',fetchImpl),'needs_review');
  assert.equal(await publishEngagement(env,'winner:abc','hello',fetchImpl),'already_attempted');
  assert.equal(sent,1);
  assert.equal([...events.values()][0],'needs_review');
});
test('disabled engagement performs no database work',async()=>{
  assert.deepEqual(await runTagRunEngagement({}),{status:'disabled'});
});

test('notification runner uses confirmed ledger evidence, real non-winners and once-only daily events',async t=>{
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec(`
    CREATE TABLE tag_run_engagement_config(config_id INTEGER,started_day TEXT);
    INSERT INTO tag_run_engagement_config VALUES(1,'2026-11-09');
    CREATE TABLE tag_run_engagement_posts(chat_id TEXT,event_key TEXT,status TEXT,body TEXT,PRIMARY KEY(chat_id,event_key));
    CREATE TABLE tag_run_messages(chat_id TEXT,telegram_id TEXT,day_key TEXT,points INTEGER,message_unix INTEGER,reply_to_id TEXT);
    CREATE TABLE tag_run_member_totals(chat_id TEXT,telegram_id TEXT,display_name TEXT,score INTEGER);
    CREATE TABLE tag_run_member_blocks(chat_id TEXT,telegram_id TEXT,blocked INTEGER);
    CREATE TABLE tag_run_v2_assets(asset_key TEXT,token_symbol TEXT,token_contract TEXT,token_precision INTEGER);
    CREATE TABLE tag_run_v2_payout_intents(chat_id TEXT,intent_key TEXT,day_key TEXT,telegram_id TEXT,amount_units TEXT,signed_tx_id TEXT,asset_key TEXT,status TEXT);
    CREATE TABLE tag_run_v2_draw_workflows(chat_id TEXT,day_key TEXT,state TEXT,input_json TEXT);
    CREATE TABLE tag_run_v2_participation(chat_id TEXT,day_key TEXT,telegram_id TEXT,earned_weight INTEGER,spent_historical_weight INTEGER);
    CREATE TABLE tag_run_v2_bundles(chat_id TEXT,day_key TEXT,telegram_id TEXT);
    INSERT INTO tag_run_messages VALUES('-1001234567890','9','2026-11-15',10,1,'10'),('-1001234567890','10','2026-11-15',10,600,'9');
    INSERT INTO tag_run_member_totals VALUES('-1001234567890','9','Winner',30),('-1001234567890','10','Still In',20);
    INSERT INTO tag_run_v2_assets VALUES('asset','LFGK','kingsofgraff',4);
    INSERT INTO tag_run_v2_participation VALUES('-1001234567890','2026-11-15','9',10,0),('-1001234567890','2026-11-15','10',10,0);
    INSERT INTO tag_run_v2_bundles VALUES('-1001234567890','2026-11-15','9');
  `);
  const chat='-1001234567890';
  sql.prepare('INSERT INTO tag_run_v2_payout_intents VALUES(?,?,?,?,?,?,?,?)')
    .run(chat,'a'.repeat(64),'2026-11-15','9','10000','b'.repeat(64),'asset','confirmed');
  sql.prepare('INSERT INTO tag_run_v2_payout_intents VALUES(?,?,?,?,?,?,?,?)')
    .run(chat,'c'.repeat(64),'2026-11-15','10','10000',null,'asset','broadcast_unknown');
  sql.prepare('INSERT INTO tag_run_v2_draw_workflows VALUES(?,?,?,?)').run(chat,'2026-11-15','reviewed',
    JSON.stringify({participation:[
      {telegram_id:'9',earned_weight:10,spent_historical_weight:0,blocked:0},
      {telegram_id:'10',earned_weight:10,spent_historical_weight:0,blocked:0}
    ]}));
  const DB={prepare(query){return {bind(...args){return {
    first:async()=>sql.prepare(query).get(...args)||null,
    all:async()=>({success:true,results:sql.prepare(query).all(...args)}),
    run:async()=>({success:true,meta:{changes:sql.prepare(query).run(...args).changes}})
  };}};}};
  const sent=[];
  const env={DB,TAG_RUN_ENGAGEMENT_ENABLED:'true',TELEGRAM_GROUP_CHAT_ID:chat,TELEGRAM_BOT_TOKEN:'fake'};
  const opts={nowMs:Date.parse('2026-11-16T12:00:00Z'),fetchImpl:async(url,options)=>{
    assert.match(url,/sendMessage$/);sent.push(JSON.parse(options.body).text);
    return {ok:true,json:async()=>({ok:true})};
  }};
  const result=await runTagRunEngagement(env,opts);
  assert(result.outcomes.every(r=>r.status==='serviced'));
  assert.equal(sent.length,4);
  const winner=sent.find(x=>x.includes('TOKEN DROP CONFIRMED'));
  assert.match(winner,/1.0000 LFGK/);
  assert(winner.includes('https://waxblock.io/transaction/'+'b'.repeat(64)));
  assert.doesNotMatch(winner,/Still In/);
  const near=sent.find(x=>x.includes('STILL IN THE MIX'));
  assert.match(near,/Still In: 10 unused participation weight/);
  assert.doesNotMatch(near,/Winner:/);
  await runTagRunEngagement(env,opts);
  assert.equal(sent.length,4);
  assert.equal(sql.prepare("SELECT status FROM tag_run_v2_payout_intents WHERE intent_key=?").get('c'.repeat(64)).status,'broadcast_unknown');
});
