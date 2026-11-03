import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import {
  TIP_ACCOUNT, WAX_MAINNET_CHAIN_ID, assetKey, parseIntegerUnits, parseQuantity,
  formatQuantity, eligibleAsset, validUtcDay, sha256Text, previewCommunityDraw
} from '../workers/moonboys-api/tag-run/v2-core.js';
import {
  readWaxTipAccount, discoverWaxTipTokens
} from '../workers/moonboys-api/tag-run/v2-chain.js';
import {
  saveYesterdayParticipation, handleTagRunV2Command
} from '../workers/moonboys-api/tag-run/v2-service.js';
import { handleTagRunCommand } from '../workers/moonboys-api/tag-run/handler.js';
import {
  readInboundTipReceipts, quarantineInboundTipReceipts
} from '../workers/moonboys-api/tag-run/v2-deposits.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const V1 = read('workers/moonboys-api/migrations/103_tag_run_street_cred_rewards.sql');
const V2 = read('workers/moonboys-api/migrations/104_tag_run_v2_community_token_pot.sql');
const GROUP = '-1001234567890';
const ASSET = (contract='kingsofgraff',symbol='LFGK',precision=4) => ({
  contract,symbol,precision,key:assetKey(contract,symbol,precision),
  balanceUnits:'1000000',reservedUnits:'0',excludedUnits:'0',
  approved:true,confirmed:true
});
const SEED = 'bc'.repeat(32);
const DAY = '2026-11-02';

