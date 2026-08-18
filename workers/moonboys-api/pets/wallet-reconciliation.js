export const PET_INSTANCE_AUTHORITY_VERSION = '0001-01-01 00:00:00';
export const PET_ACCOUNT_WALLET_RECONCILIATION_EVENT_KEY = 'moonpet_wallet_reconcile:v1';

const PET_ACCOUNT_WALLET_MAX = 999999;
const PET_ACCOUNT_WALLET_RECONCILIATION_SOURCE = 'wallet_reconciliation';
const PET_ACCOUNT_WALLET_CURRENCIES = Object.freeze(['moon_gold', 'moon_crystals', 'style_tokens']);

function getPetDayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function getPetWeekKey(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getMoonpetSeasonKey(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const quarter = Math.floor(month / 3) + 1;
  return `pet-s${year}-${String(quarter).padStart(3, '0')}`;
}

function parseJsonObject(value) {
  if (!value) return {};
  const parsed = JSON.parse(String(value));
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function wholeNumber(value) {
  return Math.trunc(Number(value) || 0);
}

function clampWallet(value) {
  return Math.max(0, Math.min(PET_ACCOUNT_WALLET_MAX, wholeNumber(value)));
}

function nestedWalletValue(object, key, currency) {
  const value = object?.[key]?.[currency] ?? object?.context?.[key]?.[currency];
  return value === undefined || value === null ? null : clampWallet(value);
}

function walletClaimDelta(row, currency) {
  const applied = parseJsonObject(row.applied_rewards);
  const requested = parseJsonObject(row.requested_rewards);
  const metadata = parseJsonObject(row.metadata);
  const credit = wholeNumber(applied[currency] ?? requested[currency] ?? metadata?.requested?.[currency] ?? 0);
  const cost = wholeNumber(metadata?.currency_costs?.[currency] ?? 0);
  return credit - cost;
}

function replayFromSnapshotRows(rows, currency, finalBalance) {
  const snapshots = rows.map((row) => {
    const metadata = parseJsonObject(row.metadata);
    return {
      before: nestedWalletValue(metadata, 'wallet_before', currency),
      after: nestedWalletValue(metadata, 'wallet_after', currency),
      delta: walletClaimDelta(row, currency),
      claim_id: row.claim_id,
    };
  });
  if (!snapshots.every((entry) => entry.before !== null && entry.after !== null)) return null;
  let running = snapshots[0].before;
  const starting = running;
  for (const entry of snapshots) {
    if (entry.before !== running || entry.after !== clampWallet(entry.before + entry.delta)) {
      throw new Error(`moonpet_wallet_reconciliation_ambiguous_ledger:${entry.claim_id}`);
    }
    running = entry.after;
  }
  if (running !== finalBalance) throw new Error('moonpet_wallet_reconciliation_ambiguous_ledger');
  return finalBalance - starting;
}

function replayFromInferredStart(rows, currency, finalBalance) {
  const deltas = rows.map((row) => walletClaimDelta(row, currency)).filter((delta) => delta !== 0);
  if (!deltas.length) return 0;
  const forward = (start) => deltas.reduce((balance, delta) => clampWallet(balance + delta), clampWallet(start));
  let low = 0;
  let high = PET_ACCOUNT_WALLET_MAX;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (forward(mid) >= finalBalance) high = mid;
    else low = mid + 1;
  }
  const firstStart = low;
  if (forward(firstStart) !== finalBalance) throw new Error('moonpet_wallet_reconciliation_ambiguous_ledger');
  low = 0;
  high = PET_ACCOUNT_WALLET_MAX;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (forward(mid) <= finalBalance) low = mid;
    else high = mid - 1;
  }
  const lastStart = low;
  if (firstStart !== lastStart) throw new Error('moonpet_wallet_reconciliation_ambiguous_ledger');
  return finalBalance - firstStart;
}

function replayCurrencyDelta(rows, currency, finalBalance) {
  const snapshotDelta = replayFromSnapshotRows(rows, currency, finalBalance);
  if (snapshotDelta !== null) return snapshotDelta;
  return replayFromInferredStart(rows, currency, finalBalance);
}

