// TAG RUN V2 production payout custody boundary.
// This module owns durable D1 caps, intents and prepared-transaction locks.
// The scheduled automation may call it only behind the complete release gate;
// no public route can reserve, sign or broadcast a payout. The signer receives
// one exact reviewed transfer and its key exists only as a Worker secret.
import {
  TIP_ACCOUNT, WAX_MAINNET_CHAIN_ID, assetKey, parseIntegerUnits,
  formatQuantity, sha256Text, validUtcDay
} from './v2-core.js';
import { authenticatedGroupId, isValidWaxAccount } from './core.js';
import { checkWaxDestination } from './wallet-destination.js';

export const PAYOUT_EXECUTOR_IMPLEMENTED = true;
export const PAYOUT_EXECUTOR_AUTO_ENABLED = true;
const HEX=/^[0-9a-f]{64}$/;
const fail=reason=>{throw new Error('v2_payout_'+reason);};
const read=(response,label)=>{
  if(response === null)return null;
  if(!response || typeof response!=='object')fail(label+'_read_unavailable');
  return response;
};
const units=value=>parseIntegerUnits(value);
const exact=(value)=>{const x=units(value);if(x<=0n)fail('invalid_positive_units');return x;};
const assertGroup=(env,chatId)=>{
  const group=authenticatedGroupId(env);
  if(!group||chatId!==group)fail('group_mismatch');
};
function assertExecutionMode(env){
  // This requires a SEPARATE operator-reviewed production release. The
  // existing observation deployment has all of these switches OFF.
  if(env?.TAG_RUN_ENABLED!=='true' ||
     env?.TAG_RUN_V2_POOL_ENABLED!=='true' ||
     env?.TAG_RUN_V2_DRAWS_ENABLED!=='true' ||
     env?.TAG_RUN_V2_PAYOUTS_ENABLED!=='true' ||
     env?.TAG_RUN_V2_OBSERVATION_ENABLED!=='false' ||
     env?.TAG_RUN_WEEKLY_REWARDS_ENABLED!=='false' ||
     env?.TAG_RUN_V2_TIP_ACCOUNT!==TIP_ACCOUNT ||
     env?.TAG_RUN_V2_EXECUTOR_RELEASE_APPROVED!=='true' ||
     !env?.DB)fail('release_not_authorized');
}
function assertReconciliationMode(env){
  // Stopping NEW payouts must never prevent confirmation of an action that
  // was already handed to Anchor before the emergency stop. This does NOT
  // unlock a cap, reserve a bundle or invoke the signer.
  if(env?.TAG_RUN_ENABLED!=='true' ||
     env?.TAG_RUN_WEEKLY_REWARDS_ENABLED!=='false' ||
     env?.TAG_RUN_V2_TIP_ACCOUNT!==TIP_ACCOUNT || !env?.DB)
    fail('reconciliation_not_authorized');
}
async function config(db){
  const row=read(await db.prepare(
    'SELECT wallet_account,status,daily_bps,active_daily_bps,active_policy_version,historical_ticket_bps '+
    'FROM tag_run_v2_pool_config WHERE config_id=1').first(),'config');
  if(!row||row.wallet_account!==TIP_ACCOUNT||row.status!=='review_only'||
     (row.daily_bps!==500||row.active_daily_bps!==100||row.active_policy_version!==2)||row.historical_ticket_bps!==5000)
    fail('pool_not_reviewed');
}
const decimalAdd=(a,b)=>{
  const n=units(a)+units(b);
  if(n.toString().length>78)fail('units_overflow');
  return n.toString();
};
const rowInfo=row=>Object.freeze({
  intentKey:row.intent_key,chatId:row.chat_id,day:row.day_key,
  assetKey:row.asset_key,destination:row.receiving_account,
  amountUnits:row.amount_units,status:row.status,txId:row.signed_tx_id,
  submissionTxId:row.submission_tx_id ?? null,
  transferConfirmed:row.status==='confirmed'
});