test('locked wallet, chain, new migration and disabled V2 execution flags',()=>{
  assert.equal(TIP_ACCOUNT,'isthatajoint');
  assert.match(WAX_MAINNET_CHAIN_ID,/^[0-9a-f]{64}$/);
  const flags=read('workers/moonboys-api/wrangler.toml');
  for(const key of ['TAG_RUN_V2_POOL_ENABLED','TAG_RUN_V2_DRAWS_ENABLED',
    'TAG_RUN_V2_PAYOUTS_ENABLED']) {
    assert.match(flags,new RegExp(key + ' = "false"'));
  }
  assert.match(flags,/TAG_RUN_V2_TIP_ACCOUNT = "isthatajoint"/);
  assert.match(flags,/10 0 \* \* \*/);
  assert.match(V2,/CREATE TABLE IF NOT EXISTS tag_run_v2_participation/);
  assert.match(V2,/CHECK\(status='preview_only'\)/);
  assert.doesNotMatch(V2,/private_key|wax_secret|transact\(|\bSIGNER\b/i);
  assert.doesNotMatch(read('workers/moonboys-api/tag-run/v2-chain.js'),
    /\/v1\/chain\/push_transaction|\/transfer\b|private_key|seed_phrase/i);
  assert.match(read('scripts/ci-domain-runner.mjs'),
    /tag-run-v2-community-pot\.test\.mjs/);
  const evidence=JSON.parse(read('deployments/d1-evidence-request.json'));
  const production=JSON.parse(read('deployments/production.json'));
  for(const names of [evidence.required_migrations,
    production.d1_databases.wikicoms.required_migrations]) {
    assert(names.includes('104_tag_run_v2_community_token_pot.sql'));
  }
  assert.match(read('.github/workflows/d1-production-migration-verify.yml'),
    /104_tag_run_v2_community_token_pot\.sql/);
});

test('pure BigInt math never uses USD prices or floating-point token math',()=>{
  const a=eligibleAsset({...ASSET(), balanceUnits:'100000000000000000000000000000',
    reservedUnits:'80000000000000000000000000000',
    excludedUnits:'0'});
  assert.equal(a.availableUnits,'20000000000000000000000000000');
  assert.equal(a.dailyBudgetUnits,'1000000000000000000000000000');
  const b=eligibleAsset({...ASSET(),balanceUnits:'1001',reservedUnits:'1',
    excludedUnits:'1'});
  assert.equal(b.dailyBudgetUnits,'49'); // floor(999 * 0.05)
  assert.equal(eligibleAsset({...ASSET(),balanceUnits:'1'}).dailyBudgetUnits,'0');
  assert.throws(()=>eligibleAsset({...ASSET(),balanceUnits:'10',
    reservedUnits:'11'}),/treasury_balance_deficit/);
  assert.throws(()=>eligibleAsset({...ASSET(),approved:false}),/asset_not_approved/);
  assert.throws(()=>parseIntegerUnits('1.5'),/invalid_token_units/);
  assert.throws(()=>parseIntegerUnits('0001'),/invalid_token_units/);
  assert.throws(()=>parseIntegerUnits('-1'),/invalid_token_units/);
  assert.equal(parseQuantity('12.3456 LFGK',4,'LFGK'),'123456');
  assert.equal(parseQuantity('12 WAX',0,'WAX'),'12');
  assert.equal(formatQuantity('123456',4,'LFGK'),'12.3456 LFGK');
  assert.throws(()=>parseQuantity('0.01 WAX',0,'WAX'),/invalid_token_precision/);
  assert.throws(()=>parseQuantity('1.00000 LFGK',4,'LFGK'),/invalid_token_quantity/);
  assert.equal(validUtcDay('2026-11-02'),true);
  assert.equal(validUtcDay('2026-02-30'),false);
  assert.equal(validUtcDay('not-a-day'),false);
});

test('same token symbol at different contracts is a separate asset',()=>{
  assert.notEqual(assetKey('kingsofgraff','LFGK',4),assetKey('otherissuer','LFGK',4));
  assert.match(assetKey('kingsofgraff','LFGK',4),new RegExp('^'+WAX_MAINNET_CHAIN_ID));
  assert.throws(()=>assetKey('bad!contract','LFGK',4),/invalid_token_identity/);
});

test('deterministic mixed token draw never allocates over 5% per asset',async()=>{
  const assets=[ASSET(),ASSET('eosio.token','WAX',8)];
  const current=[{telegramId:'1111',points:150},{telegramId:'2222',points:40}];
  const historical=[{telegramId:'3333',points:1000},{telegramId:'4444',points:50}];
  const input={day:DAY,assets,current,historical,seedHex:SEED,cryptoImpl:webcrypto};
  const first=await previewCommunityDraw(input);
  const again=await previewCommunityDraw(input);
  assert.deepEqual(first,again,'same snapshots and seed must replay exactly');
  assert.equal(first.status,'preview_only');
  assert.equal(first.budgets.length,2);
  assert.equal(first.bundles.length,40);
  for(const b of first.budgets){
    const bundles=first.bundles.filter(x=>x.assetKey===b.key);
    assert.equal(bundles.reduce((sum,x)=>sum+BigInt(x.units),0n),
      BigInt(b.dailyBudgetUnits));
    assert(bundles.every(x=>x.status==='preview_only'));
    assert(bundles.some(x=>x.pool==='historical'));
    assert(bundles.some(x=>x.pool==='current'));
    assert(bundles.every(x=>['historical','current'].includes(x.pool)));
  }
  assert.equal(first.seedCommitment,await sha256Text(SEED,webcrypto));
  assert.notDeepEqual((await previewCommunityDraw({...input,
    seedHex:'ad'.repeat(32)})).bundles,first.bundles,
    'different seeds should change at least some winners');
  await assert.rejects(previewCommunityDraw({...input,assets:[assets[0],assets[0]]}),
    /duplicate_asset/);
});

test('empty token pot retains participants without inventing payouts',async()=>{
  const base={day:DAY,seedHex:SEED,cryptoImpl:webcrypto};
  const a=await previewCommunityDraw({...base,assets:[],
    current:[{telegramId:'1111',points:20}],historical:[]});
  assert.equal(a.bundles.length,0);
  assert.equal(a.eligibleCurrent,1);
  const b=await previewCommunityDraw({...base,assets:[ASSET()],
    current:[],historical:[]});
  assert.equal(b.bundles.length,0);
  const c=await previewCommunityDraw({...base,assets:[ASSET()],
    current:[],historical:[{telegramId:'1111',points:20}]});
  assert(c.bundles.length>0);
  assert(c.bundles.every(x=>x.pool==='historical'));
});

test('large balances and indivisible dust never overpay',async()=>{
  const a=ASSET('eosio.token','WAX',8);
  a.balanceUnits='1000000000000000000000000';
  const result=await previewCommunityDraw({day:DAY,seedHex:SEED,
    cryptoImpl:webcrypto,assets:[a],
    current:[{telegramId:'1111',points:10}],historical:[]});
  assert.equal(result.bundles.reduce((x,b)=>x+BigInt(b.units),0n),
    BigInt(result.budgets[0].dailyBudgetUnits));
  const tiny=await previewCommunityDraw({day:DAY,seedHex:SEED,
    cryptoImpl:webcrypto,assets:[{...ASSET(),balanceUnits:'19'}],
    current:[{telegramId:'1111',points:10}],historical:[]});
  assert.equal(tiny.bundles.length,0);
});

function rpcFixture({wrongChain=false,wrongAccount=false,
  failBalance=false,reportedPrecision=4,balanceQuantity='12.3456 LFGK'}={}){
  const calls=[];
  const fetchImpl=async (url,opts={})=>{
    calls.push({url,options:opts});
    if(url.endsWith('/get_info')) return {ok:true,json:async()=>({
      chain_id:wrongChain?'wrong':WAX_MAINNET_CHAIN_ID,
      last_irreversible_block_num:12345
    })};
    if(url.endsWith('/get_account')) return {ok:true,json:async()=>({
      account_name:wrongAccount?'different':TIP_ACCOUNT
    })};
    if(url.includes('/v2/state/get_tokens?')) return {ok:true,json:async()=>({
      tokens:[{contract:'kingsofgraff',symbol:'LFGK',precision:reportedPrecision,amount:123456},
        {contract:'scamtoken123',symbol:'SCAM',precision:4,amount:1}]
    })};
    if(url.endsWith('/get_currency_balance'))return {ok:!failBalance,
      json:async()=>[balanceQuantity]};
    throw new Error('unexpected_network_call');
  };
  return {calls,fetchImpl};
}
test('WAX account is discovered read-only and unknown tokens quarantined',async()=>{
  const rpc=rpcFixture();
  const inventory=await discoverWaxTipTokens({fetchImpl:rpc.fetchImpl,
    approvedAssets:[assetKey('kingsofgraff','LFGK',4)]});
  assert.equal(inventory.account,'isthatajoint');
  assert.equal(inventory.custodyVerified,false);
  assert.equal(inventory.snapshotFinalityVerified,false);
  assert.equal(inventory.assets.length,2);
  const [approved,unknown]=inventory.assets;
  assert.equal(approved.balanceUnits,'123456');
  assert.equal(approved.status,'observed_only');
  assert.equal(approved.confirmed,false);
  assert.equal(unknown.status,'quarantined_unknown_token');
  assert.equal(rpc.calls.filter(x=>x.url.endsWith('/get_currency_balance')).length,1,
    'never query unapproved token contracts');
  assert(rpc.calls.every(x=>!x.url.includes('push_transaction')));
});
test('chain balances reject mismatched token precision instead of padding units',async()=>{
  await assert.rejects(discoverWaxTipTokens({
    fetchImpl:rpcFixture({reportedPrecision:8}).fetchImpl,
    approvedAssets:[assetKey('kingsofgraff','LFGK',8)]
  }),/wax_currency_precision_mismatch/);
  await assert.rejects(discoverWaxTipTokens({
    fetchImpl:rpcFixture({reportedPrecision:4,balanceQuantity:'12.345 LFGK'}).fetchImpl,
    approvedAssets:[assetKey('kingsofgraff','LFGK',4)]
  }),/wax_currency_precision_mismatch/);
});
test('WAX RPC wrong chain/account or balance outage fails closed',async()=>{
  await assert.rejects(readWaxTipAccount({fetchImpl:rpcFixture({wrongChain:true}).fetchImpl}),
    /wax_wrong_chain/);
  await assert.rejects(readWaxTipAccount({fetchImpl:rpcFixture({wrongAccount:true}).fetchImpl}),
    /wax_tip_account_missing/);
  await assert.rejects(discoverWaxTipTokens({
    fetchImpl:rpcFixture({failBalance:true}).fetchImpl,
    approvedAssets:[assetKey('kingsofgraff','LFGK',4)]
  }),/wax_currency_balance_unavailable/);
});

function fixture(t){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON;');
  sqlite.exec(V1);
  sqlite.exec(V2);
  const DB={prepare(query){return {
    bind(...args){return {
      async all(){return {success:true,results:sqlite.prepare(query).all(...args)};},
      async first(){return sqlite.prepare(query).get(...args)||null;},
      async run(){const r=sqlite.prepare(query).run(...args);
        return {success:true,meta:{changes:r.changes}};}
    };},
    async first(){return sqlite.prepare(query).get()||null;},
    async run(){const r=sqlite.prepare(query).run();
      return {success:true,meta:{changes:r.changes}};},
    async all(){return {success:true,results:sqlite.prepare(query).all()};}
  };}};
  const env={DB,TAG_RUN_ENABLED:'true',TAG_RUN_V2_POOL_ENABLED:'true',
    TAG_RUN_V2_TIP_ACCOUNT:TIP_ACCOUNT,TELEGRAM_GROUP_CHAT_ID:GROUP};
  t.after(()=>sqlite.close());
  return {sqlite,DB,env};
}
test('additive migration preserves existing V1 records and starts paused',t=>{
  const f=fixture(t);
  const cfg=f.sqlite.prepare('SELECT * FROM tag_run_v2_pool_config').get();
  assert.equal(cfg.wallet_account,TIP_ACCOUNT);
  assert.equal(cfg.daily_bps,500);
  assert.equal(cfg.historical_ticket_bps,5000);
  assert.equal(cfg.status,'paused');
  assert.equal(f.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM tag_run_weekly_plans').get().n,0);
  assert.throws(()=>f.sqlite.exec(
    "INSERT INTO tag_run_v2_bundles(chat_id,day_key,asset_key,bundle_index,telegram_id,ticket_class,units,status) VALUES('x','2026-11-02','y',1,'123','current','1','paid')"
  ),/CHECK constraint failed|FOREIGN KEY constraint failed/);
});
test('yesterday participation is unique, idempotent and carries unfunded weight',async t=>{
  const f=fixture(t);
  const now=Date.parse('2026-11-03T00:10:00.000Z');
  f.sqlite.exec("UPDATE tag_run_v2_pool_config SET status='read_only'");
  const stmt=f.sqlite.prepare('INSERT INTO tag_run_messages '+
    '(chat_id,message_id,telegram_id,display_name,day_key,week_key,message_unix,content_hash,points) '+
    'VALUES (?,?,?,?,?,?,?,?,?)');
  stmt.run(GROUP,1,'1111','First','2026-11-02','2026-11-02',1793577600,'unique-hash-one',10);
  stmt.run(GROUP,2,'1111','First','2026-11-02','2026-11-02',1793577650,'unique-hash-two',12);
  stmt.run(GROUP,3,'2222','Second','2026-11-02','2026-11-02',1793577700,'unique-hash-three',10);
  const first=await saveYesterdayParticipation(f.env,{nowMs:now,cryptoImpl:webcrypto});
  assert.deepEqual(first,{status:'recorded',day:DAY,eligible:2,inserted:2,
    processedDays:1,backlogRemaining:false});
  const repeat=await saveYesterdayParticipation(f.env,{nowMs:now,cryptoImpl:webcrypto});
  assert.equal(repeat.inserted,0);
  const rows=f.sqlite.prepare('SELECT telegram_id,earned_weight,spent_historical_weight '+
    'FROM tag_run_v2_participation ORDER BY telegram_id').all();
  assert.deepEqual(rows.map(x=>[x.telegram_id,x.earned_weight,x.spent_historical_weight]),
    [['1111',22,0],['2222',10,0]]);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM tag_run_v2_bundles').get().n,0);
});
test('V2 bot commands are closed without feature flag and paused by default',async t=>{
  const f=fixture(t);
  const replies=[];
  const opt={name:'pool',isAdmin:false,isPrivate:false,chatId:GROUP,
    telegramId:'1111',send:async text=>replies.push(text)};
  f.env.TAG_RUN_V2_POOL_ENABLED='false';
  assert.equal(await handleTagRunV2Command(f.env,opt),true);
  assert.match(replies.at(-1),/not active yet/);
  f.env.TAG_RUN_V2_POOL_ENABLED='true';
  assert.equal(await handleTagRunV2Command(f.env,opt),true);
  assert.match(replies.at(-1),/Do not send tokens yet/);
  assert.equal(await handleTagRunV2Command(f.env,{
    ...opt,name:'drawpreview'
  }),true);
  assert.match(replies.at(-1),/restricted/);
});

function incomingRpcFixture({pastLib=false,unknownBlock=false,
  invalidBlockReply=false,blockUnavailable=false,twoActions=false}={}){
  const calls=[];
  // Raw Hyperion actions include 'actions' and no 'irreversible' or block_id.
  const action={
    act:{account:'kingsofgraff',name:'transfer',
      data:{from:'somewallet11',to:TIP_ACCOUNT,
        quantity:'7.0000 LFGK',memo:'Community tip'}},
    block_num:pastLib?12346:123,trx_id:'b'.repeat(64),
    global_sequence:'555'
  };
  if(unknownBlock)action.block_id='c'.repeat(64);
  const actions=[action];
  if(twoActions)actions.push({...action,
    trx_id:'d'.repeat(64),global_sequence:'556'});
  const fetchImpl=async (url,opts={})=>{
    calls.push({url,options:opts});
    if(url.endsWith('/get_info'))return {ok:true,json:async()=>({
      chain_id:WAX_MAINNET_CHAIN_ID,last_irreversible_block_num:12345
    })};
    if(url.endsWith('/get_account'))return {ok:true,
      json:async()=>({account_name:TIP_ACCOUNT})};
    if(url.endsWith('/get_block'))return {ok:!blockUnavailable,
      json:async()=>({id:'a'.repeat(64),
        block_num:invalidBlockReply?124:123})};
    if(url.includes('/v2/history/get_actions?'))return {
      ok:true,json:async()=>({actions})
    };
    throw Error('unexpected RPC '+url);
  };
  return {fetchImpl,calls};
}
test('read-only incoming transfers require WAX LIB and are quarantined',async t=>{
  const f=fixture(t);
  f.sqlite.exec("UPDATE tag_run_v2_pool_config SET status='read_only'");
  const rpc=incomingRpcFixture();
  const first=await readInboundTipReceipts({fetchImpl:rpc.fetchImpl,
    cryptoImpl:webcrypto});
  assert.equal(first.receipts.length,1);
  assert.equal(first.receipts[0].blockId,'a'.repeat(64));
  const historyUrl=rpc.calls.find(c=>c.url.includes('/v2/history/get_actions?'))?.url;
  assert(historyUrl,'Hyperion raw get_actions request must be issued');
  const params=new URL(historyUrl).searchParams;
  assert.equal(params.get('simple'),null,'raw action mode cannot be simple');
  assert.equal(params.get('checkLib'),'true');
  assert.equal(rpc.calls.filter(c=>c.url.endsWith('/get_block')).length,1,
    'read verified block provenance from chain RPC');
  assert.equal(first.receipts[0].assetKey,
    assetKey('kingsofgraff','LFGK',4));
  assert.equal(first.receipts[0].units,'70000');
  assert.equal(first.receipts[0].status,'quarantined');
  assert.equal(first.receipts[0].memoDigest.length,64);
  const recorded=await quarantineInboundTipReceipts(f.env,{
    fetchImpl:rpc.fetchImpl,cryptoImpl:webcrypto
  });
  assert.deepEqual({status:recorded.status,inserted:recorded.inserted},
    {status:'quarantined_review_only',inserted:1});
  const repeated=await quarantineInboundTipReceipts(f.env,{
    fetchImpl:rpc.fetchImpl,cryptoImpl:webcrypto
  });
  assert.equal(repeated.inserted,0,'same global sequence can only be ingested once');
  const deposit=f.sqlite.prepare('SELECT status,units FROM tag_run_v2_deposits').get();
  assert.equal(deposit.status,'quarantined');
  assert.equal(deposit.units,'70000');
  assert.equal(f.sqlite.prepare('SELECT eligibility FROM tag_run_v2_assets').get().eligibility,
    'quarantined');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM tag_run_v2_bundles').get().n,0);
  assert(rpc.calls.every(c=>!c.url.includes('push_transaction')));
});
test('non-LIB or mismatched block actions cannot create donations',async()=>{
  const nonFinal=await readInboundTipReceipts({
    fetchImpl:incomingRpcFixture({pastLib:true}).fetchImpl,
    cryptoImpl:webcrypto
  });
  assert.equal(nonFinal.receipts.length,0,
    'block number beyond independently checked LIB is never ingested');
  const conflicting=await readInboundTipReceipts({
    fetchImpl:incomingRpcFixture({unknownBlock:true}).fetchImpl,
    cryptoImpl:webcrypto
  });
  assert.equal(conflicting.receipts.length,0,
    'provider block ID mismatch is rejected');
  await assert.rejects(readInboundTipReceipts({
    fetchImpl:incomingRpcFixture({invalidBlockReply:true}).fetchImpl,
    cryptoImpl:webcrypto
  }),/wax_irreversible_block_mismatch/);
  await assert.rejects(readInboundTipReceipts({
    fetchImpl:incomingRpcFixture({blockUnavailable:true}).fetchImpl,
    cryptoImpl:webcrypto
  }),/wax_irreversible_block_unavailable/);
});
test('full Hyperion actions from the same block reuse one WAX block check',async()=>{
  const rpc=incomingRpcFixture({twoActions:true});
  const scan=await readInboundTipReceipts({
    fetchImpl:rpc.fetchImpl,cryptoImpl:webcrypto
  });
  assert.equal(scan.receipts.length,2);
  assert.equal(rpc.calls.filter(c=>c.url.endsWith('/get_block')).length,1);
  assert(scan.receipts.every(r=>r.status==='quarantined'));
});

test('checkpoint outage retries set-based participation writes without duplicates',async t=>{
  const f=fixture(t);
  f.sqlite.exec("UPDATE tag_run_v2_pool_config SET status='read_only'");
  const sql='INSERT INTO tag_run_messages '+
    '(chat_id,message_id,telegram_id,display_name,day_key,week_key,message_unix,content_hash,points) '+
    'VALUES (?,?,?,?,?,?,?,?,?)';
  const insert=f.sqlite.prepare(sql);
  insert.run(GROUP,71,'1111','First','2026-11-02','2026-11-02',1793577600,'retry-one',10);
  insert.run(GROUP,72,'2222','Second','2026-11-02','2026-11-02',1793577700,'retry-two',10);
  const original=f.DB.prepare.bind(f.DB);
  let thrown=false;
  f.env.DB={
    prepare(query){
      const statement=original(query);
      if(!query.startsWith('INSERT INTO tag_run_v2_capture_cursors'))return statement;
      return {
        bind(...args){
          const bound=statement.bind(...args);
          return {
            async run(){
              if(!thrown){thrown=true;throw Error('simulated_checkpoint_outage');}
              return bound.run();
            }
          };
        }
      };
    }
  };
  const nowMs=Date.parse('2026-11-03T00:10:00.000Z');
  await assert.rejects(saveYesterdayParticipation(f.env,{
    nowMs,cryptoImpl:webcrypto
  }),/simulated_checkpoint_outage/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM tag_run_v2_participation')
    .get().n,2,'set-based member write can commit before cursor failure');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM tag_run_v2_capture_cursors')
    .get().n,0,'cursor cannot claim the day complete');
  f.env.DB=f.DB;
  const result=await saveYesterdayParticipation(f.env,{
    nowMs,cryptoImpl:webcrypto
  });
  assert.equal(result.inserted,0,'retry cannot double-count the two existing members');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM tag_run_v2_participation')
    .get().n,2);
  assert.equal(f.sqlite.prepare('SELECT last_completed_day_key FROM tag_run_v2_capture_cursors')
    .get().last_completed_day_key,'2026-11-02');
});
test('backfill cursor also advances across empty days before current day',async t=>{
  const f=fixture(t);
  f.sqlite.exec("UPDATE tag_run_v2_pool_config SET status='read_only'");
  const sql='INSERT INTO tag_run_messages '+
    '(chat_id,message_id,telegram_id,display_name,day_key,week_key,message_unix,content_hash,points) '+
    'VALUES (?,?,?,?,?,?,?,?,?)';
  const insert=f.sqlite.prepare(sql);
  insert.run(GROUP,81,'1111','First','2026-10-30','2026-10-26',1793320000,'backfill-one',10);
  insert.run(GROUP,82,'2222','Second','2026-11-02','2026-11-02',1793577700,'backfill-two',10);
  const result=await saveYesterdayParticipation(f.env,{
    nowMs:Date.parse('2026-11-03T00:10:00.000Z'),cryptoImpl:webcrypto
  });
  assert.equal(result.processedDays,4,'October 30, 31 and November 1, 2');
  assert.equal(result.eligible,2);
  assert.equal(result.inserted,2);
  assert.equal(result.backlogRemaining,false);
  assert.equal(f.sqlite.prepare('SELECT last_completed_day_key FROM tag_run_v2_capture_cursors')
    .get().last_completed_day_key,'2026-11-02');
  const next=await saveYesterdayParticipation(f.env,{
    nowMs:Date.parse('2026-11-04T00:10:00.000Z'),cryptoImpl:webcrypto
  });
  assert.equal(next.processedDays,1,'empty Nov 3 still gets a completion checkpoint');
  assert.equal(next.inserted,0);
  assert.equal(f.sqlite.prepare('SELECT last_completed_day_key FROM tag_run_v2_capture_cursors')
    .get().last_completed_day_key,'2026-11-03');
});

