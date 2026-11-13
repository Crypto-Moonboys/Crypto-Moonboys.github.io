// Persisted commit/reveal draw workflow. It remains signer-agnostic; the
// scheduled automation supplies distinct commit and policy-review identities.
import { canonicalSnapshotSetDigest } from '../workers/moonboys-api/tag-run/v2-snapshot-commitment.js';
import { previewCommunityDraw, sha256Text, validUtcDay, parseIntegerUnits,
  MAX_POINTS_PER_DAY, MAX_HISTORICAL_WEIGHT, TIP_ACCOUNT, WAX_MAINNET_CHAIN_ID
} from '../workers/moonboys-api/tag-run/v2-core.js';
const HEX=/^[0-9a-f]{64}$/;
const fail=reason=>{throw Error('v2_draw_'+reason);};
export const DRAW_RULES=Object.freeze({domain:'tag-run-v2:persisted-draw:v1',dailyBps:100,
  historicalClassBps:5000,maxBundlesPerAsset:20,maxHistoricalWeight:MAX_HISTORICAL_WEIGHT,
  historicalWinClaimCap:MAX_POINTS_PER_DAY,entropy:'committed-secret-plus-future-wax-block-v1'});
const stable=value=>JSON.stringify(value,function(_key,row){
  if(row&&typeof row==='object'&&!Array.isArray(row))
    return Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]]));
  return row;
});
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>=3&&v.length<=128;
const checkedJson=(value,max)=>{const json=stable(value);if(new TextEncoder().encode(json).length>max)fail('payload_limit');return json;};
const exact=v=>parseIntegerUnits(v);
async function all(db,sql,...params){
  const result=await db.prepare(sql).bind(...params).all();
  if(result?.success!==true||!Array.isArray(result.results))fail('source_read_unavailable');
  return result.results;
}
async function first(db,sql,...params){
  const row=await db.prepare(sql).bind(...params).first();
  if(row!==null&&(!row||typeof row!=='object'||Array.isArray(row)))fail('source_read_unavailable');
  return row;
}
function mode(env,day,nowMs){
  if(!env?.DB||env.TAG_RUN_ENABLED!=='true'||env.TAG_RUN_WEEKLY_REWARDS_ENABLED!=='false'||
    env.TAG_RUN_V2_POOL_ENABLED!=='true'||env.TAG_RUN_V2_DRAWS_ENABLED!=='true'||
    env.TAG_RUN_V2_OBSERVATION_ENABLED!=='false'||env.TAG_RUN_V2_DRAW_REVIEW_RELEASE_APPROVED!=='true'||
    env.TAG_RUN_V2_TIP_ACCOUNT!==TIP_ACCOUNT||!String(env.TELEGRAM_GROUP_CHAT_ID||'').match(/^-100[0-9]{5,20}$/))fail('release_not_approved');
  if(!validUtcDay(day)||day>=new Date(nowMs).toISOString().slice(0,10))fail('day_not_complete');
  return String(env.TELEGRAM_GROUP_CHAT_ID);
}
async function pool(db){
  const p=await first(db,'SELECT * FROM tag_run_v2_pool_config WHERE config_id=1');
  if(!p||p.status!=='review_only'||p.wallet_account!==TIP_ACCOUNT||p.daily_bps!==500||
    p.active_daily_bps!==100||p.active_policy_version!==2||p.historical_ticket_bps!==5000)fail('pool_not_reviewed');
}
export async function loadDrawInputs(db,chatId,day){
  await pool(db);
  const cursor=await first(db,'SELECT last_completed_day_key FROM tag_run_v2_capture_cursors WHERE chat_id=?',chatId);
  if(!validUtcDay(cursor?.last_completed_day_key)||cursor.last_completed_day_key<day)fail('capture_incomplete');
  const snapshots=await all(db,'SELECT s.*,a.chain_id,a.token_contract,a.token_symbol,a.token_precision,'+
    'a.eligibility,a.reviewed_by AS asset_reviewer,a.verified_at AS asset_verified_at '+
    'FROM tag_run_v2_snapshots s JOIN tag_run_v2_assets a ON a.asset_key=s.asset_key '+
    'WHERE s.chat_id=? AND s.day_key=? ORDER BY s.asset_key LIMIT 101',chatId,day);
  if(!snapshots.length||snapshots.length>100||snapshots.some(s=>s.eligibility!=='approved'||!text(s.asset_reviewer)||!s.asset_verified_at))fail('asset_not_reviewed');
  const snapshotsDigest=await canonicalSnapshotSetDigest({chatId,day,rows:snapshots});
  const participation=await all(db,'SELECT day_key,telegram_id,earned_weight,spent_historical_weight,source_receipts_digest '+
    'FROM tag_run_v2_participation WHERE chat_id=? AND day_key<=? ORDER BY day_key,telegram_id LIMIT 20001',chatId,day);
  if(participation.length>20000)fail('participation_limit');
  for(const row of participation){
    if(!validUtcDay(row.day_key)||!String(row.telegram_id).match(/^[0-9]{1,20}$/)||
      !Number.isSafeInteger(row.earned_weight)||row.earned_weight<0||row.earned_weight>MAX_POINTS_PER_DAY||
      !Number.isSafeInteger(row.spent_historical_weight)||row.spent_historical_weight<0||
      row.spent_historical_weight>row.earned_weight||!HEX.test(row.source_receipts_digest))fail('participation_invalid');
  }
  // Funding authority comes from the reviewed token identity and its
  // independently verified irreversible balance snapshot. Individual inbound
  // transfer approvals are not part of policy v2.
  const deposits=[];
  const outstanding=await all(db,'SELECT b.chat_id,b.day_key,b.asset_key,b.bundle_index,b.units '+
    'FROM tag_run_v2_bundles b JOIN tag_run_v2_draws d ON d.chat_id=b.chat_id AND d.day_key=b.day_key '+
    'LEFT JOIN tag_run_v2_payout_intents i ON i.chat_id=b.chat_id AND i.day_key=b.day_key '+
    'AND i.asset_key=b.asset_key AND i.bundle_index=b.bundle_index '+
    "WHERE d.status='reviewed' AND (i.status IS NULL OR i.status!='confirmed') AND b.asset_key IN "+
    '(SELECT asset_key FROM tag_run_v2_snapshots WHERE chat_id=? AND day_key=?) '+
    'ORDER BY b.chat_id,b.day_key,b.asset_key,b.bundle_index LIMIT 20001',chatId,day);
  if(outstanding.length>20000)fail('liability_limit');
  for(const s of snapshots){
    const reserved=outstanding.filter(b=>b.asset_key===s.asset_key).reduce((n,b)=>n+exact(b.units),0n);
    if(reserved!==exact(s.allocated_unpaid_units))fail('snapshot_unpaid_reservations_mismatch');
  }
  const weightsDigest=await sha256Text(stable(participation));
  return {domain:DRAW_RULES.domain,chatId,day,snapshots,participation,deposits,outstanding,
    snapshotsDigest,weightsDigest,rulesDigest:await sha256Text(stable(DRAW_RULES))};
}
function candidates(input){
  const current=[],historical=new Map();
  for(const row of input.participation){
    if(row.day_key===input.day){if(row.earned_weight>0)current.push({telegramId:row.telegram_id,points:row.earned_weight});}
    else historical.set(row.telegram_id,(historical.get(row.telegram_id)||0)+row.earned_weight-row.spent_historical_weight);
  }
  const previous=[...historical].filter(([,points])=>points>0).map(([telegramId,points])=>
    ({telegramId,points:Math.min(points,MAX_HISTORICAL_WEIGHT)}));
  if(current.length>2000||previous.length>2000)fail('member_limit');
  return {current,historical:previous};
}
export async function replayDraw(input,seedHex,beaconId){
  if(input?.domain!==DRAW_RULES.domain||!HEX.test(seedHex)||!HEX.test(beaconId))fail('invalid_replay');
  const seed=await sha256Text(stable([DRAW_RULES.domain,seedHex,beaconId]));
  const result=await previewCommunityDraw({day:input.day,...candidates(input),seedHex:seed,
    assets:input.snapshots.map(s=>({key:s.asset_key,contract:s.token_contract,symbol:s.token_symbol,
      precision:s.token_precision,balanceUnits:s.onchain_units,reservedUnits:s.allocated_unpaid_units,
      excludedUnits:s.excluded_units,approved:true,confirmed:true}))});
  const debits=[];
  const winners=new Map();
  for(const b of result.bundles)if(b.pool==='historical'&&!winners.has(b.telegramId))winners.set(b.telegramId,b);
  for(const [telegramId,win] of winners){
    let remaining=MAX_POINTS_PER_DAY;
    for(const row of input.participation.filter(p=>p.telegram_id===telegramId&&p.day_key<input.day)){
      const take=Math.min(remaining,row.earned_weight-row.spent_historical_weight);
      if(take>0){debits.push({telegramId,sourceDay:row.day_key,units:take,priorSpent:row.spent_historical_weight,
        earnedWeight:row.earned_weight,receiptDigest:row.source_receipts_digest,
        winningAssetKey:win.assetKey,winningBundleIndex:win.bundleIndex});remaining-=take;}
      if(!remaining)break;
    }
  }
  return {bundles:result.bundles,debits};
}
async function workflow(db,chatId,day){return first(db,'SELECT * FROM tag_run_v2_draw_workflows WHERE chat_id=? AND day_key=?',chatId,day);}
function validBatch(results){
  // D1 includes trigger writes in meta.changes; do not demand exactly one.
  if(!Array.isArray(results)||results.length!==2||results.some(r=>r?.success!==true||!Number.isSafeInteger(r.meta?.changes)||r.meta.changes<1))fail('atomic_transition_not_applied');
}
export async function commitDraw(env,{day,seedCommitment,committedBy,chooseFutureBlock,
  verifyRelease=async()=>{},nowMs=Date.now()}={}){
  const chatId=mode(env,day,nowMs);if(!HEX.test(seedCommitment)||!text(committedBy)||typeof chooseFutureBlock!=='function')fail('commit_arguments');
  const existing=await workflow(env.DB,chatId,day);
  if(existing){await verifyStored(env.DB,existing);if(existing.seed_commitment!==seedCommitment||existing.committed_by!==committedBy)fail('day_already_committed');return drawReceipt(existing);}
  const input=await loadDrawInputs(env.DB,chatId,day), inputJson=checkedJson(input,900000);
  const sample=await replayDraw(input,'0'.repeat(64),'0'.repeat(64));
  if(!sample.bundles.length)fail('no_funded_eligible_bundles');
  const beacon=await chooseFutureBlock();
  if(!Number.isSafeInteger(beacon?.head)||beacon.head<1||!Number.isSafeInteger(beacon.block)||beacon.block<beacon.head+120||!Number.isSafeInteger(beacon.notAfter)||beacon.notAfter<Math.floor(Date.now()/1000)||beacon.notAfter>Math.floor(Date.now()/1000)+10)fail('future_entropy_required');
  const digest=await sha256Text(inputJson);
  await verifyRelease();
  validBatch(await env.DB.batch([
    env.DB.prepare('INSERT INTO tag_run_v2_draws(chat_id,day_key,seed_commitment,rules_digest,weights_digest,snapshots_digest,reward_policy_bps) VALUES(?,?,?,?,?,?,100)')
      .bind(chatId,day,seedCommitment,input.rulesDigest,input.weightsDigest,input.snapshotsDigest),
    env.DB.prepare('INSERT INTO tag_run_v2_draw_workflows(chat_id,day_key,committed_by,input_json,inputs_digest,seed_commitment,observed_head,beacon_block,commit_not_after) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(chatId,day,committedBy,inputJson,digest,seedCommitment,beacon.head,beacon.block,beacon.notAfter)
  ]));return drawReceipt(await workflow(env.DB,chatId,day));
}
async function verifyStored(db,row){
  if(!row||await sha256Text(row.input_json)!==row.inputs_digest)fail('stored_input_tampered');
  const input=JSON.parse(row.input_json);
  if(row.chat_id!==input.chatId||row.day_key!==input.day||await canonicalSnapshotSetDigest({chatId:row.chat_id,day:row.day_key,rows:input.snapshots})!==input.snapshotsDigest||
    await sha256Text(stable(input.participation))!==input.weightsDigest||input.rulesDigest!==await sha256Text(stable(DRAW_RULES)))fail('stored_commitment_tampered');
  const parent=await first(db,'SELECT * FROM tag_run_v2_draws WHERE chat_id=? AND day_key=?',row.chat_id,row.day_key);
  if(!parent||parent.seed_commitment!==row.seed_commitment||parent.snapshots_digest!==input.snapshotsDigest||
    parent.weights_digest!==input.weightsDigest||parent.rules_digest!==input.rulesDigest||parent.reward_policy_bps!==100)fail('parent_commitment_tampered');
  if(['revealed','reviewed'].includes(row.state)){
    if(await sha256Text(row.seed_reveal)!==row.seed_commitment||parent.seed_reveal!==row.seed_reveal)fail('seed_tampered');
    const expected=await replayDraw(input,row.seed_reveal,row.beacon_id);
    if(stable(expected.bundles)!==row.bundles_json||stable(expected.debits)!==row.debits_json)fail('allocation_tampered');
    const bundles=await all(db,'SELECT asset_key,bundle_index,telegram_id,ticket_class,units FROM tag_run_v2_bundles WHERE chat_id=? AND day_key=? ORDER BY asset_key,bundle_index',row.chat_id,row.day_key);
    const canonical=expected.bundles.map(b=>({asset_key:b.assetKey,bundle_index:b.bundleIndex,telegram_id:b.telegramId,ticket_class:b.pool,units:b.units})).sort((a,b)=>a.asset_key.localeCompare(b.asset_key)||a.bundle_index-b.bundle_index);
    if(stable(bundles)!==stable(canonical))fail('persisted_bundle_tampered');
    if(row.state==='reviewed'&&(parent.status!=='reviewed'||parent.reviewed_by!==row.reviewed_by))fail('review_tampered');
  }
  return input;
}
export async function revealDraw(env,{day,seedHex,readIrreversibleBlock,verifyRelease=async()=>{},nowMs=Date.now()}={}){
  const chatId=mode(env,day,nowMs), row=await workflow(env.DB,chatId,day);
  if(!row||!HEX.test(seedHex)||await sha256Text(seedHex)!==row.seed_commitment||typeof readIrreversibleBlock!=='function')fail('reveal_arguments');
  const input=await verifyStored(env.DB,row);
  if(['revealed','reviewed'].includes(row.state))return drawReceipt(row);
  if(row.state!=='committed')fail('invalid_transition');
  if(stable(await loadDrawInputs(env.DB,chatId,day))!==row.input_json)fail('source_changed_since_commit');
  const beacon=await readIrreversibleBlock(row.beacon_block);
  if(beacon?.block!==row.beacon_block||beacon.irreversible!==true||!HEX.test(beacon.id)||parseInt(beacon.id.slice(0,8),16)!==row.beacon_block)fail('beacon_not_irreversible');
  const plan=await replayDraw(input,seedHex,beacon.id);
  await verifyRelease();
  validBatch(await env.DB.batch([
    env.DB.prepare("UPDATE tag_run_v2_draw_workflows SET state='revealed',seed_reveal=?,beacon_id=?,bundles_json=?,debits_json=? WHERE chat_id=? AND day_key=? AND state='committed'")
      .bind(seedHex,beacon.id,checkedJson(plan.bundles,300000),checkedJson(plan.debits,300000),chatId,day),
    env.DB.prepare('UPDATE tag_run_v2_draws SET seed_reveal=? WHERE chat_id=? AND day_key=? AND seed_reveal IS NULL').bind(seedHex,chatId,day)
  ]));return drawReceipt(await workflow(env.DB,chatId,day));
}
export async function reviewDraw(env,{day,reviewedBy,expectedInputsDigest,verifyRelease=async()=>{},nowMs=Date.now()}={}){
  const chatId=mode(env,day,nowMs),row=await workflow(env.DB,chatId,day);
  if(!row||!text(reviewedBy)||reviewedBy===row.committed_by||expectedInputsDigest!==row.inputs_digest)fail('independent_review_required');
  await verifyStored(env.DB,row);
  if(row.state==='reviewed')return drawReceipt(row);
  if(row.state!=='revealed')fail('reveal_required');
  if(stable(await loadDrawInputs(env.DB,chatId,day))!==row.input_json)fail('source_changed_since_commit');
  await verifyRelease();
  validBatch(await env.DB.batch([
    env.DB.prepare("UPDATE tag_run_v2_draw_workflows SET state='reviewed',reviewed_by=? WHERE chat_id=? AND day_key=? AND state='revealed'").bind(reviewedBy,chatId,day),
    env.DB.prepare("UPDATE tag_run_v2_draws SET status='reviewed',reviewed_by=? WHERE chat_id=? AND day_key=? AND status='preview_only'").bind(reviewedBy,chatId,day)
  ]));return drawReceipt(await workflow(env.DB,chatId,day));
}
export async function inspectPersistedDraw(db,chatId,day){
  const row=await workflow(db,chatId,day);await verifyStored(db,row);return drawReceipt(row);
}
export async function rejectDraw(env,{day,reviewedBy,reason,verifyRelease=async()=>{},nowMs=Date.now()}={}){
  const chatId=mode(env,day,nowMs),row=await workflow(env.DB,chatId,day);
  if(!row||!text(reviewedBy)||reviewedBy===row.committed_by||!text(reason))fail('independent_review_required');
  if(row.state==='rejected')return drawReceipt(row);
  if(!['committed','revealed'].includes(row.state))fail('funded_draw_cannot_be_rejected');
  await verifyRelease();
  validBatch(await env.DB.batch([
    env.DB.prepare("UPDATE tag_run_v2_draw_workflows SET state='rejected',reviewed_by=?,rejection_reason=? WHERE chat_id=? AND day_key=? AND state IN ('committed','revealed')").bind(reviewedBy,reason,chatId,day),
    env.DB.prepare("UPDATE tag_run_v2_draws SET status='rejected',reviewed_by=? WHERE chat_id=? AND day_key=? AND status='preview_only'").bind(reviewedBy,chatId,day)
  ]));return drawReceipt(await workflow(env.DB,chatId,day));
}
function drawReceipt(row){return Object.freeze({chatId:row.chat_id,day:row.day_key,state:row.state,
  seedCommitment:row.seed_commitment,beaconBlock:row.beacon_block,inputsDigest:row.inputs_digest,
  bundles:JSON.parse(row.bundles_json).length,payoutAttempted:false});}
