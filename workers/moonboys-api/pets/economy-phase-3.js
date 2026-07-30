export const PET_CRAFTING_MATERIALS = Object.freeze({
  scrap_metal: Object.freeze({ label: 'Scrap Metal', sources: ['job', 'run_fight', 'arena_complete'], max_stack: 9999 }),
  moon_fabric: Object.freeze({ label: 'Moon Fabric', sources: ['street_artist', 'event', 'run_loot'], max_stack: 9999 }),
  crystal_shard: Object.freeze({ label: 'Crystal Shard', sources: ['explore', 'run_extract', 'daily_chest'], max_stack: 9999 }),
  battery_cell: Object.freeze({ label: 'Battery Cell', sources: ['timed_work', 'run_loot', 'arena_complete'], max_stack: 9999 }),
  spray_core: Object.freeze({ label: 'Spray Core', sources: ['street_artist', 'event', 'run_boss'], max_stack: 9999 }),
  kaiju_fragment: Object.freeze({ label: 'Kaiju Fragment', sources: ['kaiju_win', 'run_boss'], max_stack: 9999 }),
  arena_token: Object.freeze({ label: 'Arena Token', sources: ['arena_win', 'arena_draw', 'arena_daily'], max_stack: 9999 }),
});

export const PET_EQUIPMENT_UPGRADE_COSTS = Object.freeze({
  2: Object.freeze({ moon_gold: 80, crystal_shard: 0, scrap_metal: 2 }),
  3: Object.freeze({ moon_gold: 140, crystal_shard: 1, scrap_metal: 4 }),
  4: Object.freeze({ moon_gold: 220, crystal_shard: 2, scrap_metal: 6 }),
  5: Object.freeze({ moon_gold: 340, crystal_shard: 4, scrap_metal: 8 }),
  6: Object.freeze({ moon_gold: 500, crystal_shard: 6, scrap_metal: 12 }),
  7: Object.freeze({ moon_gold: 700, crystal_shard: 9, scrap_metal: 16 }),
  8: Object.freeze({ moon_gold: 950, crystal_shard: 13, scrap_metal: 22 }),
  9: Object.freeze({ moon_gold: 1250, crystal_shard: 18, scrap_metal: 30 }),
  10: Object.freeze({ moon_gold: 1600, crystal_shard: 25, scrap_metal: 40, mastery_token: 1 }),
});

export const PET_EQUIPMENT_SETS = Object.freeze({
  street_runner: Object.freeze({ items: ['hoverboard', 'crown_jacket', 'lucky_charm'], bonuses: Object.freeze({ 2: { explore_reward_pct: 5 }, 3: { run_sneak_pct: 8, arena_dodge: 2 } }) }),
  crystal_beast: Object.freeze({ items: ['crystal_bowl', 'cyber_armor', 'shield_charm'], bonuses: Object.freeze({ 2: { run_survival_pct: 6 }, 3: { health_restore: 5, arena_defense: 3 } }) }),
  moon_enforcer: Object.freeze({ items: ['moon_armor', 'street_armor', 'moon_blaster'], bonuses: Object.freeze({ 2: { job_reward_pct: 5 }, 3: { arena_attack: 3, arena_defense: 3 } }) }),
});

export const PET_RARE_DROP_TABLES = Object.freeze({
  job: Object.freeze([{ item: 'scrap_metal', weight: 60 }, { item: 'moon_fabric', weight: 30 }, { item: 'spray_core', weight: 10 }]),
  run: Object.freeze([{ item: 'crystal_shard', weight: 45 }, { item: 'battery_cell', weight: 35 }, { item: 'spray_core', weight: 15 }, { item: 'kaiju_fragment', weight: 5 }]),
  arena: Object.freeze([{ item: 'arena_token', weight: 75 }, { item: 'scrap_metal', weight: 20 }, { item: 'crystal_shard', weight: 5 }]),
  kaiju: Object.freeze([{ item: 'kaiju_fragment', weight: 80 }, { item: 'crystal_shard', weight: 15 }, { item: 'spray_core', weight: 5 }]),
});

export const PET_COSMETIC_SINKS = Object.freeze({
  rename_badge: Object.freeze({ cost: { style_tokens: 25 }, repeatable: true }),
  profile_frame: Object.freeze({ cost: { style_tokens: 80, moon_crystals: 4 }, repeatable: false }),
  victory_pose: Object.freeze({ cost: { style_tokens: 120, arena_token: 15 }, repeatable: false }),
  run_trail: Object.freeze({ cost: { style_tokens: 100, spray_core: 5 }, repeatable: false }),
});

export const PET_PRESTIGE_REQUIREMENTS = Object.freeze({
  min_level: 100,
  min_mastered_items: 3,
  min_completed_regions: 4,
  cost: Object.freeze({ moon_gold: 5000, moon_crystals: 50 }),
});

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function normalizePetMaterial(value) {
  const key = String(value || '').trim().toLowerCase();
  return hasOwn(PET_CRAFTING_MATERIALS, key) ? key : null;
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