test('half historical ticket probability gives old members a chance with one token unit',async()=>{
  const a={...ASSET(),balanceUnits:'20'};
  let sawHistorical=false,sawCurrent=false;
  for(let i=0;i<32;i++){
    const result=await previewCommunityDraw({
      day:DAY,seedHex:i.toString(16).padStart(64,'0'),
      cryptoImpl:webcrypto,assets:[a],
      current:[{telegramId:'1111',points:10}],
      historical:[{telegramId:'2222',points:10}]
    });
    assert.equal(result.bundles.length,1);
    assert.equal(result.bundles[0].units,'1');
    sawHistorical ||= result.bundles[0].pool==='historical';
    sawCurrent ||= result.bundles[0].pool==='current';
  }
  assert.equal(sawHistorical,true,'historical weighted members can win even one unit');
  assert.equal(sawCurrent,true,'current members retain a fair chance');
});

test('V2 command failures are awaited and return the established temporary error',async t=>{
  const f=fixture(t);
  f.env.TELEGRAM_BOT_TOKEN='123456:unit-test-only';
  f.env.TELEGRAM_BOT_USERNAME='WIKICOMSBOT';
  const original=f.DB.prepare.bind(f.DB);
  f.env.DB={ prepare(sql){
    if (sql.includes('FROM tag_run_v2_pool_config')) {
      return { async first(){ throw new Error('simulated_v2_database_failure'); } };
    }
    return original(sql);
  }};
  for(const text of ['/pool','/rewards']){
    const sent=[];
    const update={message:{
      message_id:42,chat:{id:Number(GROUP),type:'supergroup'},
      from:{id:1111,first_name:'Community Tester'},text
    }};
    const handled=await handleTagRunCommand(update,f.env,{
      fetchImpl:async (url,options)=>{
        assert.match(url,/\/sendMessage$/);
        sent.push(JSON.parse(options.body));
        return {ok:true};
      }
    });
    assert.equal(handled,true);
    assert.equal(sent.length,1,'each failed command gets one fallback reply');
    assert.match(sent[0].text,/TAG RUN is temporarily unavailable/);
  }
});

