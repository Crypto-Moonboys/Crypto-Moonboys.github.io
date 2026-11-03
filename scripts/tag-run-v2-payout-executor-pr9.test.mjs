import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import {
  TIP_ACCOUNT,WAX_MAINNET_CHAIN_ID,assetKey,sha256Text
} from '../workers/moonboys-api/tag-run/v2-core.js';
import {
  PAYOUT_EXECUTOR_IMPLEMENTED,PAYOUT_EXECUTOR_AUTO_ENABLED,
  initializeReviewedDailyCap,reserveReviewedPayout,buildReviewedWaxTransfer,
  handoffApprovedPayout,markIrreversiblyConfirmed
} from '../workers/moonboys-api/tag-run/v2-payout-executor.js';
import { verifyIrreversibleWaxPayout } from
  '../workers/moonboys-api/tag-run/v2-payout-chain-reconcile.js';

const GROUP='-1001234567890',OTHER='-1007777777777';
const DAY='2026-11-02',A=assetKey('kingsofgraff','LFGK',4);
const MEMBER='1111',RECEIVER='gkniftyheads',SNAP='a'.repeat(64),
  RULES='b'.repeat(64),AUTH='c'.repeat(64),TRANSACTION='d'.repeat(64);
function fixture(t,{daily='500',available='10000',donation=true,
  approved=true,verified=true,recipient=RECEIVER}={}){
  const sqlite=new DatabaseSync(':memory:');
  t.after(()=>sqlite.close());
  sqlite.exec('PRAGMA foreign_keys=ON;PRAGMA recursive_triggers=OFF;');
  for(const file of [
    '../workers/moonboys-api/migrations/103_tag_run_street_cred_rewards.sql',
    '../workers/moonboys-api/migrations/104_tag_run_v2_community_token_pot.sql',
    '../workers/moonboys-api/migrations/105_tag_run_v2_payout_execution.sql'
  ])sqlite.exec(readFileSync(new URL(file,import.meta.url),'utf8'));
  sqlite.prepare("UPDATE tag_run_v2_pool_config SET status='review_only'").run();
  sqlite.prepare('INSERT INTO tag_run_v2_assets '+
    '(asset_key,chain_id,token_contract,token_symbol,token_precision,eligibility) '+
    'VALUES (?,?,?,?,?,?)').run(A,WAX_MAINNET_CHAIN_ID,
      'kingsofgraff','LFGK',4,approved?'approved':'quarantined');
  if(donation)sqlite.prepare(
    'INSERT INTO tag_run_v2_deposits '+
    '(chain_id,global_action_seq,transaction_id,block_num,block_id,'+
    'sender_account,recipient_account,asset_key,units,memo_digest,status) '+
    'VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  ).run(WAX_MAINNET_CHAIN_ID,'11','e'.repeat(64),101,'f'.repeat(64),
    'somewallet11',TIP_ACCOUNT,A,'100000',SNAP,'confirmed_donation');
  sqlite.prepare('INSERT INTO tag_run_v2_snapshots '+
    '(chat_id,day_key,asset_key,wallet_account,chain_irreversible_block,'+
    'chain_block_id,onchain_units,allocated_unpaid_units,excluded_units,'+
    'spendable_units,five_percent_units,snapshot_digest,status) '+
    'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(GROUP,DAY,A,TIP_ACCOUNT,101,'f'.repeat(64),
    available,'0','0',available,daily,SNAP,
    verified?'verified':'unverified');
  sqlite.prepare('INSERT INTO tag_run_v2_draws '+
    '(chat_id,day_key,status,seed_commitment,rules_digest,weights_digest,'+
    'snapshots_digest) VALUES (?,?,?,?,?,?,?)'
  ).run(GROUP,DAY,'reviewed',SNAP,RULES,RULES,SNAP);
  sqlite.prepare('UPDATE tag_run_v2_draws SET reviewed_by=? '+
    'WHERE chat_id=? AND day_key=?').run('independent-reviewer',GROUP,DAY);
  for(let i=0;i<3;i++){
    sqlite.prepare('INSERT INTO tag_run_v2_bundles '+
      '(chat_id,day_key,asset_key,bundle_index,telegram_id,'+
      'ticket_class,units) VALUES (?,?,?,?,?,?,?)'
    ).run(GROUP,DAY,A,i,MEMBER,'current',
      ['100','200','250'][i]);
  }
  sqlite.prepare('INSERT INTO tag_run_wallets (telegram_id,wax_account) '+
    'VALUES (?,?)').run(MEMBER,recipient);
  const DB={
    prepare(sql){
      function statement(args=[]) {
        return {
          sql,args,
          bind(...values){return statement(values);},
          async first(){return sqlite.prepare(sql).get(...args)||null;},
          async all(){return {success:true,
            results:sqlite.prepare(sql).all(...args)};},
          async run(){const r=sqlite.prepare(sql).run(...args);
            return {success:true,meta:{changes:r.changes}};}
        };
      }
      return statement();
    },
    async batch(statements){
      sqlite.exec('BEGIN IMMEDIATE');
      try{
        const results=statements.map(q=>{
          const r=sqlite.prepare(q.sql).run(...q.args);
          return {success:true,meta:{changes:r.changes}};
        });
        sqlite.exec('COMMIT');
        return results;
      }catch(e){
        sqlite.exec('ROLLBACK');
        throw e;
      }
    }
  };
  const env={
    DB,TELEGRAM_GROUP_CHAT_ID:GROUP,TAG_RUN_ENABLED:'true',
    TAG_RUN_WEEKLY_REWARDS_ENABLED:'false',
    TAG_RUN_V2_POOL_ENABLED:'true',TAG_RUN_V2_DRAWS_ENABLED:'true',
    TAG_RUN_V2_PAYOUTS_ENABLED:'true',
    TAG_RUN_V2_OBSERVATION_ENABLED:'false',
    TAG_RUN_V2_TIP_ACCOUNT:TIP_ACCOUNT,
    TAG_RUN_V2_EXECUTOR_RELEASE_APPROVED:'true'
  };
  const cap=()=>sqlite.prepare('SELECT * FROM tag_run_v2_payout_caps').get();
  const intents=()=>sqlite.prepare('SELECT * FROM tag_run_v2_payout_intents '+ 
    'ORDER BY bundle_index').all();
  return {sqlite,DB,env,cap,intents};
}
const capArgs={chatId:GROUP,day:DAY,contract:'kingsofgraff',
  symbol:'LFGK',precision:4,authorizedBy:'two-person-reviewed'};