// Only create a daily cap after the existing live D1 source contains an
// approved asset and a VERIFIED irreversible snapshot; never use observed
// head balances, quarantine records or an unsigned offline simulation.
export async function initializeReviewedDailyCap(env,{
  chatId,day,contract,symbol,precision,authorizedBy,maxTransferUnits,
  paused=true
}={}){
  assertExecutionMode(env);assertGroup(env,chatId);
  if(!validUtcDay(day)||!Number.isInteger(precision)||precision<0||
     precision>8||typeof authorizedBy!=='string'||!authorizedBy ||
     paused!==true)fail('invalid_cap_authority');
  await config(env.DB);
  const key=assetKey(contract,symbol,precision);
  const source=read(await env.DB.prepare(
    'SELECT s.snapshot_digest,s.status,s.spendable_units,'+
    's.onchain_units,s.allocated_unpaid_units,s.excluded_units,'+
    's.daily_reward_units,s.reward_policy_bps,a.eligibility FROM tag_run_v2_snapshots s '+
    'JOIN tag_run_v2_assets a ON a.asset_key=s.asset_key '+
    'WHERE s.chat_id=? AND s.day_key=? AND s.asset_key=?'
  ).bind(chatId,day,key).first(),'snapshot');
  if(!source||source.status!=='verified'||source.reward_policy_bps!==100||source.eligibility!=='approved'||
     !HEX.test(source.snapshot_digest))fail('unapproved_snapshot');
  const available=units(source.spendable_units),
    onchain=units(source.onchain_units),
    reserved=units(source.allocated_unpaid_units),
    excluded=units(source.excluded_units),
    daily=units(source.daily_reward_units);
  if(reserved+excluded>onchain ||
     available!==onchain-reserved-excluded ||
     source.reward_policy_bps!==100||daily!==available*100n/10000n||daily===0n)
    fail('snapshot_budget_mismatch');
  const per=exact(maxTransferUnits);
  if(per>daily)fail('invalid_transfer_cap');
  const r=await env.DB.prepare(
    'INSERT INTO tag_run_v2_payout_caps '+
    '(chat_id,day_key,asset_key,snapshot_digest,daily_limit_units,'+
    'per_transfer_limit_units,authorized_by,reward_policy_bps) VALUES (?,?,?,?,?,?,?,100)'
  ).bind(chatId,day,key,source.snapshot_digest,daily.toString(),
    per.toString(),authorizedBy).run();
  if(r?.success!==true||r.meta?.changes!==1)fail('cap_write_failed');
  return Object.freeze({chatId,day,assetKey:key,dailyLimitUnits:daily.toString(),
    paused:true,perTransferLimitUnits:per.toString(),authorized:false});
}

