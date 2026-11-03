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
    assert(bundles.filter(x=>x.pool==='historical').length<=10);
    assert(bundles.filter(x=>x.pool==='current').length>=10);
  }
  assert.equal(first.seedCommitment,await sha256Text(SEED,webcrypto));
  assert.notDeepEqual((await previewCommunityDraw({...input,
    seedHex:'ad'.repeat(32)})).bundles,first.bundles,
    'different seeds should change at least some winners');
  assert.throws(()=>previewCommunityDraw({...input,assets:[assets[0],assets[0]]}),
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
  failBalance=false}={}){
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
      tokens:[{contract:'kingsofgraff',symbol:'LFGK',precision:4,amount:123456},
        {contract:'scamtoken123',symbol:'SCAM',precision:4,amount:1}]
    })};
    if(url.endsWith('/get_currency_balance'))return {ok:!failBalance,
      json:async()=>['12.3456 LFGK']};
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
  assert.deepEqual(first,{status:'recorded',day:DAY,eligible:2,inserted:2});
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
