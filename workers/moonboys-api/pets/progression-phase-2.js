export const PET_PROGRESSION_TRACKS = Object.freeze({
  care: Object.freeze({ label: 'Care XP', max_daily_award: 300, sources: ['feed', 'play', 'clean', 'sleep', 'train'] }),
  training: Object.freeze({ label: 'Training XP', max_daily_award: 240, sources: ['train', 'timed_train'] }),
  adventure: Object.freeze({ label: 'Adventure XP', max_daily_award: 360, sources: ['run_step', 'run_extract', 'run_boss', 'explore'] }),
  arena: Object.freeze({ label: 'Arena XP', max_daily_award: 300, sources: ['arena_attack', 'arena_block', 'arena_complete'] }),
  job: Object.freeze({ label: 'Job XP', max_daily_award: 240, sources: ['job', 'timed_work'] }),
  bond: Object.freeze({ label: 'Bond XP', max_daily_award: 180, sources: ['feed', 'play', 'clean', 'sleep', 'daily_chest'] }),
});

export const PET_LEVEL_MILESTONES = Object.freeze([
  Object.freeze({ level: 2, unlock: 'second_daily_mission' }),
  Object.freeze({ level: 5, unlock: 'timed_activities' }),
  Object.freeze({ level: 8, unlock: 'first_passive_trait' }),
  Object.freeze({ level: 10, unlock: 'pet_arena' }),
  Object.freeze({ level: 15, unlock: 'equipment_upgrades' }),
  Object.freeze({ level: 20, unlock: 'advanced_jobs' }),
  Object.freeze({ level: 25, unlock: 'second_run_region' }),
  Object.freeze({ level: 30, unlock: 'gear_mastery_abilities' }),
  Object.freeze({ level: 40, unlock: 'elite_arena' }),
  Object.freeze({ level: 50, unlock: 'pet_evolution_choice' }),
  Object.freeze({ level: 70, unlock: 'prestige_challenges' }),
  Object.freeze({ level: 100, unlock: 'legendary_pet_status' }),
]);

export const PET_JOB_RANKS = Object.freeze([
  'assistant',
  'crew_member',
  'all_city_specialist',
  'master_operator',
  'legendary_contractor',
]);

export const PET_RUN_REGIONS = Object.freeze({
  moon_alley: Object.freeze({ min_level: 1, mastery_required: 0, focus: ['care', 'adventure'] }),
  neon_rooftops: Object.freeze({ min_level: 10, mastery_required: 100, focus: ['adventure', 'training'] }),
  rugpull_mines: Object.freeze({ min_level: 20, mastery_required: 300, focus: ['job', 'adventure'] }),
  blockchain_sewers: Object.freeze({ min_level: 30, mastery_required: 700, focus: ['adventure', 'arena'] }),
  kaiju_district: Object.freeze({ min_level: 45, mastery_required: 1400, focus: ['arena', 'adventure'] }),
  moon_citadel: Object.freeze({ min_level: 70, mastery_required: 3000, focus: ['arena', 'bond'] }),
});

export const PET_TRAITS = Object.freeze({
  brave: Object.freeze({ source_actions: ['fight', 'arena_attack', 'run_boss'], threshold: 100 }),
  loyal: Object.freeze({ source_actions: ['feed', 'play', 'clean', 'sleep'], threshold: 140 }),
  clever: Object.freeze({ source_actions: ['sneak', 'explore', 'event'], threshold: 120 }),
  stylish: Object.freeze({ source_actions: ['style_reward', 'street_artist', 'event'], threshold: 120 }),
  tough: Object.freeze({ source_actions: ['arena_block', 'train', 'guard_job'], threshold: 120 }),
  lucky: Object.freeze({ source_actions: ['gamble', 'run_luck', 'daily_chest'], threshold: 100 }),
});

export function normalizePetProgressionTrack(value) {
  const key = String(value || '').trim().toLowerCase();
  return PET_PROGRESSION_TRACKS[key] ? key : null;
}

export function clampPetTrackAward(track, amount, awardedToday = 0) {
  const key = normalizePetProgressionTrack(track);
  if (!key) return 0;
  const requested = Math.max(0, Math.floor(Number(amount) || 0));
  const used = Math.max(0, Math.floor(Number(awardedToday) || 0));
  return Math.min(requested, Math.max(0, PET_PROGRESSION_TRACKS[key].max_daily_award - used));
}

export function getPetTrackLevel(xp) {
  const value = Math.max(0, Math.floor(Number(xp) || 0));
  return Math.min(100, 1 + Math.floor(Math.sqrt(value / 80)));
}

export function getPetLevelUnlocks(level) {
  const value = Math.max(1, Math.floor(Number(level) || 1));
  return PET_LEVEL_MILESTONES.filter((entry) => entry.level <= value).map((entry) => entry.unlock);
}

export function getPetJobRank(jobXp) {
  const value = Math.max(0, Math.floor(Number(jobXp) || 0));
  const index = value >= 5000 ? 4 : value >= 2000 ? 3 : value >= 750 ? 2 : value >= 200 ? 1 : 0;
  return PET_JOB_RANKS[index];
}

export function canEnterPetRunRegion(regionKey, petLevel, regionMasteryXp = 0) {
  const region = PET_RUN_REGIONS[String(regionKey || '').trim()];
  if (!region) return false;
  return Math.max(1, Math.floor(Number(petLevel) || 1)) >= region.min_level
    && Math.max(0, Math.floor(Number(regionMasteryXp) || 0)) >= region.mastery_required;
}

export function getPetTraitProgress(action, amount = 1) {
  const normalizedAction = String(action || '').trim();
  const award = Math.max(0, Math.min(25, Math.floor(Number(amount) || 0)));
  return Object.fromEntries(Object.entries(PET_TRAITS)
    .filter(([, trait]) => trait.source_actions.includes(normalizedAction))
    .map(([key]) => [key, award]));
}

export function getUnlockedPetTraits(progress = {}) {
  return Object.entries(PET_TRAITS)
    .filter(([key, trait]) => Math.max(0, Number(progress[key]) || 0) >= trait.threshold)
    .map(([key]) => key);
}
