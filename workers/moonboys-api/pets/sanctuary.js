const json = (value, fallback) => {
  try { return JSON.parse(value); } catch { return fallback; }
};

async function rows(db, sql, ...bindings) {
  const result = await db.prepare(sql).bind(...bindings).all();
  return result.results || [];
}

export const PET_RECOVERABLE_ACTIVITY_PREDICATE = `status = 'completed'
  AND json_valid(metadata) = 1
  AND json_extract(metadata, '$.claim_state') = 'claiming'`;

async function hasPendingActivity(db, telegramId) {
  const checks = [
    [`SELECT id FROM telegram_pet_activity_sessions WHERE telegram_id=?
      AND (status IN ('active','pending','ready') OR (${PET_RECOVERABLE_ACTIVITY_PREDICATE})) LIMIT 1`, [telegramId]],
    [`SELECT run_id AS id FROM telegram_pet_runs WHERE telegram_id=? AND status IN ('active','pending','ready','extractable') LIMIT 1`, [telegramId]],
    [`SELECT battle_id AS id FROM telegram_pet_arena_battles WHERE (player1_telegram_id=? OR player2_telegram_id=?) AND status NOT IN ('completed','cancelled','expired') LIMIT 1`, [telegramId, telegramId]],
    [`SELECT match_id AS id FROM telegram_pet_kaiju_matches WHERE (player1_telegram_id=? OR player2_telegram_id=?) AND status NOT IN ('completed','cancelled','expired') LIMIT 1`, [telegramId, telegramId]],
  ];
  for (const [sql, bindings] of checks) {
    const pending = await db.prepare(sql).bind(...bindings).first();
    if (pending) return pending;
  }
  return null;
}

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

function currentSeasonKey(timestamp) {
  const date = new Date(timestamp);
  return `pet-s${date.getUTCFullYear()}-${String(Math.floor(date.getUTCMonth() / 3) + 1).padStart(3, '0')}`;
}