// A cap remains paused until the automatic release policy verifies its pinned
// asset, reviewed draw and immutable snapshot, then opens it separately.
// All reservations spend a CUMULATIVE cap, including cancelled/unknown items.
// D1.batch is a single transaction; any duplicate/over-budget INSERT aborts
// the preceding CAS update rather than leaving a partial reserved amount.
export async function reserveReviewedPayout(env,{
  chatId,day,contract,symbol,precision,bundleIndex,
  telegramId,receivingAccount,amountUnits,authorizationDigest,approvedBy
}={}){
  assertExecutionMode(env);assertGroup(env,chatId);
  if(!validUtcDay(day)||!Number.isSafeInteger(bundleIndex)||
     bundleIndex<0||bundleIndex>=20||
     !/^[0-9]{1,20}$/.test(String(telegramId||''))||
     !isValidWaxAccount(receivingAccount)||receivingAccount===TIP_ACCOUNT||
     !HEX.test(authorizationDigest||'')||
     typeof approvedBy!=='string'||!approvedBy)fail('invalid_intent');
  const amount=exact(amountUnits);
  const key=assetKey(contract,symbol,precision);
  await config(env.DB);
  const [cap,bundle,wallet]=await Promise.all([
    env.DB.prepare('SELECT * FROM tag_run_v2_payout_caps '+
      'WHERE chat_id=? AND day_key=? AND asset_key=?')
      .bind(chatId,day,key).first(),
    env.DB.prepare('SELECT b.telegram_id,b.units,b.status,'+
      'd.status AS draw_status,d.reviewed_by FROM tag_run_v2_bundles b '+
      'JOIN tag_run_v2_draws d ON d.chat_id=b.chat_id AND d.day_key=b.day_key '+
      'WHERE b.chat_id=? AND b.day_key=? AND b.asset_key=? AND b.bundle_index=?')
      .bind(chatId,day,key,bundleIndex).first(),
    env.DB.prepare('SELECT telegram_id,wax_account FROM tag_run_wallets '+
      'WHERE telegram_id=?').bind(String(telegramId)).first()
  ]);
  if(!cap||cap.paused!==0||!HEX.test(cap.snapshot_digest)||
     !bundle||bundle.telegram_id!==String(telegramId)||
     bundle.units!==amount.toString()||bundle.status!=='preview_only'||
     bundle.draw_status!=='reviewed'||
     typeof bundle.reviewed_by!=='string'||!bundle.reviewed_by)
    fail('cap_or_allocation_not_approved');
  if(!wallet||wallet.telegram_id!==String(telegramId)||
     wallet.wax_account!==receivingAccount)fail('registered_destination_changed');
  const snapshot=await env.DB.prepare(
    'SELECT status,snapshot_digest FROM tag_run_v2_snapshots '+
    'WHERE chat_id=? AND day_key=? AND asset_key=?'
  ).bind(chatId,day,key).first();
  const asset=await env.DB.prepare(
    'SELECT eligibility FROM tag_run_v2_assets WHERE asset_key=?')
    .bind(key).first();
  if(!snapshot||snapshot.status!=='verified'||
     snapshot.snapshot_digest!==cap.snapshot_digest||
     asset?.eligibility!=='approved')fail('funding_proof_revoked');
  const spent=units(cap.committed_units),limit=units(cap.daily_limit_units);
  const per=units(cap.per_transfer_limit_units);
  if(amount>per)fail('transfer_cap_exceeded');
  if(spent+amount>limit)fail('daily_cap_exceeded');
  const intentKey=await sha256Text([
    chatId,day,key,bundleIndex,telegramId,receivingAccount,
    amount.toString(),cap.snapshot_digest,authorizationDigest
  ].join('|'));
  const next=decimalAdd(cap.committed_units,amount.toString());
  const change=env.DB.prepare(
    'UPDATE tag_run_v2_payout_caps SET committed_units=?,last_reserved_units=?,'+
    'last_intent_key=?,revision=revision+1 '+
    'WHERE chat_id=? AND day_key=? AND asset_key=? AND paused=0 '+
    'AND revision=? AND committed_units=?'
  ).bind(next,amount.toString(),intentKey,chatId,day,key,
    cap.revision,cap.committed_units);
  const insert=env.DB.prepare(
    'INSERT INTO tag_run_v2_payout_intents '+
    '(intent_key,chat_id,day_key,asset_key,bundle_index,telegram_id,'+
    'receiving_account,amount_units,snapshot_digest,authorization_digest,'+
    'approved_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(intentKey,chatId,day,key,bundleIndex,String(telegramId),
    receivingAccount,amount.toString(),cap.snapshot_digest,
    authorizationDigest,approvedBy);
  // Atomicity depends on verified Cloudflare D1 .batch contract and SQL
  // constraints; concurrent callers cannot double reserve the same cap.
  const results=await env.DB.batch([change,insert]);
  if(!Array.isArray(results)||results.length!==2||
     results.some(r=>r?.success!==true)||
     results[0].meta?.changes!==1||results[1].meta?.changes!==1)
    fail('reservation_batch_failed');
  return Object.freeze({intentKey,destination:receivingAccount,
    amountUnits:amount.toString(),state:'reserved',transferAttempted:false});
}

// Generate exact EOSIO transfer request. Token contract is the recorded
// asset contract, never inferred from its symbol alone. The custom
// "tagrain" permission must be configured on-chain for EACH approved
// token contract's transfer action. linkauth does not limit amounts/to.
export function buildReviewedWaxTransfer(intent,{permission='tagrain'}={}){
  if(!intent||intent.status!=='reserved'||!HEX.test(intent.intent_key)||
     !isValidWaxAccount(intent.receiving_account)||
     intent.receiving_account===TIP_ACCOUNT||
     !['tagrain','active'].includes(permission))
    fail('intent_not_reserved');
  const parts=String(intent.asset_key||'').split(':');
  if(parts.length!==4||parts[0]!==WAX_MAINNET_CHAIN_ID)
    fail('wrong_chain_or_asset');
  const [_,contract,symbol,precisionRaw]=parts;
  const precision=Number(precisionRaw);
  if(assetKey(contract,symbol,precision)!==intent.asset_key)
    fail('wrong_chain_or_asset');
  const quantity=formatQuantity(intent.amount_units,precision,symbol);
  const action=Object.freeze({
    account:contract,name:'transfer',
    authorization:[{actor:TIP_ACCOUNT,permission}],
    data:{from:TIP_ACCOUNT,to:intent.receiving_account,quantity,
      memo:'TAG RUN V2 '+intent.intent_key.slice(0,20)}
  });
  return Object.freeze({chainId:WAX_MAINNET_CHAIN_ID,action,
    intentKey:intent.intent_key,from:TIP_ACCOUNT,contract,
    destination:intent.receiving_account,amountUnits:intent.amount_units});
}


