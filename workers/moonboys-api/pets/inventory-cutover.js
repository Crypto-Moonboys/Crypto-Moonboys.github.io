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

export async function reconcileLegacyPetInventory(db, telegramId) {
  // D1 batch() is transactional: the authority delta and its checkpoint either
  // both commit or both roll back. The legacy view excludes authority-owned
  // audit events, so calling this bridge repeatedly cannot duplicate new writes.
  const statements = prepareLegacyPetInventoryReconciliation(db, telegramId);
  if (!statements.length) return [];
  return db.batch(statements);
}