// This mutation is intentionally not exposed as a player action. Callers must
// supply the authenticated owner and the existing pending-work authority.
export async function movePetToSanctuaryIfEligible(db, input, options = {}) {
  const petId = String(input?.pet_id || '').trim();
  const telegramId = String(input?.telegram_id || '').trim();
  const seasonKey = String(input?.season_key || '').trim();
  if (!petId || !telegramId || !seasonKey) return { accepted: false, reason: 'invalid_request' };

  const pet = await db.prepare(`SELECT * FROM telegram_pet_instances
    WHERE pet_id=? AND telegram_id=? AND season_key=? LIMIT 1`).bind(petId, telegramId, seasonKey).first();
  if (!pet) return { accepted: false, reason: 'pet_not_owned' };
  const completion = await db.prepare(`SELECT * FROM telegram_pet_season_completions
    WHERE pet_id=? AND telegram_id=? AND season_key=? LIMIT 1`).bind(petId, telegramId, seasonKey).first();
  if (!completion) return { accepted: false, reason: 'season_not_complete' };
  const timestamp = options.now || new Date().toISOString();
  const archiveStatements = [
    db.prepare(`UPDATE telegram_pet_instances SET status='archived', updated_at=?
      WHERE pet_id=? AND telegram_id=? AND EXISTS (SELECT 1 FROM telegram_pet_sanctuary WHERE pet_id=?)`).bind(timestamp, petId, telegramId, petId),
    db.prepare(`UPDATE telegram_pet_season_slots SET status='archived', updated_at=?
      WHERE pet_id=? AND telegram_id=? AND EXISTS (SELECT 1 FROM telegram_pet_sanctuary WHERE pet_id=?)`).bind(timestamp, petId, telegramId, petId),
    db.prepare(`INSERT INTO telegram_pet_active_slots (telegram_id, pet_id, season_key, updated_at)
      SELECT telegram_id, pet_id, season_key, ? FROM telegram_pet_season_slots
      WHERE telegram_id=? AND pet_id<>? AND status='active'
        AND EXISTS (SELECT 1 FROM telegram_pet_sanctuary WHERE pet_id=?)
        AND EXISTS (SELECT 1 FROM telegram_pet_active_slots a WHERE a.telegram_id=? AND a.pet_id=?)
      ORDER BY CASE WHEN season_key=? THEN 0 ELSE 1 END, updated_at DESC, slot_number LIMIT 1
      ON CONFLICT(telegram_id) DO UPDATE SET pet_id=excluded.pet_id, season_key=excluded.season_key, updated_at=excluded.updated_at`).bind(timestamp, telegramId, petId, petId, telegramId, petId, seasonKey),
    db.prepare(`UPDATE telegram_pet_profiles SET
      (pet_name, species, stage, pet_xp, level, hunger, happiness, cleanliness, energy, health,
       streak_days, moon_gold, moon_crystals, style_tokens, equipped_food, equipped_toy,
       equipped_outfit, equipped_armor, equipped_weapon, equipped_charm, last_active_day,
       last_decay_at, updated_at) =
      (SELECT i.pet_name, i.species, i.stage, i.pet_xp, i.level, i.hunger, i.happiness,
       i.cleanliness, i.energy, i.health, i.streak_days, i.moon_gold, i.moon_crystals,
       i.style_tokens, i.equipped_food, i.equipped_toy, i.equipped_outfit, i.equipped_armor,
       i.equipped_weapon, i.equipped_charm, i.last_active_day, i.last_decay_at, ?
      FROM telegram_pet_instances i JOIN telegram_pet_active_slots a ON a.pet_id=i.pet_id
       WHERE a.telegram_id=? AND i.telegram_id=? LIMIT 1)
      WHERE telegram_id=? AND EXISTS (SELECT 1 FROM telegram_pet_sanctuary WHERE pet_id=?) AND EXISTS (
        SELECT 1 FROM telegram_pet_active_slots a JOIN telegram_pet_instances i ON i.pet_id=a.pet_id
        WHERE a.telegram_id=? AND i.telegram_id=?)`).bind(timestamp, telegramId, telegramId, telegramId, petId, telegramId, telegramId),
    db.prepare(`DELETE FROM telegram_pet_active_slots WHERE pet_id=? AND telegram_id=?
      AND EXISTS (SELECT 1 FROM telegram_pet_sanctuary WHERE pet_id=?)`).bind(petId, telegramId, petId),
  ];
  const existing = await db.prepare(`SELECT pet_id FROM telegram_pet_sanctuary
    WHERE pet_id=? AND telegram_id=? AND original_season_key=? LIMIT 1`).bind(petId, telegramId, seasonKey).first();
  if (existing) {
    await db.batch(archiveStatements);
    return { accepted: true, duplicate: true, reason: 'already_in_sanctuary', pet_id: petId };
  }
  const activePointer = await db.prepare(`SELECT pet_id FROM telegram_pet_active_slots
    WHERE telegram_id=? LIMIT 1`).bind(telegramId).first();
  if (String(activePointer?.pet_id || '') === petId) {
    const replacement = await db.prepare(`SELECT pet_id FROM telegram_pet_season_slots
      WHERE telegram_id=? AND pet_id<>? AND status='active' ORDER BY CASE WHEN season_key=? THEN 0 ELSE 1 END, updated_at DESC, slot_number LIMIT 1`)
      .bind(telegramId, petId, seasonKey).first();
    if (!replacement) {
      // Archived slots remain historical evidence. A successor starts a new
      // allocation namespace instead of consuming/reusing the completed season.
      const successorSeasonKey = String(options.successor_season_key || currentSeasonKey(timestamp));
      const successorId = `${petId}:successor`;
      archiveStatements.unshift(
        db.prepare(`INSERT OR IGNORE INTO telegram_pet_season_slots
          (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent, status, created_at, updated_at)
          SELECT ?, ?, ?, ?, 'free', ?, 0, 'active', ?, ?
          WHERE EXISTS (SELECT 1 FROM telegram_pet_sanctuary WHERE pet_id=?)`).bind(
          successorId, telegramId, successorSeasonKey, 1, `sanctuary-successor:${petId}`, timestamp, timestamp, petId,
        ),
        db.prepare(`INSERT OR IGNORE INTO telegram_pet_instances
          (pet_id, telegram_id, season_key, slot_number, pet_name, species, stage, pet_xp, level,
           hunger, happiness, cleanliness, energy, health, streak_days, moon_gold, moon_crystals,
           style_tokens, status, last_decay_at, source_profile_updated_at, created_at, updated_at)
          SELECT ?, ?, ?, ?, 'Moonpet', '', 'egg', 0, 1, 25, 70, 70, 70, 75, 0, 0, 0, 0,
           'active', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_sanctuary WHERE pet_id=?)`).bind(
          successorId, telegramId, successorSeasonKey, 1, timestamp, timestamp, timestamp, timestamp, petId,
        ),
        db.prepare(`INSERT OR IGNORE INTO telegram_pet_lifecycle_by_pet
          (pet_id, telegram_id, lifecycle_version, identity_seed, phase, species_id, palette_id,
           marking_id, eye_style, temperament, innate_traits_json, incubation_progress,
           incubation_json, created_at, updated_at)
          SELECT ?, ?, 1, ?, 'egg', NULL, NULL, NULL, NULL, NULL, '[]', 0, '{}', ?, ?
          WHERE EXISTS (SELECT 1 FROM telegram_pet_sanctuary WHERE pet_id=?)`).bind(
          successorId, telegramId, `sanctuary-successor:${successorId}`, timestamp, timestamp, petId,
        ),
      );
    }
  }
  const pending = options.getPendingActivity
    ? await options.getPendingActivity(db, telegramId)
    : await hasPendingActivity(db, telegramId);
  if (pending) return { accepted: false, reason: 'pending_activity' };

  let snapshots;
  try {
    snapshots = await Promise.all([
      db.prepare(`SELECT * FROM telegram_pet_lifecycle_by_pet WHERE pet_id=? AND telegram_id=?`).bind(petId, telegramId).first(),
      rows(db, `SELECT evolution_id, stage, cosmetic_unlocks, achievement_unlocks, unlocked_at
        FROM telegram_pet_evolutions_by_pet WHERE pet_id=? AND telegram_id=? ORDER BY stage`, petId, telegramId),
      rows(db, `SELECT trait_id, progress, unlocked_at FROM telegram_pet_personality_traits
        WHERE telegram_id=? ORDER BY trait_id`, telegramId),
      db.prepare(`SELECT * FROM telegram_pet_memories WHERE telegram_id=?`).bind(telegramId).first(),
      rows(db, `SELECT asset_type, asset_key, quantity FROM telegram_pet_inventory
        WHERE telegram_id=? AND asset_type='cosmetic' AND quantity>0 ORDER BY asset_key`, telegramId),
      rows(db, `SELECT item_key, slot, item_level, mastery_tier FROM telegram_pet_equipment_progression
        WHERE telegram_id=? ORDER BY slot, item_key`, telegramId),
      db.prepare(`SELECT * FROM telegram_pet_progression_state WHERE telegram_id=?`).bind(telegramId).first(),
    ]);
  } catch (error) {
    const detail = { event: 'pet_sanctuary_snapshot_failed', petId, telegramId, message: error?.message || String(error) };
    if (options.logError) options.logError(detail);
    else console.error('[moonpet-sanctuary]', JSON.stringify(detail));
    return { accepted: false, reason: 'snapshot_read_failed', pet_id: petId };
  }
  const [lifecycle, evolutions, traits, memories, cosmetics, gear, progress] = snapshots;
  const finalEvolution = evolutions.at(-1);
  const identity = { pet_id: petId, pet_name: pet.pet_name, species: pet.species, lifecycle, evolutions };
  const equipment = {
    equipped_food: pet.equipped_food, equipped_toy: pet.equipped_toy, equipped_outfit: pet.equipped_outfit,
    equipped_armor: pet.equipped_armor, equipped_weapon: pet.equipped_weapon, equipped_charm: pet.equipped_charm,
  };
  const insert = db.prepare(`INSERT OR IGNORE INTO telegram_pet_sanctuary
    (sanctuary_id, pet_id, telegram_id, original_season_key, completed_at, entered_sanctuary_at,
     species, variant, stage, legendary_evolution_id, identity_snapshot_json, cosmetic_snapshot_json,
     trait_snapshot_json, memory_snapshot_json, status, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'resident', ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM telegram_pet_activity_sessions WHERE telegram_id=?
      AND (status IN ('active','pending','ready') OR (${PET_RECOVERABLE_ACTIVITY_PREDICATE})))
      AND NOT EXISTS (SELECT 1 FROM telegram_pet_runs WHERE telegram_id=? AND status IN ('active','pending','ready','extractable'))
      AND NOT EXISTS (SELECT 1 FROM telegram_pet_arena_battles WHERE (player1_telegram_id=? OR player2_telegram_id=?) AND status NOT IN ('completed','cancelled','expired'))
      AND NOT EXISTS (SELECT 1 FROM telegram_pet_kaiju_matches WHERE (player1_telegram_id=? OR player2_telegram_id=?) AND status NOT IN ('completed','cancelled','expired'))`).bind(
    `sanctuary:${petId}`, petId, telegramId, seasonKey, completion.completed_at, timestamp,
    lifecycle?.species_id || pet.species || 'unknown', lifecycle?.rare_morph_id || lifecycle?.palette_id || null,
    String(finalEvolution?.stage ?? pet.stage ?? lifecycle?.phase ?? 'legendary'), completion.legendary_evolution_id,
    JSON.stringify({ ...identity, progression: progress }), JSON.stringify({ inventory: cosmetics, equipment, gear }),
    JSON.stringify(traits), JSON.stringify(memories || {}), timestamp, timestamp,
    telegramId, telegramId, telegramId, telegramId, telegramId, telegramId,
  );
  const results = await db.batch([insert, ...archiveStatements]);
  const duplicate = Number(results?.[0]?.meta?.changes || 0) !== 1;
  if (duplicate) {
    const resident = await db.prepare(`SELECT 1 AS present FROM telegram_pet_sanctuary WHERE pet_id=?`).bind(petId).first();
    if (!resident) return { accepted: false, duplicate: false, reason: 'pending_activity', pet_id: petId };
  }
  return { accepted: true, duplicate, reason: duplicate ? 'already_in_sanctuary' : 'entered_sanctuary', pet_id: petId };
}

export async function reconcileCompletedPetsToSanctuary(db, telegramId, options = {}) {
  let result;
  try {
    result = await db.prepare(`SELECT c.pet_id, c.telegram_id, c.season_key
      FROM telegram_pet_season_completions c
      LEFT JOIN telegram_pet_sanctuary s ON s.pet_id=c.pet_id
      WHERE c.telegram_id=? AND s.pet_id IS NULL ORDER BY c.completed_at`).bind(String(telegramId)).all();
  } catch (error) {
    const message = String(error?.message || '');
    if (message.includes('no such table: telegram_pet_season_completions') || message.includes('no such table: telegram_pet_sanctuary')) return [];
    throw error;
  }
  const transitions = [];
  for (const completion of result.results || []) {
    transitions.push(await movePetToSanctuaryIfEligible(db, completion, options));
  }
  return transitions;
}
