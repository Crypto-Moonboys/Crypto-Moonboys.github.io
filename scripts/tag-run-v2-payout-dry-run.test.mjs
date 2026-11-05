import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import {
  TIP_ACCOUNT, WAX_MAINNET_CHAIN_ID, assetKey
} from '../workers/moonboys-api/tag-run/v2-core.js';
import { previewReviewedPayoutAuthorization, PAYOUT_DRY_RUN_ONLY } from
  '../workers/moonboys-api/tag-run/v2-payout-dry-run.js';
import {
  reserveReviewedPayout, buildReviewedWaxTransfer
} from '../workers/moonboys-api/tag-run/v2-payout-executor.js';
import {parseDryRunArgs,selectOnlyDatabase} from './tag-run-v2-payout-dry-run.mjs';

const GROUP='-1001234567890', DAY='2026-11-02';
const A=assetKey('kingsofgraff','LFGK',4);
const MEMBER='1111', RECEIVER='gkniftyheads';
const SNAP='a'.repeat(64), AUTH='c'.repeat(64), RULES='b'.repeat(64);

function fixture(t,{perTransfer='500'}={}){
  const sqlite=new DatabaseSync(':memory:');
  t.after(()=>sqlite.close());
  sqlite.exec('PRAGMA foreign_keys=ON;PRAGMA recursive_triggers=OFF;');
  for(const file of [
    '../workers/moonboys-api/migrations/103_tag_run_street_cred_rewards.sql',
    '../workers/moonboys-api/migrations/104_tag_run_v2_community_token_pot.sql',
    '../workers/moonboys-api/migrations/105_tag_run_v2_payout_execution.sql'
  ])sqlite.exec(readFileSync(new URL(file,import.meta.url),'utf8'));
  sqlite.prepare(
    "UPDATE tag_run_v2_pool_config SET status='review_only'").run();
  sqlite.prepare('INSERT INTO tag_run_v2_assets '+
    '(asset_key,chain_id,token_contract,token_symbol,token_precision,'+
    'eligibility,verified_at,reviewed_by) VALUES (?,?,?,?,?,?,?,?)'
  ).run(A,WAX_MAINNET_CHAIN_ID,'kingsofgraff','LFGK',4,
    'approved','2026-11-02T23:00:00Z','independent-token-reviewer');
  sqlite.prepare('INSERT INTO tag_run_v2_deposits '+
    '(chain_id,global_action_seq,transaction_id,block_num,block_id,'+
    'sender_account,recipient_account,asset_key,units,memo_digest,status,reviewed_at) '+
    'VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(WAX_MAINNET_CHAIN_ID,'11','e'.repeat(64),101,'f'.repeat(64),
    'somewallet11',TIP_ACCOUNT,A,'10000',SNAP,'confirmed_donation','2026-11-02T23:05:00Z');
  sqlite.prepare('INSERT INTO tag_run_v2_snapshots '+
    '(chat_id,day_key,asset_key,wallet_account,chain_irreversible_block,'+
    'chain_block_id,onchain_units,allocated_unpaid_units,excluded_units,'+
    'spendable_units,five_percent_units,snapshot_digest,status) '+
    'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(GROUP,DAY,A,TIP_ACCOUNT,101,'f'.repeat(64),
    '10000','0','0','10000','500',SNAP,'verified');
  sqlite.prepare('INSERT INTO tag_run_v2_draws '+
    '(chat_id,day_key,status,seed_commitment,rules_digest,weights_digest,'+
    'snapshots_digest,reviewed_by) VALUES (?,?,?,?,?,?,?,?)'
  ).run(GROUP,DAY,'reviewed',SNAP,RULES,RULES,SNAP,'independent-draw-reviewer');
  for(let i=0;i<3;i++){
    sqlite.prepare('INSERT INTO tag_run_v2_bundles '+
      '(chat_id,day_key,asset_key,bundle_index,telegram_id,ticket_class,units) '+
      'VALUES (?,?,?,?,?,?,?)'
    ).run(GROUP,DAY,A,i,MEMBER,'current',['100','200','250'][i]);
  }
  sqlite.prepare('INSERT INTO tag_run_wallets (telegram_id,wax_account) '+
    'VALUES (?,?)').run(MEMBER,RECEIVER);
  sqlite.prepare('INSERT INTO tag_run_v2_payout_caps '+
    '(chat_id,day_key,asset_key,snapshot_digest,daily_limit_units,'+
    'per_transfer_limit_units,authorized_by) VALUES (?,?,?,?,?,?,?)'
  ).run(GROUP,DAY,A,SNAP,'500',perTransfer,'reviewed-cap-approval');
  sqlite.prepare('UPDATE tag_run_v2_payout_caps SET paused=0,revision=revision+1').run();

  // Same SQLite-backed DB interface as D1. All dry-run statements are
  // SELECT-only; live reserve is used exclusively inside two fixture tests.
  const DB={
    prepare(sql){
      const statement=(args=[])=>({
        sql,args,bind(...values){return statement(values);},
        async first(){return sqlite.prepare(sql).get(...args)??null;},
        async all(){return {success:true,results:sqlite.prepare(sql).all(...args)};},
        async run(){
          const r=sqlite.prepare(sql).run(...args);
          return {success:true,meta:{changes:r.changes}};
        }
      });
      return statement();
    },
    async batch(statements){
      sqlite.exec('BEGIN IMMEDIATE');
      try{
        const rows=statements.map(s=>{
          const r=sqlite.prepare(s.sql).run(...s.args);
          return {success:true,meta:{changes:r.changes}};
        });
        sqlite.exec('COMMIT');
        return rows;
      }catch(error){sqlite.exec('ROLLBACK');throw error;}
    }
  };
  const env={DB, TELEGRAM_GROUP_CHAT_ID:GROUP,TAG_RUN_ENABLED:'true',
    TAG_RUN_WEEKLY_REWARDS_ENABLED:'false',TAG_RUN_V2_POOL_ENABLED:'true',
    TAG_RUN_V2_DRAWS_ENABLED:'true',TAG_RUN_V2_PAYOUTS_ENABLED:'true',
    TAG_RUN_V2_OBSERVATION_ENABLED:'false',
    TAG_RUN_V2_TIP_ACCOUNT:TIP_ACCOUNT,
    TAG_RUN_V2_EXECUTOR_RELEASE_APPROVED:'true'};
  const preview=(changes={})=>previewReviewedPayoutAuthorization(env,{
    chatId:GROUP,day:DAY,contract:'kingsofgraff',symbol:'LFGK',
    precision:4,bundleIndex:0,operatorAllowlist:[A],reviewDigest:AUTH,
    reviewedBy:'operator-review-reference',cryptoImpl:webcrypto,...changes
  });
  const commitCount=()=>sqlite.prepare('SELECT total_changes() AS n').get().n;
  const reserve=async bundleIndex=>reserveReviewedPayout(env,{
    chatId:GROUP,day:DAY,contract:'kingsofgraff',symbol:'LFGK',
    precision:4,bundleIndex,telegramId:MEMBER,
    receivingAccount:RECEIVER,
    amountUnits:['100','200','250'][bundleIndex],
    authorizationDigest:AUTH,approvedBy:'operator-review-reference'
  });
  return {sqlite,DB,env,preview,commitCount,reserve};
}
const includes=(p,reason)=>assert.ok(p.reasonCodes.includes(reason),
  'Expected '+reason+' in '+JSON.stringify(p.reasonCodes));

