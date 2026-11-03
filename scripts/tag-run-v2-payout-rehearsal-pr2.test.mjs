import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import { previewCommunityDraw, assetKey, TIP_ACCOUNT,
  WAX_MAINNET_CHAIN_ID } from '../workers/moonboys-api/tag-run/v2-core.js';
import { buildDirectWalletPayoutPlan } from
  '../workers/moonboys-api/tag-run/v2-direct-wallet-plan.js';
import { prepareV2PayoutRehearsal, REHEARSAL_EXECUTABLE } from
  '../workers/moonboys-api/tag-run/v2-accounting-rehearsal.js';

const KEY=assetKey('kingsofgraff','LFGK',4);
const HASH='a'.repeat(64),BLOCK='b'.repeat(64),TX='c'.repeat(64);
const CHAT='-1001234567890',DAY='2026-11-02';
const input=()=>({day:DAY,wallet:TIP_ACCOUNT,seedHex:'cd'.repeat(32),
  cryptoImpl:webcrypto,assets:[{key:KEY,contract:'kingsofgraff',
    symbol:'LFGK',precision:4,balanceUnits:'100000',
    reservedUnits:'20000',excludedUnits:'40000',approved:true,confirmed:true}],
  current:[{telegramId:'1111',points:12}],historical:[]});
const destination=[{telegramId:'1111',account:'gkniftyheads',
  registered:true,chainAccountChecked:true}];
async function build(){
  const preview=await previewCommunityDraw(input());
  const plan=await buildDirectWalletPayoutPlan({
    preview,destinations:destination,cryptoImpl:webcrypto});
  const snapshots=[{assetKey:KEY,contract:'kingsofgraff',symbol:'LFGK',
    precision:4,day:DAY,evidenceDigest:HASH,blockId:BLOCK,
    irreversibleBlockNum:1234567,status:'unverified',
    onchainUnits:'100000',reservedUnits:'20000',
    excludedUnits:'40000',availableUnits:'40000',fivePercentUnits:'2000'}];
  return {plan,snapshots};
}
const rehearse=({plan,snapshots})=>prepareV2PayoutRehearsal({
  chatId:CHAT,plan,snapshots,receiptsDigest:HASH,cryptoImpl:webcrypto
});

test('exact integer balance minus reserved and excluded governs offline intent totals',async()=>{
  const x=await build(),result=await rehearse(x);
  const second=await rehearse(x);
  assert.deepEqual(result,second);
  assert.equal(result.status,'simulation_only');
  assert.equal(result.executable,false);
  assert.equal(result.funded,false);
  assert.equal(result.reservable,false);
  assert.equal(result.transferAttempted,false);
  assert.equal(REHEARSAL_EXECUTABLE,false);
  assert.equal(result.intents.length,20);
  assert.equal(result.intents.reduce((n,x)=>n+BigInt(x.amount_units),0n),2000n);
  assert(result.intents.every(x=>x.destination_account==='gkniftyheads' &&
    x.status==='simulation_only' && /^[a-f0-9]{64}$/.test(x.intent_key)));
  assert(result.blockers.includes('funding_not_reserved'));
  assert(Object.isFrozen(result.intents));
});

test('jointly inflated available and 5% values fail despite matching preview totals',async()=>{
  const x=await build();
  x.snapshots[0]={...x.snapshots[0],availableUnits:'100000',fivePercentUnits:'5000'};
  await assert.rejects(rehearse(x),/rehearsal_snapshot_units_not_reconciled/);
});

test('deficits, forged daily budget or mismatched plan total fail closed',async()=>{
  const a=await build();
  for(const patch of [
    {onchainUnits:'100000',reservedUnits:'80000',excludedUnits:'40000'},
    {fivePercentUnits:'5000'},
    {availableUnits:'39999'},
    {blockId:'not-a-digest'},
    {irreversibleBlockNum:0},
    {status:'verified'}
  ]){
    await assert.rejects(rehearse({
      ...a,snapshots:[{...a.snapshots[0],...patch}]
    }),/rehearsal_/);
  }
  await assert.rejects(rehearse({...a,plan:{
    ...a.plan,totals:[{...a.plan.totals[0],dailyBudgetUnits:'3000'}]
  }}),/rehearsal_plan_totals_mismatch/);
});

