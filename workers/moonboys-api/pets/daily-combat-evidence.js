import { PET_ROGUELITE_ENEMIES, PET_ROGUELITE_ROOMS } from './content/index.js';

// Clearing a hostile room can mean escape or trade. Only these authored
// combat choices prove an enemy defeat; boss victory has its own objective.
const COMBAT_CHOICES = Object.freeze({
  rival_encounter: ['challenge'],
  police_heat: ['confront'],
  elite_encounter: ['fight'],
  drone_enforcer: ['elite'],
  subway_champion: ['elite', 'fight'],
});

export function isDailyEnemyCombatChoice(room, choiceId) {
  const definition = PET_ROGUELITE_ROOMS[room.content_id];
  return ['battle', 'elite'].includes(room.room_type) && definition?.room_type === room.room_type
    && Boolean(PET_ROGUELITE_ENEMIES[room.enemy_id]) && Boolean(definition.enemy_pool?.includes(room.enemy_id))
    && Boolean(COMBAT_CHOICES[room.content_id]?.includes(choiceId))
    && Boolean(room.choices?.some(choice => choice.choice_id === choiceId));
}

export function hasDailyEnemyDefeatEvidence(room, outcome) {
  // Older resolved rooms without a saved successful authored combat choice
  // remain unassigned. Existing objective/reward rows are never rewritten.
  return outcome.success === true && outcome.enemy_defeated !== false
    && isDailyEnemyCombatChoice(room, outcome.choice_id);
}