function assertAutomaticExecutionMode(env) {
  assertExecutionMode(env);
  if (env?.TAG_RUN_V2_AUTOMATION_ENABLED !== 'true' ||
      env?.TAG_RUN_V2_AUTOMATION_RELEASE_APPROVED !== 'true' ||
      env?.TAG_RUN_V2_SIGNER_PERMISSION !== 'active') {
    fail('automation_release_not_authorized');
  }
}

export async function openReviewedDailyCap(env, { chatId, day, assetKey: key } = {}) {
  assertAutomaticExecutionMode(env);
  assertGroup(env, chatId);
  if (!validUtcDay(day) || typeof key !== 'string' || !key) fail('invalid_cap_authority');
  const result = await env.DB.prepare(
    "UPDATE tag_run_v2_payout_caps SET paused=0,revision=revision+1 " +
    "WHERE chat_id=? AND day_key=? AND asset_key=? AND paused=1 AND committed_units='0' " +
    "AND EXISTS (SELECT 1 FROM tag_run_v2_pool_config p WHERE p.config_id=1 " +
    "AND p.status='review_only' AND p.wallet_account='isthatajoint' " +
    "AND p.active_daily_bps=100 AND p.active_policy_version=2) " +
    "AND EXISTS (SELECT 1 FROM tag_run_v2_snapshots s JOIN tag_run_v2_assets a " +
    "ON a.asset_key=s.asset_key WHERE s.chat_id=tag_run_v2_payout_caps.chat_id " +
    "AND s.day_key=tag_run_v2_payout_caps.day_key " +
    "AND s.asset_key=tag_run_v2_payout_caps.asset_key AND s.status='verified' " +
    "AND s.reward_policy_bps=100 AND a.eligibility='approved' " +
    "AND length(a.approved_code_hash)=64 AND length(a.approved_abi_hash)=64 " +
    "AND s.snapshot_digest=tag_run_v2_payout_caps.snapshot_digest)"
  ).bind(chatId, day, key).run();
  if (result?.success !== true || result.meta?.changes !== 1) fail('cap_not_opened');
  return Object.freeze({ chatId, day, assetKey: key, paused: false });
}

