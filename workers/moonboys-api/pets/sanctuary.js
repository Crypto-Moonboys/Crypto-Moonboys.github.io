const json = (value, fallback) => {
  try { return JSON.parse(value); } catch { return fallback; }
};

export const PET_RECOVERABLE_ACTIVITY_PREDICATE = `status = 'completed'
  AND json_valid(metadata) = 1
  AND json_extract(metadata, '$.claim_state') = 'claiming'`;

export async function listSanctuaryPetsSummary(db, telegramId) {
  const result = await db.prepare(`SELECT sanctuary_id, pet_id, original_season_key, completed_at,
      entered_sanctuary_at, species, variant, stage, legendary_evolution_id,
      json_extract(identity_snapshot_json, '$.pet_name') AS pet_name
    FROM telegram_pet_sanctuary WHERE telegram_id=? AND status='resident'
    ORDER BY completed_at DESC, sanctuary_id`).bind(String(telegramId)).all();
  return (result.results || []).map((row) => ({
    sanctuary_id: row.sanctuary_id,
    pet_id: row.pet_id,
    species: row.species,
    variant: row.variant,
    stage: row.stage,
    legendary: true,
    legendary_evolution_id: row.legendary_evolution_id,
    completed_season: row.original_season_key,
    completed_at: row.completed_at,
    entered_sanctuary_at: row.entered_sanctuary_at,
    name: row.pet_name || 'Moonpet',
  }));
}

export async function listSanctuaryPetsPrivate(db, telegramId) {
  const summaries = await listSanctuaryPetsSummary(db, telegramId);
  const result = await db.prepare(`SELECT pet_id, identity_snapshot_json, cosmetic_snapshot_json,
      trait_snapshot_json, memory_snapshot_json FROM telegram_pet_sanctuary
    WHERE telegram_id=? AND status='resident'`).bind(String(telegramId)).all();
  const snapshots = new Map((result.results || []).map((row) => [row.pet_id, row]));
  return summaries.map((pet) => {
    const row = snapshots.get(pet.pet_id) || {};
    return { ...pet, identity: json(row.identity_snapshot_json, {}), cosmetics: json(row.cosmetic_snapshot_json, {}),
      traits: json(row.trait_snapshot_json, []), memories: json(row.memory_snapshot_json, {}) };
  });
}

export const listSanctuaryPets = listSanctuaryPetsSummary;
