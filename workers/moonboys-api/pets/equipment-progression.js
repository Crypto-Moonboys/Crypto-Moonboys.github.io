export const PET_EQUIPMENT_MAX_LEVEL = 10;

export const PET_EQUIPMENT_UTILITY = Object.freeze({
  moon_kibble: Object.freeze({ slot: 'food', systems: ['feed', 'timed_train', 'run_rest'], mastery_actions: ['feed', 'train', 'run_rest'], base_effects: { feed_pet_xp: 4, hunger_restore: 4 } }),
  nebula_snack: Object.freeze({ slot: 'food', systems: ['feed', 'timed_train', 'run_rest'], mastery_actions: ['feed', 'train', 'run_rest'], base_effects: { feed_pet_xp: 10, hunger_restore: 8, energy_restore: 3 } }),
  crystal_bowl: Object.freeze({ slot: 'food', systems: ['feed', 'timed_train', 'run_rest', 'post_arena'], mastery_actions: ['feed', 'train', 'run_rest', 'arena_complete'], base_effects: { feed_pet_xp: 18, hunger_restore: 12, health_restore: 3, run_survival_pct: 6 } }),
  laser_ball: Object.freeze({ slot: 'toy', systems: ['play', 'timed_explore', 'run_sneak'], mastery_actions: ['play', 'explore', 'run_sneak'], base_effects: { play_pet_xp: 5, happiness_restore: 6, run_sneak_pct: 3 } }),
  hoverboard: Object.freeze({ slot: 'toy', systems: ['play', 'timed_explore', 'run_sneak', 'arena'], mastery_actions: ['play', 'explore', 'run_sneak', 'arena_dodge'], base_effects: { happiness_restore: 10, explore_reward_pct: 8, run_sneak_pct: 8, arena_dodge: 2 } }),
  street_hoodie: Object.freeze({ slot: 'outfit', systems: ['care', 'jobs', 'events'], mastery_actions: ['care', 'job', 'event'], base_effects: { care_pet_xp: 2, job_reward_pct: 3 } }),
  moon_armor: Object.freeze({ slot: 'outfit', systems: ['care', 'jobs', 'runs', 'arena'], mastery_actions: ['care', 'job', 'run', 'arena_complete'], base_effects: { care_pet_xp: 5, care_gold: 1, run_survival_pct: 4, arena_defense: 1 } }),
  crown_jacket: Object.freeze({ slot: 'outfit', systems: ['care', 'jobs', 'events', 'runs', 'arena'], mastery_actions: ['care', 'job', 'event', 'run_boss', 'arena_complete'], base_effects: { care_pet_xp: 8, care_gold: 2, care_style: 1, boss_reward_pct: 8, arena_luck: 2 } }),
  cardboard_armor: Object.freeze({ slot: 'armor', systems: ['arena', 'timed_train'], mastery_actions: ['arena_block', 'arena_complete', 'train'], base_effects: { arena_defense: 4, strength_training_pct: 3 } }),
  moon_helmet: Object.freeze({ slot: 'armor', systems: ['arena', 'runs'], mastery_actions: ['arena_block', 'arena_dodge', 'arena_complete'], base_effects: { arena_defense: 7, arena_dodge: 2, run_survival_pct: 2 } }),
  street_armor: Object.freeze({ slot: 'armor', systems: ['arena', 'jobs'], mastery_actions: ['arena_block', 'arena_complete', 'job'], base_effects: { arena_defense: 11, guard_job_pct: 5 } }),
  cyber_armor: Object.freeze({ slot: 'armor', systems: ['arena', 'runs', 'timed_train'], mastery_actions: ['arena_block', 'arena_complete', 'run_boss', 'train'], base_effects: { arena_defense: 18, arena_luck: 3, run_survival_pct: 6 } }),
  foam_claws: Object.freeze({ slot: 'weapon', systems: ['arena', 'timed_train'], mastery_actions: ['arena_attack', 'arena_complete', 'train'], base_effects: { arena_attack: 5, strength_training_pct: 2 } }),
  laser_claws: Object.freeze({ slot: 'weapon', systems: ['arena', 'runs'], mastery_actions: ['arena_attack', 'arena_crit', 'arena_complete', 'run_fight'], base_effects: { arena_attack: 11, arena_crit: 2, run_fight_pct: 4 } }),
  moon_blaster: Object.freeze({ slot: 'weapon', systems: ['arena', 'runs', 'events'], mastery_actions: ['arena_attack', 'arena_crit', 'arena_complete', 'run_fight', 'event'], base_effects: { arena_attack: 18, arena_crit: 4, run_fight_pct: 7 } }),
  lucky_charm: Object.freeze({ slot: 'charm', systems: ['arena', 'runs', 'events'], mastery_actions: ['arena_crit', 'arena_complete', 'run_luck', 'event'], base_effects: { arena_luck: 6, arena_crit: 2, run_luck_pct: 5 } }),
  shield_charm: Object.freeze({ slot: 'charm', systems: ['arena', 'runs'], mastery_actions: ['arena_block', 'arena_dodge', 'arena_complete', 'run_survival'], base_effects: { arena_defense: 5, arena_dodge: 3, run_survival_pct: 4 } }),
});