async function readHistoricalWalletRows(db, owner) {
  const statement = db.prepare(`
    SELECT c.claim_id, c.pet_id, c.requested_rewards, c.applied_rewards, c.metadata, c.created_at, c.awarded_at,
           i.moon_gold AS instance_moon_gold,
           i.moon_crystals AS instance_moon_crystals,
           i.style_tokens AS instance_style_tokens
    FROM telegram_pet_reward_claims c
    JOIN telegram_pet_instances i
      ON i.pet_id = c.pet_id
     AND i.telegram_id = c.telegram_id
     AND i.status IN ('active', 'retired', 'archived')
     AND i.source_profile_updated_at = ?
    WHERE c.telegram_id = ?
      AND c.pet_id IS NOT NULL
      AND c.status = 'awarded'
      AND c.source <> ?
      AND json_valid(COALESCE(NULLIF(c.applied_rewards, ''), '{}'))
      AND json_valid(COALESCE(NULLIF(c.requested_rewards, ''), '{}'))
      AND json_valid(COALESCE(NULLIF(c.metadata, ''), '{}'))
      AND EXISTS (
        SELECT 1 FROM telegram_pet_events e
        WHERE e.telegram_id = c.telegram_id
          AND e.pet_id = c.pet_id
          AND e.status = 'accepted'
          AND e.metadata = c.metadata
      )
    ORDER BY c.pet_id, COALESCE(c.awarded_at, c.created_at), c.created_at, c.claim_id
  `).bind(PET_INSTANCE_AUTHORITY_VERSION, owner, PET_ACCOUNT_WALLET_RECONCILIATION_SOURCE);
  if (typeof statement.all === 'function') {
    const rows = await statement.all();
    return rows.results || [];
  }
  if (db.database && statement.sql && Array.isArray(statement.args)) {
    return db.database.prepare(statement.sql).all(...statement.args);
  }
  throw new Error('moonpet_wallet_reconciliation_ledger_read_unavailable');
}

async function assertReconciliationLedgerIsSafe(db, owner) {
  const ambiguous = await db.prepare(`
    SELECT c.claim_id
    FROM telegram_pet_reward_claims c
    JOIN telegram_pet_instances i
      ON i.pet_id = c.pet_id
     AND i.telegram_id = c.telegram_id
     AND i.status IN ('active', 'retired', 'archived')
     AND i.source_profile_updated_at = ?
    WHERE c.telegram_id = ?
      AND c.pet_id IS NOT NULL
      AND c.status = 'awarded'
      AND c.source <> ?
      AND (
        NOT json_valid(COALESCE(NULLIF(c.applied_rewards, ''), '{}'))
        OR NOT json_valid(COALESCE(NULLIF(c.requested_rewards, ''), '{}'))
        OR NOT json_valid(COALESCE(NULLIF(c.metadata, ''), '{}'))
        OR NOT EXISTS (
          SELECT 1 FROM telegram_pet_events e
          WHERE e.telegram_id = c.telegram_id
            AND e.pet_id = c.pet_id
            AND e.status = 'accepted'
            AND e.metadata = c.metadata
        )
      )
    LIMIT 1
  `).bind(PET_INSTANCE_AUTHORITY_VERSION, owner, PET_ACCOUNT_WALLET_RECONCILIATION_SOURCE).first();
  if (ambiguous) throw new Error('moonpet_wallet_reconciliation_ambiguous_ledger');
}

function calculateHistoricalWalletDeltas(rows) {
  const byPet = new Map();
  for (const row of rows) {
    if (!byPet.has(row.pet_id)) byPet.set(row.pet_id, []);
    byPet.get(row.pet_id).push(row);
  }
  const deltas = { moon_gold: 0, moon_crystals: 0, style_tokens: 0 };
  for (const petRows of byPet.values()) {
    for (const currency of PET_ACCOUNT_WALLET_CURRENCIES) {
      deltas[currency] += replayCurrencyDelta(petRows, currency, clampWallet(petRows[0][`instance_${currency}`]));
    }
  }
  return deltas;
}

