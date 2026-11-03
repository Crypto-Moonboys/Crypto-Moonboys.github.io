import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { assetKey, WAX_MAINNET_CHAIN_ID, TIP_ACCOUNT } from
  '../workers/moonboys-api/tag-run/v2-core.js';
import {
  setSimulatedPause, createSimulatedBudget, holdSimulatedIntent
} from './tag-run-v2-atomic-budget-rehearsal.mjs';
import {
  CURRENT_COMMUNITY_REHEARSAL_ONLY, CURRENT_COMMUNITY_TRANSFERS_ENABLED,
  bindCurrentTelegramCommunity, previewOneCommunityDailyCaps,
  holdCurrentCommunitySimulation, inspectCurrentCommunitySimulation
} from './tag-run-v2-current-community-pr6.mjs';

const GROUP='-1001234567890',OTHER='-1009999999999',DAY='2026-11-02';
const A=assetKey('kingsofgraff','LFGK',4);
const B=assetKey('eosio.token','WAX',8);
const HEXA='a'.repeat(64),HEXB='b'.repeat(64);
const intent='c'.repeat(64);
const selected=(assetKey,maxTransferUnits='100')=>({assetKey,maxTransferUnits});
const budgets=(db,chat=GROUP)=>db.prepare(
  'SELECT asset_key,daily_limit_units,paused FROM '+
  'tag_run_v2_atomic_budget_rehearsal WHERE chat_id=? ORDER BY asset_key'
).all(chat);
function installScope(db) {
  db.exec(readFileSync(new URL(
    './fixtures/tag-run-v2-current-community-pr6.sql',import.meta.url),'utf8'));
}
function setup(t,{loadCommunityScope=true}={}) {
  const db=new DatabaseSync(':memory:');
  t.after(()=>db.close());
  db.exec('PRAGMA foreign_keys=ON');
  db.exec('PRAGMA recursive_triggers=OFF');
  for(const path of [
    '../workers/moonboys-api/migrations/104_tag_run_v2_community_token_pot.sql',
    './fixtures/tag-run-v2-accounting-rehearsal.sql',
    './fixtures/tag-run-v2-atomic-budget-rehearsal.sql'
  ]) db.exec(readFileSync(new URL(path,import.meta.url),'utf8'));
  const insert=db.prepare(
    'INSERT INTO tag_run_v2_assets '+
    '(asset_key,chain_id,token_contract,token_symbol,token_precision) '+
    'VALUES (?,?,?,?,?)'
  );
  insert.run(A,WAX_MAINNET_CHAIN_ID,'kingsofgraff','LFGK',4);
  insert.run(B,WAX_MAINNET_CHAIN_ID,'eosio.token','WAX',8);
  if(loadCommunityScope)installScope(db);
  return db;
}
function snapshot(db,key,options={}) {
  const second=key===B,available=options.availableUnits||
    (second?'200000':'40000');
  const onchain=options.onchainUnits||(second?'200000':'100000');
  const reserved=options.reservedUnits||(second?'0':'20000');
  const excluded=options.excludedUnits||(second?'0':'40000');
  const percent=options.fivePercentUnits||
    (BigInt(available)*500n/10000n).toString();
  db.prepare(
    'INSERT INTO tag_run_v2_snapshot_evidence_rehearsal '+
    '(snapshot_id,chat_id,day_key,asset_key,irreversible_block_num,'+
    'block_id,onchain_units,reserved_units,excluded_units,available_units,'+
    'five_percent_units,evidence_digest,status) '+
    'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(second?HEXB:HEXA,options.chatId||GROUP,
    options.dayKey||DAY,key,123456,HEXA,onchain,reserved,excluded,
    available,percent,HEXB,options.status||'unverified');
}
function insertIntent(db,chatId=GROUP,intentKey=intent,bundleIndex=0) {
  db.prepare(
    'INSERT INTO tag_run_v2_payout_intents_rehearsal '+
    '(intent_key,chat_id,day_key,asset_key,bundle_index,telegram_id,'+
    'ticket_class,destination_account,destination_digest,amount_units,'+
    'snapshot_digest,source_receipts_digest) '+
    'VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(intentKey,chatId,DAY,A,bundleIndex,'1111','current','gkniftyheads',
    HEXA,'100',HEXA,HEXB);
}
const groupOptions={telegramGroupChatId:GROUP};

