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

function parseJsonObject(value, label = 'json') {
  if (!value) return {};
  const parsed = JSON.parse(String(value));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`moonpet_wallet_reconciliation_malformed_${label}`);
  }
  return parsed;
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

function rowWalletSnapshotIfComplete(row) {
  const metadata = parseJsonObject(row.metadata, 'metadata');
  let present = false;
  const before = {};
  const after = {};
  for (const currency of PET_ACCOUNT_WALLET_CURRENCIES) {
    const beforeValue = nestedWalletValue(metadata, 'wallet_before', currency);
    const afterValue = nestedWalletValue(metadata, 'wallet_after', currency);
    if (beforeValue !== null || afterValue !== null) present = true;
    before[currency] = beforeValue;
    after[currency] = afterValue;
  }
  if (!present) return null;
  return { before, after };
}

function walletStateKey(state) {
  return PET_ACCOUNT_WALLET_CURRENCIES.map((currency) => clampWallet(state[currency])).join(':');
}

function rowWalletSnapshot(row) {
  const snapshot = rowWalletSnapshotIfComplete(row);
  if (!snapshot) throw new Error(`moonpet_wallet_reconciliation_missing_wallet_snapshot:${row.claim_id}`);
  for (const currency of PET_ACCOUNT_WALLET_CURRENCIES) {
    if (snapshot.before[currency] === null || snapshot.after[currency] === null) {
      throw new Error(`moonpet_wallet_reconciliation_missing_wallet_snapshot:${row.claim_id}`);
    }
    if (snapshot.after[currency] !== clampWallet(snapshot.before[currency] + walletClaimDelta(row, currency))) {
      throw new Error(`moonpet_wallet_reconciliation_ambiguous_ledger:${row.claim_id}`);
    }
  }
  return snapshot;
}

function walletClaimDelta(row, currency) {
  const applied = parseJsonObject(row.applied_rewards, 'applied_rewards');
  const requested = parseJsonObject(row.requested_rewards, 'requested_rewards');
  const metadata = parseJsonObject(row.metadata, 'metadata');
  const credit = wholeNumber(applied[currency] ?? requested[currency] ?? metadata?.requested?.[currency] ?? 0);
  const cost = wholeNumber(metadata?.currency_costs?.[currency] ?? 0);
  return credit - cost;
}

function settlementTimestamp(row) {
  const value = String(row.awarded_at || row.created_at || '').trim();
  if (!value) throw new Error(`moonpet_wallet_reconciliation_missing_settlement_time:${row.claim_id}`);
  return value;
}

function orderRowsByWalletSnapshots(rows) {
  const pending = rows.map((row) => ({ row, snapshot: rowWalletSnapshot(row), timestamp: settlementTimestamp(row) }));
  pending.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const ordered = [];
  let running = null;
  for (let index = 0; index < pending.length;) {
    const timestamp = pending[index].timestamp;
    const bucket = [];
    while (index < pending.length && pending[index].timestamp === timestamp) {
      bucket.push(pending[index]);
      index += 1;
    }
    if (!running) {
      const startKeys = new Set(bucket.map((entry) => walletStateKey(entry.snapshot.before)));
      const endKeys = new Set(bucket.map((entry) => walletStateKey(entry.snapshot.after)));
      const starts = bucket.filter((entry) => !endKeys.has(walletStateKey(entry.snapshot.before)));
      if (starts.length !== 1 || (bucket.length === 1 && startKeys.size !== 1)) {
        throw new Error('moonpet_wallet_reconciliation_ambiguous_ledger');
      }
      running = { ...starts[0].snapshot.before };
    }
    const remaining = [...bucket];
    while (remaining.length) {
      const matches = remaining.filter((entry) => walletStateKey(entry.snapshot.before) === walletStateKey(running));
      if (matches.length !== 1) throw new Error('moonpet_wallet_reconciliation_ambiguous_ledger');
      const match = matches[0];
      ordered.push(match.row);
      running = { ...match.snapshot.after };
      remaining.splice(remaining.indexOf(match), 1);
    }
  }
  return ordered;
}