test('any recipient blocker rejects the entire rehearsal rather than hiding a missing destination',async()=>{
  const a=await build();
  for(const patch of [
    {receivingAccount:'bad..wax'},
    {receivingAccount:TIP_ACCOUNT},
    {receivingAccount:[TIP_ACCOUNT]},
    {receivingAccount:['gkniftyheads']},
    {receivingAccount:new String('gkniftyheads')},
    {receivingAccount:{toString:()=> 'gkniftyheads'}},
    {receivingAccount:null},
    {status:'locked'},
    {blocker:'destination_requires_fresh_chain_check'},
    {bundleIndex:20}
  ]){
    const entries=[{...a.plan.entries[0],...patch},...a.plan.entries.slice(1)];
    await assert.rejects(rehearse({...a,plan:{...a.plan,entries}}),/rehearsal_/);
  }
  await assert.rejects(rehearse({...a,plan:{...a.plan,
    entries:[...a.plan.entries.slice(0,-1),a.plan.entries[0]]
  }}),/rehearsal_duplicate_or_unknown_slot/);
});

function fixture(t){
  const db=new DatabaseSync(':memory:');
  t.after(()=>db.close());
  db.exec('PRAGMA foreign_keys=ON');
  // Explicitly reproduce Cloudflare/SQLite default: DELETE triggers do not
  // protect rows replaced by INSERT OR REPLACE when recursion is disabled.
  db.exec('PRAGMA recursive_triggers=OFF');
  assert.equal(db.prepare('PRAGMA recursive_triggers').get().recursive_triggers,0);
  db.exec(readFileSync(new URL(
    '../workers/moonboys-api/migrations/104_tag_run_v2_community_token_pot.sql',
    import.meta.url),'utf8'));
  db.exec(readFileSync(new URL(
    './fixtures/tag-run-v2-accounting-rehearsal.sql',import.meta.url),'utf8'));
  db.prepare(`INSERT INTO tag_run_v2_assets
    (asset_key,chain_id,token_contract,token_symbol,token_precision)
    VALUES(?,?,?,?,?)`).run(KEY,WAX_MAINNET_CHAIN_ID,
      'kingsofgraff','LFGK',4);
  return db;
}

test('rehearsal SQL never enters Wrangler production migrations_dir',()=>{
  const prodSql = new URL(
    '../workers/moonboys-api/migrations/105_tag_run_v2_accounting_rehearsal.sql',
    import.meta.url);
  const offlineSql = new URL('./fixtures/tag-run-v2-accounting-rehearsal.sql',import.meta.url);
  const wrangler = readFileSync(
    new URL('../workers/moonboys-api/wrangler.toml',import.meta.url),'utf8');
  assert.match(wrangler,/migrations_dir = "migrations"/);
  assert.equal(existsSync(prodSql),false,
    'offline-only SQL must never be picked up by wrangler d1 migrations apply');
  assert.equal(existsSync(offlineSql),true);
});