test('read-only preview reproduces the executor intent and never modifies D1',async t=>{
  const f=fixture(t);
  const before=f.commitCount();
  const result=await f.preview();
  assert.equal(PAYOUT_DRY_RUN_ONLY,true);
  assert.equal(result.status,'REVIEW_CANDIDATE');
  assert.deepEqual(result.reasonCodes,[]);
  assert.equal(result.snapshotDailyLimitUnits,'500');
  assert.equal(result.remainingCapUnits,'500');
  assert.equal(result.bundleAmountUnits,'100');
  assert.equal(result.receivingAccount,RECEIVER);
  assert.equal(result.unsignedAction?.data.quantity,'0.0100 LFGK');
  assert.equal(result.unsignedAction?.authorization[0].permission,'tagrain');
  assert.equal(result.unsignedAction?.data.memo,
    'TAG RUN V2 '+result.intentKey.slice(0,20));
  const canonical=buildReviewedWaxTransfer({
    intent_key:result.intentKey,asset_key:A,receiving_account:RECEIVER,
    amount_units:'100',status:'reserved'
  });
  assert.deepEqual(result.unsignedAction,canonical.action);
  assert.equal(result.releaseAuthorized,false);
  assert.equal(result.transactionBroadcast,false);
  assert.equal(result.signatureRequested,false);
  assert.equal(result.reserveAttempted,false);
  assert.equal(f.commitCount(),before);
});

test('preflight works in observe-only deployment but does not release spending',async t=>{
  const f=fixture(t);
  for(const key of ['TAG_RUN_V2_POOL_ENABLED','TAG_RUN_V2_DRAWS_ENABLED',
    'TAG_RUN_V2_PAYOUTS_ENABLED','TAG_RUN_V2_EXECUTOR_RELEASE_APPROVED'])
    f.env[key]='false';
  f.env.TAG_RUN_V2_OBSERVATION_ENABLED='true';
  const result=await f.preview();
  assert.equal(result.status,'REVIEW_CANDIDATE');
  assert.equal(result.releaseAuthorized,false);
});