test('/pool displays newest verified snapshot per approved asset, not latest 20 rows',async t=>{
  const f=fixture(t);
  f.sqlite.exec("UPDATE tag_run_v2_pool_config SET status='read_only'");
  const assets=[
    {key:assetKey('kingsofgraff','LFGK',4),contract:'kingsofgraff',
      symbol:'LFGK',precision:4},
    {key:assetKey('eosio.token','WAX',8),contract:'eosio.token',
      symbol:'WAX',precision:8}
  ];
  const assetInsert=f.sqlite.prepare(
    'INSERT INTO tag_run_v2_assets '+
    '(asset_key,chain_id,token_contract,token_symbol,token_precision,eligibility) '+
    "VALUES (?,?,?,?,?,'approved')"
  );
  for(const a of assets)assetInsert.run(a.key,WAX_MAINNET_CHAIN_ID,
    a.contract,a.symbol,a.precision);
  const insert=f.sqlite.prepare(
    'INSERT INTO tag_run_v2_snapshots '+
    '(chat_id,day_key,asset_key,wallet_account,chain_irreversible_block,'+
    'chain_block_id,onchain_units,allocated_unpaid_units,excluded_units,'+
    'spendable_units,five_percent_units,snapshot_digest,status) '+
    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'verified')"
  );
  const start=Date.parse('2026-10-10T00:00:00.000Z');
  for(let i=0;i<22;i++){
    const day=new Date(start+i*86400000).toISOString().slice(0,10);
    insert.run(GROUP,day,assets[0].key,TIP_ACCOUNT,123,
      'a'.repeat(64),'1000000','0','0',String(1000+i),'50',
      'test-digest-'+i);
  }
  insert.run(GROUP,'2026-10-09',assets[1].key,TIP_ACCOUNT,123,
    'a'.repeat(64),'1000000','0','0','789','50','test-wax-digest');
  const sent=[];
  assert.equal(await handleTagRunV2Command(f.env,{
    name:'pool',isAdmin:false,isPrivate:false,chatId:GROUP,
    telegramId:'1111',send:async x=>sent.push(x)
  }),true);
  assert.equal(sent.length,1);
  assert.match(sent[0],/WAX @ eosio\.token — 789 smallest units/);
  assert.match(sent[0],/LFGK @ kingsofgraff — 1021 smallest units/);
  assert.equal((sent[0].match(/LFGK @ kingsofgraff/g)||[]).length,1);
});

