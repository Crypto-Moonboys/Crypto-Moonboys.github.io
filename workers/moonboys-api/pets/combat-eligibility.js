export const PET_ARENA_MIN_LEVEL = 10;
export const PET_WEEKLY_BOSS_MIN_LEVEL = 5;

export function getCombatEligibility({ activePetExists, lifecycleKnown, hatched, level = 0 }) {
  const normalizedLevel = Math.max(0, Number(level) || 0);
  const baseReason = !activePetExists ? 'pet_not_adopted'
    : !lifecycleKnown ? 'moonpet_lifecycle_required'
      : !hatched ? 'moon_egg_must_hatch' : 'combat_unlocked';
  const combatUnlocked = baseReason === 'combat_unlocked';
  return {
    active_pet_exists: Boolean(activePetExists),
    active_pet_lifecycle_known: Boolean(lifecycleKnown),
    active_pet_combat_eligible: Boolean(hatched),
    active_pet_level: normalizedLevel,
    arena_level_met: normalizedLevel >= PET_ARENA_MIN_LEVEL,
    weekly_boss_level_met: normalizedLevel >= PET_WEEKLY_BOSS_MIN_LEVEL,
    combat_unlocked: combatUnlocked,
    kaiju_unlocked: combatUnlocked,
    arena_unlocked: combatUnlocked && normalizedLevel >= PET_ARENA_MIN_LEVEL,
    weekly_boss_unlocked: combatUnlocked && normalizedLevel >= PET_WEEKLY_BOSS_MIN_LEVEL,
    reason: baseReason,
    kaiju_reason: combatUnlocked ? 'combat_unlocked' : baseReason,
    arena_reason: combatUnlocked
      ? (normalizedLevel >= PET_ARENA_MIN_LEVEL ? 'combat_unlocked' : 'arena_level_locked')
      : baseReason,
    weekly_boss_reason: combatUnlocked
      ? (normalizedLevel >= PET_WEEKLY_BOSS_MIN_LEVEL ? 'combat_unlocked' : 'boss_level_locked')
      : baseReason,
  };
}
