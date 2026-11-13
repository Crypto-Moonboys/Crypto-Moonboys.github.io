import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { commitDraw,revealDraw,reviewDraw,rejectDraw,inspectPersistedDraw,loadDrawInputs } from './tag-run-v2-draw-workflow.mjs';
import { chooseFutureWaxBlock,readIrreversibleWaxBlock } from './tag-run-v2-draw-entropy.mjs';
import { parseDrawCommand,validateDrawSettings,runDrawOperator,loadPrivateDrawSeed } from './tag-run-v2-owner-draw.mjs';
import { sha256Text,assetKey,TIP_ACCOUNT,WAX_MAINNET_CHAIN_ID } from '../workers/moonboys-api/tag-run/v2-core.js';
import { initializeReviewedDailyCap,reserveReviewedPayout } from '../workers/moonboys-api/tag-run/v2-payout-executor.js';
const GROUP='-1001234567890',DAY='2026-11-09',PAST='2026-11-08',SEED='1'.repeat(64),BLOCK=1120;
const BLOCK_ID=BLOCK.toString(16).padStart(8,'0')+'b'.repeat(56);
const future=async()=>({head:1000,block:BLOCK,notAfter:Math.floor(Date.now()/1000)+10});
const entropy=async()=>({block:BLOCK,id:BLOCK_ID,irreversible:true});
const read=f=>readFileSync(new URL('../workers/moonboys-api/'+f,import.meta.url),'utf8');
function fixture(t,{canonical=false,multi=false,total='10000',historical=true,triggerCounts=false,migrate=true}={}){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());sql.exec('PRAGMA foreign_keys=ON;PRAGMA recursive_triggers=OFF');
  if(canonical)sql.exec(read('schema.sql'));
  else for(const name of ['103_tag_run_street_cred_rewards.sql','104_tag_run_v2_community_token_pot.sql',
    '105_tag_run_v2_payout_execution.sql','106_tag_run_v2_one_percent_policy.sql','107_tag_run_v2_persisted_draws.sql','108_tag_run_v2_allowlist_funding.sql','109_tag_run_v2_full_automation.sql','110_tag_run_admin_member_blocks.sql'])if(migrate||!name.startsWith('107_'))sql.exec(read('migrations/'+name));
  sql.exec("UPDATE tag_run_v2_pool_config SET status='review_only'");
  const keys=[];
  for(const [symbol,precision] of [['LFGK',4],...(multi?[['DUMPIT',8]]:[])]){
    const key=assetKey('kingsofgraff',symbol,precision);keys.push(key);
    sql.prepare('INSERT INTO tag_run_v2_assets(asset_key,chain_id,token_contract,token_symbol,token_precision,eligibility,reviewed_by,verified_at) VALUES(?,?,?,?,?,\'approved\',\'auditor\',CURRENT_TIMESTAMP)')
      .run(key,WAX_MAINNET_CHAIN_ID,'kingsofgraff',symbol,precision);
    sql.prepare("INSERT INTO tag_run_v2_deposits(chain_id,global_action_seq,transaction_id,block_num,block_id,sender_account,recipient_account,asset_key,units,memo_digest,status,reviewed_at) VALUES(?,?,?,100,?,'donorwallet1',?,?,?,?,'confirmed_donation',CURRENT_TIMESTAMP)")
      .run(WAX_MAINNET_CHAIN_ID,String(keys.length),'e'.repeat(64),'f'.repeat(64),TIP_ACCOUNT,key,total,'a'.repeat(64));
    sql.prepare("INSERT INTO tag_run_v2_snapshots(chat_id,day_key,asset_key,wallet_account,chain_irreversible_block,chain_block_id,onchain_units,allocated_unpaid_units,excluded_units,spendable_units,five_percent_units,snapshot_digest,status,reward_policy_bps,daily_reward_units) VALUES(?,?,?,?,100,?,?,'0','0',?,'0',?,'verified',100,?)")
      .run(GROUP,DAY,key,TIP_ACCOUNT,'f'.repeat(64),total,total,'a'.repeat(64),(BigInt(total)/100n).toString());
  }
  sql.prepare('INSERT INTO tag_run_v2_capture_cursors(chat_id,last_completed_day_key) VALUES(?,?)').run(GROUP,DAY);
  for(const [id,day,weight] of [['1111',DAY,30],...(historical?[['2222',PAST,510],['3333',PAST,30]]:[])])
    sql.prepare('INSERT INTO tag_run_v2_participation(chat_id,day_key,telegram_id,earned_weight,source_receipts_digest) VALUES(?,?,?,?,?)').run(GROUP,day,id,weight,'c'.repeat(64));
  const state={failSecond:false,beforeBatch:null};
  function statement(query,args=[]){return {query,args,bind(...values){return statement(query,values);},
    async first(){return sql.prepare(query).get(...args)||null;},
    async all(){return {success:true,results:sql.prepare(query).all(...args)};},
    async run(){const before=sql.prepare('SELECT total_changes() n').get().n;const r=sql.prepare(query).run(...args);
      return {success:true,results:[],meta:{changes:triggerCounts?sql.prepare('SELECT total_changes() n').get().n-before:Number(r.changes)}};}};}
  let queue=Promise.resolve();
  const DB={prepare:q=>statement(q),batch(statements){
    const task=queue.then(async()=>{
    if(state.beforeBatch){const change=state.beforeBatch;state.beforeBatch=null;change();}
    sql.exec('BEGIN');try{const results=[];for(let i=0;i<statements.length;i++){
      if(i===1&&state.failSecond){state.failSecond=false;throw Error('injected second statement failure');}
      results.push(await statements[i].run());}
      sql.exec('COMMIT');return results;
    }catch(e){sql.exec('ROLLBACK');throw e;}
    });queue=task.catch(()=>{});return task;
  }};
  const env={DB,TELEGRAM_GROUP_CHAT_ID:GROUP,TAG_RUN_ENABLED:'true',TAG_RUN_WEEKLY_REWARDS_ENABLED:'false',
    TAG_RUN_V2_TIP_ACCOUNT:TIP_ACCOUNT,TAG_RUN_V2_POOL_ENABLED:'true',TAG_RUN_V2_DRAWS_ENABLED:'true',
    TAG_RUN_V2_OBSERVATION_ENABLED:'false',TAG_RUN_V2_DRAW_REVIEW_RELEASE_APPROVED:'true',
    TAG_RUN_V2_PAYOUTS_ENABLED:'false'};
  const commit=async(extra={})=>commitDraw(env,{day:DAY,seedCommitment:await sha256Text(SEED),committedBy:'operator-one',chooseFutureBlock:future,...extra});
  const reveal=extra=>revealDraw(env,{day:DAY,seedHex:SEED,readIrreversibleBlock:entropy,...extra});
  const review=async(extra={})=>reviewDraw(env,{day:DAY,reviewedBy:'independent-reviewer',expectedInputsDigest:(await inspectPersistedDraw(DB,GROUP,DAY)).inputsDigest,...extra});
  return {sql,DB,state,env,keys,commit,reveal,review};
}