test('schema and draw preview reject nonapproved daily or historical rates',async t=>{
  const f=fixture(t);
  assert.throws(()=>f.sqlite.exec(
    'UPDATE tag_run_v2_pool_config SET daily_bps=0'
  ),/CHECK constraint failed/);
  assert.throws(()=>f.sqlite.exec(
    'UPDATE tag_run_v2_pool_config SET historical_ticket_bps=0'
  ),/CHECK constraint failed/);
  f.env.DB={prepare(sql){
    if(sql.includes('FROM tag_run_v2_pool_config')){
      return {async first(){return {wallet_account:TIP_ACCOUNT,
        daily_bps:0,historical_ticket_bps:5000,
        status:'review_only',revision:0};}};
    }
    throw new Error('draw queried before rule validation');
  }};
  await assert.rejects(handleTagRunV2Command(f.env,{
    name:'drawpreview',isAdmin:true,isPrivate:true,chatId:GROUP,
    telegramId:'1111',send:async()=>{}
  }),/v2_draw_rule_configuration_mismatch/);
});


test('failed pool balance reads never appear as a verified empty pot',async t=>{
  const f=fixture(t);
  f.sqlite.exec("UPDATE tag_run_v2_pool_config SET status='read_only'");
  const original=f.DB.prepare.bind(f.DB);
  const options={
    name:'pool',isAdmin:false,isPrivate:false,chatId:GROUP,
    telegramId:'1111',send:async text=>messages.push(text)
  };
  const messages=[];
  for(const result of [
    {success:false,results:[]},
    {success:true,results:null},
    null
  ]){
    f.env.DB={prepare(sql){
      if(sql.startsWith('SELECT a.token_symbol,a.token_contract,s.spendable_units')){
        return {bind(){return {async all(){return result;}};}};
      }
      return original(sql);
    }};
    await assert.rejects(handleTagRunV2Command(f.env,options),
      /pool_balance_read_unavailable/);
    assert.equal(messages.length,0,'failed D1 reads cannot announce an empty pot');
  }
  f.env.DB=f.DB;
  assert.equal(await handleTagRunV2Command(f.env,options),true);
  assert.equal(messages.length,1);
  assert.match(messages[0],/No independently verified eligible token balances yet/);
});

