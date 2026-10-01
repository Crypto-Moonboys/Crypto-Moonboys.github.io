import evolutions from './content/evolutions.json' with { type: 'json' };
import { requirePetFirstReadResult, requirePetMutationResult } from './read-result.js';

const egg = evolutions.find(entry => entry.evolution_id === 'moon_egg');

// One canonical claim and all of its effects commit together. A request that
// loses the claim cannot write onboarding events, and a failed batch can retry.
export function buildPetOnboardingStatements(db, pet) {
  const telegramId = pet.telegram_id;
  const eventId = crypto.randomUUID();
  const eventKey = `pet:onboarding:${pet.pet_id}`;
  const claimed = `EXISTS (SELECT 1 FROM telegram_pet_identity_events
    WHERE event_id=? AND pet_id=? AND telegram_id=? AND season_key=? AND applied_at IS NULL)`;
  const claimArgs = [eventId, pet.pet_id, telegramId, pet.season_key];
  const milestone = 'evolution_moon_egg';
  const createdAt = '(SELECT created_at FROM telegram_pet_season_slots WHERE pet_id=? AND telegram_id=? AND season_key=?)';
  const creationArgs = [pet.pet_id, telegramId, pet.season_key];
  return [
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_identity_events
      (event_id,pet_id,telegram_id,season_key,event_key,event_kind,payload)
      SELECT ?,?,?,?,?,'memory',? WHERE EXISTS (
        SELECT 1 FROM telegram_pet_season_slots s JOIN telegram_pet_instances i
          ON i.pet_id=s.pet_id AND i.telegram_id=s.telegram_id AND i.season_key=s.season_key AND i.slot_number=s.slot_number
        WHERE s.pet_id=? AND s.telegram_id=? AND s.season_key=? AND s.status='active' AND i.status='active'
          AND s.slot_number=1 AND s.acquisition_type='free') AND
        (NOT EXISTS (SELECT 1 FROM telegram_pet_lifecycle_by_pet WHERE pet_id=?)
         OR NOT EXISTS (SELECT 1 FROM telegram_pet_memories WHERE pet_id=? AND first_adoption_at IS NOT NULL)
         OR NOT EXISTS (SELECT 1 FROM telegram_pet_evolutions_by_pet WHERE pet_id=? AND evolution_id='moon_egg'))
        AND NOT EXISTS (SELECT 1 FROM telegram_pet_lifecycle_by_pet WHERE pet_id=? AND telegram_id<>?)
        AND NOT EXISTS (SELECT 1 FROM telegram_pet_memories WHERE pet_id=? AND NOT (telegram_id=? AND season_key=?))`)
      .bind(...claimArgs, eventKey, JSON.stringify({ type: 'first_adoption', milestone: 'first_adoption', authority: 'atomic_onboarding' }),
        pet.pet_id, telegramId, pet.season_key,
        pet.pet_id, pet.pet_id, pet.pet_id, pet.pet_id, telegramId, pet.pet_id, telegramId, pet.season_key),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_lifecycle_by_pet
      (pet_id,telegram_id,identity_seed,phase,incubation_json,innate_traits_json,created_at)
      SELECT ?,?,?,'egg','{}','[]',${createdAt} WHERE ${claimed}`)
      .bind(pet.pet_id, telegramId, crypto.randomUUID(), ...creationArgs, ...claimArgs),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_lifecycle_events_by_pet
      (event_id,pet_id,telegram_id,event_key,action,payload_json,progress_delta,applied_at)
      SELECT ?,?,?,?,'egg_created','{}',0,CURRENT_TIMESTAMP WHERE ${claimed}
        AND EXISTS (SELECT 1 FROM telegram_pet_lifecycle_by_pet WHERE pet_id=? AND telegram_id=? AND phase='egg')
        AND NOT EXISTS (SELECT 1 FROM telegram_pet_lifecycle_events_by_pet WHERE pet_id=? AND action='egg_created')`)
      .bind(crypto.randomUUID(), pet.pet_id, telegramId, `${eventKey}:lifecycle`, ...claimArgs, pet.pet_id, telegramId, pet.pet_id),
    db.prepare(`INSERT INTO telegram_pet_memories (pet_id,telegram_id,season_key,first_adoption_at,milestones)
      SELECT ?,?,?,${createdAt},? WHERE ${claimed}
      ON CONFLICT(pet_id) DO UPDATE SET
        first_adoption_at=COALESCE(telegram_pet_memories.first_adoption_at,excluded.first_adoption_at),
        milestones=CASE WHEN EXISTS (SELECT 1 FROM json_each(telegram_pet_memories.milestones) WHERE value='first_adoption')
          THEN telegram_pet_memories.milestones ELSE json_insert(telegram_pet_memories.milestones,'$[#]','first_adoption') END,
        updated_at=CURRENT_TIMESTAMP
      WHERE telegram_pet_memories.telegram_id=excluded.telegram_id AND telegram_pet_memories.season_key=excluded.season_key`)
      .bind(pet.pet_id, telegramId, pet.season_key, ...creationArgs, JSON.stringify(['first_adoption']), ...claimArgs),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_evolutions_by_pet
      (pet_id,telegram_id,evolution_id,stage,unlock_event_key,cosmetic_unlocks,achievement_unlocks,materials_consumed)
      SELECT ?,?,'moon_egg',0,?,?,?,1 WHERE ${claimed}`)
      .bind(pet.pet_id, telegramId, `${eventKey}:moon_egg`, JSON.stringify(egg.cosmetic_unlocks), JSON.stringify(egg.achievement_unlocks), ...claimArgs),
    db.prepare(`UPDATE telegram_pet_memories SET milestones=CASE
      WHEN EXISTS (SELECT 1 FROM json_each(milestones) WHERE value=?) THEN milestones
      ELSE json_insert(milestones,'$[#]',?) END WHERE pet_id=? AND telegram_id=? AND season_key=? AND ${claimed}`)
      .bind(milestone, milestone, pet.pet_id, telegramId, pet.season_key, ...claimArgs),
    ...['first_adoption', milestone].map(id => db.prepare(`INSERT OR IGNORE INTO telegram_pet_identity_analytics
      (analytics_id,pet_id,telegram_id,season_key,event_type,milestone_id,event_data)
      SELECT ?,?,?,?,'memory_milestone',?,? WHERE ${claimed}`)
      .bind(`memory_milestone:${pet.pet_id}:${id}`, pet.pet_id, telegramId, pet.season_key, id,
        JSON.stringify({ memory_type: id === 'first_adoption' ? 'first_adoption' : 'milestone' }), ...claimArgs)),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_identity_analytics
      (analytics_id,pet_id,telegram_id,season_key,event_type,evolution_id,duration_seconds,event_data)
      SELECT ?,?,?,?,'evolution_unlock','moon_egg',0,? WHERE ${claimed}`)
      .bind(`evolution_unlock:${pet.pet_id}:moon_egg`, pet.pet_id, telegramId, pet.season_key,
        JSON.stringify({ pet_id: pet.pet_id, stage: 0, name: egg.name }), ...claimArgs),
    db.prepare(`UPDATE telegram_pet_identity_events SET applied_at=CURRENT_TIMESTAMP
      WHERE event_id=? AND pet_id=? AND telegram_id=? AND season_key=? AND applied_at IS NULL`)
      .bind(...claimArgs),
  ];
}

export async function completePetOnboarding(db, telegramId, petId) {
  const pet = await db.prepare(`SELECT s.* FROM telegram_pet_season_slots s
    JOIN telegram_pet_instances i ON i.pet_id=s.pet_id AND i.telegram_id=s.telegram_id
      AND i.season_key=s.season_key AND i.slot_number=s.slot_number
    WHERE s.pet_id=? AND s.telegram_id=? AND s.status='active' AND i.status='active'
      AND s.slot_number=1 AND s.acquisition_type='free' LIMIT 1`)
    .bind(petId, telegramId).first().then(requirePetFirstReadResult);
  if (!pet) return false;
  const statements = buildPetOnboardingStatements(db, pet);
  const results = await db.batch(statements);
  if (!Array.isArray(results) || results.length !== statements.length) throw new Error('pet_state_write_unavailable');
  results.forEach(requirePetMutationResult);
  const complete = await db.prepare(`SELECT 1 AS complete FROM telegram_pet_lifecycle_by_pet l
    JOIN telegram_pet_memories m ON m.pet_id=l.pet_id AND m.telegram_id=l.telegram_id
    JOIN telegram_pet_evolutions_by_pet e ON e.pet_id=l.pet_id AND e.telegram_id=l.telegram_id AND e.evolution_id='moon_egg'
    WHERE l.pet_id=? AND l.telegram_id=? AND m.season_key=? AND m.first_adoption_at IS NOT NULL LIMIT 1`)
    .bind(pet.pet_id, telegramId, pet.season_key).first().then(requirePetFirstReadResult);
  if (!complete) throw new Error('pet_onboarding_recovery_required');
  return Number(results[0]?.meta?.changes || 0) === 1;
}
