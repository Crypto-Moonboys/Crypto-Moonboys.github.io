import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { assetKey,TIP_ACCOUNT,WAX_MAINNET_CHAIN_ID } from
  '../workers/moonboys-api/tag-run/v2-core.js';
import { observationEnabled,handleV2ObservationCommand } from
  '../workers/moonboys-api/tag-run/v2-pilot.js';
import { handleTagRunCommand } from
  '../workers/moonboys-api/tag-run/handler.js';
import { saveYesterdayParticipation, handleTagRunV2Command } from
  '../workers/moonboys-api/tag-run/v2-service.js';
import { WAX_HYPERION, WAX_HYPERION_FALLBACKS } from
  '../workers/moonboys-api/tag-run/v2-chain.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const GROUP='-1001234567890', MEMBER='1111';
const YESTERDAY='2026-11-02';
const NOW=Date.parse('2026-11-03T02:00:00Z');
const ASSET=assetKey('kingsofgraff','LFGK',4);
const migration103=read('workers/moonboys-api/migrations/103_tag_run_street_cred_rewards.sql');
const migration104=read('workers/moonboys-api/migrations/104_tag_run_v2_community_token_pot.sql');
const migration105=read('workers/moonboys-api/migrations/105_tag_run_v2_payout_execution.sql');
const migration106=read('workers/moonboys-api/migrations/106_tag_run_v2_one_percent_policy.sql');
const migration107=read('workers/moonboys-api/migrations/107_tag_run_v2_persisted_draws.sql');
const migration108=read('workers/moonboys-api/migrations/108_tag_run_v2_allowlist_funding.sql');
const migration109=read('workers/moonboys-api/migrations/109_tag_run_v2_full_automation.sql');
const migration110=read('workers/moonboys-api/migrations/110_tag_run_admin_member_blocks.sql');
const migration111=read('workers/moonboys-api/migrations/111_tag_run_reward_only_blocks.sql');

function fixture(t){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON;');
  sqlite.exec(migration103);
  sqlite.exec(migration104);
  sqlite.exec(migration105);
  sqlite.exec(migration106);
  sqlite.exec(migration107);
  sqlite.exec(migration108);
  sqlite.exec(migration109);
  sqlite.exec(migration110);
  sqlite.exec(migration111);
  t.after(()=>sqlite.close());
  const DB={prepare(sql){return {
    bind(...args){return {
      async first(){return sqlite.prepare(sql).get(...args)||null;},
      async all(){return {success:true,results:sqlite.prepare(sql).all(...args)};},
      async run(){const r=sqlite.prepare(sql).run(...args);
        return {success:true,meta:{changes:r.changes}};}
    };},
    async first(){return sqlite.prepare(sql).get()||null;},
    async all(){return {success:true,results:sqlite.prepare(sql).all()};},
    async run(){const r=sqlite.prepare(sql).run();
      return {success:true,meta:{changes:r.changes}};}
  };},
  async batch(statements){
    sqlite.exec('BEGIN IMMEDIATE;');
    try {
      const results=[];
      for(const statement of statements) results.push(await statement.run());
      sqlite.exec('COMMIT;');
      return results;
    } catch(error) {
      sqlite.exec('ROLLBACK;');
      throw error;
    }
  }};
  const env={
    DB,TAG_RUN_ENABLED:'true',TAG_RUN_WEEKLY_REWARDS_ENABLED:'false',
    TAG_RUN_V2_OBSERVATION_ENABLED:'true',TAG_RUN_V2_POOL_ENABLED:'true',
    TAG_RUN_V2_DRAWS_ENABLED:'false',TAG_RUN_V2_PAYOUTS_ENABLED:'false',
    TAG_RUN_V2_TIP_ACCOUNT:TIP_ACCOUNT,TELEGRAM_GROUP_CHAT_ID:GROUP,
    TELEGRAM_BOT_TOKEN:'123456:unit-test-token',TELEGRAM_BOT_USERNAME:'WIKICOMSBOT',
    ADMIN_TELEGRAM_IDS:MEMBER
  };
  return {sqlite,DB,env};
}