test('operator allowlist must identify exact contract/symbol/precision/chain',async t=>{
  const f=fixture(t);
  for(const list of [[],['kingsofgraff:LFGK:4'],
    [assetKey('kingsofgraff','DUMPIT',8)]]){
    const p=await f.preview({operatorAllowlist:list});
    assert.equal(p.status,'BLOCKED');includes(p,'operator_asset_allowlist_missing');
    assert.equal(p.unsignedAction,null);
  }
});
test('operator review reference and digest are mandatory inputs, never on-chain proof',async t=>{
  const f=fixture(t);
  const p=await f.preview({reviewDigest:null,reviewedBy:''});
  includes(p,'operator_review_reference_missing');
  assert.equal(p.unsignedAction,null);
});
test('quarantined/suspended asset and removed approval evidence fail closed',async t=>{
  const f=fixture(t);
  f.sqlite.prepare("UPDATE tag_run_v2_assets SET eligibility='quarantined'").run();
  includes(await f.preview(),'asset_not_approved');
  f.sqlite.prepare("UPDATE tag_run_v2_assets SET eligibility='approved',reviewed_by=NULL").run();
  includes(await f.preview(),'asset_review_evidence_missing');
});
test('funding source must include a confirmed donor event',async t=>{
  const f=fixture(t);
  f.sqlite.prepare("UPDATE tag_run_v2_deposits SET status='refund_review'").run();
  const p=await f.preview();includes(p,'confirmed_donation_missing');
  assert.equal(p.transactionBroadcast,false);
});
test('pool pause, cap pause and unreviewed draw each block',async t=>{
  const f=fixture(t);
  f.sqlite.prepare("UPDATE tag_run_v2_pool_config SET status='paused'").run();
  includes(await f.preview(),'pool_not_review_only');
  f.sqlite.prepare("UPDATE tag_run_v2_pool_config SET status='review_only'").run();
  f.sqlite.prepare('UPDATE tag_run_v2_payout_caps SET paused=1,revision=revision+1').run();
  includes(await f.preview(),'payout_cap_paused');
  f.sqlite.prepare('UPDATE tag_run_v2_payout_caps SET paused=0,revision=revision+1').run();
  f.sqlite.prepare("UPDATE tag_run_v2_draws SET status='rejected'").run();
  includes(await f.preview(),'draw_not_reviewed');
});
test('snapshot arithmetic detects 5% inflation and digest/source revocation',async t=>{
  const f=fixture(t);
  f.sqlite.prepare("UPDATE tag_run_v2_snapshots SET five_percent_units='501'").run();
  includes(await f.preview(),'snapshot_budget_invalid');
});
test('invalid registered destination is blocked',async t=>{
  const f=fixture(t);
  f.sqlite.prepare("UPDATE tag_run_wallets SET wax_account='NOT_WAX'").run();
  includes(await f.preview(),'registered_destination_missing');
});
test('changed valid registered destination is read from authoritative D1',async t=>{
  const f=fixture(t);
  f.sqlite.prepare("UPDATE tag_run_wallets SET wax_account='newrecipient1'").run();
  const p=await f.preview();
  assert.equal(p.status,'REVIEW_CANDIDATE');
  assert.equal(p.receivingAccount,'newrecipient1');
  assert.equal(p.unsignedAction.data.to,'newrecipient1');
});
test('per-transfer limit is enforced using BigInt units',async t=>{
  const f=fixture(t,{perTransfer:'100'});
  includes(await f.preview({bundleIndex:1}),'per_transfer_cap_exceeded');
});
test('duplicate bundle reservation is detected from the real payout ledger',async t=>{
  const f=fixture(t);
  await f.reserve(0);
  const before=f.commitCount();
  const result=await f.preview();
  includes(result,'bundle_already_reserved');
  assert.equal(result.unsignedAction,null);
  assert.equal(f.commitCount(),before);
});
test('remaining cumulative 5% cap cannot be exceeded by another bundle',async t=>{
  const f=fixture(t);
  await f.reserve(0);
  await f.reserve(1);
  const result=await f.preview({bundleIndex:2});
  includes(result,'daily_cap_exceeded');
  assert.equal(result.remainingCapUnits,'200');
  assert.equal(result.unsignedAction,null);
});
test('a remote DB read failure is never treated as approval',async t=>{
  const f=fixture(t);
  f.env.DB={prepare(){throw Error('d1_unavailable');}};
  await assert.rejects(f.preview(),/d1_unavailable/);
});
test('invalid group and bundle selectors are rejected before D1 reads',async t=>{
  const f=fixture(t);
  await assert.rejects(f.preview({chatId:'-100other'}),/selector_invalid/);
  await assert.rejects(f.preview({bundleIndex:20}),/selector_invalid/);
});


