const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

export { MOONPET_REACTION_LIBRARY, buildMoonpetReaction, buildMoonpetReactionChoice, getMoonpetMood, selectMoonpetReaction } from './moonpet-reactions.js';

export const PET_ACHIEVEMENTS = deepFreeze({
  moonpet_beginning: { title: 'Moonpet Beginning', target: 1, source: 'adoption', description: 'Adopt a Moonpet.' },
  caring_hand: { title: 'Caring Hand', target: 25, source: 'care_actions', description: 'Complete 25 care actions.' },
  alley_regular: { title: 'Alley Regular', target: 20, source: 'event_actions', description: 'Resolve 20 random events.' },
  honest_hustle: { title: 'Honest Hustle', target: 25, source: 'job_actions', description: 'Complete 25 jobs.' },
  job_hopper: { title: 'Job Hopper', target: 6, source: 'distinct_jobs', description: 'Complete six different jobs.' },
  moon_runner: { title: 'Moon Runner', target: 10, source: 'runs_completed', description: 'Complete or extract 10 runs.' },
  boss_breaker: { title: 'Boss Breaker', target: 5, source: 'bosses_defeated', description: 'Defeat five roguelite or weekly bosses.' },
  personality_unlocked: { title: 'A Mind Of Their Own', target: 1, source: 'personalities', description: 'Unlock a personality trait.' },
  full_character: { title: 'Full Character', target: 4, source: 'personalities', description: 'Unlock all four personality traits.' },
  raised_in_moon_alley: { title: 'Raised In Moon Alley', target: 1, source: 'evolution_stage', description: 'Reach Street Moonpet.' },
  cyber_companion: { title: 'Cyber Companion', target: 2, source: 'evolution_stage', description: 'Reach Cyber Moonpet.' },
  moon_alley_elite: { title: 'Moon Alley Elite', target: 3, source: 'evolution_stage', description: 'Reach Elite Moonpet.' },
  moon_guardian: { title: 'Moon Guardian', target: 4, source: 'evolution_stage', description: 'Reach Moon Guardian.' },
  legendary_moon_guardian: { title: 'Legendary Moon Guardian', target: 5, source: 'evolution_stage', description: 'Reach the final evolution.' },
});

export const PET_WEEKLY_BOSSES = deepFreeze([
  { boss_id: 'neon_titan', title: 'Neon Titan', hp: 420, weakness: 'outsmart', reward: { moon_gold: 140, moon_crystals: 4, style_tokens: 3 } },
  { boss_id: 'rugpull_colossus', title: 'Rugpull Colossus', hp: 500, weakness: 'strike', reward: { moon_gold: 165, moon_crystals: 5, style_tokens: 2 } },
  { boss_id: 'kaiju_zero', title: 'Kaiju Zero', hp: 580, weakness: 'endure', reward: { moon_gold: 190, moon_crystals: 6, style_tokens: 4 } },
  { boss_id: 'citadel_overlord', title: 'Citadel Overlord', hp: 680, weakness: 'outsmart', reward: { moon_gold: 220, moon_crystals: 8, style_tokens: 5 } },
]);

export const PET_SEASON_REWARD_TIERS = deepFreeze([
  { tier_id: 'street', title: 'Street Cache', required_xp: 250, reward: { moon_gold: 80, style_tokens: 1 } },
  { tier_id: 'neon', title: 'Neon Cache', required_xp: 1000, reward: { moon_gold: 160, moon_crystals: 3, style_tokens: 2 } },
  { tier_id: 'cyber', title: 'Cyber Cache', required_xp: 3000, reward: { moon_gold: 260, moon_crystals: 6, style_tokens: 4 } },
  { tier_id: 'guardian', title: 'Guardian Cache', required_xp: 7500, reward: { moon_gold: 420, moon_crystals: 10, style_tokens: 8 } },
]);

export const PET_EVOLUTION_PERKS = deepFreeze([
  { stage: 0, title: 'Moon Egg', perk: 'Learns from care and begins forming memories.', weekly_power: 0 },
  { stage: 1, title: 'Street Moonpet', perk: 'Unlocks street jobs, street encounters and +3 weekly boss power.', weekly_power: 3 },
  { stage: 2, title: 'Cyber Moonpet', perk: 'Unlocks cyber jobs, signal events and +7 weekly boss power.', weekly_power: 7 },
  { stage: 3, title: 'Elite Moonpet', perk: 'Unlocks elite jobs, high-risk events and +12 weekly boss power.', weekly_power: 12 },
  { stage: 4, title: 'Legendary Moon Guardian', perk: 'Unlocks guardian content and +18 weekly boss power.', weekly_power: 18 },
]);

export function getPetEvolutionPerk(stageRaw) {
  const stage = Math.max(0, Math.min(4, Math.floor(Number(stageRaw) || 0)));
  return PET_EVOLUTION_PERKS[stage];
}

export function getPetWeeklyBoss(weekKeyRaw) {
  const weekKey = String(weekKeyRaw || '');
  let hash = 0;
  for (const char of weekKey) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  return PET_WEEKLY_BOSSES[hash % PET_WEEKLY_BOSSES.length];
}

export function calculatePetWeeklyBossDamage(state = {}) {
  const action = ['strike', 'outsmart', 'endure'].includes(state.action) ? state.action : 'strike';
  const boss = state.boss || PET_WEEKLY_BOSSES[0];
  const level = Math.max(1, Math.min(1000, Math.floor(Number(state.level) || 1)));
  const evolutionStage = Math.max(0, Math.min(4, Math.floor(Number(state.evolution_stage) || 0)));
  const condition = Math.max(0, Math.min(100, Math.floor((Number(state.health) + Number(state.energy)) / 2) || 0));
  const roll = Math.max(0, Math.min(12, Math.floor(Number(state.roll) || 0)));
  const weaknessBonus = action === boss.weakness ? 12 : 0;
  const personalityBonus = Array.isArray(state.personality_ids) && state.personality_ids.includes(action === 'strike' ? 'street_fighter' : action === 'outsmart' ? 'curious' : 'loyal') ? 5 : 0;
  return Math.max(8, Math.floor(18 + (level * 1.4) + getPetEvolutionPerk(evolutionStage).weekly_power + (condition / 10) + weaknessBonus + personalityBonus + roll));
}

export function getPetSeasonRewardTier(tierId) {
  return PET_SEASON_REWARD_TIERS.find((tier) => tier.tier_id === String(tierId || '').trim().toLowerCase()) || null;
}