function rpc(tokens=[
  {contract:'kingsofgraff',symbol:'LFGK',precision:4,amount:100000},
  {contract:'wuffi',symbol:'WUF',precision:4,amount:100000000},
  {contract:'gkniftyheads',symbol:'BITCOIN',precision:8,amount:0}
],opts={}){
  let calls=[], balances=[];
  const fetchImpl=async (url,options={})=>{
    calls.push({url,options});
    if(url.endsWith('/get_info'))return {ok:true,json:async()=>({
      chain_id:opts.wrongChain?'wrong-chain':WAX_MAINNET_CHAIN_ID,
      last_irreversible_block_num:500
    })};
    if(url.endsWith('/get_account'))return {ok:true,json:async()=>({
      account_name:opts.wrongAccount?'notrightname':TIP_ACCOUNT
    })};
    if(url.includes('/v2/state/get_tokens?')){
      const args=new URL(url).searchParams;
      const skip=Number(args.get('skip')),limit=Number(args.get('limit'));
      assert.equal(args.get('account'),TIP_ACCOUNT);
      if(opts.failAtSkip===skip)return {ok:false,json:async()=>({})};
      return {ok:true,json:async()=>({
        account:TIP_ACCOUNT,tokens:tokens.slice(skip,skip+limit)
      })};
    }
    if(url.endsWith('/get_abi')){
      const {account_name}=JSON.parse(options.body);
      return {ok:true,json:async()=>({account_name,abi:{
        actions:[{name:'transfer',type:'transfer'}],
        structs:[{name:'transfer',base:'',fields:[
          {name:'from',type:'name'},{name:'to',type:'name'},
          {name:'quantity',type:'asset'},{name:'memo',type:'string'}
        ]}]
      }})};
    }
    if(url.endsWith('/get_code_hash')){
      const {account_name}=JSON.parse(options.body);
      return {ok:true,json:async()=>({
        account_name,code_hash:'c'.repeat(64)
      })};
    }
    if(url.endsWith('/get_currency_stats')){
      const {symbol}=JSON.parse(options.body);
      const found=tokens.find(item=>item.symbol===symbol);
      if(!found) return {ok:true,json:async()=>({})};
      const decimals='0'.repeat(found.precision);
      const quantity='1'+(found.precision?'.'+decimals:'')+' '+symbol;
      return {ok:true,json:async()=>({[symbol]:{
        supply:quantity,max_supply:quantity,issuer:'gkniftyheads'
      }})};
    }
    if(url.endsWith('/get_currency_balance')){
      const {code,symbol,account}=JSON.parse(options.body);
      assert.equal(account,TIP_ACCOUNT);
      balances.push([code,symbol]);
      const found=tokens.find(a=>a.contract===code&&a.symbol===symbol);
      if(!found||found.amount===0)throw Error('zero-balance token must not be verified');
      const base=10n**BigInt(found.precision),amount=BigInt(found.amount)*base;
      const display=(amount/base).toString()+
        (found.precision?'.'+(amount%base).toString().padStart(found.precision,'0'):'')+
        ' '+symbol;
      return {ok:true,json:async()=>[display]};
    }
    if(url.includes('sendMessage'))return {ok:true};
    throw Error('Unexpected network request '+url);
  };
  return {fetchImpl,calls,balances};
}
async function command(f,name,{nowMs=NOW,fetchImpl=rpc().fetchImpl,
  isAdmin=true,isPrivate=true}={}){
  const messages=[];
  const result=await handleV2ObservationCommand(f.env,{
    name,isAdmin,isPrivate,chatId:GROUP,telegramId:MEMBER,
    send:async message=>messages.push(message),
    nowMs,fetchImpl,
    capture:opts=>saveYesterdayParticipation(f.env,{
      ...opts,cryptoImpl:webcrypto
    })
  });
  return {result,messages};
}
async function adminCommand(f,name,args,{fetchImpl=rpc().fetchImpl,
  isAdmin=true,isPrivate=true}={}){
  const messages=[];
  const result=await handleTagRunV2Command(f.env,{
    name,args,isAdmin,isPrivate,chatId:GROUP,telegramId:MEMBER,
    send:async message=>messages.push(message),nowMs:NOW,fetchImpl
  });
  return {result,messages};
}
function receipts(f,day,id,points=10,message=1){
  f.sqlite.prepare('INSERT INTO tag_run_messages '+
    '(chat_id,message_id,telegram_id,display_name,day_key,week_key,message_unix,'+
    'content_hash,points) VALUES (?,?,?,?,?,?,?,?,?)').run(
    GROUP,message,id,'Tester',day,day,
    Math.floor(Date.parse(day+'T12:00:00Z')/1000),day+'-'+id+'-'+message,points
  );
}
const count=(f,table)=>f.sqlite.prepare('SELECT COUNT(*) AS n FROM '+table).get().n;