test('one group only: authenticated Telegram group format and immutable binding',t=>{
  const db=setup(t);
  assert.equal(CURRENT_COMMUNITY_REHEARSAL_ONLY,true);
  assert.equal(CURRENT_COMMUNITY_TRANSFERS_ENABLED,false);
  for(const invalid of ['123','-100abc123','-100123',OTHER+'x',' -1001234567890']) {
    assert.throws(()=>bindCurrentTelegramCommunity(db,{
      telegramGroupChatId:invalid
    }),/current_community_invalid_group/);
  }
  const result=bindCurrentTelegramCommunity(db,groupOptions);
  assert.equal(result.groupChatId,GROUP);
  assert.equal(result.funded,false);
  assert.equal(result.executable,false);
  assert.equal(result.replayed,false);
  assert.equal(bindCurrentTelegramCommunity(db,groupOptions).replayed,true);
  assert.throws(()=>bindCurrentTelegramCommunity(db,{
    telegramGroupChatId:OTHER
  }),/current_community_different_community_rejected/);
  assert.throws(()=>db.exec('UPDATE tag_run_v2_current_community_scope_rehearsal '+
    "SET group_chat_id='"+OTHER+"'"),/current_community_scope_locked/);
  assert.throws(()=>db.exec('DELETE FROM tag_run_v2_current_community_scope_rehearsal'),
    /current_community_scope_locked/);
  assert.throws(()=>db.exec('INSERT OR REPLACE INTO '+
    'tag_run_v2_current_community_scope_rehearsal '+
    "(scope_id,group_chat_id) VALUES (1,'"+OTHER+"')"),
    /current_community_scope_locked/);
  assert.equal(db.prepare('SELECT group_chat_id FROM '+
    'tag_run_v2_current_community_scope_rehearsal').get().group_chat_id,GROUP);
});

test('direct SQL cannot enrol PR2 recipients or budgets from another group',t=>{
  const db=setup(t);
  bindCurrentTelegramCommunity(db,groupOptions);
  assert.throws(()=>insertIntent(db,OTHER),/current_community_mismatch/);
  assert.throws(()=>db.prepare(
    'INSERT INTO tag_run_v2_atomic_budget_rehearsal '+
    '(chat_id,day_key,asset_key,daily_limit_units,'+
    'per_transfer_limit_units,paused) VALUES (?,?,?,?,?,1)'
  ).run(OTHER,DAY,A,'2000','100'),/current_community_mismatch/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM '+
    'tag_run_v2_payout_intents_rehearsal').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM '+
    'tag_run_v2_atomic_budget_rehearsal').get().n,0);
});

for(const kind of ['foreign_intent','foreign_budget','foreign_hold','mixed_rows']) {
  test('binding rejects pre-existing '+kind+' before scope fixture installation',t=>{
    // Emulate a disposable PR2/PR5 DB populated BEFORE PR6 existed.
    const db=setup(t,{loadCommunityScope:false});
    if(kind==='foreign_intent'||kind==='foreign_hold')
      insertIntent(db,OTHER);
    if(kind==='foreign_budget'||kind==='foreign_hold'||kind==='mixed_rows')
      createSimulatedBudget(db,{
        chatId:OTHER,dayKey:DAY,assetKey:A,
        dailyLimitUnits:'200',maxTransferUnits:'100',paused:false
      });
    if(kind==='foreign_hold')
      holdSimulatedIntent(db,{intentKey:intent});
    if(kind==='mixed_rows')insertIntent(db,GROUP);
    const counts=()=>[
      db.prepare('SELECT COUNT(*) AS n FROM tag_run_v2_payout_intents_rehearsal')
        .get().n,
      db.prepare('SELECT COUNT(*) AS n FROM tag_run_v2_atomic_budget_rehearsal')
        .get().n,
      db.prepare('SELECT COUNT(*) AS n FROM tag_run_v2_atomic_holds_rehearsal')
        .get().n
    ];
    const before=counts();
    installScope(db);
    assert.throws(()=>bindCurrentTelegramCommunity(db,groupOptions),
      /current_community_existing_foreign_rows/);
    assert.throws(()=>db.prepare(
      'INSERT OR REPLACE INTO tag_run_v2_current_community_scope_rehearsal '+
      '(scope_id,group_chat_id) VALUES (1,?)').run(GROUP),
      /current_community_existing_foreign_rows/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM '+
      'tag_run_v2_current_community_scope_rehearsal').get().n,0);
    assert.deepEqual(counts(),before,'rejected binding never deletes existing rows');
    if(kind==='foreign_hold')assert.equal(
      db.prepare('SELECT state FROM tag_run_v2_atomic_holds_rehearsal '+
        'WHERE intent_key=?').get(intent).state,'simulation_held');
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  });
}

