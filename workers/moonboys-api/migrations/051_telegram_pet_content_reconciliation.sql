-- Canonicalise Moonpet material storage before unified Mini App progression.
-- Runtime progression already uses telegram_pet_material_balances; older reward
-- settlement stored the same material keys in telegram_pet_inventory.

INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity, updated_at)
SELECT telegram_id, asset_key, SUM(quantity), CURRENT_TIMESTAMP
FROM telegram_pet_inventory
WHERE asset_type = 'material' AND quantity > 0
GROUP BY telegram_id, asset_key
ON CONFLICT(telegram_id, material_key) DO UPDATE SET
  quantity = MIN(9999, telegram_pet_material_balances.quantity + excluded.quantity),
  updated_at = CURRENT_TIMESTAMP;

DELETE FROM telegram_pet_inventory WHERE asset_type = 'material';

-- Translate pre-canonical evolution resources if any were already earned.
INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity, updated_at)
SELECT telegram_id, 'scrap_metal', quantity, CURRENT_TIMESTAMP
FROM telegram_pet_material_balances WHERE material_key = 'neon_scrap'
ON CONFLICT(telegram_id, material_key) DO UPDATE SET
  quantity = MIN(9999, telegram_pet_material_balances.quantity + excluded.quantity), updated_at = CURRENT_TIMESTAMP;
DELETE FROM telegram_pet_material_balances WHERE material_key = 'neon_scrap';

INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity, updated_at)
SELECT telegram_id, 'moon_fabric', quantity, CURRENT_TIMESTAMP
FROM telegram_pet_material_balances WHERE material_key = 'spray_pigment'
ON CONFLICT(telegram_id, material_key) DO UPDATE SET
  quantity = MIN(9999, telegram_pet_material_balances.quantity + excluded.quantity), updated_at = CURRENT_TIMESTAMP;
DELETE FROM telegram_pet_material_balances WHERE material_key = 'spray_pigment';