const intentArgs={chatId:GROUP,day:DAY,contract:'kingsofgraff',
  symbol:'LFGK',precision:4,bundleIndex:0,
  telegramId:MEMBER,receivingAccount:RECEIVER,amountUnits:'100',
  authorizationDigest:AUTH,approvedBy:'two-person-reviewed'};
async function openCap(f,options={}){
  await initializeReviewedDailyCap(f.env,{...capArgs,...options});
  f.sqlite.prepare('UPDATE tag_run_v2_payout_caps '+
    'SET paused=0,revision=revision+1').run();
}
const destinationRpc=async(url,opts={})=>{
  if(url.endsWith('/get_info'))return {ok:true,json:async()=>({
    chain_id:WAX_MAINNET_CHAIN_ID
  })};
  if(url.endsWith('/get_account')){
    const body=JSON.parse(opts.body);
    return {ok:true,json:async()=>({account_name:body.account_name})};
  }
  throw Error('unexpected recipient lookup '+url);
};
const safeAction=(intent)=>({
  irreversible:true,chainId:WAX_MAINNET_CHAIN_ID,
  contract:'kingsofgraff',name:'transfer',
  from:TIP_ACCOUNT,to:RECEIVER,quantity:'0.0100 LFGK',
  memo:'TAG RUN V2 '+intent.slice(0,20),
  blockNum:101,blockId:'f'.repeat(64)
});

