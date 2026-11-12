// TAG RUN V2: strictly observational Telegram pilot. No token entitlement,
// verified historical snapshot, draw settlement, signing or transfer routes.
// The public /pool and legacy funded /drawpreview remain gated OFF separately.
import {
  TIP_ACCOUNT, MAX_POINTS_PER_DAY, MAX_HISTORICAL_WEIGHT, formatQuantity,
  previewCommunityDraw, drawSeed, validUtcDay
} from './v2-core.js';
import { discoverWaxTipTokens } from './v2-chain.js';

export const OBSERVATION_ADMIN_COMMANDS = new Set([
  'poolobserve', 'poolreview', 'poolstate', 'poolbackfill', 'pooltest'
]);

// Pool administration may be enabled while the verified configuration remains
// paused. Observation stays available in that state, but any draw, payout or
// legacy funded-reward gate immediately closes this read-only pilot.
export function observationEnabled(env) {
  return env?.TAG_RUN_ENABLED === 'true' &&
    env?.TAG_RUN_WEEKLY_REWARDS_ENABLED === 'false' &&
    env?.TAG_RUN_V2_OBSERVATION_ENABLED === 'true' &&
    env?.TAG_RUN_V2_DRAWS_ENABLED === 'false' &&
    env?.TAG_RUN_V2_PAYOUTS_ENABLED === 'false' &&
    env?.TAG_RUN_V2_TIP_ACCOUNT === TIP_ACCOUNT &&
    Boolean(env?.DB);
}

