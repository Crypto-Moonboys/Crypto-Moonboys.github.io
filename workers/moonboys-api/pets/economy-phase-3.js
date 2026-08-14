function deepFreeze(value) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function') || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export const PET_CRAFTING_MATERIALS = deepFreeze({
  scrap_metal: { label: 'Scrap Metal', sources: ['job', 'run_fight', 'arena_complete'], max_stack: 9999 },
  moon_fabric: { label: 'Moon Fabric', sources: ['street_artist', 'event', 'run_loot'], max_stack: 9999 },
  crystal_shard: { label: 'Crystal Shard', sources: ['explore', 'run_extract', 'daily_chest'], max_stack: 9999 },
  battery_cell: { label: 'Battery Cell', sources: ['timed_work', 'run_loot', 'arena_complete'], max_stack: 9999 },
  spray_core: { label: 'Spray Core', sources: ['street_artist', 'event', 'run_boss'], max_stack: 9999 },
  kaiju_fragment: { label: 'Kaiju Fragment', sources: ['kaiju_win', 'run_boss'], max_stack: 9999 },
  arena_token: { label: 'Arena Token', sources: ['arena_win', 'arena_draw', 'arena_daily'], max_stack: 9999 },
  evolution_fragment: { label: 'Evolution Fragment', sources: ['run_boss', 'weekly_boss'], max_stack: 9999 },
  mastery_token: { label: 'Mastery Token', sources: ['prestige_challenge', 'season_guardian'], max_stack: 9999 },
});

export const PET_CRAFTING_RECIPES = deepFreeze({
  street_rations: { title: 'Street Rations', detail: 'Two Moon Snacks for long care and run sessions.', min_level: 3, cost: { scrap_metal: 2, moon_fabric: 1 }, output: { item_key: 'moon_snack', quantity: 2 } },
  clean_kit: { title: 'Clean Kit', detail: 'Two Clean Wipes to recover cleanliness between missions.', min_level: 4, cost: { moon_fabric: 2, spray_core: 1 }, output: { item_key: 'clean_wipe', quantity: 2 } },
  battery_pack: { title: 'Battery Pack', detail: 'An Energy Drink for demanding runs and boss fights.', min_level: 6, cost: { battery_cell: 3, crystal_shard: 1 }, output: { item_key: 'energy_drink', quantity: 1 } },
  style_patch: { title: 'Style Patch', detail: 'A wearable patch that converts into Style Tokens when used.', min_level: 8, cost: { moon_fabric: 3, spray_core: 2 }, output: { item_key: 'style_patch', quantity: 1 } },
  route_map: { title: 'Route Map', detail: 'An Adventure Map for safer expedition and run routing.', min_level: 10, cost: { scrap_metal: 4, crystal_shard: 2 }, output: { item_key: 'adventure_map', quantity: 1 } },
});

export const PET_EQUIPMENT_UPGRADE_COSTS = deepFreeze({
  2: { moon_gold: 80, crystal_shard: 0, scrap_metal: 2 },
  3: { moon_gold: 140, crystal_shard: 1, scrap_metal: 4 },
  4: { moon_gold: 220, crystal_shard: 2, scrap_metal: 6 },
  5: { moon_gold: 340, crystal_shard: 4, scrap_metal: 8 },
  6: { moon_gold: 500, crystal_shard: 6, scrap_metal: 12 },
  7: { moon_gold: 700, crystal_shard: 9, scrap_metal: 16 },
  8: { moon_gold: 950, crystal_shard: 13, scrap_metal: 22 },
  9: { moon_gold: 1250, crystal_shard: 18, scrap_metal: 30 },
  10: { moon_gold: 1600, crystal_shard: 25, scrap_metal: 40, mastery_token: 1 },
});

export const PET_EQUIPMENT_SETS = deepFreeze({
  street_runner: { items: ['hoverboard', 'crown_jacket', 'lucky_charm'], bonuses: { 2: { arena_dodge: 2 }, 3: { arena_attack: 3 } } },
  crystal_beast: { items: ['crystal_bowl', 'cyber_armor', 'shield_charm'], bonuses: { 2: { arena_defense: 3 }, 3: { arena_attack: 2 } } },
  moon_enforcer: { items: ['moon_armor', 'street_armor', 'moon_blaster'], bonuses: { 2: { job_reward_pct: 5 }, 3: { arena_attack: 3, arena_defense: 3 } } },
});

