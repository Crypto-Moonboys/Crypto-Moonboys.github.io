export const PET_INSTANCE_AUTHORITY_VERSION = '0001-01-01 00:00:00';
export const PET_ACCOUNT_WALLET_RECONCILIATION_EVENT_KEY = 'moonpet_wallet_reconcile:v1';

const PET_ACCOUNT_WALLET_MAX = 999999;
const PET_ACCOUNT_WALLET_RECONCILIATION_SOURCE = 'wallet_reconciliation';

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

function walletLedgerAmount(currency) {
  const path = `$.${currency}`;
  const requestedPath = `$.requested.${currency}`;
  const costPath = `$.currency_costs.${currency}`;
  return `MAX(0,
    CAST(COALESCE(
      json_extract(NULLIF(c.applied_rewards, ''), '${path}'),
      json_extract(NULLIF(c.requested_rewards, ''), '${path}'),
      json_extract(NULLIF(c.metadata, ''), '${requestedPath}'),
      0
    ) AS INTEGER)
    - CAST(COALESCE(json_extract(NULLIF(c.metadata, ''), '${costPath}'), 0) AS INTEGER)
  )`;
}

function ledgerBackedWalletSubquery(currency) {
  return `
    SELECT SUM(MIN(ledger.wallet_amount, MAX(0, COALESCE(i.${currency}, 0))))
    FROM (
      SELECT c.pet_id, SUM(${walletLedgerAmount(currency)}) AS wallet_amount
      FROM telegram_pet_reward_claims c
      WHERE c.telegram_id = ?
        AND c.pet_id IS NOT NULL
        AND c.status = 'awarded'
        AND c.source <> '${PET_ACCOUNT_WALLET_RECONCILIATION_SOURCE}'
        AND EXISTS (
          SELECT 1 FROM telegram_pet_events e
          WHERE e.telegram_id = c.telegram_id
            AND e.pet_id = c.pet_id
            AND e.status = 'accepted'
            AND e.metadata = c.metadata
        )
      GROUP BY c.pet_id
    ) ledger
    JOIN telegram_pet_instances i
      ON i.pet_id = ledger.pet_id
     AND i.telegram_id = ?
     AND i.status IN ('active', 'retired', 'archived')
     AND i.source_profile_updated_at = ?
    WHERE ledger.wallet_amount > 0`;
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
// unique owner/source/idempotency receipt, and lets us reconstruct only
// accepted historical pet_id wallet rewards. The current profile balance is
// never used as a per-pet baseline: each ledger total is bounded by that pet's
// sentinel instance wallet cache so post-fix account-settled claims cannot be
// replayed into the account wallet.
export async function reconcilePetInstanceWalletToProfile(db, telegramId, now = new Date()) {
  const owner = String(telegramId || '').trim();
  if (!owner) return false;
  try {
    if (await hasPetAccountWalletReconciliationMarker(db, owner)) return false;
    const markerId = crypto.randomUUID();
    const dayKey = getPetDayKey(now);
    const metadata = JSON.stringify({
      source: 'runtime_wallet_reconciliation',
      contract: 'account_wallet_profile_authority',
      derived_from: 'accepted_pet_id_reward_claim_ledger',
      folded_from: 'pet_authority_instance_wallet_columns',
      season_key: getMoonpetSeasonKey(now),
      week_key: getPetWeekKey(now),
    });
    const results = await db.batch([
      db.prepare(`INSERT OR IGNORE INTO telegram_pet_reward_claims
          (claim_id, pet_id, telegram_id, source, idempotency_key, day_key, status, requested_rewards, applied_rewards, metadata, awarded_at)
        SELECT ?, NULL, ?, ?, ?, ?, 'awarded', '{}', '{}', ?, CURRENT_TIMESTAMP
        WHERE EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id = ?)
          AND NOT EXISTS (
            SELECT 1 FROM telegram_pet_reward_claims
            WHERE telegram_id = ? AND source = ? AND idempotency_key = ? AND status = 'awarded'
          )`)
        .bind(markerId, owner, PET_ACCOUNT_WALLET_RECONCILIATION_SOURCE, PET_ACCOUNT_WALLET_RECONCILIATION_EVENT_KEY, dayKey, metadata,
          owner, owner, PET_ACCOUNT_WALLET_RECONCILIATION_SOURCE, PET_ACCOUNT_WALLET_RECONCILIATION_EVENT_KEY),
      db.prepare(`UPDATE telegram_pet_profiles SET
          moon_gold = MIN(?, moon_gold + COALESCE((${ledgerBackedWalletSubquery('moon_gold')}), 0)),
          moon_crystals = MIN(?, moon_crystals + COALESCE((${ledgerBackedWalletSubquery('moon_crystals')}), 0)),
          style_tokens = MIN(?, style_tokens + COALESCE((${ledgerBackedWalletSubquery('style_tokens')}), 0))
        WHERE telegram_id = ? AND EXISTS (
          SELECT 1 FROM telegram_pet_reward_claims
          WHERE claim_id = ? AND source = ? AND idempotency_key = ? AND status = 'awarded'
        )`)
        .bind(
          PET_ACCOUNT_WALLET_MAX, owner, owner, PET_INSTANCE_AUTHORITY_VERSION,
          PET_ACCOUNT_WALLET_MAX, owner, owner, PET_INSTANCE_AUTHORITY_VERSION,
          PET_ACCOUNT_WALLET_MAX, owner, owner, PET_INSTANCE_AUTHORITY_VERSION,
          owner, markerId, PET_ACCOUNT_WALLET_RECONCILIATION_SOURCE, PET_ACCOUNT_WALLET_RECONCILIATION_EVENT_KEY,
        ),
    ]);
    return Number(results?.[0]?.meta?.changes || 0) === 1;
  } catch (error) {
    if (/no such table: telegram_pet_(events|instances|profiles|reward_claims)/i.test(String(error?.message || error))) return false;
    throw error;
  }
}
