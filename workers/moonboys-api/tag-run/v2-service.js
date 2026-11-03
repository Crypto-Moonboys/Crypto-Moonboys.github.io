// TAG RUN V2 read-only bot commands and participation ingestion.
// All operations are disabled until migration 104 and separate approval.
// NO token transfers, no wallet secret handling, no D1 token entitlements.
import { previousDay } from './core.js';
import {
  TIP_ACCOUNT, MAX_POINTS_PER_DAY, MAX_HISTORICAL_WEIGHT,
  sha256Text, drawSeed, previewCommunityDraw
} from './v2-core.js';
import { discoverWaxTipTokens } from './v2-chain.js';
import { quarantineInboundTipReceipts } from './v2-deposits.js';
import { OBSERVATION_ADMIN_COMMANDS, observationEnabled,
  handleV2ObservationCommand } from './v2-pilot.js';

export const V2_COMMANDS = new Set([
  'pool', 'myrewards', 'poolstatus', 'poolscan', 'drawpreview', 'drawaudit', 'poolpause',
  ...OBSERVATION_ADMIN_COMMANDS
]);
export const V2_ADMIN_COMMANDS = new Set([
  'poolstatus', 'poolscan', 'drawpreview', 'drawaudit', 'poolpause',
  ...OBSERVATION_ADMIN_COMMANDS
]);
const isV2Available = env => env?.TAG_RUN_ENABLED === 'true' &&
  env?.TAG_RUN_V2_POOL_ENABLED === 'true' && !!env?.DB &&
  env?.TAG_RUN_V2_TIP_ACCOUNT === TIP_ACCOUNT;

async function configFor(db) {
  return db.prepare('SELECT wallet_account,daily_bps,historical_ticket_bps,status,revision ' +
    'FROM tag_run_v2_pool_config WHERE config_id=1').first();
}

// A failed D1 read must never be presented as an empty wallet, allowlist,
// or draw audit. Cloudflare D1 .all() returns { success, results }.
function requiredRows(result, label) {
  if (result?.success !== true || !Array.isArray(result.results)) {
    throw new Error(label + '_unavailable');
  }
  return result.results;
}

