-- Reconcile legacy event-ledger item writes made after migration 042 began.
-- D1 remote migrations cannot execute the multi-statement trigger programs
-- previously embedded in 042, so this forward migration applies the same ledger
-- delta once after 043 and 044 without changing inventory or reward authority.

INSERT OR IGNORE INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity)
SELECT telegram_id, 'item', asset_key, 0
FROM telegram_pet_legacy_item_balances_042;

INSERT OR IGNORE INTO telegram_pet_inventory_legacy_sync_042 (telegram_id, asset_key, quantity)
SELECT telegram_id, asset_key, 0
FROM telegram_pet_legacy_item_balances_042;

UPDATE telegram_pet_inventory
SET quantity = MAX(0, quantity
    + COALESCE((SELECT quantity FROM telegram_pet_legacy_item_balances_042 b
        WHERE b.telegram_id = telegram_pet_inventory.telegram_id
          AND b.asset_key = telegram_pet_inventory.asset_key), 0)
    - COALESCE((SELECT quantity FROM telegram_pet_inventory_legacy_sync_042 s
        WHERE s.telegram_id = telegram_pet_inventory.telegram_id
          AND s.asset_key = telegram_pet_inventory.asset_key), 0)),
    updated_at = CURRENT_TIMESTAMP
WHERE asset_type = 'item'
  AND EXISTS (
    SELECT 1 FROM telegram_pet_inventory_legacy_sync_042 s
    WHERE s.telegram_id = telegram_pet_inventory.telegram_id
      AND s.asset_key = telegram_pet_inventory.asset_key
  );

UPDATE telegram_pet_inventory_legacy_sync_042
SET quantity = COALESCE((SELECT quantity FROM telegram_pet_legacy_item_balances_042 b
      WHERE b.telegram_id = telegram_pet_inventory_legacy_sync_042.telegram_id
        AND b.asset_key = telegram_pet_inventory_legacy_sync_042.asset_key), 0),
    updated_at = CURRENT_TIMESTAMP;
