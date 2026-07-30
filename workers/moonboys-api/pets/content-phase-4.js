function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export const PET_REGION_CONTENT = deepFreeze({
  moon_alley: {
    encounters: ['lost_delivery_drone', 'graffiti_wall_request', 'moon_crate_found'],
    boss: 'alley_scrapper',
    reward_focus: ['scrap_metal', 'moon_fabric'],
  },
  neon_rooftops: {
    encounters: ['rooftop_race', 'signal_hijack', 'neon_storm'],
    boss: 'skyline_hunter',
    reward_focus: ['battery_cell', 'spray_core'],
  },
  rugpull_mines: {
    encounters: ['unstable_tunnel', 'abandoned_rig', 'miner_rescue'],
    boss: 'rugpull_drill_beast',
    reward_focus: ['crystal_shard', 'scrap_metal'],
  },
  blockchain_sewers: {
    encounters: ['toxic_flow', 'hidden_node', 'data_leech_swarm'],
    boss: 'sewer_validator',
    reward_focus: ['battery_cell', 'crystal_shard'],
  },
  kaiju_district: {
    encounters: ['evacuation_route', 'kaiju_footprint', 'collapsed_arcade'],
    boss: 'district_destroyer',
    reward_focus: ['kaiju_fragment', 'arena_token'],
  },
  moon_citadel: {
    encounters: ['citadel_gate', 'royal_archive', 'zero_gravity_trial'],
    boss: 'moon_warlord_prime',
    reward_focus: ['arena_token', 'spray_core', 'kaiju_fragment'],
  },
});

export const PET_EVENT_CHAINS = deepFreeze({
  lost_delivery_drone: {
    steps: ['inspect_wreckage', 'trace_owner', 'return_or_salvage'],
    final_outcomes: ['bond_reward', 'material_reward', 'job_unlock'],
  },
  signal_hijack: {
    steps: ['find_transmitter', 'decode_signal', 'broadcast_or_block'],
    final_outcomes: ['arena_buff', 'faction_reputation', 'event_cache'],
  },
  miner_rescue: {
    steps: ['locate_survivors', 'stabilize_tunnel', 'escort_team'],
    final_outcomes: ['job_xp', 'crystal_reward', 'loyal_trait'],
  },
  royal_archive: {
    steps: ['open_archive', 'solve_cipher', 'choose_legacy'],
    final_outcomes: ['prestige_progress', 'rare_cosmetic', 'bond_xp'],
  },
});

export const PET_ELITE_JOBS = deepFreeze({
  mural_commission: { min_level: 20, required_track: 'job', required_xp: 750, preferred_traits: ['stylish', 'loyal'], reward_table: 'job' },
  vault_security: { min_level: 25, required_track: 'training', required_xp: 1000, preferred_traits: ['tough', 'clever'], reward_table: 'arena' },
  rooftop_courier: { min_level: 20, required_track: 'adventure', required_xp: 750, preferred_traits: ['clever', 'brave'], reward_table: 'run' },
  kaiju_recovery: { min_level: 45, required_track: 'arena', required_xp: 2000, preferred_traits: ['brave', 'tough'], reward_table: 'kaiju' },
});

export const PET_ARENA_STATUS_EFFECTS = deepFreeze({
  bleed: { duration_rounds: 3, max_stacks: 2, damage_per_stack: 3 },
  armor_break: { duration_rounds: 2, max_stacks: 1, defense_reduction_pct: 20 },
  blinded: { duration_rounds: 2, max_stacks: 1, accuracy_reduction_pct: 18 },
  barrier: { duration_rounds: 2, max_stacks: 1, absorb_damage: 12 },
  haste: { duration_rounds: 2, max_stacks: 1, dodge_bonus: 4 },
});

export const PET_SEASONAL_BOSSES = deepFreeze({
  neon_titan: { season: 'neon_uprising', min_level: 25, phases: 3, weakness: 'armor_break', reward: 'battery_cell' },
  rugpull_colossus: { season: 'mine_collapse', min_level: 35, phases: 3, weakness: 'bleed', reward: 'crystal_shard' },
  kaiju_zero: { season: 'kaiju_siege', min_level: 50, phases: 4, weakness: 'blinded', reward: 'kaiju_fragment' },
  citadel_overlord: { season: 'moon_citadel', min_level: 70, phases: 5, weakness: 'barrier', reward: 'arena_token' },
});

export const PET_FACTION_BONUSES = deepFreeze({
  'hard-fork-rockers': { system: 'training', effect: { training_xp_pct: 5, streak_protection: 1 } },
  'rugpull-miners': { system: 'runs', effect: { run_survival_pct: 5, crystal_find_pct: 4 } },
  graffpunks: { system: 'events', effect: { event_reward_pct: 5, style_reward_pct: 5 } },
  'blockchain-furies': { system: 'arena', effect: { arena_speed: 2, revenge_damage_pct: 5 } },
  'crypto-moongirls': { system: 'arena', effect: { accuracy_pct: 4, status_resist_pct: 5 } },
  blockstars: { system: 'jobs', effect: { job_reward_pct: 5, spotlight_xp_pct: 5 } },
  'all-city-bulls': { system: 'arena', effect: { arena_attack: 2, win_streak_reward_pct: 4 } },
  'nomad-bears': { system: 'runs', effect: { route_variety_pct: 5, extract_reward_pct: 4 } },
  'crypto-stoned-boys': { system: 'events', effect: { random_branch_luck: 4, care_decay_reduction_pct: 4 } },
});

export function getPetRegionContent(regionKey) {
  const key = String(regionKey || '').trim().toLowerCase();
  return hasOwn(PET_REGION_CONTENT, key) ? PET_REGION_CONTENT[key] : null;
}

export function getPetEventChain(eventKey) {
  const key = String(eventKey || '').trim().toLowerCase();
  return hasOwn(PET_EVENT_CHAINS, key) ? PET_EVENT_CHAINS[key] : null;
}

export function canStartPetEliteJob(jobKey, state = {}) {
  const key = String(jobKey || '').trim().toLowerCase();
  if (!hasOwn(PET_ELITE_JOBS, key)) return false;
  const job = PET_ELITE_JOBS[key];
  const trackXp = Math.max(0, Math.floor(Number(state[`${job.required_track}_xp`]) || 0));
  return Math.max(1, Math.floor(Number(state.level) || 1)) >= job.min_level && trackXp >= job.required_xp;
}

export function applyPetArenaStatus(statusKey, currentStacks = 0) {
  const key = String(statusKey || '').trim().toLowerCase();
  if (!hasOwn(PET_ARENA_STATUS_EFFECTS, key)) return null;
  const effect = PET_ARENA_STATUS_EFFECTS[key];
  const stacks = Math.min(effect.max_stacks, Math.max(1, Math.floor(Number(currentStacks) || 0) + 1));
  return { status: key, stacks, duration_rounds: effect.duration_rounds };
}

export function getPetSeasonalBoss(bossKey, petLevel) {
  const key = String(bossKey || '').trim().toLowerCase();
  if (!hasOwn(PET_SEASONAL_BOSSES, key)) return null;
  const boss = PET_SEASONAL_BOSSES[key];
  return Math.max(1, Math.floor(Number(petLevel) || 1)) >= boss.min_level ? boss : null;
}

export function getPetFactionBonus(factionKey) {
  const key = String(factionKey || '').trim().toLowerCase();
  return hasOwn(PET_FACTION_BONUSES, key) ? PET_FACTION_BONUSES[key] : null;
}