export function getPetEquipmentDefinition(itemKey) {
  return PET_EQUIPMENT_UTILITY[String(itemKey || '').trim()] || null;
}

export function getPetEquipmentLevelFromXp(xp) {
  const value = Math.max(0, Math.floor(Number(xp) || 0));
  return Math.min(PET_EQUIPMENT_MAX_LEVEL, 1 + Math.floor(Math.sqrt(value / 100)));
}

export function getPetEquipmentXpForLevel(level) {
  const safeLevel = Math.max(1, Math.min(PET_EQUIPMENT_MAX_LEVEL, Math.floor(Number(level) || 1)));
  return ((safeLevel - 1) ** 2) * 100;
}

export function getPetEquipmentMasteryTier(masteryXp) {
  const xp = Math.max(0, Math.floor(Number(masteryXp) || 0));
  if (xp >= 5000) return 5;
  if (xp >= 2500) return 4;
  if (xp >= 1000) return 3;
  if (xp >= 300) return 2;
  if (xp >= 75) return 1;
  return 0;
}

export function scalePetEquipmentEffects(itemKey, progression = {}) {
  const definition = getPetEquipmentDefinition(itemKey);
  if (!definition) return null;
  const level = Math.max(1, Math.min(PET_EQUIPMENT_MAX_LEVEL, Math.floor(Number(progression.level) || getPetEquipmentLevelFromXp(progression.item_xp))));
  const masteryTier = getPetEquipmentMasteryTier(progression.mastery_xp);
  const levelMultiplier = 1 + ((level - 1) * 0.08);
  const masteryMultiplier = 1 + (masteryTier * 0.03);
  const effects = Object.fromEntries(Object.entries(definition.base_effects).map(([key, value]) => [key, Number((Number(value) * levelMultiplier * masteryMultiplier).toFixed(2))]));
  return { item_key: itemKey, slot: definition.slot, systems: [...definition.systems], level, mastery_tier: masteryTier, effects };
}

export function getPetEquipmentMasteryAward(itemKey, action, amount = 1) {
  const definition = getPetEquipmentDefinition(itemKey);
  if (!definition || !definition.mastery_actions.includes(String(action || ''))) return 0;
  return Math.max(1, Math.min(25, Math.floor(Number(amount) || 1)));
}

export function formatPetEquipmentProgression(itemKey, progression = {}) {
  const scaled = scalePetEquipmentEffects(itemKey, progression);
  if (!scaled) return null;
  const effectText = Object.entries(scaled.effects).map(([key, value]) => `${key.replace(/_/g, ' ')} +${value}`).join(', ');
  return `${itemKey} · Lv.${scaled.level} · Mastery ${scaled.mastery_tier}/5 · ${effectText}`;
}