test('approved asset metadata must match exact WAX asset identity',async t=>{
  const f=fixture(t);
  f.sqlite.prepare("UPDATE tag_run_v2_assets SET token_symbol='DUMPIT'").run();
  includes(await f.preview(),'asset_not_approved');
  f.sqlite.prepare("UPDATE tag_run_v2_assets SET token_symbol='LFGK',chain_id=?")
    .run('0'.repeat(64));
  includes(await f.preview(),'asset_not_approved');
  f.sqlite.prepare("UPDATE tag_run_v2_assets SET chain_id=?,token_contract='wuffi'")
    .run(WAX_MAINNET_CHAIN_ID);
  includes(await f.preview(),'asset_not_approved');
  f.sqlite.prepare("UPDATE tag_run_v2_assets SET token_contract='kingsofgraff',token_precision=8").run();
  includes(await f.preview(),'asset_not_approved');
});
test('partial refund-review deposits cannot justify the confirmed funded balance',async t=>{
  const f=fixture(t);
  f.sqlite.prepare("UPDATE tag_run_v2_deposits SET units='1'").run();
  f.sqlite.prepare('INSERT INTO tag_run_v2_deposits '+
    '(chain_id,global_action_seq,transaction_id,block_num,block_id,'+
    'sender_account,recipient_account,asset_key,units,memo_digest,status) '+
    'VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  ).run(WAX_MAINNET_CHAIN_ID,'12','d'.repeat(64),101,'f'.repeat(64),
    'somewallet11',TIP_ACCOUNT,A,'9999',SNAP,'refund_review');
  includes(await f.preview(),'donation_funding_snapshot_unreconciled');
});
test('future donations or unreviewed donations cannot fund an earlier LIB',async t=>{
  const f=fixture(t);
  f.sqlite.prepare("UPDATE tag_run_v2_deposits SET block_num=102").run();
  includes(await f.preview(),'donation_funding_snapshot_unreconciled');
  includes(await f.preview(),'confirmed_donation_missing');
  f.sqlite.prepare('UPDATE tag_run_v2_deposits SET block_num=101,reviewed_at=NULL').run();
  includes(await f.preview(),'confirmed_donation_missing');
});
test('mismatched reviewed draw snapshot commitment blocks the payout',async t=>{
  const f=fixture(t);
  f.sqlite.prepare('UPDATE tag_run_v2_draws SET snapshots_digest=?')
    .run('e'.repeat(64));
  includes(await f.preview(),'draw_snapshot_commitment_unverifiable');
});
test('multi-asset draws fail closed until a canonical aggregate digest exists',async t=>{
  const f=fixture(t);
  const second=assetKey('kingsofgraff','DUMPIT',8);
  f.sqlite.prepare('INSERT INTO tag_run_v2_assets '+
    '(asset_key,chain_id,token_contract,token_symbol,token_precision) '+
    'VALUES (?,?,?,?,?)'
  ).run(second,WAX_MAINNET_CHAIN_ID,'kingsofgraff','DUMPIT',8);
  f.sqlite.prepare('INSERT INTO tag_run_v2_snapshots '+
    '(chat_id,day_key,asset_key,wallet_account,chain_irreversible_block,'+
    'chain_block_id,onchain_units,allocated_unpaid_units,excluded_units,'+
    'spendable_units,five_percent_units,snapshot_digest,status) '+
    'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(GROUP,DAY,second,TIP_ACCOUNT,101,'f'.repeat(64),
    '100','0','0','100','5','e'.repeat(64),'verified');
  includes(await f.preview(),'draw_snapshot_commitment_unverifiable');
});

test('CLI arguments require explicit exact asset selection and never imply approval',()=>{
  const args=parseDryRunArgs([
    '--asset','kingsofgraff:LFGK:4','--day',DAY,'--bundle','0'
  ]);
  assert.deepEqual(args.operatorAllowlist,[]);
  assert.equal(args.bundleIndex,0);
  const reviewed=parseDryRunArgs([
    '--asset','kingsofgraff:LFGK:4','--day',DAY,'--bundle','0',
    '--allow-asset','kingsofgraff:LFGK:4'
  ]);
  assert.deepEqual(reviewed.operatorAllowlist,[A]);
  assert.throws(()=>parseDryRunArgs([
    '--asset','kingsofgraff:LFGK:4','--bundle','20'
  ]),/bundle_index_invalid/);
});
test('Cloudflare adapter is wrapped in SELECT-only capability',()=>{
  let called=0;
  const db=selectOnlyDatabase({
    prepare(sql){called++;return {bind(){return {first:async()=>({sql})}}};}
  });
  assert.throws(()=>db.prepare('UPDATE accounts SET status=1'),
    /write_statement_forbidden/);
  assert.throws(()=>db.prepare('SELECT 1; DELETE FROM users'),
    /write_statement_forbidden/);
  assert.equal(called,0);
});