test('blocked member is excluded from persisted draw inputs without deleting history',async t=>{
  const f=fixture(t);
  f.sql.prepare(
    'INSERT INTO tag_run_member_blocks ' +
    '(chat_id,telegram_id,username,blocked,updated_by,blocked_at) ' +
    'VALUES (?,?,?,1,?,CURRENT_TIMESTAMP)'
  ).run(GROUP,'1111','target_user','9000001');
  const input=await loadDrawInputs(f.DB,GROUP,DAY);
  assert.equal(input.participation.some(row=>row.telegram_id==='1111'),false);
  assert.equal(f.sql.prepare(
    'SELECT COUNT(*) AS n FROM tag_run_v2_participation WHERE telegram_id=?'
  ).get('1111').n,1,'participation audit row remains immutable');
});


test('commit stores exact 1% inputs before future entropy, without bundles or token debt',async t=>{
  const f=fixture(t);const receipt=await f.commit();assert.equal(receipt.state,'committed');assert.equal(receipt.bundles,0);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM tag_run_v2_bundles').get().n,0);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM tag_run_v2_draw_weight_claims').get().n,0);
  assert.equal(f.sql.prepare('SELECT seed_reveal FROM tag_run_v2_draws').get().seed_reveal,null);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM tag_run_v2_payout_intents').get().n,0);
});
test('read-only pilot cannot create a committed or funded draw',async t=>{
  const f=fixture(t);f.env.TAG_RUN_V2_DRAW_REVIEW_RELEASE_APPROVED='false';
  await assert.rejects(f.commit(),/release_not_approved/);assert.equal(f.sql.prepare('SELECT count(*) n FROM tag_run_v2_draws').get().n,0);
});
test('incomplete day/capture, token quarantine and dust fail closed while receipt status does not',async t=>{
  for(const edit of [f=>{f.env.TAG_RUN_V2_DRAWS_ENABLED='false';},
    f=>f.sql.exec("UPDATE tag_run_v2_capture_cursors SET last_completed_day_key='2026-11-08'"),
    f=>f.sql.exec("UPDATE tag_run_v2_assets SET eligibility='quarantined'"),
    f=>f.sql.exec('DELETE FROM tag_run_v2_participation')]){
    const f=fixture(t);edit(f);await assert.rejects(f.commit());
  }
  const receiptOnly=fixture(t);
  receiptOnly.sql.exec("UPDATE tag_run_v2_deposits SET status='quarantined'");
  assert.equal((await receiptOnly.commit()).state,'committed');
  const dust=fixture(t,{total:'99'});await assert.rejects(dust.commit(),/no_funded_eligible_bundles/);
  const f=fixture(t);await assert.rejects(f.commit({day:'2099-01-01'}),/day_not_complete/);
});
test('the committed day cannot be rerolled with another seed or another operator',async t=>{
  const f=fixture(t);const a=await f.commit();assert.deepEqual(await f.commit(),a);
  await assert.rejects(f.commit({seedCommitment:'9'.repeat(64)}),/day_already_committed/);
  await assert.rejects(f.commit({committedBy:'operator-two'}),/day_already_committed/);
});
test('past beacon or expired commit observation cannot substitute for future entropy',async t=>{
  const f=fixture(t);await assert.rejects(f.commit({chooseFutureBlock:async()=>({head:1000,block:1000,notAfter:Math.floor(Date.now()/1000)+10})}),/future_entropy_required/);
  await assert.rejects(f.commit({chooseFutureBlock:async()=>({head:1000,block:1120,notAfter:1})}),/future_entropy_required/);
});
test('wrong seed, unfinalized block or wrong block ID cannot reveal winners',async t=>{
  const f=fixture(t);await f.commit();
  await assert.rejects(f.reveal({seedHex:'2'.repeat(64)}),/reveal_arguments/);
  for(const proof of [{block:BLOCK,id:BLOCK_ID,irreversible:false},{block:BLOCK+1,id:BLOCK_ID,irreversible:true},
    {block:BLOCK,id:'a'.repeat(64),irreversible:true}])await assert.rejects(f.reveal({readIrreversibleBlock:async()=>proof}),/beacon_not_irreversible/);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM tag_run_v2_bundles').get().n,0);
});
test('reveal persists identical bundles on replay and creates no funded liabilities yet',async t=>{
  const f=fixture(t,{multi:true});await f.commit();const receipt=await f.reveal();assert.equal(receipt.state,'revealed');assert.equal(receipt.bundles,40);
  assert.deepEqual(await f.reveal(),receipt);assert.equal(f.sql.prepare('SELECT count(*) n FROM tag_run_v2_bundles').get().n,40);
  for(const key of f.keys){const total=f.sql.prepare('SELECT units FROM tag_run_v2_bundles WHERE asset_key=?').all(key).reduce((n,b)=>n+BigInt(b.units),0n);assert.equal(total,100n);}
  assert.equal(f.sql.prepare('SELECT status FROM tag_run_v2_draws').get().status,'preview_only');
  assert.equal(f.sql.prepare('SELECT sum(spent_historical_weight) n FROM tag_run_v2_participation').get().n,0);
});
test('independent review finalizes immutable bundles and consumes only historical winners',async t=>{
  const f=fixture(t);await f.commit();await f.reveal();
  await assert.rejects(f.review({reviewedBy:'operator-one'}),/independent_review_required/);
  await assert.rejects(f.review({expectedInputsDigest:'0'.repeat(64)}),/independent_review_required/);
  const reviewed=await f.review();assert.equal(reviewed.state,'reviewed');assert.deepEqual(await f.review(),reviewed);
  const spent=f.sql.prepare('SELECT telegram_id,spent_historical_weight n FROM tag_run_v2_participation').all();
  const winners=new Set(f.sql.prepare("SELECT telegram_id FROM tag_run_v2_bundles WHERE ticket_class='historical'").all().map(r=>r.telegram_id));
  for(const row of spent)assert.equal(row.n>0,winners.has(row.telegram_id));
  assert.ok(f.sql.prepare('SELECT coalesce(max(units),0) n FROM tag_run_v2_draw_weight_claims').get().n<=510);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM tag_run_v2_payout_intents').get().n,0);
});
test('a reviewed draw can feed the existing durable payout cap and reservation functions',async t=>{
  const f=fixture(t,{historical:false});await f.commit();await f.reveal();await f.review();
  const env={...f.env,TAG_RUN_V2_PAYOUTS_ENABLED:'true',TAG_RUN_V2_EXECUTOR_RELEASE_APPROVED:'true'};
  await initializeReviewedDailyCap(env,{chatId:GROUP,day:DAY,contract:'kingsofgraff',symbol:'LFGK',precision:4,authorizedBy:'independent-reviewer',maxTransferUnits:'100'});
  f.sql.exec('UPDATE tag_run_v2_payout_caps SET paused=0,revision=revision+1');
  f.sql.prepare('INSERT INTO tag_run_wallets(telegram_id,wax_account) VALUES(?,?)').run('1111','gkniftyheads');
  const b=f.sql.prepare('SELECT * FROM tag_run_v2_bundles ORDER BY bundle_index LIMIT 1').get();
  const receipt=await reserveReviewedPayout(env,{chatId:GROUP,day:DAY,contract:'kingsofgraff',symbol:'LFGK',precision:4,bundleIndex:b.bundle_index,
    telegramId:b.telegram_id,receivingAccount:'gkniftyheads',amountUnits:b.units,authorizationDigest:'d'.repeat(64),approvedBy:'independent-reviewer'});
  assert.equal(receipt.state,'reserved');assert.equal(receipt.transferAttempted,false);
});
for(const stage of ['commit','reveal','review'])test(stage+' rolls back its first statement when its second statement fails',async t=>{
  const f=fixture(t);if(stage!=='commit')await f.commit();if(stage==='review')await f.reveal();
  const before=f.sql.prepare('SELECT total_changes() n').get().n;f.state.failSecond=true;
  await assert.rejects(f[stage](),/injected second/);
  if(stage==='commit')assert.equal(f.sql.prepare('SELECT count(*) n FROM tag_run_v2_draws').get().n,0);
  else {assert.equal(f.sql.prepare('SELECT state FROM tag_run_v2_draw_workflows').get().state,stage==='reveal'?'committed':'revealed');
    assert.equal(f.sql.prepare('SELECT count(*) n FROM tag_run_v2_draw_weight_claims').get().n,0);}
  if(stage==='reveal')assert.equal(f.sql.prepare('SELECT count(*) n FROM tag_run_v2_bundles').get().n,0);
  assert.ok(f.sql.prepare('SELECT total_changes() n').get().n>=before);
  await f[stage]();
});
test('D1 trigger-inclusive change counts do not turn a committed transition into failure',async t=>{
  const f=fixture(t,{triggerCounts:true});await f.commit();await f.reveal();assert.equal((await f.review()).state,'reviewed');
});
test('pool pause or token suspension during final batch preparation rolls back while receipt status does not',async t=>{
  for(const change of [f=>f.sql.exec("UPDATE tag_run_v2_pool_config SET status='paused'"),
    f=>f.sql.exec("UPDATE tag_run_v2_assets SET eligibility='suspended'")]){
    const f=fixture(t);await f.commit();await f.reveal();f.state.beforeBatch=()=>change(f);
    await assert.rejects(f.review());assert.equal(f.sql.prepare('SELECT state FROM tag_run_v2_draw_workflows').get().state,'revealed');
    assert.equal(f.sql.prepare('SELECT count(*) n FROM tag_run_v2_draw_weight_claims').get().n,0);
  }
  const receiptOnly=fixture(t);await receiptOnly.commit();await receiptOnly.reveal();
  receiptOnly.state.beforeBatch=()=>receiptOnly.sql.exec("UPDATE tag_run_v2_deposits SET status='refund_review'");
  assert.equal((await receiptOnly.review()).state,'reviewed');
});
test('source changes, inserted late participants and snapshot replacement cannot silently redraw',async t=>{
  const f=fixture(t);await f.commit();f.sql.exec('UPDATE tag_run_v2_participation SET earned_weight=earned_weight+1 WHERE earned_weight<510');
  await assert.rejects(f.reveal(),/source_changed_since_commit/);
  assert.throws(()=>f.sql.exec("UPDATE tag_run_v2_snapshots SET daily_reward_units='101'"),/committed_snapshot_immutable/);
  assert.throws(()=>f.sql.exec('DELETE FROM tag_run_v2_snapshots'),/committed_snapshot_immutable/);
  const g=fixture(t);await g.commit();await g.reveal();g.state.beforeBatch=()=>g.sql.prepare('INSERT INTO tag_run_v2_participation(chat_id,day_key,telegram_id,earned_weight,source_receipts_digest) VALUES(?,?,?,?,?)').run(GROUP,DAY,'4444',5,'d'.repeat(64));
  await assert.rejects(g.review(),/participation_changed/);
});
test('new unpaid obligations arriving during review cannot reuse the snapshot balance',async t=>{
  const f=fixture(t);await f.commit();await f.reveal();
  f.state.beforeBatch=()=>{
    f.sql.prepare("INSERT INTO tag_run_v2_draws(chat_id,day_key,status,seed_commitment,rules_digest,weights_digest,snapshots_digest,reviewed_by,reward_policy_bps) VALUES(?,'2026-11-07','reviewed',?,?,?,?,'auditor',100)").run(GROUP,...Array(4).fill('a'.repeat(64)));
    f.sql.prepare("INSERT INTO tag_run_v2_bundles(chat_id,day_key,asset_key,bundle_index,telegram_id,ticket_class,units) VALUES(?,'2026-11-07',?,0,'1111','current','1')").run(GROUP,f.keys[0]);
  };
  await assert.rejects(f.review(),/reservations_changed/);
});
test('unpaid bundles, including members without registered wallets, are full reserved liabilities',async t=>{
  const f=fixture(t);await f.commit();await f.reveal();await f.review();
  const next='2026-11-10';f.sql.prepare('UPDATE tag_run_v2_capture_cursors SET last_completed_day_key=?').run(next);
  const s=f.sql.prepare('SELECT * FROM tag_run_v2_snapshots').get();
  f.sql.prepare("INSERT INTO tag_run_v2_snapshots(chat_id,day_key,asset_key,wallet_account,chain_irreversible_block,chain_block_id,onchain_units,allocated_unpaid_units,excluded_units,spendable_units,five_percent_units,snapshot_digest,status,reward_policy_bps,daily_reward_units) VALUES(?,?,?,?,100,?,?,'100','0','9900','0',?,'verified',100,'99')")
    .run(GROUP,next,f.keys[0],TIP_ACCOUNT,s.chain_block_id,s.onchain_units,s.snapshot_digest);
  const input=await loadDrawInputs(f.DB,GROUP,next);assert.equal(input.outstanding.reduce((n,b)=>n+BigInt(b.units),0n),100n);
  assert.equal(input.snapshots[0].daily_reward_units,'99');
  f.sql.prepare("UPDATE tag_run_v2_snapshots SET allocated_unpaid_units='0',spendable_units='10000',daily_reward_units='100' WHERE day_key=?").run(next);
  await assert.rejects(loadDrawInputs(f.DB,GROUP,next),/snapshot_unpaid_reservations_mismatch/);
});
test('committed inputs, reviewed bundles and historical claim journal reject overwrite/delete/REPLACE',async t=>{
  const f=fixture(t);await f.commit();await f.reveal();await f.review();
  for(const sql of ["UPDATE tag_run_v2_draw_workflows SET inputs_digest='changed'",'DELETE FROM tag_run_v2_draw_workflows',
    "UPDATE tag_run_v2_draws SET reviewed_by='attacker'",'DELETE FROM tag_run_v2_draws',
    "UPDATE tag_run_v2_bundles SET units='1000000'",'DELETE FROM tag_run_v2_bundles',
    'UPDATE tag_run_v2_draw_weight_claims SET units=1','DELETE FROM tag_run_v2_draw_weight_claims',
    'UPDATE tag_run_v2_participation SET spent_historical_weight=0 WHERE spent_historical_weight>0'])assert.throws(()=>f.sql.exec(sql));
  const b=f.sql.prepare('SELECT * FROM tag_run_v2_bundles LIMIT 1').get();
  assert.throws(()=>f.sql.prepare('INSERT OR REPLACE INTO tag_run_v2_bundles(chat_id,day_key,asset_key,bundle_index,telegram_id,ticket_class,units) VALUES(?,?,?,?,?,?,?)')
    .run(b.chat_id,b.day_key,b.asset_key,b.bundle_index,b.telegram_id,b.ticket_class,b.units));
});
test('unfunded commitment can be rejected, but funded reviewed liabilities cannot be cancelled',async t=>{
  const f=fixture(t);await f.commit();assert.equal((await rejectDraw(f.env,{day:DAY,reviewedBy:'independent-reviewer',reason:'funding source changed'})).state,'rejected');
  await assert.rejects(f.reveal(),/invalid_transition/);
  const g=fixture(t);await g.commit();await g.reveal();await g.review();
  await assert.rejects(rejectDraw(g.env,{day:DAY,reviewedBy:'independent-reviewer',reason:'cancel funded winners'}),/funded_draw_cannot_be_rejected/);
});
test('canonical schema and sequential migration agree on persistent workflow and claims',async t=>{
  const f=fixture(t,{canonical:true});await f.commit();await f.reveal();await f.review();
  assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(f.sql.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});

function rpc({futureOnly=false,mutate}={}){return async(url,options)=>{
  const host=new URL(url).hostname,method=url.split('/').at(-1),body=JSON.parse(options.body||'{}');
  let data=method==='get_info'?{chain_id:WAX_MAINNET_CHAIN_ID,head_block_num:futureOnly?1000:1200,
    last_irreversible_block_num:futureOnly?990:1190,head_block_time:new Date().toISOString().replace(/Z$/,'')}:
    {block_num:body.block_num_or_id,id:BLOCK_ID};
  if(mutate)data=mutate({host,method,data});
  return new Response(JSON.stringify(data));
};}
test('entropy chooses an unproduced block and requires both providers irreversible agreement',async()=>{
  const future=await chooseFutureWaxBlock({fetchImpl:rpc({futureOnly:true})});assert.equal(future.block,BLOCK);
  assert.deepEqual(await readIrreversibleWaxBlock(BLOCK,{fetchImpl:rpc()}),{block:BLOCK,id:BLOCK_ID,irreversible:true});
});
test('entropy fails closed on stale heads, wrong chain, unfinalized blocks, provider disagreement and outages',async()=>{
  for(const mutate of [({method,data})=>method==='get_info'?{...data,chain_id:'bad'}:data,
    ({method,data})=>method==='get_info'?{...data,head_block_time:'2020-01-01T00:00:00'}:data,
    ({method,data})=>method==='get_info'?{...data,last_irreversible_block_num:1}:data,
    ({host,method,data})=>host==='wax.eosphere.io'&&method==='get_block'?{...data,id:BLOCK_ID.slice(0,8)+'c'.repeat(56)}:data])
    await assert.rejects(readIrreversibleWaxBlock(BLOCK,{fetchImpl:rpc({mutate})}),/entropy_unavailable/);
  await assert.rejects(chooseFutureWaxBlock({fetchImpl:async()=>{throw Error('private error');}}),/entropy_unavailable/);
});
test('operator commands require explicit mutation approval and the independent draw release flag',()=>{
  assert.throws(()=>parseDrawCommand(['commit','--day',DAY]),/explicit_live_required/);
  assert.equal(parseDrawCommand(['verify','--day',DAY]).command,'verify');
  assert.throws(()=>parseDrawCommand(['commit','--day',DAY,'--live','--live']),/invalid_option/);
  assert.throws(()=>validateDrawSettings({bindings:[]}),/wrong_database/);
});
test('operator CLI never creates a seed or D1 draw while deployed drawing flags are OFF',async()=>{
  let writes=0,seeds=0;
  await assert.rejects(runDrawOperator(['commit','--day',DAY,'--reviewer','operator-one','--seed-file','unused','--live'],{
    vars:{CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'fixture-token-123',TAG_RUN_OPERATOR_GROUP_ID:GROUP},
    fetchImpl:async()=>{writes++;return new Response(JSON.stringify({success:true,result:{bindings:[{name:'DB',type:'d1',database_id:'8a36e17a-18fa-4b98-90e1-3f269164b166'}]}}));},
    loadSeed:async()=>{seeds++;return SEED;},confirmation:async()=>{throw Error('must not prompt');},log:()=>{}
  }),/release_not_approved/);assert.equal(writes,1);assert.equal(seeds,0);
});

test('migration 107 preserves every legacy table row and is safe to rehearse twice',t=>{
  const f=fixture(t,{migrate:false});
  const oldTables=f.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
  const data=()=>JSON.stringify(oldTables.map(name=>[name,f.sql.prepare('SELECT * FROM "'+name+'"').all()]));
  const before=data();f.sql.exec(read('migrations/107_tag_run_v2_persisted_draws.sql'));
  f.sql.exec(read('migrations/107_tag_run_v2_persisted_draws.sql'));
  assert.equal(data(),before);assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(f.sql.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
for(const stage of ['commit','reveal','review'])test('concurrent '+stage+' attempts cannot duplicate winners or historical consumption',async t=>{
  const f=fixture(t);if(stage!=='commit')await f.commit();if(stage==='review')await f.reveal();
  const attempts=await Promise.allSettled([f[stage](),f[stage]()]);
  assert.ok(attempts.some(r=>r.status==='fulfilled'));
  assert.equal(f.sql.prepare('SELECT count(*) n FROM tag_run_v2_draw_workflows').get().n,1);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM tag_run_v2_bundles').get().n,stage==='commit'?0:20);
  if(stage==='review'){
    assert.equal(f.sql.prepare('SELECT state FROM tag_run_v2_draw_workflows').get().state,'reviewed');
    for(const row of f.sql.prepare('SELECT earned_weight,spent_historical_weight FROM tag_run_v2_participation').all())
      assert.ok(row.spent_historical_weight<=row.earned_weight);
  }
  await f[stage]();
});

test('private draw seed survives retries and rejects another day or repository-local storage',async t=>{
  const {mkdtemp,readFile,unlink,rmdir}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const dir=await mkdtemp(join(tmpdir(),'tag-run-draw-test-')),file=join(dir,'private-seed.json');
  t.after(async()=>{await unlink(file).catch(()=>{});await rmdir(dir);});
  const seed=await loadPrivateDrawSeed(file,GROUP,DAY,true);
  assert.match(seed,/^[a-f0-9]{64}$/);
  assert.equal(JSON.parse(await readFile(file,'utf8')).seedHex,seed);
  assert.equal(await loadPrivateDrawSeed(file,GROUP,DAY,true),seed);
  assert.equal(await loadPrivateDrawSeed(file,GROUP,DAY,false),seed);
  await assert.rejects(loadPrivateDrawSeed(file,GROUP,PAST,true),/invalid_seed_file/);
  await assert.rejects(loadPrivateDrawSeed(new URL('./never-create-seed.json',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),GROUP,DAY,true),/seed_must_be_outside_repository/);
});

test('historical wins consume at most 510 oldest available weight once across token wins',async t=>{
  const f=fixture(t,{multi:true});
  f.sql.prepare('DELETE FROM tag_run_v2_participation WHERE telegram_id=?').run('3333');
  f.sql.prepare('INSERT INTO tag_run_v2_participation(chat_id,day_key,telegram_id,earned_weight,spent_historical_weight,source_receipts_digest) VALUES(?,?,?,?,?,?)')
    .run(GROUP,'2026-11-07','2222',510,400,'c'.repeat(64));
  f.sql.prepare('INSERT INTO tag_run_v2_participation(chat_id,day_key,telegram_id,earned_weight,spent_historical_weight,source_receipts_digest) VALUES(?,?,?,?,?,?)')
    .run(GROUP,'2026-11-06','2222',510,510,'c'.repeat(64));
  await f.commit();await f.reveal();await f.review();
  const wins=f.sql.prepare("SELECT DISTINCT asset_key FROM tag_run_v2_bundles WHERE telegram_id='2222' AND ticket_class='historical'").all();
  assert.equal(wins.length,2);
  const claims=f.sql.prepare('SELECT source_day,units FROM tag_run_v2_draw_weight_claims WHERE telegram_id=? ORDER BY source_day').all('2222');
  assert.deepEqual(claims.map(r=>[r.source_day,r.units]),[['2026-11-07',110],[PAST,400]]);
  assert.equal(f.sql.prepare("SELECT spent_historical_weight FROM tag_run_v2_participation WHERE telegram_id='2222' AND day_key=?").get(PAST).spent_historical_weight,400);
  await f.review();assert.equal(f.sql.prepare('SELECT sum(units) n FROM tag_run_v2_draw_weight_claims').get().n,510);
});