test('failed pool allowlist reads cannot masquerade as empty inventory',async t=>{
  const f=fixture(t);
  f.sqlite.exec("UPDATE tag_run_v2_pool_config SET status='read_only'");
  const original=f.DB.prepare.bind(f.DB);
  const messages=[];
  let networkCalls=0;
  const options={
    name:'poolstatus',isAdmin:true,isPrivate:true,chatId:GROUP,
    telegramId:'1111',send:async text=>messages.push(text),
    fetchImpl:async()=>{networkCalls++;throw new Error('RPC must not run on a failed allowlist');}
  };
  for(const result of [
    {success:false,results:[]},
    {success:true,results:undefined},
    {success:true,results:{}}
  ]){
    f.env.DB={prepare(sql){
      if(sql.startsWith('SELECT asset_key FROM tag_run_v2_assets')){
        return {async all(){return result;}};
      }
      return original(sql);
    }};
    await assert.rejects(handleTagRunV2Command(f.env,options),
      /pool_allowlist_read_unavailable/);
    assert.equal(messages.length,0);
    assert.equal(networkCalls,0,'no RPC before a successful allowlist read');
  }
});

test('failed draw audit reads cannot claim there are no draw records',async t=>{
  const f=fixture(t);
  f.sqlite.exec("UPDATE tag_run_v2_pool_config SET status='read_only'");
  const original=f.DB.prepare.bind(f.DB);
  const messages=[];
  const options={
    name:'drawaudit',isAdmin:true,isPrivate:true,chatId:GROUP,
    telegramId:'1111',send:async text=>messages.push(text)
  };
  for(const result of [
    {success:false,results:[]},
    {success:true,results:null}
  ]){
    f.env.DB={prepare(sql){
      if(sql.startsWith('SELECT day_key,status,created_at FROM tag_run_v2_draws')){
        return {bind(){return {async all(){return result;}};}};
      }
      return original(sql);
    }};
    await assert.rejects(handleTagRunV2Command(f.env,options),
      /pool_draw_audit_read_unavailable/);
    assert.equal(messages.length,0);
  }
  f.env.DB=f.DB;
  assert.equal(await handleTagRunV2Command(f.env,options),true);
  assert.equal(messages.length,1);
  assert.match(messages[0],/No review-only draw records/);
});

