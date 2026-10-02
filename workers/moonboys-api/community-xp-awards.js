import { selectCommunitySeason } from './community-season-authority.js';

function rows(result) {
  if (result?.success === false || !Array.isArray(result?.results)) throw new Error('community_xp_state_unavailable');
  return result.results;
}

function changes(result) {
  const value = result?.meta?.changes ?? result?.changes;
  if (result?.success === false || !Number.isInteger(value) || value < 0) throw new Error('community_xp_save_unavailable');
  return value;
}

function earningDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('community_xp_timestamp_invalid');
  return date;
}

function identity(action, referenceId, now) {
  if (action === 'daily_claim') return { key: now.toISOString().slice(0, 10), where: 'DATE(created_at) = ?', args: [now.toISOString().slice(0, 10)] };
  if (action === 'first_start' || action === 'group_join') return { key: 'once', where: '1=1', args: [] };
  if (!referenceId) throw new Error('community_xp_reference_required');
  return { key: referenceId, where: 'reference_id = ?', args: [referenceId] };
}

export async function hasDailyCommunityClaim(db, telegramId, at = new Date()) {
  const day = earningDate(at).toISOString().slice(0, 10);
  const row = await db.prepare(`SELECT id FROM telegram_xp_log
    WHERE telegram_id = ? AND action = 'daily_claim' AND DATE(created_at) = ? LIMIT 1`).bind(telegramId, day).first();
  if (row === null) return false;
  if (row?.success === false || !Number.isSafeInteger(Number(row?.id)) || Number(row.id) <= 0) throw new Error('community_xp_state_unavailable');
  return true;
}

/**
 * All writes use a receipt token generated for this attempt. A duplicate cannot
 * satisfy another attempt's predicate, including in appended source mutations.
 * D1 batches roll back the receipt, log, account, leaderboard and source together.
 * Legacy logs block a new award but are never guessed to be repairable receipts.
 */
export async function awardCommunityXp(db, telegramId, xpChange, action, referenceId = '', options = {}) {
  if (!Number.isSafeInteger(xpChange) || xpChange < 0) throw new Error('community_xp_amount_invalid');
  const now = earningDate(options.now ?? new Date());
  const owner = String(telegramId);
  const reference = action === 'daily_claim' ? now.toISOString().slice(0, 10) : String(referenceId || '');
  const source = identity(action, reference, now);
  const lookup = () => db.prepare(`SELECT * FROM telegram_community_xp_awards WHERE telegram_id=? AND action=? AND claim_key=?`).bind(owner, action, source.key).all();
  const legacyLookup = () => db.prepare(`SELECT id, telegram_id, action, reference_id, xp_change, created_at FROM telegram_xp_log
    WHERE telegram_id=? AND action=? AND ${source.where} ORDER BY id LIMIT 1`).bind(owner, action, ...source.args).all();
  const existingResult = async () => {
    const receipt = rows(await lookup())[0];
    if (receipt) {
      if (receipt.telegram_id !== owner || receipt.action !== action || receipt.claim_key !== source.key
        || String(receipt.reference_id || '') !== reference || !Number.isSafeInteger(receipt.xp_change) || receipt.xp_change < 0
        || !receipt.settlement_token || !Number.isFinite(new Date(receipt.earned_at).getTime())
        || (receipt.season_id !== null && (!Number.isSafeInteger(receipt.season_id) || receipt.season_id <= 0))) throw new Error('community_xp_receipt_invalid');
      return { accepted: true, duplicate: true, xp_awarded: 0, original_xp: receipt.xp_change, season_id: receipt.season_id, earned_at: receipt.earned_at };
    }
    const legacy = rows(await legacyLookup())[0];
    if (!legacy) return null;
    if (legacy.telegram_id !== owner || legacy.action !== action || !Number.isSafeInteger(legacy.id) || legacy.id <= 0
      || !Number.isSafeInteger(legacy.xp_change) || legacy.xp_change < 0) throw new Error('community_xp_receipt_invalid');
    return { accepted: true, duplicate: true, legacy_receipt: true, xp_awarded: 0, original_xp: legacy.xp_change, earned_at: legacy.created_at };
  };
  const prior = await existingResult();
  if (prior) return prior;
  const season = await selectCommunitySeason(db, now);
  if (season !== null && (!Number.isSafeInteger(season?.id) || season.id <= 0)) throw new Error('community_season_unavailable');
  const token = crypto.randomUUID();
  const gate = {
    sql: 'EXISTS (SELECT 1 FROM telegram_community_xp_awards WHERE telegram_id=? AND action=? AND claim_key=? AND settlement_token=?)',
    args: [owner, action, source.key, token],
  };
  const statements = [db.prepare(`INSERT OR IGNORE INTO telegram_community_xp_awards
    (telegram_id, action, claim_key, reference_id, xp_change, season_id, earned_at, settlement_token)
    SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_users WHERE telegram_id=?)
      AND NOT EXISTS (SELECT 1 FROM telegram_xp_log WHERE telegram_id=? AND action=? AND ${source.where})
      AND (${options.sourcePredicate?.sql || '1=1'})`).bind(owner, action, source.key, reference || null, xpChange, season?.id ?? null,
      now.toISOString(), token, owner, owner, action, ...source.args, ...(options.sourcePredicate?.args || []))];
  if (xpChange > 0) {
    statements.push(db.prepare(`INSERT INTO telegram_xp_log (telegram_id, action, xp_change, reference_id, created_at)
      SELECT ?, ?, ?, ?, ? WHERE ${gate.sql}`).bind(owner, action, xpChange, reference || null, now.toISOString(), ...gate.args));
    statements.push(db.prepare(`UPDATE telegram_users SET xp=xp+?, level=CAST((xp+?)/100 AS INTEGER)+1,
      updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND ${gate.sql}`).bind(xpChange, xpChange, owner, ...gate.args));
    if (season?.id) statements.push(db.prepare(`INSERT INTO telegram_leaderboard (telegram_id, season_id, xp)
      SELECT ?, ?, ? WHERE ${gate.sql} ON CONFLICT(telegram_id, season_id)
      DO UPDATE SET xp=xp+excluded.xp, updated_at=CURRENT_TIMESTAMP`).bind(owner, season.id, xpChange, ...gate.args));
  }
  const sourceStatements = options.sourceStatements?.(gate) || [];
  statements.push(...sourceStatements.map(entry => entry.statement));
  const results = await db.batch(statements);
  if (!Array.isArray(results) || results.length !== statements.length) throw new Error('community_xp_save_unavailable');
  const affected = results.map(changes);
  const inserted = affected[0];
  if (inserted !== 0 && inserted !== 1) throw new Error('community_xp_save_unavailable');
  for (let i = 1; i < affected.length; i++) {
    const extra = sourceStatements[i - (statements.length - sourceStatements.length)];
    if (affected[i] !== inserted && !(inserted === 1 && extra?.allowExisting === true && affected[i] === 0)) throw new Error('community_xp_save_unavailable');
  }
  if (inserted === 0) {
    const saved = await existingResult();
    if (saved) return saved;
    throw new Error('community_xp_source_changed');
  }
  return { accepted: true, duplicate: false, xp_awarded: xpChange, original_xp: xpChange, season_id: season?.id ?? null, earned_at: now.toISOString() };
}