export const PET_RARE_DROP_TABLES = deepFreeze({
  job: [{ item: 'scrap_metal', weight: 60 }, { item: 'moon_fabric', weight: 30 }, { item: 'spray_core', weight: 10 }],
  run: [{ item: 'crystal_shard', weight: 45 }, { item: 'battery_cell', weight: 35 }, { item: 'spray_core', weight: 15 }, { item: 'kaiju_fragment', weight: 5 }],
  arena: [{ item: 'arena_token', weight: 75 }, { item: 'scrap_metal', weight: 20 }, { item: 'crystal_shard', weight: 5 }],
  kaiju: [{ item: 'kaiju_fragment', weight: 80 }, { item: 'crystal_shard', weight: 15 }, { item: 'spray_core', weight: 5 }],
});

export const PET_COSMETIC_SINKS = deepFreeze({
  rename_badge: { cost: { style_tokens: 25 }, repeatable: true },
  profile_frame: { cost: { style_tokens: 80, moon_crystals: 4 }, repeatable: false },
  victory_pose: { cost: { style_tokens: 120, arena_token: 15 }, repeatable: false },
  run_trail: { cost: { style_tokens: 100, spray_core: 5 }, repeatable: false },
});

export const PET_PRESTIGE_REQUIREMENTS = deepFreeze({
  min_level: 100,
  min_mastered_items: 3,
  min_completed_regions: 4,
  cost: { moon_gold: 5000, moon_crystals: 50 },
});

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function normalizePetMaterial(value) {
  const key = String(value || '').trim().toLowerCase();
  return hasOwn(PET_CRAFTING_MATERIALS, key) ? key : null;
}

export function getPetCraftingRecipe(value) {
  const key = String(value || '').trim().toLowerCase();
  return hasOwn(PET_CRAFTING_RECIPES, key) ? { key, ...PET_CRAFTING_RECIPES[key], cost: { ...PET_CRAFTING_RECIPES[key].cost }, output: { ...PET_CRAFTING_RECIPES[key].output } } : null;
}

export function clampPetMaterialStack(materialKey, current, delta) {
  const key = normalizePetMaterial(materialKey);
  if (!key) return 0;
  const base = Math.max(0, Math.floor(Number(current) || 0));
  const change = Math.floor(Number(delta) || 0);
  return Math.max(0, Math.min(PET_CRAFTING_MATERIALS[key].max_stack, base + change));
}

export function getPetEquipmentUpgradeCost(targetLevel) {
  const level = Math.floor(Number(targetLevel) || 0);
  return hasOwn(PET_EQUIPMENT_UPGRADE_COSTS, level) ? { ...PET_EQUIPMENT_UPGRADE_COSTS[level] } : null;
}

export function canAffordPetEconomyCost(wallet = {}, cost = {}) {
  return Object.entries(cost).every(([key, amount]) => Math.max(0, Math.floor(Number(wallet[key]) || 0)) >= Math.max(0, Math.floor(Number(amount) || 0)));
}

export function getActivePetSetBonuses(equippedItems = []) {
  const equipped = new Set((Array.isArray(equippedItems) ? equippedItems : []).map((value) => String(value || '').trim()).filter(Boolean));
  const active = [];
  for (const [setKey, set] of Object.entries(PET_EQUIPMENT_SETS)) {
    const pieces = set.items.filter((item) => equipped.has(item)).length;
    const effects = {};
    for (const [required, bonus] of Object.entries(set.bonuses)) {
      if (pieces >= Number(required)) Object.assign(effects, bonus);
    }
    if (pieces >= 2) active.push({ set_key: setKey, pieces, effects });
  }
  return active;
}

export function resolvePetRareDrop(tableKey, roll) {
  const key = String(tableKey || '').trim().toLowerCase();
  if (!hasOwn(PET_RARE_DROP_TABLES, key)) return null;
  const table = PET_RARE_DROP_TABLES[key];
  const total = table.reduce((sum, entry) => sum + entry.weight, 0);
  const normalizedRoll = Math.max(0, Math.min(0.999999, Number(roll) || 0));
  let cursor = normalizedRoll * total;
  for (const entry of table) {
    if (cursor < entry.weight) return entry.item;
    cursor -= entry.weight;
  }
  return table.at(-1)?.item || null;
}

export function canPetPrestige(state = {}) {
  return Math.max(1, Math.floor(Number(state.level) || 1)) >= PET_PRESTIGE_REQUIREMENTS.min_level
    && Math.max(0, Math.floor(Number(state.mastered_items) || 0)) >= PET_PRESTIGE_REQUIREMENTS.min_mastered_items
    && Math.max(0, Math.floor(Number(state.completed_regions) || 0)) >= PET_PRESTIGE_REQUIREMENTS.min_completed_regions
    && canAffordPetEconomyCost(state, PET_PRESTIGE_REQUIREMENTS.cost);
}