test('draw preview blocks before, during and after failed historical catch-up',async t=>{
  const f=fixture(t);
  f.sqlite.exec("UPDATE tag_run_v2_pool_config SET status='review_only'");
  const insert=f.sqlite.prepare('INSERT INTO tag_run_messages '+
    '(chat_id,message_id,telegram_id,display_name,day_key,week_key,message_unix,content_hash,points) '+
    'VALUES (?,?,?,?,?,?,?,?,?)');
  insert.run(GROUP,901,'1111','Past tagger','2026-10-30','2026-10-26',
    1793320000,'historical-first',10);
  insert.run(GROUP,902,'2222','Recent tagger','2026-11-02','2026-11-02',
    1793577700,'historical-second',12);
  const nowMs=Date.parse('2026-11-03T00:15:00.000Z');
  const messages=[];
  const options={
    name:'drawpreview',isAdmin:true,isPrivate:true,chatId:GROUP,
    telegramId:'1111',nowMs,send:async text=>messages.push(text)
  };
  // A missing checkpoint is incomplete even when a prior day's V1 data exists.
  assert.equal(await handleTagRunV2Command(f.env,options),true);
  assert.match(messages.at(-1),/DRAW PREVIEW BLOCKED/);
  assert.match(messages.at(-1),/Historical Street Cred participation/);
  assert.doesNotMatch(messages.at(-1),/UNSAVED SIMULATION ONLY/);
  const partial=await saveYesterdayParticipation(f.env,{
    nowMs,cryptoImpl:webcrypto,maxDays:2
  });
  assert.equal(partial.backlogRemaining,true);
  assert.equal(partial.day,'2026-10-31');
  assert.equal(await handleTagRunV2Command(f.env,options),true);
  assert.match(messages.at(-1),/DRAW PREVIEW BLOCKED/,
    'pending November receipts must not be treated as empty history');
  // Do not bypass the checkpoint when the D1 read itself failed.
  const original=f.DB.prepare.bind(f.DB);
  f.env.DB={prepare(sql){
    if(sql.startsWith('SELECT last_completed_day_key FROM tag_run_v2_capture_cursors')){
      return {bind(){return {async first(){return {success:false};}};}};
    }
    return original(sql);
  }};
  await assert.rejects(handleTagRunV2Command(f.env,options),
    /participation_capture_cursor_unavailable/);
  f.env.DB=f.DB;
  const completed=await saveYesterdayParticipation(f.env,{
    nowMs,cryptoImpl:webcrypto,maxDays:7
  });
  assert.equal(completed.backlogRemaining,false);
  assert.equal(completed.day,'2026-11-02');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM tag_run_v2_participation')
    .get().n,2);
  // Gate now passes: with no separately verified token snapshot, preview
  // reports the absence of verified balances instead of fabricating a draw.
  assert.equal(await handleTagRunV2Command(f.env,options),true);
  assert.match(messages.at(-1),/No independently verified token snapshots/);
  assert.doesNotMatch(messages.at(-1),/DRAW PREVIEW BLOCKED/);
});