// Persist the exact signed bytes and transaction ID before any network push.
// A crash can only cause the SAME signed transaction to be re-broadcast.
export async function stagePreparedAutomaticPayout(env, {
  intentKey, transactionId, signedTransactionJson,
  verifyPinnedContract, fetchImpl = fetch
} = {}) {
  assertAutomaticExecutionMode(env);
  if (!HEX.test(intentKey || '') || !HEX.test(transactionId || '') ||
      typeof signedTransactionJson !== 'string' ||
      signedTransactionJson.length < 100 || signedTransactionJson.length > 20000 ||
      typeof verifyPinnedContract !== 'function') fail('prepared_transaction_invalid');
  let parsed;
  try { parsed = JSON.parse(signedTransactionJson); }
  catch (_) { fail('prepared_transaction_invalid'); }
  if (!parsed || typeof parsed !== 'object') fail('prepared_transaction_invalid');
  const intent = await env.DB.prepare(
    'SELECT * FROM tag_run_v2_payout_intents WHERE intent_key=?'
  ).bind(intentKey).first();
  if (!intent || intent.status !== 'reserved') fail('already_submitted_or_missing');
  assertGroup(env, intent.chat_id);
  await config(env.DB);
  const source = await env.DB.prepare(
    'SELECT s.status,s.snapshot_digest,a.eligibility,a.approved_code_hash,' +
    'a.approved_abi_hash FROM tag_run_v2_snapshots s JOIN tag_run_v2_assets a ' +
    'ON a.asset_key=s.asset_key WHERE s.chat_id=? AND s.day_key=? AND s.asset_key=?'
  ).bind(intent.chat_id,intent.day_key,intent.asset_key).first();
  if (!source || source.status !== 'verified' ||
      source.snapshot_digest !== intent.snapshot_digest ||
      source.eligibility !== 'approved' ||
      !HEX.test(source.approved_code_hash || '') ||
      !HEX.test(source.approved_abi_hash || '')) fail('funding_proof_revoked');
  const destination = await checkWaxDestination(intent.receiving_account, fetchImpl);
  if (destination.status !== 'exists') fail('recipient_account_unavailable');
  const request = buildReviewedWaxTransfer(intent, { permission: 'active' });
  const observed = await verifyPinnedContract({
    contract: request.contract,
    symbol: request.action.data.quantity.split(' ').at(-1),
    precision: request.action.data.quantity.includes('.')
      ? request.action.data.quantity.split(' ')[0].split('.')[1].length : 0,
    expectedCodeHash: source.approved_code_hash,
    expectedAbiHash: source.approved_abi_hash
  });
  if (observed?.codeHash !== source.approved_code_hash ||
      observed?.abiHash !== source.approved_abi_hash) fail('contract_pin_changed');
  const lock = await env.DB.prepare(
    "UPDATE tag_run_v2_payout_intents SET status='broadcast_unknown'," +
    "submission_tx_id=?,signed_transaction_json=?,updated_at=CURRENT_TIMESTAMP " +
    "WHERE intent_key=? AND status='reserved' " +
    "AND EXISTS (SELECT 1 FROM tag_run_v2_payout_caps c " +
    "JOIN tag_run_v2_pool_config p ON p.config_id=1 " +
    "WHERE c.chat_id=tag_run_v2_payout_intents.chat_id " +
    "AND c.day_key=tag_run_v2_payout_intents.day_key " +
    "AND c.asset_key=tag_run_v2_payout_intents.asset_key AND c.paused=0 " +
    "AND c.reward_policy_bps=100 AND p.status='review_only' " +
    "AND p.wallet_account='isthatajoint' AND p.active_daily_bps=100 " +
    "AND p.active_policy_version=2) " +
    "AND EXISTS (SELECT 1 FROM tag_run_v2_snapshots s " +
    "JOIN tag_run_v2_assets a ON a.asset_key=s.asset_key " +
    "WHERE s.chat_id=tag_run_v2_payout_intents.chat_id " +
    "AND s.day_key=tag_run_v2_payout_intents.day_key " +
    "AND s.asset_key=tag_run_v2_payout_intents.asset_key " +
    "AND s.status='verified' AND s.reward_policy_bps=100 " +
    "AND s.snapshot_digest=tag_run_v2_payout_intents.snapshot_digest " +
    "AND a.eligibility='approved' AND a.approved_code_hash=? " +
    "AND a.approved_abi_hash=?) " +
    "AND EXISTS (SELECT 1 FROM tag_run_v2_draws d " +
    "WHERE d.chat_id=tag_run_v2_payout_intents.chat_id " +
    "AND d.day_key=tag_run_v2_payout_intents.day_key " +
    "AND d.status='reviewed' AND d.reward_policy_bps=100)"
  ).bind(transactionId, signedTransactionJson, intentKey,
    source.approved_code_hash, source.approved_abi_hash).run();
  if (lock?.success !== true || lock.meta?.changes !== 1) {
    fail('send_lock_blocked_or_already_submitted');
  }
  return Object.freeze({ intentKey, transactionId, status: 'broadcast_unknown',
    signedTransactionJson });
}

export async function loadPreparedAutomaticPayout(env, { intentKey } = {}) {
  assertAutomaticExecutionMode(env);
  if (!HEX.test(intentKey || '')) fail('prepared_transaction_invalid');
  const row = await env.DB.prepare(
    'SELECT * FROM tag_run_v2_payout_intents WHERE intent_key=?'
  ).bind(intentKey).first();
  if (!row || row.status !== 'broadcast_unknown' ||
      !HEX.test(row.submission_tx_id || '') ||
      typeof row.signed_transaction_json !== 'string') {
    fail('prepared_transaction_missing');
  }
  assertGroup(env, row.chat_id);
  return Object.freeze({ ...rowInfo(row),
    signedTransactionJson: row.signed_transaction_json });
}