async function hasPetAccountWalletReconciliationMarker(db, owner) {
  const marker = await db.prepare(`
    SELECT claim_id FROM telegram_pet_reward_claims
    WHERE telegram_id = ? AND source = ? AND idempotency_key = ? AND status = 'awarded'
    LIMIT 1
  `).bind(owner, PET_ACCOUNT_WALLET_RECONCILIATION_SOURCE, PET_ACCOUNT_WALLET_RECONCILIATION_EVENT_KEY).first();
  return Boolean(marker);
}

// No migration is required for the PR #1224 -> #1228 wallet repair. The
// existing reward-claim ledger is not used by the public activity feed, has a
// unique owner/source/idempotency receipt, and lets us replay accepted
// historical pet_id wallet credits and debits in settlement order. The current
// profile balance is never used as a per-pet baseline; if per-event clamping
// cannot be reconstructed from snapshots or a unique inferred starting balance,
// reconciliation fails closed before committing the one-shot marker.
export async function reconcilePetInstanceWalletToProfile(db, telegramId, now = new Date()) {
  const owner = String(telegramId || '').trim();
  if (!owner) return false;
  try {
    if (await hasPetAccountWalletReconciliationMarker(db, owner)) return false;
    await assertReconciliationLedgerIsSafe(db, owner);
    const historicalRows = await readHistoricalWalletRows(db, owner);
    const walletDeltas = calculateHistoricalWalletDeltas(historicalRows);
    const markerId = crypto.randomUUID();
    const dayKey = getPetDayKey(now);
    const metadata = JSON.stringify({
      source: 'runtime_wallet_reconciliation',
      contract: 'account_wallet_profile_authority',
      derived_from: 'accepted_pet_id_reward_claim_ledger',
      folded_from: 'pet_authority_instance_wallet_columns',
      replay: 'ordered_wallet_transitions_with_per_event_clamps',
      season_key: getMoonpetSeasonKey(now),
      week_key: getPetWeekKey(now),
    });
    const results = await db.batch([
      db.prepare(`INSERT OR IGNORE INTO telegram_pet_reward_claims
          (claim_id, pet_id, telegram_id, source, idempotency_key, day_key, status, requested_rewards, applied_rewards, metadata, awarded_at)
        SELECT ?, NULL, ?, '${PET_ACCOUNT_WALLET_RECONCILIATION_SOURCE}', ?, ?, 'awarded', '{}', '{}', ?, CURRENT_TIMESTAMP
        WHERE EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id = ?)
          AND NOT EXISTS (
            SELECT 1 FROM telegram_pet_reward_claims
            WHERE telegram_id = ? AND source = '${PET_ACCOUNT_WALLET_RECONCILIATION_SOURCE}' AND idempotency_key = ? AND status = 'awarded'
          )`)
        .bind(markerId, owner, PET_ACCOUNT_WALLET_RECONCILIATION_EVENT_KEY, dayKey, metadata,
          owner, owner, PET_ACCOUNT_WALLET_RECONCILIATION_EVENT_KEY),
      db.prepare(`UPDATE telegram_pet_profiles SET
          moon_gold = MIN(?, MAX(0, moon_gold + ?)),
          moon_crystals = MIN(?, MAX(0, moon_crystals + ?)),
          style_tokens = MIN(?, MAX(0, style_tokens + ?))
        WHERE telegram_id = ? AND EXISTS (
          SELECT 1 FROM telegram_pet_reward_claims
          WHERE claim_id = ? AND source = ? AND idempotency_key = ? AND status = 'awarded'
        )`)
        .bind(
          PET_ACCOUNT_WALLET_MAX, walletDeltas.moon_gold,
          PET_ACCOUNT_WALLET_MAX, walletDeltas.moon_crystals,
          PET_ACCOUNT_WALLET_MAX, walletDeltas.style_tokens,
          owner, markerId, PET_ACCOUNT_WALLET_RECONCILIATION_SOURCE, PET_ACCOUNT_WALLET_RECONCILIATION_EVENT_KEY,
        ),
    ]);
    return Number(results?.[0]?.meta?.changes || 0) === 1;
  } catch (error) {
    if (/no such table: telegram_pet_(events|instances|profiles|reward_claims)/i.test(String(error?.message || error))) return false;
    throw error;
  }
}