test('owner-approved pilot gate is enabled while every funded reward gate stays OFF',t=>{
  const f=fixture(t),cfg=read('workers/moonboys-api/wrangler.toml');
  assert.equal(observationEnabled(f.env),true);
  assert.match(cfg,/TAG_RUN_V2_OBSERVATION_ENABLED = "true"/);
  assert.match(cfg,/TAG_RUN_V2_POOL_ENABLED = "true"/);
  for(const flag of ['TAG_RUN_V2_DRAWS_ENABLED',
    'TAG_RUN_V2_PAYOUTS_ENABLED','TAG_RUN_WEEKLY_REWARDS_ENABLED']){
    assert.match(cfg,new RegExp(flag+' = "false"'));
  }
  const wrapper = read('workers/moonboys-api/worker-phase5-final.js');
  const plan = read('workers/moonboys-api/scheduled/phase5-cron-plan.js');
  assert.match(wrapper,/phase5CronTasks\(event, env\)/);
  assert.match(wrapper,/if \(tasks\.participation\)[\s\S]*?saveYesterdayParticipation\(env\)/);
  assert.match(plan,/TAG_RUN_V2_OBSERVATION_ENABLED === 'true'/,
    'read-only capture must remain behind the independent observation gate');
  assert.match(plan,/cron === MOONBOYS_CRON\.participation/);
  for(const key of ['TAG_RUN_V2_DRAWS_ENABLED','TAG_RUN_V2_PAYOUTS_ENABLED',
    'TAG_RUN_WEEKLY_REWARDS_ENABLED']){
    f.env[key]='true';
    assert.equal(observationEnabled(f.env),false,key+' must close observation');
    f.env[key]='false';
  }
  f.env.TAG_RUN_V2_POOL_ENABLED='false';
  assert.equal(observationEnabled(f.env),true,
    'pool administration gate must not disable safe paused observation');
  f.env.TAG_RUN_V2_POOL_ENABLED='true';
  assert.equal(f.sqlite.prepare('SELECT status FROM tag_run_v2_pool_config').get().status,
    'paused');
  assert.equal(f.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('only authorized bot private chat may inspect live inventory',async t=>{
  const f=fixture(t),network=rpc();
  for(const combination of [
    {isAdmin:false,isPrivate:true},
    {isAdmin:true,isPrivate:false}
  ]){
    const result=await command(f,'poolobserve',{...combination,fetchImpl:network.fetchImpl});
    assert.equal(result.result,true);
    assert.match(result.messages[0],/authorised admins/);
    assert.equal(network.calls.length,0);
  }
  assert.equal(count(f,'tag_run_v2_assets'),0);
});

test('live WAX asset observation stores quarantined identity, not token funding',async t=>{
  const f=fixture(t),network=rpc();
  const first=await command(f,'poolobserve',{fetchImpl:network.fetchImpl});
  assert.equal(first.result,true);
  assert.match(first.messages[0],/100000\.0000 LFGK/);
  assert.match(first.messages[0],/100000000\.0000 WUF/);
  assert.match(first.messages[0],/OBSERVED ONLY/);
  assert.match(first.messages[0],/quarantined asset identities: 3/);
  assert.equal(count(f,'tag_run_v2_assets'),3);
  assert.equal(count(f,'tag_run_v2_audit'),1);
  assert.deepEqual(f.sqlite.prepare('SELECT DISTINCT eligibility FROM tag_run_v2_assets')
    .all().map(r=>r.eligibility),['quarantined']);
  assert.equal(count(f,'tag_run_v2_snapshots'),0);
  assert.equal(count(f,'tag_run_v2_draws'),0);
  assert.equal(count(f,'tag_run_v2_bundles'),0);
  assert.equal(count(f,'tag_run_v2_deposits'),0);
  assert.equal(network.balances.length,2,
    'zero-balance token is quarantined without claiming a chain holding');
  const again=await command(f,'poolobserve',{fetchImpl:network.fetchImpl});
  assert.match(again.messages[0],/quarantined asset identities: 0/);
  assert.equal(count(f,'tag_run_v2_assets'),3);
  assert.equal(count(f,'tag_run_v2_audit'),1,'same LIB/day is idempotent');
  assert(network.calls.every(c=>!c.url.includes('push_transaction')));
});

test('wallet observation validates entire inventory including beyond first 50',async t=>{
  const f=fixture(t),tokens=Array.from({length:51},(_,i)=>({
    contract:'kingsofgraff',symbol:'A'+String.fromCharCode(65+Math.floor(i/26))+
      String.fromCharCode(65+i%26),precision:4,amount:0
  }));
  tokens[50]={contract:'kingsofgraff',symbol:'LFGK',precision:4,amount:55};
  const network=rpc(tokens);
  const observed=await command(f,'poolobserve',{fetchImpl:network.fetchImpl});
  assert.match(observed.messages[0],/Discovered: 51/);
  assert.equal(count(f,'tag_run_v2_assets'),51);
  assert.equal(network.balances.length,1);
  const bigger=rpc([...tokens,...Array.from({length:50},(_,i)=>({
    contract:'wuffi',symbol:'B'+String.fromCharCode(65+Math.floor(i/26))+
      String.fromCharCode(65+i%26),precision:4,amount:0
  }))]);
  await assert.rejects(command(f,'poolobserve',{fetchImpl:bigger.fetchImpl}),
    /wax_inventory_incomplete_or_excessive/);
  assert.equal(count(f,'tag_run_v2_assets'),51,
    'no unverified subset can be inserted after an oversized inventory');
});

test('poolreview displays token status without approving any token',async t=>{
  const f=fixture(t),network=rpc();
  await command(f,'poolobserve',{fetchImpl:network.fetchImpl});
  const reviewed=await command(f,'poolreview');
  assert.match(reviewed.messages[0],/TOKEN REVIEW QUEUE/);
  assert.match(reviewed.messages[0],/LFGK \(kingsofgraff, 4 decimals\): quarantined/);
  assert.match(reviewed.messages[0],/use \/poolapprove with its review reference/);
  assert.match(reviewed.messages[0],/Use \/poolquarantine with a reason/);
  assert.match(reviewed.messages[0],/Approved tokens use their verified irreversible wallet balance/);
  assert.equal(f.sqlite.prepare(
    "SELECT COUNT(*) AS n FROM tag_run_v2_assets WHERE eligibility='approved'"
  ).get().n,0);
});

test('real Street Cred backfills while pool stays paused and no transfers exist',async t=>{
  const f=fixture(t);
  receipts(f,'2026-11-01',MEMBER,10,11);
  receipts(f,YESTERDAY,'2222',12,12);
  const first=await command(f,'poolbackfill');
  assert.match(first.messages[0],/Last completed UTC day: 2026-11-02/);
  assert.match(first.messages[0],/Real member-day receipts inserted: 2/);
  const repeated=await command(f,'poolbackfill');
  assert.match(repeated.messages[0],/Real member-day receipts inserted: 0/);
  assert.equal(count(f,'tag_run_v2_participation'),2);
  assert.equal(count(f,'tag_run_v2_capture_cursors'),1);
  assert.equal(count(f,'tag_run_v2_draws'),0);
  assert.equal(count(f,'tag_run_v2_bundles'),0);
  assert.equal(f.sqlite.prepare('SELECT status FROM tag_run_v2_pool_config').get().status,
    'paused');
  assert.equal(f.sqlite.prepare('SELECT SUM(spent_historical_weight) AS spent FROM '+
    'tag_run_v2_participation').get().spent,0);
});

test('empty quiet chat still advances real capture cursor with zero participants',async t=>{
  const f=fixture(t);
  const action=await command(f,'poolbackfill');
  assert.match(action.messages[0],/Real member-day receipts inserted: 0/);
  assert.equal(count(f,'tag_run_v2_participation'),0);
  assert.equal(f.sqlite.prepare('SELECT last_completed_day_key FROM '+
    'tag_run_v2_capture_cursors').get().last_completed_day_key,YESTERDAY);
  const status=await command(f,'poolstate');
  assert.match(status.messages[0],/Backfill through 2026-11-02: COMPLETE/);
  assert.match(status.messages[0],/V1 scored messages for 2026-11-02: 0/);
});

test('hypothetical draw blocks until prior real participation is fully captured',async t=>{
  const f=fixture(t),network=rpc();
  receipts(f,'2026-11-01',MEMBER,10,21);
  receipts(f,YESTERDAY,'2222',12,22);
  const blocked=await command(f,'pooltest',{fetchImpl:network.fetchImpl});
  assert.match(blocked.messages[0],/SIMULATION BLOCKED/);
  assert.equal(network.calls.length,0);
  await command(f,'poolbackfill');
  const quarantined=await command(f,'pooltest',{fetchImpl:network.fetchImpl});
  assert.match(quarantined.messages[0],/UNSAVED UNVERIFIED ALLOWLIST WHAT-IF ONLY/);
  assert.match(quarantined.messages[0],/Observed positive tokens: 2/);
  assert.match(quarantined.messages[0],/Approved positive observed: 0/);
  assert.match(quarantined.messages[0],/Quarantined positive excluded: 2/);
  assert.match(quarantined.messages[0],/Hypothetical 1% approved-token pools: none/);
  assert.match(quarantined.messages[0],/Hypothetical bundles: 0/);
  assert.doesNotMatch(quarantined.messages[0],/1000\.0000 LFGK/);
  await command(f,'poolobserve',{fetchImpl:network.fetchImpl});
  // Test-only independent approval on a disposable SQLite database.
  f.sqlite.prepare("UPDATE tag_run_v2_assets SET eligibility='approved',"+
    "reviewed_by='fixture-review',verified_at='2026-11-02' "+
    "WHERE asset_key=?").run(ASSET);
  const simulated=await command(f,'pooltest',{fetchImpl:network.fetchImpl});
  assert.match(simulated.messages[0],/UNSAVED UNVERIFIED ALLOWLIST WHAT-IF ONLY/);
  assert.match(simulated.messages[0],/Current eligible members: 1/);
  assert.match(simulated.messages[0],/Historical eligible members: 1/);
  assert.match(simulated.messages[0],/Approved positive observed: 1/);
  assert.match(simulated.messages[0],/Quarantined positive excluded: 1/);
  assert.match(simulated.messages[0],/1000\.0000 LFGK/);
  assert.doesNotMatch(simulated.messages[0],/1000000\.0000 WUF/);
  assert.match(simulated.messages[0],/No DB draw\/claim\/reserve\/payout is saved/);
  assert.equal(count(f,'tag_run_v2_draws'),0);
  assert.equal(count(f,'tag_run_v2_bundles'),0);
  assert.equal(count(f,'tag_run_v2_snapshots'),0);
});

test('failed blockchain proof or D1 read aborts without installing reward state',async t=>{
  const f=fixture(t);
  const broken=rpc(undefined,{wrongChain:true});
  await assert.rejects(command(f,'poolobserve',{fetchImpl:broken.fetchImpl}),
    /wax_wrong_chain_or_missing_finality/);
  assert.equal(count(f,'tag_run_v2_assets'),0);
  const original=f.DB.prepare.bind(f.DB);
  f.env.DB={prepare(sql){
    if(sql.startsWith("SELECT asset_key FROM tag_run_v2_assets")){
      return {async all(){return {success:false,results:[]};}};
    }
    return original(sql);
  }};
  await assert.rejects(command(f,'poolobserve'),
    /observation_approved_asset_read_unavailable/);
  assert.equal(count(f,'tag_run_v2_draws'),0);
});

test('real Telegram admin authentication and group restrictions are preserved',async t=>{
  const f=fixture(t),network=rpc();
  for(const [user,type] of [[2222,'private'],[1111,'supergroup']]){
    const sent=[];
    const message={
      message_id:90,chat:{id:type==='private'?user:Number(GROUP),type},
      from:{id:user,first_name:'Tester'},text:'/poolobserve'
    };
    const handled=await handleTagRunCommand({message},f.env,{
      fetchImpl:async (url,options)=>{
        if(url.includes('sendMessage')){
          sent.push(JSON.parse(options.body));return {ok:true};
        }
        return network.fetchImpl(url,options);
      }
    });
    assert.equal(handled,true);
    assert.equal(sent.length,1);
    assert.match(sent[0].text,/authorised admins|admin settings/);
  }
  assert.equal(network.balances.length,0);
  const sent=[];
  assert.equal(await handleTagRunCommand({message:{
    message_id:91,chat:{id:1111,type:'private'},
    from:{id:1111,first_name:'Admin'},text:'/poolstate'
  }},f.env,{fetchImpl:async (url,options)=>{
    assert.match(url,/sendMessage/);
    sent.push(JSON.parse(options.body));return {ok:true};
  }}),true);
  assert.match(sent[0].text,/READ-ONLY PILOT/);
});

test('pilot fail-closed when pool config is no longer paused',async t=>{
  const f=fixture(t);
  f.sqlite.exec("UPDATE tag_run_v2_pool_config SET status='review_only'");
  await assert.rejects(command(f,'poolstate'),
    /observation_config_not_paused_and_verified/);
  await assert.rejects(command(f,'poolbackfill'),
    /observation_config_not_paused_and_verified/);
  assert.equal(count(f,'tag_run_v2_capture_cursors'),0);
});

test('all production observation paths are free of WAX transfers and token settlement',()=>{
  const wrangler=read('workers/moonboys-api/wrangler.toml');
  assert.match(wrangler,/TAG_RUN_V2_OBSERVATION_ENABLED = "true"/);
  const source=read('workers/moonboys-api/tag-run/v2-pilot.js');
  assert.doesNotMatch(source,/push_transaction|signTransaction|signing_key|private_key|transfer\(/i);
  assert.match(source,/tag_run_v2_assets/);
  assert.doesNotMatch(source,/INSERT INTO tag_run_v2_snapshots|INSERT INTO tag_run_v2_bundles|INSERT INTO tag_run_v2_draws/);
});


test('resolved failed capture cursor or oldest V1 receipt read cannot skip history',async t=>{
  const f=fixture(t),original=f.DB.prepare.bind(f.DB);
  receipts(f,'2026-11-01',MEMBER,10,331);
  for(const [queryPart,failure] of [
    ['SELECT last_completed_day_key FROM tag_run_v2_capture_cursors',
      {success:false}],
    ['SELECT MIN(day_key) AS first_day FROM tag_run_messages',
      {success:false}]
  ]){
    f.env.DB={prepare(sql){
      if(sql.startsWith(queryPart)){
        return {bind(){return {async first(){return failure;}};}};
      }
      return original(sql);
    }};
    await assert.rejects(command(f,'poolbackfill'),
      /participation_(?:capture_cursor|oldest_source_day)_unavailable/);
    assert.equal(count(f,'tag_run_v2_capture_cursors'),0);
    assert.equal(count(f,'tag_run_v2_participation'),0);
  }
  f.env.DB=f.DB;
  const completed=await command(f,'poolbackfill');
  assert.match(completed.messages[0],/Real member-day receipts inserted: 1/);
  assert.equal(count(f,'tag_run_v2_participation'),1);
});


test('live today Street Cred appears immediately without premature historical weight',async t=>{
  const f=fixture(t);
  receipts(f,'2026-11-03',MEMBER,10,818);
  const state=await command(f,'poolstate');
  assert.match(state.messages[0],/V1 scored messages for 2026-11-02: 0/);
  assert.match(state.messages[0],/V1 scored today \(2026-11-03 UTC\): 1/);
  assert.match(state.messages[0],/Backfill through 2026-11-02: PENDING/);
  const backfilled=await command(f,'poolbackfill');
  assert.match(backfilled.messages[0],/Real member-day receipts inserted: 0/);
  assert.equal(count(f,'tag_run_v2_participation'),0,
    'an unfinished current UTC day is not backfilled as historical participation');
});

test('live inventory uses an alternate Hyperion when the primary returns non-2xx',async t=>{
  const f=fixture(t),network=rpc();
  const fetchImpl=(url,options)=>{
    if(url.startsWith(WAX_HYPERION+'/v2/state/get_tokens')) {
      return Promise.resolve({ok:false,status:503});
    }
    return network.fetchImpl(url,options);
  };
  const observed=await command(f,'poolobserve',{fetchImpl});
  assert.match(observed.messages[0],/LIVE READ-ONLY INVENTORY/);
  assert.equal(count(f,'tag_run_v2_assets'),3);
  assert.equal(network.balances.length,2);
  assert(network.calls.some(x=>x.url.startsWith(WAX_HYPERION_FALLBACKS[0]+
    '/v2/state/get_tokens')));
  assert.equal(count(f,'tag_run_v2_snapshots'),0);
  assert.equal(count(f,'tag_run_v2_draws'),0);
});

test('transport failure on a later inventory page restarts from zero, not a mixed page',async t=>{
  const f=fixture(t),tokens=Array.from({length:51},(_,i)=>({
    contract:'kingsofgraff',
    symbol:'C'+String.fromCharCode(65+Math.floor(i/26))+
      String.fromCharCode(65+i%26),precision:4,amount:0
  }));
  const network=rpc(tokens);
  const calls=[];
  const fetchImpl=(url,options)=>{
    if(url.includes('/v2/state/get_tokens?')){
      calls.push(url);
      if(url.startsWith(WAX_HYPERION+'/') &&
          new URL(url).searchParams.get('skip')==='50') {
        return Promise.resolve({ok:false,status:503});
      }
    }
    return network.fetchImpl(url,options);
  };
  await command(f,'poolobserve',{fetchImpl});
  assert.equal(count(f,'tag_run_v2_assets'),51);
  assert(calls.some(x=>x.startsWith(WAX_HYPERION_FALLBACKS[0]+'/') &&
    new URL(x).searchParams.get('skip')==='0'));
  assert(calls.some(x=>x.startsWith(WAX_HYPERION_FALLBACKS[0]+'/') &&
    new URL(x).searchParams.get('skip')==='50'));
  assert.equal(count(f,'tag_run_v2_draws'),0);
});

test('all inventory providers unavailable leaves all assets and funded ledgers untouched',async t=>{
  const f=fixture(t),network=rpc();
  const fetchImpl=(url,options)=>{
    if(url.includes('/v2/state/get_tokens?')) throw new TypeError('fetch failed');
    return network.fetchImpl(url,options);
  };
  await assert.rejects(command(f,'poolobserve',{fetchImpl}),
    /wax_inventory_unavailable/);
  assert.equal(count(f,'tag_run_v2_assets'),0);
  assert.equal(count(f,'tag_run_v2_audit'),0);
  assert.equal(count(f,'tag_run_v2_draws'),0);
  assert.equal(count(f,'tag_run_v2_bundles'),0);
});

test('malformed successful primary inventory never silently falls back',async t=>{
  const f=fixture(t),network=rpc(),urls=[];
  const fetchImpl=(url,options)=>{
    if(url.includes('/v2/state/get_tokens?')){
      urls.push(url);
      return Promise.resolve({ok:true,json:async()=>({account:TIP_ACCOUNT,tokens:'invalid'})});
    }
    return network.fetchImpl(url,options);
  };
  await assert.rejects(command(f,'poolobserve',{fetchImpl}),
    /wax_inventory_incomplete_or_excessive/);
  assert.equal(urls.length,1);
  assert(urls[0].startsWith(WAX_HYPERION+'/'));
  assert.equal(count(f,'tag_run_v2_assets'),0);
});


test('private /myrewards reads real completed-day unfunded credit with observation on',async t=>{
  const f=fixture(t),messages=[];
  // Source-authoritative completed-day records, never balances or prizes.
  receipts(f,'2026-11-02',MEMBER,12,2301);
  receipts(f,'2026-11-02','2222',10,2302);
  const capture=await saveYesterdayParticipation(f.env,{
    nowMs:NOW,cryptoImpl:webcrypto
  });
  assert.equal(capture.inserted,2);
  // Today's V1 message must not be counted as historical participation.
  receipts(f,'2026-11-03',MEMBER,17,2303);
  const before=f.sqlite.prepare('SELECT total_changes() AS n').get().n;
  const result=await handleTagRunV2Command(f.env,{
    name:'myrewards',isAdmin:false,isPrivate:true,chatId:GROUP,
    telegramId:MEMBER,send:async value=>messages.push(value),nowMs:NOW
  });
  assert.equal(result,true);
  assert.match(messages[0],/READ-ONLY/);
  assert.match(messages[0],/Unfunded participation weight: 12 points/);
  assert.match(messages[0],/Pool: PAUSED.*Draws: OFF.*Transfers: OFF/);
  assert.match(messages[0],/not tokens/);
  assert.equal(f.sqlite.prepare('SELECT total_changes() AS n').get().n,before,
    'member summary is strictly read-only');
  assert.equal(count(f,'tag_run_v2_draws'),0);
  assert.equal(count(f,'tag_run_v2_bundles'),0);
  assert.equal(count(f,'tag_run_v2_snapshots'),0);
});

test('/myrewards never discloses member credit publicly or another member privately',async t=>{
  const f=fixture(t),sent=[];
  f.sqlite.prepare('INSERT INTO tag_run_v2_participation '+
    '(chat_id,day_key,telegram_id,earned_weight,source_receipts_digest) '+
    'VALUES (?,?,?,?,?)').run(GROUP,YESTERDAY,MEMBER,77,'a'.repeat(64));
  const options={name:'myrewards',isAdmin:false,chatId:GROUP,
    telegramId:'2222',send:async message=>sent.push(message)};
  const previousDB=f.env.DB;
  f.env.DB={prepare(){throw Error('no DB read allowed for public /myrewards');}};
  assert.equal(await handleTagRunV2Command(f.env,{
    ...options,isPrivate:false
  }),true);
  assert.match(sent.at(-1),/DM the bot/);
  assert.doesNotMatch(sent.at(-1),/77 points/);
  f.env.DB=previousDB;
  assert.equal(await handleTagRunV2Command(f.env,{
    ...options,isPrivate:true
  }),true);
  assert.match(sent.at(-1),/Unfunded participation weight: 0 points/);
  assert.doesNotMatch(sent.at(-1),/77 points/);
  assert.equal(await handleTagRunV2Command(f.env,{
    ...options,isPrivate:true,telegramId:MEMBER
  }),true);
  assert.match(sent.at(-1),/Unfunded participation weight: 77 points/);
});

test('/myrewards fails closed on bad D1 reads, corrupt weight or unapproved pilot state',async t=>{
  const f=fixture(t),sent=[];
  const options={name:'myrewards',isAdmin:false,isPrivate:true,
    chatId:GROUP,telegramId:MEMBER,send:async message=>sent.push(message)};
  const before=f.env.DB;
  f.env.DB={prepare(sql) {
    if(sql.includes('FROM tag_run_v2_participation'))return {
      bind(){return {async all(){return {success:false,results:[]};}};}
    };
    return before.prepare(sql);
  }};
  await assert.rejects(handleTagRunV2Command(f.env,options),
    /pending_participation_unavailable/);
  assert.equal(sent.length,0);
  f.env.DB=before;
  f.sqlite.prepare('INSERT INTO tag_run_v2_participation '+
    '(chat_id,day_key,telegram_id,earned_weight,spent_historical_weight,'+
    'source_receipts_digest) VALUES (?,?,?,?,?,?)').run(
    GROUP,YESTERDAY,MEMBER,10,0,'a'.repeat(64));
  f.env.DB={prepare(sql) {
    if(sql.includes('FROM tag_run_v2_participation'))return {
      bind(){return {async all(){return {success:true,results:[
        {earned_weight:10,spent_historical_weight:11}
      ]};}};}
    };
    return before.prepare(sql);
  }};
  await assert.rejects(handleTagRunV2Command(f.env,options),
    /pending_participation_invalid/);
  f.env.DB=before;
  f.sqlite.prepare("UPDATE tag_run_v2_pool_config SET status='review_only'").run();
  await assert.rejects(handleTagRunV2Command(f.env,options),
    /not active yet|observation_config_not_paused_and_verified/);
  assert.equal(count(f,'tag_run_v2_draws'),0);
  assert.equal(count(f,'tag_run_v2_bundles'),0);
});

test('/myrewards stays unavailable if independent observation gate is turned off',async t=>{
  const f=fixture(t),sent=[];
  f.env.TAG_RUN_V2_OBSERVATION_ENABLED='false';
  await handleTagRunV2Command(f.env,{
    name:'myrewards',isAdmin:false,isPrivate:true,chatId:GROUP,
    telegramId:MEMBER,send:async message=>sent.push(message)
  });
  assert.match(sent.at(-1),/not active yet/);
  assert.equal(count(f,'tag_run_v2_draws'),0);
});


test('private admin can approve an observed token identity for all wallet funding',async t=>{
  const f=fixture(t),observe=rpc();
  await command(f,'poolobserve',{fetchImpl:observe.fetchImpl});
  const approval=rpc();
  const result=await adminCommand(f,'poolapprove',
    'kingsofgraff LFGK 4 independent-review-1697',
    {fetchImpl:approval.fetchImpl});
  assert.equal(result.result,true);
  assert.match(result.messages[0],/APPROVED FOR COMMUNITY POT/);
  assert.match(result.messages[0],/All irreversible wallet units of this token are eligible/);
  assert.match(result.messages[0],/Draws: OFF · Payouts: OFF/);
  assert.deepEqual(approval.balances,[['kingsofgraff','LFGK']]);
  const asset=f.sqlite.prepare(
    'SELECT eligibility,verified_at,reviewed_by FROM tag_run_v2_assets WHERE asset_key=?'
  ).get(ASSET);
  assert.equal(asset.eligibility,'approved');
  assert.ok(asset.verified_at);
  assert.equal(asset.reviewed_by,'telegram:'+MEMBER);
  const audit=f.sqlite.prepare(
    "SELECT event_key,event_type,reason,reviewed_by FROM tag_run_v2_audit " +
    "WHERE event_type='asset_eligibility_approved'"
  ).get();
  assert.equal(audit.event_type,'asset_eligibility_approved');
  assert.ok(audit.event_key.includes(ASSET));
  assert.ok(audit.reason.includes('asset_key='+ASSET));
  assert.match(audit.reason,/contract=kingsofgraff; symbol=LFGK; precision=4/);
  assert.match(audit.reason,/review=independent-review-1697/);
  assert.match(audit.reason,/all irreversible wallet units become Community Pot eligible; contract approval remains separate/);
  assert.equal(audit.reviewed_by,'telegram:'+MEMBER);
  assert.equal(count(f,'tag_run_v2_deposits'),0);
});

test('approval is private-admin only, paused-only and fails closed on chain mismatch',async t=>{
  const f=fixture(t),observe=rpc();
  await command(f,'poolobserve',{fetchImpl:observe.fetchImpl});
  for(const access of [
    {isAdmin:false,isPrivate:true},
    {isAdmin:true,isPrivate:false}
  ]){
    const network=rpc();
    const result=await adminCommand(f,'poolapprove',
      'kingsofgraff LFGK 4 review-1697',{...access,fetchImpl:network.fetchImpl});
    assert.match(result.messages[0],/authorised bot DMs/);
    assert.equal(network.calls.length,0);
  }
  f.sqlite.exec("UPDATE tag_run_v2_pool_config SET status='review_only'");
  const paused=rpc();
  const blocked=await adminCommand(f,'poolapprove',
    'kingsofgraff LFGK 4 review-1697',{fetchImpl:paused.fetchImpl});
  assert.match(blocked.messages[0],/must be paused/);
  assert.equal(paused.calls.length,0);
  f.sqlite.exec("UPDATE tag_run_v2_pool_config SET status='paused'");
  const wrong=rpc(undefined,{wrongChain:true});
  const failed=await adminCommand(f,'poolapprove',
    'kingsofgraff LFGK 4 review-1697',{fetchImpl:wrong.fetchImpl});
  assert.match(failed.messages[0],/live WAX chain and token identity recheck failed/);
  assert.equal(f.sqlite.prepare(
    'SELECT eligibility FROM tag_run_v2_assets WHERE asset_key=?'
  ).get(ASSET).eligibility,'quarantined');
  assert.equal(f.sqlite.prepare(
    "SELECT COUNT(*) AS n FROM tag_run_v2_audit " +
    "WHERE event_type LIKE 'asset_eligibility_%'"
  ).get().n,0);
});

test('private admin quarantine is immediate and has no network dependency',async t=>{
  const f=fixture(t),observe=rpc();
  await command(f,'poolobserve',{fetchImpl:observe.fetchImpl});
  await adminCommand(f,'poolapprove',
    'kingsofgraff LFGK 4 review-1697',{fetchImpl:rpc().fetchImpl});
  let networkCalls=0;
  const result=await adminCommand(f,'poolquarantine',
    'kingsofgraff LFGK 4 emergency transfer restrictions changed',{
      fetchImpl:async()=>{networkCalls++;throw Error('must not call network');}
    });
  assert.equal(result.result,true);
  assert.equal(networkCalls,0);
  assert.match(result.messages[0],/QUARANTINED NOW/);
  assert.match(result.messages[0],/Future snapshot, draw and send eligibility checks will reject/);
  const asset=f.sqlite.prepare(
    'SELECT eligibility,verified_at,reviewed_by FROM tag_run_v2_assets WHERE asset_key=?'
  ).get(ASSET);
  assert.equal(asset.eligibility,'quarantined');
  assert.equal(asset.verified_at,null);
  assert.equal(asset.reviewed_by,'telegram:'+MEMBER);
  const audit=f.sqlite.prepare(
    "SELECT event_key,reason FROM tag_run_v2_audit " +
    "WHERE event_type='asset_eligibility_quarantined'"
  ).get();
  assert.ok(audit.event_key.includes(ASSET));
  assert.ok(audit.reason.includes('asset_key='+ASSET));
  assert.match(audit.reason,/contract=kingsofgraff; symbol=LFGK; precision=4/);
  assert.match(audit.reason,/emergency transfer restrictions changed/);
});

test('asset admin commands reject malformed identities and preserve state',async t=>{
  const f=fixture(t),network=rpc();
  await command(f,'poolobserve',{fetchImpl:network.fetchImpl});
  for(const [name,args] of [
    ['poolapprove','kingsofgraff lfgk 4 review-1697'],
    ['poolapprove','kingsofgraff LFGK 9 review-1697'],
    ['poolapprove','kingsofgraff LFGK 4 has spaces'],
    ['poolquarantine','kingsofgraff LFGK 4 no']
  ]){
    const result=await adminCommand(f,name,args,{fetchImpl:network.fetchImpl});
    assert.match(result.messages[0],/Usage:/);
  }
  assert.equal(f.sqlite.prepare(
    'SELECT eligibility FROM tag_run_v2_assets WHERE asset_key=?'
  ).get(ASSET).eligibility,'quarantined');
  assert.equal(f.sqlite.prepare(
    "SELECT COUNT(*) AS n FROM tag_run_v2_audit " +
    "WHERE event_type LIKE 'asset_eligibility_%'"
  ).get().n,0);
});


test('asset eligibility and audit change roll back together on audit failure',async t=>{
  const f=fixture(t),observe=rpc();
  await command(f,'poolobserve',{fetchImpl:observe.fetchImpl});
  f.sqlite.exec(
    "CREATE TRIGGER fail_asset_approval_audit BEFORE INSERT ON tag_run_v2_audit " +
    "WHEN NEW.event_type='asset_eligibility_approved' BEGIN " +
    "SELECT RAISE(ABORT,'forced audit failure'); END;"
  );
  const result=await adminCommand(f,'poolapprove',
    'kingsofgraff LFGK 4 rollback-review-1697',{fetchImpl:rpc().fetchImpl});
  assert.match(result.messages[0],/failed atomically/);
  assert.equal(f.sqlite.prepare(
    'SELECT eligibility FROM tag_run_v2_assets WHERE asset_key=?'
  ).get(ASSET).eligibility,'quarantined');
  assert.equal(f.sqlite.prepare(
    "SELECT COUNT(*) AS n FROM tag_run_v2_audit WHERE event_type='asset_eligibility_approved'"
  ).get().n,0);
});

test('top-level Telegram handler forwards asset command arguments',async t=>{
  const f=fixture(t),observe=rpc();
  await command(f,'poolobserve',{fetchImpl:observe.fetchImpl});
  const network=rpc(),sent=[];
  const handled=await handleTagRunCommand({message:{
    message_id:501,chat:{id:Number(MEMBER),type:'private'},
    from:{id:Number(MEMBER),first_name:'Admin'},
    text:'/poolapprove kingsofgraff LFGK 4 handler-review-1697'
  }},f.env,{fetchImpl:async (url,options)=>{
    if(url.includes('sendMessage')){
      sent.push(JSON.parse(options.body));return {ok:true};
    }
    return network.fetchImpl(url,options);
  }});
  assert.equal(handled,true);
  assert.match(sent[0].text,/APPROVED FOR COMMUNITY POT/);
  assert.equal(f.sqlite.prepare(
    'SELECT eligibility FROM tag_run_v2_assets WHERE asset_key=?'
  ).get(ASSET).eligibility,'approved');
});