// Calling this changes D1 to UNKNOWN *before* asking any signer to
// broadcast. A failed/timeout RPC must NEVER re-sign/re-submit this intent;
// an operator must reconcile the original chain action. No public route
// calls this function, and no signer is configured by this PR.
export async function handoffApprovedPayout(env,{
  intentKey,signAndBroadcast,verifyReleaseAuthorization,fetchImpl=fetch
}={}){
  assertExecutionMode(env);
  if(!HEX.test(intentKey||'')||typeof signAndBroadcast!=='function')
    fail('missing_authorized_signer');
  if(verifyReleaseAuthorization!==undefined&&
     typeof verifyReleaseAuthorization!=='function')
    fail('invalid_release_authorization_check');
  const intent=await env.DB.prepare(
    'SELECT * FROM tag_run_v2_payout_intents WHERE intent_key=?'
  ).bind(intentKey).first();
  if(!intent||intent.status!=='reserved')fail('already_submitted_or_missing');
  assertGroup(env,intent.chat_id);
  // Both pause layers must be honored. The final D1 UPDATE repeats
  // these checks atomically after the asynchronous recipient RPC returns.
  await config(env.DB);
  const cap=await env.DB.prepare(
    'SELECT paused FROM tag_run_v2_payout_caps '+
    'WHERE chat_id=? AND day_key=? AND asset_key=?'
  ).bind(intent.chat_id,intent.day_key,intent.asset_key).first();
  if(!cap||cap.paused!==0)fail('emergency_pause');
  const source=await env.DB.prepare(
    'SELECT s.status,s.snapshot_digest,a.eligibility FROM tag_run_v2_snapshots s '+
    'JOIN tag_run_v2_assets a ON a.asset_key=s.asset_key '+
    'WHERE s.chat_id=? AND s.day_key=? AND s.asset_key=?'
  ).bind(intent.chat_id,intent.day_key,intent.asset_key).first();
  if(!source||source.status!=='verified'||
     source.snapshot_digest!==intent.snapshot_digest||
     source.eligibility!=='approved')
    fail('funding_proof_revoked');
  // Recheck the user-selected receiving account exists on WAX mainnet
  // immediately before any irreversible send; no ownership signature needed.
  const destination=await checkWaxDestination(intent.receiving_account,fetchImpl);
  if(destination.status!=='exists')fail('recipient_account_unavailable');
  if(verifyReleaseAuthorization)await verifyReleaseAuthorization();
  const action=buildReviewedWaxTransfer(intent);
  // CAS on intent AND both live pause authorities in the SAME D1 UPDATE:
  // a pause or asset revocation committed during the awaited RPC cannot
  // slip past a stale preflight and cause an irreversible payout.
  const lock=await env.DB.prepare(
    "UPDATE tag_run_v2_payout_intents SET status='broadcast_unknown',"+
    "updated_at=CURRENT_TIMESTAMP WHERE intent_key=? AND status='reserved' "+
    "AND EXISTS (SELECT 1 FROM tag_run_v2_payout_caps c "+
    "JOIN tag_run_v2_pool_config p ON p.config_id=1 "+
    "WHERE c.chat_id=tag_run_v2_payout_intents.chat_id "+
    "AND c.day_key=tag_run_v2_payout_intents.day_key "+
    "AND c.asset_key=tag_run_v2_payout_intents.asset_key "+
    "AND c.paused=0 AND c.reward_policy_bps=100 AND p.status='review_only' "+
    "AND p.wallet_account='isthatajoint' AND p.daily_bps=500 AND p.active_daily_bps=100 AND p.active_policy_version=2 "+
    "AND p.historical_ticket_bps=5000) "+
    "AND EXISTS (SELECT 1 FROM tag_run_v2_snapshots s "+
    "JOIN tag_run_v2_assets a ON a.asset_key=s.asset_key "+
    "WHERE s.chat_id=tag_run_v2_payout_intents.chat_id "+
    "AND s.day_key=tag_run_v2_payout_intents.day_key "+
    "AND s.asset_key=tag_run_v2_payout_intents.asset_key "+
    "AND s.status='verified' AND s.reward_policy_bps=100 "+
    "AND s.snapshot_digest=tag_run_v2_payout_intents.snapshot_digest "+
    "AND a.eligibility='approved') "+
    "AND EXISTS (SELECT 1 FROM tag_run_v2_draws d "+
    "WHERE d.chat_id=tag_run_v2_payout_intents.chat_id "+
    "AND d.day_key=tag_run_v2_payout_intents.day_key "+
    "AND d.status='reviewed' AND d.reward_policy_bps=100 AND d.reviewed_by IS NOT NULL "+
    "AND length(d.reviewed_by)>0)"
  ).bind(intentKey).run();
  if(lock?.success!==true||lock.meta?.changes!==1)
    fail('send_lock_blocked_or_already_submitted');
  // Exception, timeout or a tx ID response does not change UNKNOWN state:
  // chain action confirmation must be separately verified against LIB.
  // External signer MUST approve the exact action + chainId before sending.
  try {
    const submitted=await signAndBroadcast(action);
    return Object.freeze({intentKey,status:'broadcast_unknown',
      networkResponseTxId:HEX.test(submitted?.transactionId||'')
        ? submitted.transactionId:null,
      broadcastMayHaveOccurred:true,confirmed:false});
  } catch(_) {
    return Object.freeze({intentKey,status:'broadcast_unknown',
      networkResponseTxId:null,broadcastMayHaveOccurred:true,
      confirmed:false,manualReconciliationRequired:true});
  }
}

