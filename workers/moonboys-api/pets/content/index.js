import regions from './regions.json' with { type: 'json' };
import rooms from './rooms.json' with { type: 'json' };
import enemies from './enemies.json' with { type: 'json' };
import bosses from './bosses.json' with { type: 'json' };
import relics from './relics.json' with { type: 'json' };
import modifiers from './modifiers.json' with { type: 'json' };

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const ROOM_TYPES = new Set(['battle', 'choice_event', 'loot', 'elite', 'boss']);
const RELIC_RARITIES = new Set(['common', 'rare', 'epic', 'legendary']);

export const SAFE_RUN_MODIFIER_EFFECTS = Object.freeze([
  'loot_rolls', 'room_visibility', 'healing_disabled', 'enemy_speed_pct', 'energy_cost_modifier',
  'hidden_route', 'boss_rooms_only', 'rare_cache_chance_bps', 'damage_dealt_pct', 'damage_taken_pct',
  'event_outcome_pct',
]);

export const SAFE_RELIC_EFFECTS = Object.freeze([
  'start_energy', 'graffiti_outcome_bonus', 'reveal_hidden_choices', 'movement_cost_modifier',
  'rare_drop_chance_bps', 'avoid_encounters', 'energy_support', 'combat_power_pct',
  'damage_reduction_pct', 'event_outcome_bonus',
]);

function indexBy(entries, idKey, label) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error(`invalid_${label}_content`);
  const result = {};
  for (const entry of entries) {
    const id = String(entry?.[idKey] || '');
    if (!ID_PATTERN.test(id) || result[id]) throw new Error(`invalid_${label}_id`);
    result[id] = entry;
  }
  return result;
}

function validateEffects(effects, allowedKeys, errorCode) {
  if (!effects || typeof effects !== 'object' || Array.isArray(effects)) throw new Error(errorCode);
  const allowed = new Set(allowedKeys);
  for (const [key, value] of Object.entries(effects)) {
    if (!allowed.has(key) || (value !== null && typeof value === 'object')) throw new Error(errorCode);
  }
  return true;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function validatePetRunModifierContent(modifier) {
  return validateEffects(modifier?.effects, SAFE_RUN_MODIFIER_EFFECTS, 'run_modifier_cannot_change_permanent_rewards');
}

export function validatePetRelicContent(relic) {
  if (!RELIC_RARITIES.has(String(relic?.rarity || ''))) throw new Error('invalid_pet_relic_rarity');
  return validateEffects(relic?.effects, SAFE_RELIC_EFFECTS, 'relic_cannot_change_reward_authority');
}

export function validatePetRogueliteContent(content = { regions, rooms, enemies, bosses, relics, modifiers }) {
  const regionIndex = indexBy(content.regions, 'region_id', 'region');
  const roomIndex = indexBy(content.rooms, 'room_id', 'room');
  const enemyIndex = indexBy(content.enemies, 'enemy_id', 'enemy');
  const bossIndex = indexBy(content.bosses, 'boss_id', 'boss');
  const relicIndex = indexBy(content.relics, 'relic_id', 'relic');
  const modifierIndex = indexBy(content.modifiers, 'modifier_id', 'modifier');

  for (const room of Object.values(roomIndex)) {
    if (!ROOM_TYPES.has(room.room_type) || !Array.isArray(room.choices) || room.choices.length === 0) throw new Error('invalid_room_content');
    for (const enemyId of room.enemy_pool || []) if (!enemyIndex[enemyId]) throw new Error('unknown_room_enemy');
    if (room.boss_id && !bossIndex[room.boss_id]) throw new Error('unknown_room_boss');
  }
  for (const region of Object.values(regionIndex)) {
    for (const roomId of region.room_pool || []) if (!roomIndex[roomId]) throw new Error('unknown_region_room');
    for (const enemyId of region.enemy_pool || []) if (!enemyIndex[enemyId]) throw new Error('unknown_region_enemy');
    for (const bossId of region.boss_pool || []) if (!bossIndex[bossId]) throw new Error('unknown_region_boss');
  }
  for (const boss of Object.values(bossIndex)) {
    if (Number(boss.relic_chance_bps || 0) < 0 || Number(boss.relic_chance_bps || 0) > 10000) throw new Error('invalid_boss_relic_chance');
    for (const relicId of boss.relic_pool || []) if (!relicIndex[relicId]) throw new Error('unknown_boss_relic');
    if (Number(boss.rewards?.pet_xp || 0) > 0 || Number(boss.rewards?.community_xp || 0) > 0) throw new Error('boss_cannot_create_repeat_xp');
  }
  for (const relic of Object.values(relicIndex)) validatePetRelicContent(relic);
  for (const modifier of Object.values(modifierIndex)) validatePetRunModifierContent(modifier);
  return true;
}

validatePetRogueliteContent();

export const PET_ROGUELITE_REGIONS = deepFreeze(indexBy(regions, 'region_id', 'region'));
export const PET_ROGUELITE_ROOMS = deepFreeze(indexBy(rooms, 'room_id', 'room'));
export const PET_ROGUELITE_ENEMIES = deepFreeze(indexBy(enemies, 'enemy_id', 'enemy'));
export const PET_ROGUELITE_BOSSES = deepFreeze(indexBy(bosses, 'boss_id', 'boss'));
export const PET_ROGUELITE_RELICS = deepFreeze(indexBy(relics, 'relic_id', 'relic'));
export const PET_RUN_MODIFIERS = deepFreeze(indexBy(modifiers, 'modifier_id', 'modifier'));
