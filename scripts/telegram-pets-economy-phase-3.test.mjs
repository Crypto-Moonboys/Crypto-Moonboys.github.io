import assert from 'node:assert/strict';
import {
  PET_COSMETIC_SINKS,
  PET_CRAFTING_MATERIALS,
  PET_EQUIPMENT_SETS,
  PET_EQUIPMENT_UPGRADE_COSTS,
  PET_PRESTIGE_REQUIREMENTS,
  PET_RARE_DROP_TABLES,
  canAffordPetEconomyCost,
  canPetPrestige,
  clampPetMaterialStack,
  getActivePetSetBonuses,
  getPetEquipmentUpgradeCost,
  normalizePetMaterial,
  resolvePetRareDrop,
} from '../workers/moonboys-api/pets/economy-phase-3.js';

assert.ok(Object.keys(PET_CRAFTING_MATERIALS).length >= 7, 'phase 3 must define a useful material economy');
for (const [key, material] of Object.entries(PET_CRAFTING_MATERIALS)) {
  assert.ok(material.label, `${key} must have a label`);
  assert.ok(material.sources.length >= 2, `${key} must have multiple sources`);
  assert.ok(material.max_stack > 0, `${key} must have a positive stack cap`);
}
assert.equal(normalizePetMaterial('CRYSTAL_SHARD'), 'crystal_shard');
for (const inheritedKey of ['constructor', '__proto__', 'toString']) {
  assert.equal(normalizePetMaterial(inheritedKey), null, `${inheritedKey} must not be accepted as a material`);
}
assert.equal(clampPetMaterialStack('scrap_metal', 9998, 10), 9999, 'material stacks must respect the cap');
assert.equal(clampPetMaterialStack('scrap_metal', 2, -10), 0, 'material stacks cannot become negative');
assert.equal(clampPetMaterialStack('constructor', 2, 10), 0, 'invalid materials must not produce balances');

assert.equal(Object.keys(PET_EQUIPMENT_UPGRADE_COSTS).length, 9, 'levels 2-10 must have upgrade costs');
assert.deepEqual(getPetEquipmentUpgradeCost(2), PET_EQUIPMENT_UPGRADE_COSTS[2]);
assert.ok(getPetEquipmentUpgradeCost(10).mastery_token === 1, 'level 10 must require a mastery gate');
assert.equal(getPetEquipmentUpgradeCost(1), null, 'base level has no upgrade cost');
assert.equal(canAffordPetEconomyCost({ moon_gold: 100, scrap_metal: 2 }, { moon_gold: 80, scrap_metal: 2 }), true);
assert.equal(canAffordPetEconomyCost({ moon_gold: 79, scrap_metal: 2 }, { moon_gold: 80, scrap_metal: 2 }), false);

assert.ok(Object.keys(PET_EQUIPMENT_SETS).length >= 3, 'phase 3 must define multiple build sets');
const streetRunnerTwo = getActivePetSetBonuses(['hoverboard', 'crown_jacket']);
assert.equal(streetRunnerTwo[0].set_key, 'street_runner');
assert.equal(streetRunnerTwo[0].pieces, 2);
assert.ok(streetRunnerTwo[0].effects.explore_reward_pct > 0);
const streetRunnerFull = getActivePetSetBonuses(['hoverboard', 'crown_jacket', 'lucky_charm']);
assert.ok(streetRunnerFull[0].effects.arena_dodge > 0, 'three-piece bonus must add the full-set effect');
assert.deepEqual(getActivePetSetBonuses(['hoverboard']), [], 'one item must not activate a set bonus');

for (const [key, table] of Object.entries(PET_RARE_DROP_TABLES)) {
  assert.ok(table.length >= 3, `${key} drop table must contain variety`);
  assert.equal(table.reduce((sum, entry) => sum + entry.weight, 0), 100, `${key} drop weights must total 100`);
  for (const entry of table) assert.ok(normalizePetMaterial(entry.item), `${key} drop ${entry.item} must be a registered material`);
}
assert.equal(resolvePetRareDrop('job', 0), 'scrap_metal');
assert.equal(resolvePetRareDrop('job', 0.999999), 'spray_core');
assert.equal(resolvePetRareDrop('constructor', 0.5), null, 'prototype keys must not resolve drop tables');
assert.equal(resolvePetRareDrop('missing', 0.5), null);

assert.ok(Object.keys(PET_COSMETIC_SINKS).length >= 4, 'phase 3 must include repeatable and permanent cosmetic sinks');
assert.equal(PET_COSMETIC_SINKS.rename_badge.repeatable, true);
assert.equal(PET_COSMETIC_SINKS.profile_frame.repeatable, false);

assert.equal(PET_PRESTIGE_REQUIREMENTS.min_level, 100);
assert.equal(canPetPrestige({ level: 100, mastered_items: 3, completed_regions: 4, moon_gold: 5000, moon_crystals: 50 }), true);
assert.equal(canPetPrestige({ level: 99, mastered_items: 10, completed_regions: 6, moon_gold: 99999, moon_crystals: 999 }), false);
assert.equal(canPetPrestige({ level: 100, mastered_items: 2, completed_regions: 6, moon_gold: 99999, moon_crystals: 999 }), false);
assert.equal(canPetPrestige({ level: 100, mastered_items: 3, completed_regions: 4, moon_gold: 4999, moon_crystals: 50 }), false);

console.log('telegram-pets-economy-phase-3.test.mjs passed');