// /drawpreview reads historical weights from completed UTC participation days.
// If a catch-up job is still backfilling, a seemingly valid preview would
// silently exclude eligible historical members. Even a missing cursor blocks.
async function historicalBackfillComplete(db, chatId, day) {
  const cursor = await db.prepare(
    'SELECT last_completed_day_key FROM tag_run_v2_capture_cursors WHERE chat_id=?'
  ).bind(chatId).first();
  if (cursor === null) return false;
  if (!cursor || typeof cursor.last_completed_day_key !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(cursor.last_completed_day_key)) {
    throw new Error('participation_capture_cursor_unavailable');
  }
  const timestamp = Date.parse(cursor.last_completed_day_key + 'T00:00:00.000Z');
  if (!Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString().slice(0, 10) !== cursor.last_completed_day_key) {
    throw new Error('participation_capture_cursor_invalid');
  }
  // Requiring completion through the target UTC day is stronger than merely
  // checking the prior-day backlog, and ensures initial capture also ran.
  return cursor.last_completed_day_key >= day;
}
function nextUtcDay(day) {
  const timestamp = Date.parse(String(day) + 'T00:00:00.000Z');
  if (!Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString().slice(0, 10) !== day) {
    throw new Error('invalid_capture_cursor_day');
  }
  return new Date(timestamp + 86400000).toISOString().slice(0, 10);
}
export async function saveYesterdayParticipation(env, options = {}) {
  const pilot = observationEnabled(env);
  if (!isV2Available(env) && !pilot) return { status: 'disabled' };
  const cfg = await configFor(env.DB);
  if (!cfg || (cfg.status === 'paused' && !pilot)) return { status: 'paused' };
  if (pilot && (cfg.wallet_account !== TIP_ACCOUNT || cfg.status !== 'paused' ||
      cfg.daily_bps !== 500 || cfg.historical_ticket_bps !== 5000)) {
    throw new Error('observation_config_not_paused_and_verified');
  }
  const chatId = String(env.TELEGRAM_GROUP_CHAT_ID || '').trim();
  const yesterday = previousDay(options.nowMs ?? Date.now());
  const maxDays = Math.min(7, Math.max(1,
    Number.isSafeInteger(options.maxDays) ? options.maxDays : 7));
  const checkpoint = await env.DB.prepare(
    'SELECT last_completed_day_key FROM tag_run_v2_capture_cursors WHERE chat_id=?'
  ).bind(chatId).first();
  // A resolved D1 read error can be a truthy object, not just a thrown
  // exception. It MUST NOT be interpreted as "no checkpoint".
  if (checkpoint !== null &&
      (!checkpoint || !validUtcDay(checkpoint.last_completed_day_key))) {
    throw new Error('participation_capture_cursor_unavailable');
  }
  // First V2 activation backfills the earliest still-preserved V1 receipt,
  // not just yesterday. Subsequent failures replay the day after the most
  // recently completed checkpoint before processing newer UTC days.
  const oldest = checkpoint ? null : await env.DB.prepare(
    'SELECT MIN(day_key) AS first_day FROM tag_run_messages ' +
    'WHERE chat_id=? AND day_key<=?'
  ).bind(chatId, yesterday).first();
  if (!checkpoint &&
      (!oldest || !Object.prototype.hasOwnProperty.call(oldest,'first_day') ||
       (oldest.first_day != null && !validUtcDay(oldest.first_day)))) {
    throw new Error('participation_oldest_source_day_unavailable');
  }
  let day = checkpoint?.last_completed_day_key
    ? nextUtcDay(checkpoint.last_completed_day_key)
    : String(oldest?.first_day || yesterday);
  if (day > yesterday) {
    return { status: 'up_to_date', day: yesterday,
      eligible: 0, inserted: 0, processedDays: 0, backlogRemaining: false };
  }
  let inserted = 0, eligible = 0, processedDays = 0;
  let lastCompleted = checkpoint?.last_completed_day_key || null;
  while (day <= yesterday && processedDays < maxDays) {
    const result = await env.DB.prepare(
      'SELECT telegram_id,message_id,points FROM tag_run_messages ' +
      'WHERE chat_id=? AND day_key=? ORDER BY telegram_id,message_id LIMIT 30001'
    ).bind(chatId, day).all();
    if (result?.success === false || !Array.isArray(result?.results)) {
      throw new Error('participation_receipts_unavailable');
    }
    const rows = result.results;
    if (rows.length > 30000) throw new Error('participation_receipt_limit_exceeded');
    const members = new Map();
    for (const row of rows) {
      const id = String(row.telegram_id);
      if (!/^[0-9]{1,20}$/.test(id) ||
          !Number.isSafeInteger(row.message_id) ||
          !Number.isSafeInteger(row.points) ||
          row.points < 1 || row.points > 17) {
        throw new Error('malformed_daily_receipt');
      }
      if (!members.has(id)) members.set(id, { points: 0, receipts: [] });
      const member = members.get(id);
      member.points += row.points;
      if (member.points > MAX_POINTS_PER_DAY || member.receipts.length >= 30) {
        throw new Error('daily_participation_authority_mismatch');
      }
      member.receipts.push([row.message_id,row.points]);
    }
    // One canonical day's receipt digest plus one set-based INSERT avoids
    // thousands of per-member D1 round trips on a busy Telegram group.
    // Every row of this UTC day refers to the same immutable source digest.
    const digest = await sha256Text(JSON.stringify({
      chatId, day, receipts: rows.map(r =>
        [String(r.telegram_id),r.message_id,r.points])
    }), options.cryptoImpl);
    const write = await env.DB.prepare(
      'INSERT OR IGNORE INTO tag_run_v2_participation ' +
      '(chat_id,day_key,telegram_id,earned_weight,source_receipts_digest) ' +
      'SELECT chat_id,day_key,telegram_id,SUM(points),? FROM tag_run_messages ' +
      'WHERE chat_id=? AND day_key=? GROUP BY chat_id,day_key,telegram_id'
    ).bind(digest,chatId,day).run();
    if (write?.success === false ||
        !Number.isSafeInteger(write?.meta?.changes) ||
        write.meta.changes < 0) throw new Error('participation_write_failed');
    const audit = await env.DB.prepare(
      'SELECT COUNT(*) AS recorded, ' +
      'SUM(CASE WHEN source_receipts_digest<>? THEN 1 ELSE 0 END) AS bad_digest ' +
      'FROM tag_run_v2_participation WHERE chat_id=? AND day_key=?'
    ).bind(digest,chatId,day).first();
    if (!audit || Number(audit.recorded) !== members.size ||
        Number(audit.bad_digest || 0) !== 0) {
      throw new Error('participation_reconciliation_failed');
    }
    inserted += write.meta.changes;
    // Checkpoint advances only AFTER all participants for this day were
    // recorded. A D1 failure leaves the cursor unchanged; the next run
    // replays INSERT OR IGNORE, including any partially written rows.
    const done = await env.DB.prepare(
      'INSERT INTO tag_run_v2_capture_cursors (chat_id,last_completed_day_key) ' +
      'VALUES (?,?) ON CONFLICT(chat_id) DO UPDATE SET ' +
      'last_completed_day_key=excluded.last_completed_day_key, ' +
      'updated_at=CURRENT_TIMESTAMP WHERE excluded.last_completed_day_key>' +
      'tag_run_v2_capture_cursors.last_completed_day_key'
    ).bind(chatId,day).run();
    if (done?.success === false) throw new Error('capture_checkpoint_write_failed');
    eligible += members.size;
    processedDays++;
    lastCompleted = day;
    day = nextUtcDay(day);
  }
  return { status: 'recorded', day: lastCompleted, eligible, inserted,
    processedDays, backlogRemaining: day <= yesterday };
}
async function pendingWeight(db, chatId, telegramId) {
  const query = await db.prepare(
    'SELECT earned_weight,spent_historical_weight FROM tag_run_v2_participation ' +
    'WHERE chat_id=? AND telegram_id=?'
  ).bind(chatId,telegramId).all();
  if (query?.success === false || !Array.isArray(query?.results) ||
      query.results.length > 3660) throw new Error('pending_participation_unavailable');
  return query.results.reduce((total,row) =>
    total + Math.max(0, Number(row.earned_weight) -
      Number(row.spent_historical_weight)),0);
}
async function drawInput(db, chatId, day) {
  const [snapshots, recent, backlog] = await Promise.all([
    db.prepare('SELECT s.*,a.token_contract,a.token_symbol,a.token_precision,' +
      'a.eligibility FROM tag_run_v2_snapshots s JOIN tag_run_v2_assets a ' +
      'ON s.asset_key=a.asset_key WHERE s.chat_id=? AND s.day_key=? ' +
      "AND s.status='verified' AND a.eligibility='approved' LIMIT 101")
      .bind(chatId,day).all(),
    db.prepare('SELECT telegram_id,SUM(points) AS points FROM tag_run_messages ' +
      'WHERE chat_id=? AND day_key=? GROUP BY telegram_id ORDER BY telegram_id LIMIT 2001')
      .bind(chatId,day).all(),
    db.prepare('SELECT telegram_id, SUM(earned_weight-spent_historical_weight) AS points ' +
      'FROM tag_run_v2_participation WHERE chat_id=? AND day_key<? ' +
      'GROUP BY telegram_id HAVING points>0 ORDER BY telegram_id LIMIT 2001')
      .bind(chatId,day).all()
  ]);
  if ([snapshots,recent,backlog].some(r => r?.success === false ||
      !Array.isArray(r?.results))) throw new Error('draw_input_unavailable');
  if (snapshots.results.length > 100 || recent.results.length > 2000 ||
      backlog.results.length > 2000) throw new Error('draw_input_limit_exceeded');
  return {
    assets: snapshots.results.map(a => ({
      contract:a.token_contract,symbol:a.token_symbol,precision:a.token_precision,
      key:a.asset_key,balanceUnits:a.onchain_units,reservedUnits:a.allocated_unpaid_units,
      excludedUnits:a.excluded_units,approved:true,confirmed:true
    })),
    current: recent.results.map(r=>({
      telegramId:r.telegram_id,points:Number(r.points)
    })),
    historical:backlog.results.map(r=>({
      telegramId:r.telegram_id,points:Math.min(MAX_HISTORICAL_WEIGHT,Number(r.points))
    }))
  };
}
export async function handleTagRunV2Command(env, options) {
  const { name, isAdmin, isPrivate, chatId, telegramId, send,
    nowMs = Date.now(), fetchImpl = fetch } = options;
  if (V2_ADMIN_COMMANDS.has(name) && (!isAdmin || !isPrivate)) {
    await send('Community Pot administration is restricted to authorised bot DMs.');
    return true;
  }
  if (OBSERVATION_ADMIN_COMMANDS.has(name)) {
    return await handleV2ObservationCommand(env, {
      name,isAdmin,isPrivate,chatId,telegramId,send,nowMs,fetchImpl,
      capture: captureOptions => saveYesterdayParticipation(env,captureOptions)
    });
  }
  if (!isV2Available(env)) {
    await send('TAG RUN V2 Community Token Pot is not active yet. ' +
      'Street Cred and the 29 ranks continue normally. No token payouts are enabled.');
    return true;
  }
  const cfg = await configFor(env.DB);
  if (!cfg || cfg.wallet_account !== TIP_ACCOUNT) {
    await send('Community Pot configuration is not verified; no donations requested.');
    return true;
  }
  if (name === 'pool') {
    if (cfg.status === 'paused') {
      await send('Community Pot V2 is paused pending wallet custody and chain checks. ' +
        'Do not send tokens yet. Street Cred remains active.');
      return true;
    }
    const rows = await env.DB.prepare(
      'SELECT a.token_symbol,a.token_contract,s.spendable_units,s.day_key ' +
      'FROM tag_run_v2_assets a JOIN tag_run_v2_snapshots s ' +
      'ON s.asset_key=a.asset_key WHERE s.chat_id=? ' +
      "AND a.eligibility='approved' AND s.status='verified' " +
      'AND s.day_key = (SELECT MAX(latest.day_key) ' +
      'FROM tag_run_v2_snapshots latest WHERE latest.chat_id=s.chat_id ' +
      "AND latest.asset_key=s.asset_key AND latest.status='verified') " +
      'ORDER BY s.day_key DESC,a.token_symbol,a.token_contract LIMIT 20'
    ).bind(chatId).all();
    const balances = requiredRows(rows, 'pool_balance_read');
    const lines = balances.map(r=>r.token_symbol+' @ '+
      r.token_contract+' — '+r.spendable_units+' smallest units ('+r.day_key+')');
    await send('TAG RUN · COMMUNITY TOKEN POT (READ-ONLY)\n' +
      'Pot status: '+cfg.status+'. Wallet: '+TIP_ACCOUNT+
      '\nDaily review pool: at most 5% of each approved unreserved token.'+
      '\n'+(lines.join('\n')||'No independently verified eligible token balances yet.')+
      '\nStreet Cred is permanent. Token bonuses are not guaranteed.');
    return true;
  }
  if (name === 'myrewards') {
    const pending = await pendingWeight(env.DB,chatId,telegramId);
    await send('TAG RUN · YOUR COMMUNITY POT\n' +
      'Unfunded participation weight: '+pending+' points (not a token balance).'+
      '\nHistorical activity receives up to 50% of ticket weight when current ' +
      'and past participants both qualify.\n'+
      'Funded token payouts: NOT ENABLED. No monetary promise or pending transfer.');
    return true;
  }
  if (name === 'poolpause') {
    const write = await env.DB.prepare(
      "UPDATE tag_run_v2_pool_config SET status='paused',revision=revision+1," +
      'updated_at=CURRENT_TIMESTAMP WHERE config_id=1'
    ).run();
    if (write?.success === false) throw new Error('pool_pause_write_failed');
    await send('Community Token Pot paused. TAG RUN Street Cred continues.');
    return true;
  }
  if (name === 'poolscan') {
    if (cfg.status === 'paused') {
      await send('Community Pot paused; scanning is not enabled.');
      return true;
    }
    try {
      const result = await quarantineInboundTipReceipts(env, { fetchImpl });
      await send('TAG RUN V2 · INBOUND SCAN (QUARANTINE ONLY)\n' +
        'Irreversible inbound candidates: ' + result.seen +
        '\nNew quarantined receipts: ' + result.inserted +
        '\nHistory scan incomplete: ' + (result.truncated ? 'YES' : 'UNKNOWN') +
        '\nNo donation is approved by this scan. No token draw or transfer.');
    } catch (error) {
      await send('Community Pot scan unavailable: ' +
        String(error?.message || error).slice(0,120) +
        '. No donation was approved and no transfer was attempted.');
    }
    return true;
  }
  if (name === 'poolstatus') {
    const allow = await env.DB.prepare(
      "SELECT asset_key FROM tag_run_v2_assets WHERE eligibility='approved' LIMIT 101"
    ).all();
    const approvedAssets = requiredRows(allow, 'pool_allowlist_read');
    if (approvedAssets.length > 100) throw new Error('approved_asset_limit');
    let inventory;
    try {
      inventory = await discoverWaxTipTokens({
        fetchImpl,approvedAssets:approvedAssets.map(r=>r.asset_key)
      });
    } catch (err) {
      await send('Community Pot RPC check failed closed: '+
        String(err?.message || 'unavailable').slice(0,120)+
        '. No token allocation or transfer attempted.');
      return true;
    }
    await send('TAG RUN V2 · ADMIN READ-ONLY INVENTORY\n'+
      'Wallet exists on WAX mainnet: '+inventory.account+
      '\nDiscovered assets: '+inventory.assets.length+
      '\nApproved observed: '+inventory.assets.filter(x=>x.status==='observed_only').length+
      '\nQuarantined/unknown: '+inventory.assets.filter(x=>x.status!=='observed_only').length+
      '\nCustody verified: NO. Finalized snapshot: NO.'+
      '\nNo automated token allocation, claims or transfers.');
    return true;
  }
  if (name === 'drawaudit') {
    const rows = await env.DB.prepare(
      'SELECT day_key,status,created_at FROM tag_run_v2_draws ' +
      'WHERE chat_id=? ORDER BY day_key DESC LIMIT 10'
    ).bind(chatId).all();
    const records = requiredRows(rows, 'pool_draw_audit_read');
    await send('TAG RUN V2 · REVIEW-ONLY DRAW AUDIT\n' +
      (records.map(r=>r.day_key+' · '+r.status).join('\n')||
        'No review-only draw records. No payout records exist.'));
    return true;
  }
  if (name === 'drawpreview') {
    if (cfg.status !== 'review_only') {
      await send('V2 draw preview is paused until custody and asset review are complete.');
      return true;
    }
    // The approved V2 foundation has fixed 5% daily and 50% historical
    // probability. Reject unexpected DB settings rather than silently
    // simulating different rates from those displayed to members.
    if (cfg.daily_bps !== 500 || cfg.historical_ticket_bps !== 5000) {
      throw new Error('v2_draw_rule_configuration_mismatch');
    }
    const day = previousDay(nowMs);
    if (!(await historicalBackfillComplete(env.DB, chatId, day))) {
      await send('TAG RUN V2 · DRAW PREVIEW BLOCKED\n' +
        'Historical Street Cred participation is still being backfilled ' +
        'through ' + day + ' UTC. No draw was simulated, token bundle ' +
        'allocated or token transferred. Retry after catch-up completes.');
      return true;
    }
    const input = await drawInput(env.DB,chatId,day);
    if (!input.assets.length) {
      await send('No independently verified token snapshots for '+day+
        '. No token amounts have been allocated.');
      return true;
    }
    const seedHex = drawSeed();
    const preview = await previewCommunityDraw({
      day,...input,seedHex
    });
    await send('TAG RUN V2 · UNSAVED SIMULATION ONLY\n'+
      'Day: '+day+'\nApproved assets: '+preview.budgets.length+
      '\nHypothetical token bundles: '+preview.bundles.length+
      '\nHistorical ticket cap: 50%\n'+
      'Commitment: '+preview.seedCommitment.slice(0,16)+'…'+
      '\nThis is not a committed, independently auditable draw, '+
      'token debt, or payout. No funds are moved.');
    return true;
  }
  return false;
}
