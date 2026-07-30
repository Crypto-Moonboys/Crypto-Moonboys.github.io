import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PET_EQUIPMENT_MAX_LEVEL,
  PET_EQUIPMENT_UTILITY,
  formatPetEquipmentProgression,
  getPetEquipmentDefinition,
  getPetEquipmentLevelFromXp,
  getPetEquipmentMasteryAward,
  getPetEquipmentMasteryTier,
  getPetEquipmentXpForLevel,
  scalePetEquipmentEffects,
} from '../workers/moonboys-api/pets/equipment-progression.js';

const migration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/038_telegram_pet_equipment_progression.sql', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');

assert.equal(PET_EQUIPMENT_MAX_LEVEL, 10);
for (const key of ['crystal_bowl', 'hoverboard', 'crown_jacket', 'moon_helmet', 'laser_claws', 'shield_charm']) {
  const item = getPetEquipmentDefinition(key);
  assert.ok(item, `${key} must have a utility definition`);
  assert.ok(item.systems.length >= 3, `${key} must affect at least three systems`);
  assert.ok(item.mastery_actions.length >= 3, `${key} must have multiple mastery sources`);
}

assert.equal(getPetEquipmentLevelFromXp(0), 1);
assert.equal(getPetEquipmentLevelFromXp(getPetEquipmentXpForLevel(5)), 5);
assert.equal(getPetEquipmentLevelFromXp(999999), 10);
assert.equal(getPetEquipmentMasteryTier(0), 0);
assert.equal(getPetEquipmentMasteryTier(75), 1);
assert.equal(getPetEquipmentMasteryTier(5000), 5);

const base = scalePetEquipmentEffects('laser_claws', { item_level: 1, mastery_xp: 0 });
const upgraded = scalePetEquipmentEffects('laser_claws', { item_level: 7, item_xp: 0, mastery_xp: 2500 });
assert.equal(upgraded.level, 7, 'persisted item_level must be authoritative even when item_xp is zero');
assert.ok(upgraded.effects.arena_attack > base.effects.arena_attack, 'levels and mastery must improve active effects');
assert.equal(getPetEquipmentMasteryAward('laser_claws', 'arena_attack', 5), 5);
assert.equal(getPetEquipmentMasteryAward('laser_claws', 'feed', 5), 0, 'irrelevant actions must not award mastery');
assert.match(formatPetEquipmentProgression('hoverboard', { item_level: 4, mastery_xp: 1000 }), /Lv\.4 · Mastery 3\/5/);

assert.ok(Object.keys(PET_EQUIPMENT_UTILITY).length >= 17, 'all existing shop equipment should have progression definitions');
for (const sql of [migration, schema]) {
  assert.ok(sql.includes('telegram_pet_equipment_progression'));
  assert.ok(sql.includes('telegram_pet_equipment_events'));
  assert.ok(sql.includes('UNIQUE (telegram_id, item_key, event_key)'), 'mastery events must be idempotent per equipment item');
  assert.ok(sql.includes('CHECK (item_level BETWEEN 1 AND 10)'));
}
assert.ok(migration.includes('INSERT OR IGNORE INTO telegram_pet_equipment_progression'), 'migration must seed equipped items safely');

console.log('telegram-pets-equipment-progression.test.mjs passed');