test('production payout code exists but cannot execute in observation deployment',async t=>{
  const f=fixture(t);
  assert.equal(PAYOUT_EXECUTOR_IMPLEMENTED,true);
  assert.equal(PAYOUT_EXECUTOR_AUTO_ENABLED,false);
  assert.throws(()=>buildReviewedWaxTransfer({status:'preview_only'}),
    /v2_payout_intent_not_reserved/);
  for(const flag of ['TAG_RUN_V2_POOL_ENABLED','TAG_RUN_V2_DRAWS_ENABLED',
    'TAG_RUN_V2_PAYOUTS_ENABLED','TAG_RUN_V2_EXECUTOR_RELEASE_APPROVED']){
    f.env[flag]='false';
    await assert.rejects(initializeReviewedDailyCap(f.env,capArgs),
      /v2_payout_release_not_authorized/);
    f.env[flag]='true';
  }
  f.env.TAG_RUN_V2_OBSERVATION_ENABLED='true';
  await assert.rejects(initializeReviewedDailyCap(f.env,capArgs),
    /v2_payout_release_not_authorized/);
  assert.equal(f.intents().length,0);
});

test('funding requires approved token, confirmed donation and verified snapshot',async t=>{
  for(const variant of [
    {donation:false},{approved:false},{verified:false}
  ]){
    const f=fixture(t,variant);
    await assert.rejects(initializeReviewedDailyCap(f.env,capArgs),
      /v2_payout_unapproved_snapshot|v2_payout_cap_source_unapproved/);
    assert.equal(f.cap(),undefined);
  }
});

test('never accept an invented daily cap greater than 5% of available funds',async t=>{
  const f=fixture(t,{daily:'501',available:'10000'});
  await assert.rejects(initializeReviewedDailyCap(f.env,capArgs),
    /v2_payout_snapshot_budget_mismatch/);
  assert.equal(f.cap(),undefined);
});

test('approved daily cap starts paused; cannot accept payouts without release',async t=>{
  const f=fixture(t);
  const cap=await initializeReviewedDailyCap(f.env,capArgs);
  assert.equal(cap.dailyLimitUnits,'500');
  assert.equal(cap.paused,true);
  await assert.rejects(reserveReviewedPayout(f.env,intentArgs),
    /v2_payout_cap_or_allocation_not_approved/);
  assert.equal(f.intents().length,0);
});

test('payout cannot reserve an unreviewed or rejected draw',async t=>{
  const f=fixture(t);await openCap(f);
  f.sqlite.prepare("UPDATE tag_run_v2_draws SET status='preview_only'").run();
  await assert.rejects(reserveReviewedPayout(f.env,intentArgs),
    /v2_payout_cap_or_allocation_not_approved/);
  assert.equal(f.intents().length,0);
  f.sqlite.prepare("UPDATE tag_run_v2_draws SET status='rejected'").run();
  await assert.rejects(reserveReviewedPayout(f.env,intentArgs),
    /v2_payout_cap_or_allocation_not_approved/);
  assert.equal(f.cap().committed_units,'0');
});

test('unique cap reservations commit once and freeze member destination',async t=>{
  const f=fixture(t);
  await openCap(f);
  const first=await reserveReviewedPayout(f.env,intentArgs);
  assert.equal(first.state,'reserved');
  assert.equal(first.transferAttempted,false);
  assert.match(first.intentKey,/^[0-9a-f]{64}$/);
  assert.equal(f.cap().committed_units,'100');
  assert.equal(f.cap().last_intent_key,first.intentKey);
  assert.equal(f.intents()[0].receiving_account,RECEIVER);
  await assert.rejects(reserveReviewedPayout(f.env,intentArgs),
    /v2_payout_intent_source_unapproved_or_duplicate/);
  assert.equal(f.cap().committed_units,'100',
    'D1 batch must roll back the cap update on a duplicate intent');
  assert.equal(f.intents().length,1);
  assert.throws(()=>f.sqlite.prepare('UPDATE tag_run_v2_payout_intents '+
    "SET receiving_account='otherwallet'").run(),
    /v2_payout_intent_immutable/);
  assert.throws(()=>f.sqlite.prepare('DELETE FROM tag_run_v2_payout_intents')
    .run(),/v2_payout_intent_immutable/);
});

