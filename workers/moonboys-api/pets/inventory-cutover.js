import { requirePetMutationResult, requirePetFirstReadResult } from './read-result.js';

export function prepareLegacyPetInventoryReconciliation(db, telegramIdRaw) {
  const telegramId = String(telegramIdRaw || '').trim();
  if (!telegramId) return [];

  return [
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity)
      SELECT telegram_id, 'item', asset_key, 0
      FROM telegram_pet_legacy_item_balances_042
      WHERE telegram_id = ?`).bind(telegramId),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_inventory_legacy_sync_042 (telegram_id, asset_key, quantity)
      SELECT telegram_id, asset_key, 0
      FROM telegram_pet_legacy_item_balances_042
      WHERE telegram_id = ?`).bind(telegramId),
    db.prepare(`UPDATE telegram_pet_inventory
      SET quantity = MAX(0, quantity
          + COALESCE((SELECT quantity FROM telegram_pet_legacy_item_balances_042 b
              WHERE b.telegram_id = telegram_pet_inventory.telegram_id
                AND b.asset_key = telegram_pet_inventory.asset_key), 0)
          - COALESCE((SELECT quantity FROM telegram_pet_inventory_legacy_sync_042 s
              WHERE s.telegram_id = telegram_pet_inventory.telegram_id
                AND s.asset_key = telegram_pet_inventory.asset_key), 0)),
          updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ? AND asset_type = 'item'
        AND EXISTS (SELECT 1 FROM telegram_pet_inventory_legacy_sync_042 s
          WHERE s.telegram_id = telegram_pet_inventory.telegram_id
            AND s.asset_key = telegram_pet_inventory.asset_key)`).bind(telegramId),
    db.prepare(`UPDATE telegram_pet_inventory_legacy_sync_042
      SET quantity = COALESCE((SELECT quantity FROM telegram_pet_legacy_item_balances_042 b
            WHERE b.telegram_id = telegram_pet_inventory_legacy_sync_042.telegram_id
              AND b.asset_key = telegram_pet_inventory_legacy_sync_042.asset_key), 0),
          updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ?`).bind(telegramId),
  ];
}

export async function reconcileLegacyPetInventory(db, telegramId, { skipEmpty = false } = {}) {
  if (skipEmpty) {
    // Current writers use the authoritative inventory ledger. Only historical
    // item deltas or an existing checkpoint can consume this beta bridge.
    // Probe after the full response's economy snapshot; a concurrent legacy
    // event is still detected by its final source/economy assertions.
    const row = await db.prepare(`SELECT (EXISTS (
      SELECT 1 FROM telegram_pet_events WHERE telegram_id=?1 AND status='accepted' AND json_valid(metadata)
        AND COALESCE(json_extract(metadata,'$.inventory_authority'),0)<>1
        AND (COALESCE(json_extract(metadata,'$.item_key'),json_extract(metadata,'$.inventory_key'))
          IN ('moon_snack','energy_drink','clean_wipe','lucky_charm','style_patch','adventure_map')
          OR json_extract(metadata,'$.consumed_item_key')
          IN ('moon_snack','energy_drink','clean_wipe','lucky_charm','style_patch','adventure_map'))
      ) OR EXISTS (SELECT 1 FROM telegram_pet_inventory_legacy_sync_042 WHERE telegram_id=?1)) AS needed`)
      .bind(String(telegramId)).first().then(requirePetFirstReadResult);
    if (!row || (row.needed !== 0 && row.needed !== 1)) throw new Error('pet_state_read_unavailable');
    if (!row.needed) return [];
  }
  // D1 batch() is transactional: the authority delta and its checkpoint either
  // both commit or both roll back. The legacy view excludes authority-owned
  // audit events, so calling this bridge repeatedly cannot duplicate new writes.
  const statements = prepareLegacyPetInventoryReconciliation(db, telegramId);
  if (!statements.length) return [];
  const results = await db.batch(statements);
  if (!Array.isArray(results) || results.length !== statements.length) throw new Error('pet_state_write_unavailable');
  for (const result of results) {
    requirePetMutationResult(result);
    if (!Number.isSafeInteger(result?.meta?.changes) || result.meta.changes < 0) throw new Error('pet_state_write_unavailable');
  }
  return results;
}