function ensureRows(response, label) {
  if (response?.success !== true || !Array.isArray(response.results)) {
    throw new Error(label + '_unavailable');
  }
  return response.results;
}
function integerCount(row, field, label) {
  const n = Number(row?.[field]);
  if (!row || !Number.isSafeInteger(n) || n < 0) {
    throw new Error(label + '_unavailable');
  }
  return n;
}
async function poolConfig(db) {
  const cfg = await db.prepare('SELECT wallet_account,status,daily_bps,active_daily_bps,active_policy_version,' +
    'historical_ticket_bps FROM tag_run_v2_pool_config WHERE config_id=1').first();
  if (!cfg || cfg.wallet_account !== TIP_ACCOUNT || cfg.status !== 'paused' ||
      (cfg.daily_bps !== 500 || cfg.active_daily_bps !== 100 || cfg.active_policy_version !== 2) || cfg.historical_ticket_bps !== 5000) {
    throw new Error('observation_config_not_paused_and_verified');
  }
  return cfg;
}
async function completeThrough(db, chatId, day) {
  const row = await db.prepare('SELECT last_completed_day_key FROM ' +
    'tag_run_v2_capture_cursors WHERE chat_id=?').bind(chatId).first();
  if (row === null) return false;
  if (!row || !validUtcDay(row.last_completed_day_key)) {
    throw new Error('observation_capture_cursor_unavailable');
  }
  return row.last_completed_day_key >= day;
}
function lastUtcDay(nowMs) {
  return new Date(nowMs - 86400000).toISOString().slice(0,10);
}
async function latestActivity(db, chatId, day) {
  const [current, older] = await Promise.all([
    db.prepare('SELECT telegram_id, SUM(points) AS points FROM tag_run_messages ' +
      'WHERE chat_id=? AND day_key=? GROUP BY telegram_id ' +
      'ORDER BY telegram_id LIMIT 2001').bind(chatId,day).all(),
    db.prepare('SELECT telegram_id, ' +
      'SUM(earned_weight-spent_historical_weight) AS points ' +
      'FROM tag_run_v2_participation WHERE chat_id=? AND day_key<? ' +
      'GROUP BY telegram_id HAVING points>0 ORDER BY telegram_id LIMIT 2001')
      .bind(chatId,day).all()
  ]);
  const cur=ensureRows(current,'observation_current_activity');
  const old=ensureRows(older,'observation_historical_activity');
  if (cur.length>2000 || old.length>2000) throw new Error('observation_member_limit');
  return {
    current:cur.map(row=>({
      telegramId:String(row.telegram_id),points:integerCount(row,'points','daily_weight')
    })),
    historical:old.map(row=>({
      telegramId:String(row.telegram_id),
      points:Math.min(integerCount(row,'points','historical_weight'),MAX_HISTORICAL_WEIGHT)
    }))
  };
}
async function readApprovedAssets(db) {
  const response = await db.prepare(
    "SELECT asset_key FROM tag_run_v2_assets WHERE eligibility='approved' LIMIT 101"
  ).all();
  const rows=ensureRows(response,'observation_approved_asset_read');
  if (rows.length>100) throw new Error('observation_approved_asset_limit');
  return rows.map(r=>String(r.asset_key));
}
async function observeTokens(env, fetchImpl) {
  const approvedAssets=await readApprovedAssets(env.DB);
  const result=await discoverWaxTipTokens({
    fetchImpl,account:TIP_ACCOUNT,approvedAssets,observeAll:true
  });
  if (result.custodyVerified || result.snapshotFinalityVerified) {
    throw new Error('observation_provider_claims_unverified_authority');
  }
  if (result.assets.length>100 || result.account!==TIP_ACCOUNT) {
    throw new Error('observation_inventory_incomplete');
  }
  return { ...result, approvedAssetKeys: approvedAssets };
}
function conciseInventory(result) {
  const positive=result.assets.filter(a=>a.balanceUnits &&
    a.balanceUnits!=='0');
  const lines=positive.slice(0,12).map(asset=>
    formatQuantity(asset.balanceUnits,asset.precision,asset.symbol) +
    ' · '+asset.contract+' · '+asset.status);
  return 'Wallet: '+TIP_ACCOUNT+' · WAX mainnet\n' +
    'Discovered: '+result.assets.length+' · Positive chain balances: '+positive.length+
    '\n' +(lines.join('\n') || 'No positive observed balances verified.')+
    (positive.length>12?'\nAdditional positive tokens omitted from message.':'')+
    '\nOBSERVED ONLY — no approved donation value, custody proof or finalized snapshot.';
}
async function recordQuarantineIdentities(db, inventory) {
  let added=0;
  for (const item of inventory.assets) {
    // Discoveries are only identities, never reward eligibility or balances.
    const write=await db.prepare('INSERT OR IGNORE INTO tag_run_v2_assets '+
      '(asset_key,chain_id,token_contract,token_symbol,token_precision,eligibility) '+
      "VALUES (?,?,?,?,?,'quarantined')")
      .bind(item.key,inventory.chainId,item.contract,item.symbol,
        item.precision).run();
    const changed=Number(write?.meta?.changes);
    if (write?.success===false || !Number.isSafeInteger(changed) || changed<0) {
      throw new Error('observation_quarantine_write_unavailable');
    }
    added+=changed;
  }
  return added;
}
async function recordObservationAudit(db, actor, inventory, day) {
  const key='v2-observation:'+day+':'+inventory.latestIrreversibleBlock;
  const written=await db.prepare('INSERT OR IGNORE INTO tag_run_v2_audit '+
    '(event_key,event_type,reason,reviewed_by) VALUES (?,?,?,?)').bind(
      key,'inventory_observation',
      'Observed '+inventory.assets.length+' token identities; no custody, donation, '+
      'balance finality or reward eligibility confirmed',String(actor)
    ).run();
  const changes=Number(written?.meta?.changes);
  if (written?.success===false || !Number.isSafeInteger(changes) || changes<0) {
    throw new Error('observation_audit_write_unavailable');
  }
}
export async function handleV2ObservationCommand(env, {
  name,isAdmin,isPrivate,chatId,telegramId,send,nowMs=Date.now(),
  fetchImpl=fetch,capture
}) {
  if (!OBSERVATION_ADMIN_COMMANDS.has(name)) return false;
  if (!isAdmin || !isPrivate) {
    await send('Community Pot read-only testing is for authorised admins in a private bot chat.');
    return true;
  }
  if (!observationEnabled(env)) {
    await send('TAG RUN V2 observation pilot is disabled or a reward gate is ON. '+
      'No token transfers or simulations attempted.');
    return true;
  }
  await poolConfig(env.DB); // keep the funded pool paused even during observation
  const day=lastUtcDay(nowMs);
  if (name==='poolstate') {
    const currentDay = new Date(nowMs).toISOString().slice(0,10);
    const [cursor,assetCount,participationCount,receivedCompleted,receivedToday] = await Promise.all([
      env.DB.prepare('SELECT last_completed_day_key FROM '+
        'tag_run_v2_capture_cursors WHERE chat_id=?').bind(chatId).first(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM tag_run_v2_assets').first(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM tag_run_v2_participation '+
        'WHERE chat_id=?').bind(chatId).first(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM tag_run_messages '+
        'WHERE chat_id=? AND day_key=?').bind(chatId,day).first(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM tag_run_messages '+
        'WHERE chat_id=? AND day_key=?').bind(chatId,currentDay).first()
    ]);
    if (cursor!==null && (!cursor || !validUtcDay(cursor.last_completed_day_key))) {
      throw new Error('observation_capture_cursor_unavailable');
    }
    await send('TAG RUN V2 · READ-ONLY PILOT\nWallet: '+TIP_ACCOUNT+
      '\nPool: PAUSED · Funded draws: OFF · Transfers: OFF'+
      '\nRecorded asset identities: '+integerCount(assetCount,'n','asset_count')+
      '\nReal V2 participation rows: '+integerCount(participationCount,'n','participation_count')+
      '\nV1 scored messages for '+day+': '+integerCount(receivedCompleted,'n','v1_receipts')+
      '\nV1 scored today ('+currentDay+' UTC): '+integerCount(receivedToday,'n','v1_today_receipts')+
      '\nCapture cursor: '+(cursor?.last_completed_day_key||'NOT STARTED')+
      '\nBackfill through '+day+': '+(cursor?.last_completed_day_key>=day?'COMPLETE':'PENDING')+
      '\nNo custody verification or reward commitments.');
    return true;
  }
  if (name==='poolbackfill') {
    if (typeof capture!=='function') throw new Error('capture_callback_unavailable');
    const result=await capture({nowMs,maxDays:7});
    if (!['recorded','up_to_date'].includes(result?.status)) {
      throw new Error('observation_backfill_unavailable');
    }
    await send('TAG RUN V2 · REAL STREET CRED BACKFILL\n'+
      'Last completed UTC day: '+String(result.day)+
      '\nDays processed: '+result.processedDays+
      '\nReal member-day receipts inserted: '+result.inserted+
      '\nMore days remaining: '+(result.backlogRemaining?'YES — run /poolbackfill again':'NO')+
      '\nHistorical weight is participation credit, not token debt.');
    return true;
  }
  if (name==='poolreview') {
    const response=await env.DB.prepare('SELECT token_contract,token_symbol,'+
      'token_precision,eligibility FROM tag_run_v2_assets '+
      'ORDER BY token_symbol,token_contract LIMIT 101').all();
    const assets=ensureRows(response,'observation_review_read');
    if (assets.length>100) throw new Error('observation_review_limit');
    const lines=assets.slice(0,16).map(a=>
      a.token_symbol+' ('+a.token_contract+', '+a.token_precision+
      ' decimals): '+a.eligibility);
    await send('TAG RUN V2 · TOKEN REVIEW QUEUE\n'+
      (lines.join('\n')||'No token identities observed yet. Run /poolobserve.')+
      (assets.length>16?'\nMore tokens omitted from the Telegram preview.':'')+
      '\nAll unreviewed assets remain quarantined. Complete the independent '+
      'contract and precision review, then use /poolapprove with its review reference. '+
      'Use /poolquarantine with a reason to remove eligibility immediately. '+
      'Donation provenance remains a separate gate.');
    return true;
  }
  if (name==='poolobserve') {
    const result=await observeTokens(env,fetchImpl);
    // Only persist asset identity as QUARANTINED, never observed balances
    // as authoritative or verified. Any crash can retry INSERT OR IGNORE.
    const added=await recordQuarantineIdentities(env.DB,result);
    await recordObservationAudit(env.DB,telegramId,result,day);
    await send('TAG RUN V2 · LIVE READ-ONLY INVENTORY\n'+conciseInventory(result)+
      '\nNew quarantined asset identities: '+added+
      '\nNo on-chain transfer or token reward was performed.');
    return true;
  }
  if (name==='pooltest') {
    if (!(await completeThrough(env.DB,chatId,day))) {
      await send('TAG RUN V2 · SIMULATION BLOCKED\nHistorical participation '+
        'has not been captured through '+day+
        '. Run /poolbackfill until complete. No winner was simulated.');
      return true;
    }
    const [inventory,weight]=await Promise.all([
      observeTokens(env,fetchImpl),latestActivity(env.DB,chatId,day)
    ]);
    // Only exact D1 allowlisted token identities enter this hypothetical preview.
    const approvedKeys=new Set(inventory.approvedAssetKeys);
    const observedPositive=inventory.assets.filter(a=>a.balanceUnits&&a.balanceUnits!=='0');
    const positive=observedPositive.filter(a=>
      approvedKeys.has(a.key) && a.status==='observed_only');
    if (positive.length>12) {
      throw new Error('observation_simulation_asset_limit');
    }
    const seedHex=drawSeed();
    // These cloned flags are inputs ONLY to an isolated, pure mathematical
    // what-if calculation, never written to the DB or used for allocation.
    // The chain observations are NOT custody/finality/asset approval proof.
    const simulated=await previewCommunityDraw({
      day,seedHex,assets:positive.map(a=>({
        contract:a.contract,symbol:a.symbol,precision:a.precision,key:a.key,
        balanceUnits:a.balanceUnits,reservedUnits:'0',excludedUnits:'0',
        approved:true,confirmed:true
      })),current:weight.current,historical:weight.historical
    });
    const parts=simulated.budgets.map(b=>
      formatQuantity(b.dailyBudgetUnits,b.precision,b.symbol)+' ('+b.contract+')');
    await send('TAG RUN V2 · UNSAVED UNVERIFIED ALLOWLIST WHAT-IF ONLY\n'+
      'Wallet: '+TIP_ACCOUNT+' · target: '+day+' UTC'+
      '\nObserved positive tokens: '+observedPositive.length+
      '\nApproved positive observed: '+positive.length+
      '\nQuarantined positive excluded: '+(observedPositive.length-positive.length)+
      '\nCurrent eligible members: '+weight.current.length+
      '\nHistorical eligible members: '+weight.historical.length+
      '\nHypothetical 1% approved-token pools: '+(parts.join('; ')||'none — no allowlisted positive balances')+
      '\nHypothetical bundles: '+simulated.bundles.length+
      '\nHistorical/current lottery weight: 50%/50% when both groups exist.'+
      '\nNo asset is approved by this calculation; chain head balances are NOT '+
      'an irreversible cutoff snapshot. No DB draw/claim/reserve/payout is saved.');
    return true;
  }
  return false;
}