test('SQLite requires non-NULL immutable digest identifiers on all three rehearsal tables',t=>{
  const db=fixture(t);
  // SQLite historically permits NULL in a TEXT PRIMARY KEY unless it is
  // explicitly NOT NULL. Check both missing and explicit NULL identifiers
  // with every other column valid; never create an unaddressable record.
  const examples=[
    {
      table:'tag_run_v2_funding_evidence_rehearsal',id:'evidence_id',
      columns:['asset_key','chain_id','global_action_seq','transaction_id',
        'irreversible_block_num','block_id','donor_account','recipient_account',
        'units','donor_intent_digest','custody_review_digest'],
      values:[KEY,WAX_MAINNET_CHAIN_ID,'seq:missing-id',TX,100,BLOCK,
        'gkniftyheads',TIP_ACCOUNT,'20',HASH,BLOCK]
    },
    {
      table:'tag_run_v2_snapshot_evidence_rehearsal',id:'snapshot_id',
      columns:['chat_id','day_key','asset_key','irreversible_block_num',
        'block_id','onchain_units','reserved_units','excluded_units',
        'available_units','five_percent_units','evidence_digest'],
      values:[CHAT,DAY,KEY,100,BLOCK,'100000','20000','40000',
        '40000','2000',HASH]
    },
    {
      table:'tag_run_v2_payout_intents_rehearsal',id:'intent_key',
      columns:['chat_id','day_key','asset_key','bundle_index','telegram_id',
        'destination_account','destination_digest','amount_units',
        'snapshot_digest','source_receipts_digest'],
      values:[CHAT,DAY,KEY,0,'1111','gkniftyheads',HASH,'100',HASH,HASH]
    }
  ];
  for(const {table,id,columns,values} of examples){
    const placeholders=columns.map(()=>'?').join(',');
    const withoutId=db.prepare(
      'INSERT INTO '+table+' ('+columns.join(',')+') VALUES ('+placeholders+')');
    assert.throws(()=>withoutId.run(...values),
      new RegExp('NOT NULL constraint failed: '+table+'\\.'+id),
      table+'.'+id+' must reject omitted identifiers');

    const explicitNull=db.prepare(
      'INSERT INTO '+table+' ('+[id,...columns].join(',')+') VALUES (?,'+placeholders+')');
    assert.throws(()=>explicitNull.run(null,...values),
      new RegExp('NOT NULL constraint failed: '+table+'\\.'+id),
      table+'.'+id+' must reject NULL identifiers');

    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n,0,
      'failed insert must not leave an immutable row');
  }
});

