// TAG RUN V2 PR6: current configured Telegram community ONLY.
// Node/SQLite disposable rehearsal. NO Worker imports, live D1 migrations,
// WAX RPC, signer, donated-funds approval, funded reservation or transfer.
import { authenticatedGroupId } from '../workers/moonboys-api/tag-run/core.js';
import {
  validUtcDay, parseIntegerUnits, DAILY_BPS, MAX_ASSETS
} from '../workers/moonboys-api/tag-run/v2-core.js';
import {
  holdSimulatedIntent, inspectSimulatedBudget
} from './tag-run-v2-atomic-budget-rehearsal.mjs';

export const CURRENT_COMMUNITY_REHEARSAL_ONLY = true;
export const CURRENT_COMMUNITY_TRANSFERS_ENABLED = false;
const HEX=/^[a-f0-9]{64}$/;
const fail=reason=>{throw new Error('current_community_'+reason);};
const groupId=value=>{
  if(typeof value!=='string')fail('invalid_group');
  const id=authenticatedGroupId({TELEGRAM_GROUP_CHAT_ID:value});
  if(!id || id!==value)fail('invalid_group');
  return id;
};
const requireScope=(db,id)=>{
  const s=db.prepare('SELECT group_chat_id,mode FROM '+
    'tag_run_v2_current_community_scope_rehearsal WHERE scope_id=1').get();
  if(!s||s.mode!=='simulation_only')fail('scope_not_configured');
  if(s.group_chat_id!==id)fail('different_community_rejected');
  return s;
};
function transaction(db,fn) {
  // Node SQLite only; no claim about D1's distributed transaction semantics.
  db.exec('BEGIN IMMEDIATE');
  try {
    const v=fn();
    db.exec('COMMIT');
    return v;
  } catch(error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
function exactUnits(value) {
  try { return parseIntegerUnits(value); }
  catch (_) { fail('invalid_integer_units'); }
}

// Lock the *one* community to the existing server-side Telegram group ID.
// Same-ID re-entry is read-only; the configured group can NEVER be changed.
export function bindCurrentTelegramCommunity(db,{telegramGroupChatId}={}) {
  const group=groupId(telegramGroupChatId);
  return transaction(db,()=>{
    const existing=db.prepare('SELECT group_chat_id FROM '+
      'tag_run_v2_current_community_scope_rehearsal WHERE scope_id=1').get();
    if(existing) {
      if(existing.group_chat_id!==group)fail('different_community_rejected');
      return Object.freeze({groupChatId:group,replayed:true,
        status:'simulation_only',funded:false,executable:false});
    }
    db.prepare('INSERT INTO tag_run_v2_current_community_scope_rehearsal '+
      '(scope_id,group_chat_id) VALUES (1,?)').run(group);
    return Object.freeze({groupChatId:group,replayed:false,
      status:'simulation_only',funded:false,executable:false});
  });
}

// Turn *unverified* PR2 snapshot evidence into explicit, PAUSED synthetic
// daily caps for exactly this group. Five percent is hypothetical and does
// not make observed treasury assets approved donations or payable rewards.
// All assets are inserted in one transaction: invalid second assets cannot
// leave a partially initialized budget for the first.
export function previewOneCommunityDailyCaps(db,{
  telegramGroupChatId,dayKey,assets
}={}) {
  const group=groupId(telegramGroupChatId);
  if(!validUtcDay(dayKey)||!Array.isArray(assets)||
     assets.length===0||assets.length>MAX_ASSETS)fail('invalid_batch');
  const seen=new Set();
  for(const item of assets) {
    if(!item||typeof item.assetKey!=='string'||!item.assetKey||
       seen.has(item.assetKey))fail('duplicate_or_invalid_asset');
    seen.add(item.assetKey);
    if(exactUnits(item.maxTransferUnits)===0n)fail('invalid_transfer_cap');
  }
  return transaction(db,()=>{
    requireScope(db,group);
    const rows=[];
    const snapshot=db.prepare('SELECT status,onchain_units,reserved_units,'+
      'excluded_units,available_units,five_percent_units FROM '+
      'tag_run_v2_snapshot_evidence_rehearsal WHERE chat_id=? '+
      'AND day_key=? AND asset_key=?');
    const insert=db.prepare('INSERT INTO tag_run_v2_atomic_budget_rehearsal '+
      '(chat_id,day_key,asset_key,daily_limit_units,'+
      'per_transfer_limit_units,paused) VALUES (?,?,?,?,?,1)');
    for(const item of assets) {
      const snap=snapshot.get(group,dayKey,item.assetKey);
      if(!snap||snap.status!=='unverified')fail('snapshot_missing_or_rejected');
      const onchain=exactUnits(snap.onchain_units);
      const reserved=exactUnits(snap.reserved_units);
      const excluded=exactUnits(snap.excluded_units);
      const available=exactUnits(snap.available_units);
      const daily=exactUnits(snap.five_percent_units);
      const maxTransfer=exactUnits(item.maxTransferUnits);
      if(reserved+excluded>onchain ||
         available!==onchain-reserved-excluded ||
         daily!==available*BigInt(DAILY_BPS)/10000n ||
         daily===0n||maxTransfer>daily)fail('unverified_budget_mismatch');
      insert.run(group,dayKey,item.assetKey,daily.toString(),
        maxTransfer.toString());
      rows.push(Object.freeze({assetKey:item.assetKey,dayKey,
        hypotheticalDailyUnits:daily.toString(),
        maxTransferUnits:maxTransfer.toString(),
        paused:true,approved:false,funded:false,transferable:false}));
    }
    return Object.freeze({status:'simulation_only',groupChatId:group,
      dayKey,treasuryApproved:false,funded:false,executable:false,
      transferAttempted:false,assets:Object.freeze(rows)});
  });
}

// Guard the already-atomic PR5 simulator with the configured chat ID.
// PR2 source rows cannot silently redirect a recipient or enrol another
// Telegram community. This remains a simulated allocation, never a payout.
export function holdCurrentCommunitySimulation(db,{
  telegramGroupChatId,intentKey
}={}) {
  const group=groupId(telegramGroupChatId);
  if(typeof intentKey!=='string'||!HEX.test(intentKey))
    fail('invalid_intent_key');
  requireScope(db,group);
  const row=db.prepare('SELECT chat_id,status FROM '+
    'tag_run_v2_payout_intents_rehearsal WHERE intent_key=?').get(intentKey);
  if(!row||row.status!=='simulation_only')fail('source_missing');
  if(row.chat_id!==group)fail('different_community_rejected');
  // PR5 itself uses BEGIN IMMEDIATE and locks original amount/destination.
  const held=holdSimulatedIntent(db,{intentKey});
  return Object.freeze({...held,groupChatId:group,
    funded:false,executable:false,transferAttempted:false});
}
export function inspectCurrentCommunitySimulation(db,{
  telegramGroupChatId,dayKey,assetKey
}={}) {
  const group=groupId(telegramGroupChatId);
  requireScope(db,group);
  if(!validUtcDay(dayKey)||typeof assetKey!=='string'||!assetKey)
    fail('invalid_scope');
  const budget=inspectSimulatedBudget(db,{
    chatId:group,dayKey,assetKey
  });
  return Object.freeze({...budget,groupChatId:group,assetKey,dayKey,
    treasuryApproved:false,donationConsentVerified:false,
    transferable:false,transferAttempted:false});
}