test('populated PR2/PR5 tables for current group bind without reset',t=>{
  const db=setup(t,{loadCommunityScope:false});
  insertIntent(db,GROUP);
  createSimulatedBudget(db,{
    chatId:GROUP,dayKey:DAY,assetKey:A,
    dailyLimitUnits:'200',maxTransferUnits:'100',paused:false
  });
  holdSimulatedIntent(db,{intentKey:intent});
  const prior=db.prepare('SELECT allocated_units,outstanding_units,revision '+
    'FROM tag_run_v2_atomic_budget_rehearsal').get();
  installScope(db);
  assert.equal(bindCurrentTelegramCommunity(db,groupOptions).replayed,false);
  assert.equal(bindCurrentTelegramCommunity(db,groupOptions).replayed,true);
  const now=db.prepare('SELECT allocated_units,outstanding_units,revision '+
    'FROM tag_run_v2_atomic_budget_rehearsal').get();
  assert.deepEqual({...now},{...prior});
  assert.equal(db.prepare('SELECT state FROM tag_run_v2_atomic_holds_rehearsal '+
    'WHERE intent_key=?').get(intent).state,'simulation_held');
  assert.throws(()=>insertIntent(db,OTHER,HEXB,1),/current_community_mismatch/);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('single configured group: daily per-token 5% previews remain paused and unfunded',t=>{
  const db=setup(t);
  bindCurrentTelegramCommunity(db,groupOptions);
  snapshot(db,A);snapshot(db,B);
  const out=previewOneCommunityDailyCaps(db,{
    ...groupOptions,dayKey:DAY,assets:[
      selected(A,'100'),selected(B,'500')
    ]
  });
  assert.equal(out.groupChatId,GROUP);
  assert.equal(out.status,'simulation_only');
  assert.equal(out.funded,false);
  assert.equal(out.treasuryApproved,false);
  assert.equal(out.transferAttempted,false);
  assert.equal(out.executable,false);
  assert.deepEqual(out.assets.map(x=>x.hypotheticalDailyUnits),
    ['2000','10000']);
  assert(budgets(db).every(x=>x.paused===1));
  assert.equal(budgets(db,OTHER).length,0);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('missing second asset snapshot rolls back earlier synthetic budget inserts',t=>{
  const db=setup(t);
  bindCurrentTelegramCommunity(db,groupOptions);
  snapshot(db,A);
  assert.throws(()=>previewOneCommunityDailyCaps(db,{
    ...groupOptions,dayKey:DAY,assets:[
      selected(A),selected(B)
    ]
  }),/current_community_snapshot_missing_or_rejected/);
  assert.equal(budgets(db).length,0);
  snapshot(db,B);
  previewOneCommunityDailyCaps(db,{
    ...groupOptions,dayKey:DAY,assets:[selected(A),selected(B)]
  });
  assert.equal(budgets(db).length,2);
});

test('inaccurate snapshot 5% or available balance fails closed, no synthetic allocation',t=>{
  const db=setup(t);
  bindCurrentTelegramCommunity(db,groupOptions);
  snapshot(db,A,{fivePercentUnits:'2001'});
  assert.throws(()=>previewOneCommunityDailyCaps(db,{
    ...groupOptions,dayKey:DAY,assets:[selected(A)]
  }),/current_community_unverified_budget_mismatch/);
  assert.equal(budgets(db).length,0);
});

test('foreign group input or duplicate token assets never initializes budgets',t=>{
  const db=setup(t);
  bindCurrentTelegramCommunity(db,groupOptions);
  snapshot(db,A);
  assert.throws(()=>previewOneCommunityDailyCaps(db,{
    telegramGroupChatId:OTHER,dayKey:DAY,assets:[selected(A)]
  }),/current_community_different_community_rejected/);
  assert.throws(()=>previewOneCommunityDailyCaps(db,{
    ...groupOptions,dayKey:DAY,assets:[selected(A),selected(A)]
  }),/current_community_duplicate_or_invalid_asset/);
  assert.throws(()=>previewOneCommunityDailyCaps(db,{
    ...groupOptions,dayKey:DAY,assets:[selected(A,'2001')]
  }),/current_community_unverified_budget_mismatch/);
  assert.equal(budgets(db).length,0);
});

test('configured participants use the existing frozen simulation-only hold',t=>{
  const db=setup(t);
  bindCurrentTelegramCommunity(db,groupOptions);
  snapshot(db,A);
  insertIntent(db);
  previewOneCommunityDailyCaps(db,{
    ...groupOptions,dayKey:DAY,assets:[selected(A)]
  });
  assert.throws(()=>holdCurrentCommunitySimulation(db,{
    ...groupOptions,intentKey:intent
  }),/atomic_rehearsal_emergency_pause/);
  setSimulatedPause(db,{
    chatId:GROUP,dayKey:DAY,assetKey:A,paused:false
  });
  const held=holdCurrentCommunitySimulation(db,{
    ...groupOptions,intentKey:intent
  });
  assert.equal(held.account,'gkniftyheads');
  assert.equal(held.groupChatId,GROUP);
  assert.equal(held.state,'simulation_held');
  assert.equal(held.funded,false);
  assert.equal(held.transferAttempted,false);
  assert.equal(holdCurrentCommunitySimulation(db,{
    ...groupOptions,intentKey:intent
  }).replayed,true);
  assert.throws(()=>holdCurrentCommunitySimulation(db,{
    telegramGroupChatId:OTHER,intentKey:intent
  }),/current_community_different_community_rejected/);
  const state=inspectCurrentCommunitySimulation(db,{
    ...groupOptions,dayKey:DAY,assetKey:A
  });
  assert.equal(state.allocatedUnits,'100');
  assert.equal(state.treasuryApproved,false);
  assert.equal(state.donationConsentVerified,false);
  assert.equal(state.transferable,false);
  assert.equal(state.confirmedOnChain,false);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('unverified snapshot budgets retain exact BigInt units above Number.MAX_SAFE_INTEGER',t=>{
  const db=setup(t);
  bindCurrentTelegramCommunity(db,groupOptions);
  const large='9007199254740993000';
  const hypothetical=(BigInt(large)*500n/10000n).toString();
  snapshot(db,A,{onchainUnits:large,reservedUnits:'0',excludedUnits:'0',
    availableUnits:large,fivePercentUnits:hypothetical});
  const model=previewOneCommunityDailyCaps(db,{
    ...groupOptions,dayKey:DAY,
    assets:[selected(A,'9007199254740993')]
  });
  assert.equal(model.assets[0].hypotheticalDailyUnits,hypothetical);
  assert.equal(budgets(db)[0].daily_limit_units,hypothetical);
  assert.equal(model.funded,false);
});

test('no new production migration, payout route or multi-community activation',()=>{
  const sql=readFileSync(new URL(
    './fixtures/tag-run-v2-current-community-pr6.sql',import.meta.url),'utf8');
  assert(sql.includes('current_community_scope_locked'));
  assert(sql.includes('current_community_mismatch'));
  const wrangler=readFileSync(new URL(
    '../workers/moonboys-api/wrangler.toml',import.meta.url),'utf8');
  assert.match(wrangler,/migrations_dir = "migrations"/);
  assert.match(wrangler,/TAG_RUN_V2_PAYOUTS_ENABLED = "false"/);
  assert.match(wrangler,/TAG_RUN_V2_DRAWS_ENABLED = "false"/);
  assert(!existsSync(new URL(
    '../workers/moonboys-api/migrations/108_tag_run_v2_current_community.sql',
    import.meta.url)));
});