async function readHistoricalWalletRows(db, owner) {
  const statement = db.prepare(`
    SELECT c.rowid AS settlement_sequence, c.claim_id, c.pet_id, c.requested_rewards, c.applied_rewards,
           c.metadata, c.created_at, c.awarded_at,
           i.moon_gold AS current_moon_gold, i.moon_crystals AS current_moon_crystals,
           i.style_tokens AS current_style_tokens
    FROM telegram_pet_reward_claims c
    LEFT JOIN telegram_pet_instances i
      ON i.pet_id = c.pet_id
     AND i.telegram_id = c.telegram_id
     AND i.status IN ('active', 'retired', 'archived')
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
    ORDER BY c.pet_id, c.rowid
  `).bind(owner, PET_ACCOUNT_WALLET_RECONCILIATION_SOURCE);
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
    WHERE c.telegram_id = ?
      AND c.pet_id IS NOT NULL
      AND c.status = 'awarded'
      AND c.source <> ?
      AND (
        NOT json_valid(COALESCE(NULLIF(c.applied_rewards, ''), '{}'))
        OR NOT json_valid(COALESCE(NULLIF(c.requested_rewards, ''), '{}'))
        OR NOT json_valid(COALESCE(NULLIF(c.metadata, ''), '{}'))
        OR CASE WHEN json_valid(COALESCE(NULLIF(c.applied_rewards, ''), '{}'))
          THEN json_type(COALESCE(NULLIF(c.applied_rewards, ''), '{}')) <> 'object' ELSE 0 END
        OR CASE WHEN json_valid(COALESCE(NULLIF(c.requested_rewards, ''), '{}'))
          THEN json_type(COALESCE(NULLIF(c.requested_rewards, ''), '{}')) <> 'object' ELSE 0 END
        OR CASE WHEN json_valid(COALESCE(NULLIF(c.metadata, ''), '{}'))
          THEN json_type(COALESCE(NULLIF(c.metadata, ''), '{}')) <> 'object' ELSE 0 END
        OR NOT EXISTS (
          SELECT 1 FROM telegram_pet_events e
          WHERE e.telegram_id = c.telegram_id
            AND e.pet_id = c.pet_id
            AND e.status = 'accepted'
            AND e.metadata = c.metadata
        )
      )
    LIMIT 1
  `).bind(owner, PET_ACCOUNT_WALLET_RECONCILIATION_SOURCE).first();
  if (ambiguous) throw new Error('moonpet_wallet_reconciliation_ambiguous_ledger');
}

function currentWalletFromRow(row) {
  const wallet = {};
  for (const currency of PET_ACCOUNT_WALLET_CURRENCIES) {
    const value = row[`current_${currency}`];
    if (value === undefined || value === null) return null;
    wallet[currency] = clampWallet(value);
  }
  return wallet;
}

function replayMissingSnapshotRowsFromTerminal(rows, terminalWallet) {
  if (!terminalWallet) throw new Error('moonpet_wallet_reconciliation_missing_wallet_snapshot');
  const deltas = { moon_gold: 0, moon_crystals: 0, style_tokens: 0 };
  let running = { ...terminalWallet };
  for (const row of [...rows].reverse()) {
    const snapshot = rowWalletSnapshotIfComplete(row);
    if (snapshot) {
      for (const currency of PET_ACCOUNT_WALLET_CURRENCIES) {
        if (snapshot.before[currency] === null || snapshot.after[currency] === null) {
          throw new Error(`moonpet_wallet_reconciliation_missing_wallet_snapshot:${row.claim_id}`);
        }
        if (snapshot.after[currency] !== clampWallet(snapshot.before[currency] + walletClaimDelta(row, currency))) {
          throw new Error(`moonpet_wallet_reconciliation_ambiguous_ledger:${row.claim_id}`);
        }
        if (running[currency] !== snapshot.after[currency]) {
          throw new Error(`moonpet_wallet_reconciliation_ambiguous_ledger:${row.claim_id}`);
        }
        deltas[currency] += snapshot.after[currency] - snapshot.before[currency];
        running[currency] = snapshot.before[currency];
      }
      continue;
    }
    for (const currency of PET_ACCOUNT_WALLET_CURRENCIES) {
      const delta = walletClaimDelta(row, currency);
      if (delta > 0 && running[currency] === PET_ACCOUNT_WALLET_MAX) {
        throw new Error(`moonpet_wallet_reconciliation_ambiguous_ledger:${row.claim_id}`);
      }
      if (delta < 0 && running[currency] === 0) {
        throw new Error(`moonpet_wallet_reconciliation_ambiguous_ledger:${row.claim_id}`);
      }
      const before = running[currency] - delta;
      if (before < 0 || before > PET_ACCOUNT_WALLET_MAX) {
        throw new Error(`moonpet_wallet_reconciliation_ambiguous_ledger:${row.claim_id}`);
      }
      deltas[currency] += delta;
      running[currency] = before;
    }
  }
  return deltas;
}

function replayHistoricalWalletDeltas(rows) {
  const byPet = new Map();
  for (const row of rows) {
    const hasWalletDelta = PET_ACCOUNT_WALLET_CURRENCIES.some((currency) => walletClaimDelta(row, currency) !== 0);
    if (!hasWalletDelta) continue;
    const snapshot = rowWalletSnapshotIfComplete(row);
    if (snapshot) {
      const hasAppliedWalletMovement = PET_ACCOUNT_WALLET_CURRENCIES.some((currency) => snapshot.before[currency] !== snapshot.after[currency]);
      if (!hasAppliedWalletMovement) continue;
    }
    if (!byPet.has(row.pet_id)) byPet.set(row.pet_id, []);
    byPet.get(row.pet_id).push(row);
  }
  const deltas = { moon_gold: 0, moon_crystals: 0, style_tokens: 0 };
  for (const petRows of byPet.values()) {
    petRows.sort((left, right) => Number(left.settlement_sequence || 0) - Number(right.settlement_sequence || 0));
    const hasMissingSnapshot = petRows.some((row) => !rowWalletSnapshotIfComplete(row));
    if (hasMissingSnapshot) {
      const replayed = replayMissingSnapshotRowsFromTerminal(petRows, currentWalletFromRow(petRows[0]));
      for (const currency of PET_ACCOUNT_WALLET_CURRENCIES) deltas[currency] += replayed[currency];
    } else {
      const orderedRows = orderRowsByWalletSnapshots(petRows);
      for (const row of orderedRows) {
        const snapshot = rowWalletSnapshot(row);
        for (const currency of PET_ACCOUNT_WALLET_CURRENCIES) {
          deltas[currency] += snapshot.after[currency] - snapshot.before[currency];
        }
      }
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
// historical pet_id wallet credits and debits in the durable claim row order.
// Before/after wallet snapshots are used when present; older claims without
// snapshots are replayed from the current terminal instance wallet only when
// that proves no per-event cap/clamp ambiguity. The current profile balance,
// current instance rows, and current instance sentinel timestamps are never used
// as a baseline or eligibility proof. If object-shaped JSON, claim ordering,
// snapshots, or terminal balances cannot prove the exact clamped order,
// reconciliation fails closed before committing the one-shot marker.
export async function reconcilePetInstanceWalletToProfile(db, telegramId, now = new Date()) {
  const owner = String(telegramId || '').trim();
  if (!owner) return false;
  try {
    if (await hasPetAccountWalletReconciliationMarker(db, owner)) return false;
    await assertReconciliationLedgerIsSafe(db, owner);
    const historicalRows = await readHistoricalWalletRows(db, owner);
    const walletDeltas = replayHistoricalWalletDeltas(historicalRows);
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