// Operator supplies independently verified irreversible WAX chain action
// evidence. This function never trusts mere RPC submission success.
export async function markIrreversiblyConfirmed(env,{
  intentKey,transactionId,verifyIrreversibleAction
}={}){
  assertReconciliationMode(env);
  if(!HEX.test(intentKey||'')||!HEX.test(transactionId||'')||
     typeof verifyIrreversibleAction!=='function')fail('finality_unverified');
  const row=await env.DB.prepare('SELECT * FROM tag_run_v2_payout_intents '+
    'WHERE intent_key=?').bind(intentKey).first();
  // An already handed-off transfer can enter reconciliation_review while
  // an operator investigates an uncertain result. Verified irreversible proof
  // must still be able to settle that exact original transfer without any
  // second broadcast or fresh reservation.
  if(!row||!['broadcast_unknown','reconciliation_review'].includes(row.status))
    fail('not_pending_reconciliation');
  if (row.submission_tx_id && row.submission_tx_id !== transactionId)
    fail('chain_action_mismatch');
  assertGroup(env,row.chat_id);
  const want=buildReviewedWaxTransfer({...row,status:'reserved'});
  // Do not accept caller-supplied "irreversible:true" or an RPC submission
  // response as proof; fetch chain action / LIB from an independent verifier.
  const action=await verifyIrreversibleAction({
    transactionId,intentKey,chainId:WAX_MAINNET_CHAIN_ID
  });
  if(action?.irreversible!==true)fail('finality_unverified');
  // The transaction ID persisted in immutable D1 must be the exact ID
  // corroborated by the independent irreversible chain action, not merely
  // an arbitrary ID supplied alongside otherwise matching action fields.
  if(action.transactionId!==transactionId ||
     action.chainId!==WAX_MAINNET_CHAIN_ID ||
     action.contract!==want.contract ||
     action.name!=='transfer'||action.from!==TIP_ACCOUNT ||
     action.to!==want.destination||action.quantity!==want.action.data.quantity||
     action.memo!==want.action.data.memo||
     !Number.isSafeInteger(action.blockNum)||action.blockNum<=0 ||
     !HEX.test(action.blockId||''))fail('chain_action_mismatch');
  // Evidence MUST be fetched/verified independently by a protected service.
  const r=await env.DB.prepare(
    "UPDATE tag_run_v2_payout_intents SET status='confirmed',signed_tx_id=?,"+
    "updated_at=CURRENT_TIMESTAMP WHERE intent_key=? "+
    "AND status IN ('broadcast_unknown','reconciliation_review') "+
    "AND signed_tx_id IS NULL"
  ).bind(transactionId,intentKey).run();
  if(r?.success!==true||r.meta?.changes!==1)fail('reconciliation_conflict');
  return Object.freeze({...rowInfo({...row,status:'confirmed',
    signed_tx_id:transactionId})});
}