test('daily ceiling is cumulative across all allocations and cancellations',async t=>{
  const f=fixture(t);
  await openCap(f);
  await reserveReviewedPayout(f.env,intentArgs);
  await reserveReviewedPayout(f.env,{...intentArgs,
    bundleIndex:1,amountUnits:'200'});
  assert.equal(f.cap().committed_units,'300');
  await assert.rejects(reserveReviewedPayout(f.env,{...intentArgs,
    bundleIndex:2,amountUnits:'250'}),/v2_payout_daily_cap_exceeded/);
  assert.equal(f.cap().committed_units,'300');
  assert.equal(f.intents().length,2);
});

test('unresolved prior-day token obligations block tomorrow against reused balance',async t=>{
  const f=fixture(t);await openCap(f);
  await reserveReviewedPayout(f.env,intentArgs);
  const tomorrow='2026-11-03';
  f.sqlite.prepare('INSERT INTO tag_run_v2_snapshots '+
    '(chat_id,day_key,asset_key,wallet_account,chain_irreversible_block,'+
    'chain_block_id,onchain_units,allocated_unpaid_units,excluded_units,'+
    'spendable_units,five_percent_units,snapshot_digest,status) '+
    'SELECT chat_id,?,asset_key,wallet_account,chain_irreversible_block,'+
    'chain_block_id,onchain_units,allocated_unpaid_units,excluded_units,'+
    'spendable_units,five_percent_units,snapshot_digest,status '+
    'FROM tag_run_v2_snapshots WHERE day_key=?'
  ).run(tomorrow,DAY);
  await initializeReviewedDailyCap(f.env,{...capArgs,day:tomorrow});
  f.sqlite.prepare('UPDATE tag_run_v2_payout_caps '+
    'SET paused=1,revision=revision+1 WHERE day_key=?').run(DAY);
  assert.throws(()=>f.sqlite.prepare('UPDATE tag_run_v2_payout_caps '+
    'SET paused=0,revision=revision+1 WHERE day_key=?')
    .run(tomorrow),/v2_payout_asset_obligations_unresolved/);
  assert.equal(f.sqlite.prepare('SELECT paused FROM tag_run_v2_payout_caps '+
    'WHERE day_key=?').get(tomorrow).paused,1);
  assert.equal(f.intents()[0].status,'reserved');
  assert.equal(f.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('a mismatched registered wallet or group blocks irrevocable reservation',async t=>{
  const f=fixture(t);
  await openCap(f);
  await assert.rejects(reserveReviewedPayout(f.env,{
    ...intentArgs,receivingAccount:'someoneelse'
  }),/v2_payout_registered_destination_changed/);
  await assert.rejects(reserveReviewedPayout(f.env,{
    ...intentArgs,chatId:OTHER
  }),/v2_payout_group_mismatch/);
  assert.equal(f.intents().length,0);
});

test('a stale/parallel cap CAS cannot create a new payout without cap consumption',async t=>{
  const f=fixture(t);
  await openCap(f);
  await reserveReviewedPayout(f.env,intentArgs);
  const malicious='e'.repeat(64);
  assert.throws(()=>f.sqlite.prepare(
    'INSERT INTO tag_run_v2_payout_intents '+
    '(intent_key,chat_id,day_key,asset_key,bundle_index,telegram_id,'+
    'receiving_account,amount_units,snapshot_digest,authorization_digest,'+
    'approved_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  ).run(malicious,GROUP,DAY,A,1,MEMBER,RECEIVER,'200',SNAP,
    AUTH,'two-person-reviewed'),/v2_payout_intent_source_unapproved_or_duplicate/);
  assert.equal(f.intents().length,1);
});

test('signer handoff marks unknown BEFORE call and never automatically retries',async t=>{
  const f=fixture(t);await openCap(f);
  const first=await reserveReviewedPayout(f.env,intentArgs);
  let calls=0;
  const result=await handoffApprovedPayout(f.env,{
    fetchImpl:destinationRpc,
    intentKey:first.intentKey,
    signAndBroadcast:async transfer=>{
      calls++;
      assert.equal(transfer.action.account,'kingsofgraff');
      assert.equal(transfer.action.authorization[0].permission,'tagrain');
      assert.equal(transfer.action.data.quantity,'0.0100 LFGK');
      assert.equal(f.intents()[0].status,'broadcast_unknown');
      return {transactionId:TRANSACTION};
    }
  });
  assert.equal(result.status,'broadcast_unknown');
  assert.equal(result.networkResponseTxId,TRANSACTION);
  assert.equal(f.intents()[0].status,'broadcast_unknown');
  await assert.rejects(handoffApprovedPayout(f.env,{
    fetchImpl:destinationRpc,
    intentKey:first.intentKey,signAndBroadcast:async()=>{calls++;return {};}
  }),/v2_payout_already_submitted_or_missing/);
  assert.equal(calls,1);
});

test('signer/network errors keep UNKNOWN hold for manual reconciliation',async t=>{
  const f=fixture(t);await openCap(f);
  const first=await reserveReviewedPayout(f.env,intentArgs);
  const out=await handoffApprovedPayout(f.env,{
    fetchImpl:destinationRpc,
    intentKey:first.intentKey,signAndBroadcast:async()=>{throw Error('timeout');}
  });
  assert.equal(out.status,'broadcast_unknown');
  assert.equal(out.manualReconciliationRequired,true);
  assert.equal(f.cap().committed_units,'100');
  assert.equal(f.intents()[0].status,'broadcast_unknown');
});

test('invalid receiver RPC blocks signer without recording UNKNOWN state',async t=>{
  const f=fixture(t);await openCap(f);
  const row=await reserveReviewedPayout(f.env,intentArgs);
  let signed=false;
  await assert.rejects(handoffApprovedPayout(f.env,{
    intentKey:row.intentKey,
    fetchImpl:async()=>({ok:true,json:async()=>({chain_id:'wrong'})}),
    signAndBroadcast:async()=>{signed=true;}
  }),/wax_destination_wrong_chain/);
  assert.equal(signed,false);
  assert.equal(f.intents()[0].status,'reserved');
});

test('verified irreversible matching chain action confirms only once',async t=>{
  const f=fixture(t);await openCap(f);
  const first=await reserveReviewedPayout(f.env,intentArgs);
  await handoffApprovedPayout(f.env,{
    fetchImpl:destinationRpc,
    intentKey:first.intentKey,signAndBroadcast:async()=>({transactionId:TRANSACTION})
  });
  const confirmed=await markIrreversiblyConfirmed(f.env,{
    intentKey:first.intentKey,transactionId:TRANSACTION,
    verifyIrreversibleAction:async proof=>{
      assert.equal(proof.transactionId,TRANSACTION);
      return safeAction(first.intentKey);
    }
  });
  assert.equal(confirmed.status,'confirmed');
  assert.equal(confirmed.txId,TRANSACTION);
  assert.equal(f.intents()[0].signed_tx_id,TRANSACTION);
  await assert.rejects(markIrreversiblyConfirmed(f.env,{
    intentKey:first.intentKey,transactionId:TRANSACTION,
    verifyIrreversibleAction:async()=>safeAction(first.intentKey)
  }),/v2_payout_not_pending_reconciliation/);
});

test('failed finality or mismatched amount never confirms sent tokens',async t=>{
  const f=fixture(t);await openCap(f);
  const first=await reserveReviewedPayout(f.env,intentArgs);
  await handoffApprovedPayout(f.env,{
    fetchImpl:destinationRpc,
    intentKey:first.intentKey,signAndBroadcast:async()=>({transactionId:TRANSACTION})
  });
  await assert.rejects(markIrreversiblyConfirmed(f.env,{
    intentKey:first.intentKey,transactionId:TRANSACTION,
    verifyIrreversibleAction:async()=>({...safeAction(first.intentKey),irreversible:false})
  }),/v2_payout_finality_unverified/);
  await assert.rejects(markIrreversiblyConfirmed(f.env,{
    intentKey:first.intentKey,transactionId:TRANSACTION,
    verifyIrreversibleAction:async()=>({...safeAction(first.intentKey),quantity:'100.0000 LFGK'})
  }),/v2_payout_chain_action_mismatch/);
  assert.equal(f.intents()[0].status,'broadcast_unknown');
});

test('no real signer endpoint, transfer flag or network broadcast is installed',()=>{
  const src=readFileSync(new URL(
    '../workers/moonboys-api/tag-run/v2-payout-executor.js',import.meta.url),
  'utf8');
  const flags=readFileSync(new URL(
    '../workers/moonboys-api/wrangler.toml',import.meta.url),'utf8');
  for(const flag of ['TAG_RUN_WEEKLY_REWARDS_ENABLED',
    'TAG_RUN_V2_POOL_ENABLED','TAG_RUN_V2_DRAWS_ENABLED',
    'TAG_RUN_V2_PAYOUTS_ENABLED']){
    assert.match(flags,new RegExp(flag+' = "false"'));
  }
  assert.doesNotMatch(src,/private.?key|seed.?phrase|push_transaction|WAX_SIGNER_URL/i);
  assert.equal(PAYOUT_EXECUTOR_AUTO_ENABLED,false);
});


function waxEvidenceMock({wrongChain=false,unfinalized=false,
  secondDifferent=false,wrongBlock=false}={}){
  let hostIndex=0;
  const row={
    global_sequence:'555',trx_id:TRANSACTION,block_num:101,
    block_id:'f'.repeat(64),
    act:{account:'kingsofgraff',name:'transfer',
      data:{from:TIP_ACCOUNT,to:RECEIVER,quantity:'0.0100 LFGK',
        memo:'TAG RUN V2 '+('1'.repeat(20))}}
  };
  return async(url,{method='GET'}={})=>{
    if(url.endsWith('/get_info'))return {ok:true,json:async()=>({
      chain_id:wrongChain?'wrong':WAX_MAINNET_CHAIN_ID,
      last_irreversible_block_num:unfinalized?100:150
    })};
    if(url.endsWith('/get_block'))return {ok:true,json:async()=>({
      block_num:101,id:wrongBlock?'e'.repeat(64):'f'.repeat(64)
    })};
    if(url.includes('/v2/history/get_actions?')){
      hostIndex++;
      const second=hostIndex===2;
      return {ok:true,json:async()=>({actions:[{
        ...row,act:second&&secondDifferent?{...row.act,
          data:{...row.act.data,to:'otherwallet'}}:row.act
      }]})};
    }
    throw Error('unexpected proof fetch '+url+' '+method);
  };
}

test('outbound reconciliation independently checks two indexers and chain LIB',async()=>{
  const result=await verifyIrreversibleWaxPayout({
    transactionId:TRANSACTION,globalSequence:'555',
    fetchImpl:waxEvidenceMock()
  });
  assert.equal(result.irreversible,true);
  assert.equal(result.merkleInclusionProven,false);
  assert.equal(result.corroborators,2);
  assert.equal(result.to,RECEIVER);
  assert.equal(result.contract,'kingsofgraff');
});
test('chain reconciliation fails closed for wrong chain, unfinalized or disagreement',async()=>{
  for(const opts of [
    {wrongChain:true},{unfinalized:true},
    {secondDifferent:true},{wrongBlock:true}
  ]){
    await assert.rejects(verifyIrreversibleWaxPayout({
      transactionId:TRANSACTION,globalSequence:'555',
      fetchImpl:waxEvidenceMock(opts)
    }),/payout_chain_/);
  }
});
test('chain finality evidence must match stored destination, amount and memo',async t=>{
  const f=fixture(t);await openCap(f);
  const intent=await reserveReviewedPayout(f.env,intentArgs);
  await handoffApprovedPayout(f.env,{
    fetchImpl:destinationRpc,
    intentKey:intent.intentKey,signAndBroadcast:async()=>({
      transactionId:TRANSACTION
    })
  });
  const fetchImpl=async(url,opts)=>{
    const original=waxEvidenceMock();
    return original(url,opts);
  };
  // Mock history action memo belongs to a DIFFERENT intent. The independent
  // verifier accepts the chain event itself; ledger reconciliation refuses
  // it as a mismatch to the frozen, original transfer request.
  await assert.rejects(markIrreversiblyConfirmed(f.env,{
    intentKey:intent.intentKey,transactionId:TRANSACTION,
    verifyIrreversibleAction:args=>verifyIrreversibleWaxPayout({
      ...args,globalSequence:'555',fetchImpl
    })
  }),/v2_payout_chain_action_mismatch/);
  assert.equal(f.intents()[0].status,'broadcast_unknown');
});