test('offline D1-compatible ledger prevents duplicate slots and forbids mutating a recipient',async t=>{
  const db=fixture(t),result=await rehearse(await build());
  const sql=`INSERT INTO tag_run_v2_payout_intents_rehearsal
    (intent_key,chat_id,day_key,asset_key,bundle_index,telegram_id,
    destination_account,destination_digest,amount_units,snapshot_digest,
    source_receipts_digest)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`;
  const insert=db.prepare(sql);
  for(const x of result.intents){
    insert.run(x.intent_key,x.chat_id,x.day_key,x.asset_key,x.bundle_index,
      x.telegram_id,x.destination_account,x.destination_digest,x.amount_units,
      x.snapshot_digest,x.source_receipts_digest);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_run_v2_payout_intents_rehearsal').get().n,20);
  const first=result.intents[0];
  assert.throws(()=>insert.run('d'.repeat(64),first.chat_id,first.day_key,first.asset_key,
    first.bundle_index,first.telegram_id,'wrongaccount',first.destination_digest,
    first.amount_units,first.snapshot_digest,first.source_receipts_digest),
    /immutable_rehearsal_intent/);
  assert.throws(()=>db.prepare(`UPDATE tag_run_v2_payout_intents_rehearsal
    SET destination_account='otherwax' WHERE intent_key=?`).run(first.intent_key),
    /immutable_rehearsal_intent/);
  assert.throws(()=>db.prepare('DELETE FROM tag_run_v2_payout_intents_rehearsal').run(),
    /immutable_rehearsal_intent/);
  assert.throws(()=>db.prepare(`UPDATE tag_run_v2_payout_intents_rehearsal
    SET status='paid'`).run(),/immutable_rehearsal_intent/);
  assert.equal(db.prepare('SELECT destination_account FROM tag_run_v2_payout_intents_rehearsal WHERE intent_key=?')
    .get(first.intent_key).destination_account,'gkniftyheads');
  // Duplicate primary key and alternate unique slot must both be blocked
  // before SQLite REPLACE can silently delete the original row.
  const replace=db.prepare(sql.replace('INSERT INTO','INSERT OR REPLACE INTO'));
  assert.throws(()=>replace.run(first.intent_key,first.chat_id,'2026-11-03',
    first.asset_key,first.bundle_index,first.telegram_id,'otherwax',
    first.destination_digest,first.amount_units,first.snapshot_digest,
    first.source_receipts_digest),/immutable_rehearsal_intent/);
  assert.throws(()=>replace.run('d'.repeat(64),first.chat_id,first.day_key,
    first.asset_key,first.bundle_index,first.telegram_id,'otherwax',
    first.destination_digest,first.amount_units,first.snapshot_digest,
    first.source_receipts_digest),/immutable_rehearsal_intent/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_run_v2_payout_intents_rehearsal').get().n,20);
  assert.equal(db.prepare('SELECT destination_account FROM tag_run_v2_payout_intents_rehearsal WHERE intent_key=?')
    .get(first.intent_key).destination_account,'gkniftyheads');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('rehearsal funding and snapshot evidence cannot be approved or rewritten in place',t=>{
  const db=fixture(t);
  const evidence=db.prepare(`INSERT INTO tag_run_v2_funding_evidence_rehearsal
    (evidence_id,asset_key,chain_id,global_action_seq,transaction_id,
     irreversible_block_num,block_id,donor_account,recipient_account,units,
     donor_intent_digest,custody_review_digest)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  evidence.run(HASH,KEY,WAX_MAINNET_CHAIN_ID,'seq:1',TX,100,BLOCK,
    'gkniftyheads',TIP_ACCOUNT,'20',HASH,BLOCK);
  assert.throws(()=>evidence.run('d'.repeat(64),KEY,WAX_MAINNET_CHAIN_ID,
    'seq:1',TX,100,BLOCK,'gkniftyheads',TIP_ACCOUNT,'20',HASH,BLOCK),
    /immutable_rehearsal_funding/);
  const evidenceReplace=db.prepare(`INSERT OR REPLACE INTO tag_run_v2_funding_evidence_rehearsal
    (evidence_id,asset_key,chain_id,global_action_seq,transaction_id,
     irreversible_block_num,block_id,donor_account,recipient_account,units,
     donor_intent_digest,custody_review_digest)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  for(const [id,sequence] of [[HASH,'seq:2'],['d'.repeat(64),'seq:1']]){
    assert.throws(()=>evidenceReplace.run(id,KEY,WAX_MAINNET_CHAIN_ID,
      sequence,TX,100,BLOCK,'otherwax',TIP_ACCOUNT,'20',HASH,BLOCK),
      /immutable_rehearsal_funding/);
  }
  assert.equal(db.prepare('SELECT donor_account FROM tag_run_v2_funding_evidence_rehearsal WHERE evidence_id=?')
    .get(HASH).donor_account,'gkniftyheads');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_run_v2_funding_evidence_rehearsal').get().n,1);
  assert.throws(()=>db.prepare(`UPDATE tag_run_v2_funding_evidence_rehearsal
    SET status='approved'`).run(),/immutable_rehearsal_funding/);
  const snapshot=db.prepare(`INSERT INTO tag_run_v2_snapshot_evidence_rehearsal
    (snapshot_id,chat_id,day_key,asset_key,irreversible_block_num,
     block_id,onchain_units,reserved_units,excluded_units,available_units,
     five_percent_units,evidence_digest)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  snapshot.run(HASH,CHAT,DAY,KEY,100,BLOCK,
    '100000','20000','40000','40000','2000',HASH);
  const replaceSnapshot=db.prepare(`INSERT OR REPLACE INTO tag_run_v2_snapshot_evidence_rehearsal
    (snapshot_id,chat_id,day_key,asset_key,irreversible_block_num,
     block_id,onchain_units,reserved_units,excluded_units,available_units,
     five_percent_units,evidence_digest)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  for(const [id,day] of [[HASH,'2026-11-03'],['d'.repeat(64),DAY]]){
    assert.throws(()=>replaceSnapshot.run(id,CHAT,day,KEY,100,BLOCK,
      '999999','20000','40000','939999','46999',HASH),
      /immutable_rehearsal_snapshot/);
  }
  assert.equal(db.prepare('SELECT onchain_units FROM tag_run_v2_snapshot_evidence_rehearsal WHERE snapshot_id=?')
    .get(HASH).onchain_units,'100000');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tag_run_v2_snapshot_evidence_rehearsal').get().n,1);
  assert.throws(()=>db.prepare(`DELETE FROM tag_run_v2_snapshot_evidence_rehearsal`).run(),
    /immutable_rehearsal_snapshot/);
  assert.throws(()=>db.prepare(`UPDATE tag_run_v2_snapshot_evidence_rehearsal
    SET status='verified'`).run(),/immutable_rehearsal_snapshot/);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});
