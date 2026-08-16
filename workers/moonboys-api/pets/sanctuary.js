const json = (value, fallback) => {
  try { return JSON.parse(value); } catch { return fallback; }
};

async function rows(db, sql, ...bindings) {
  const result = await db.prepare(sql).bind(...bindings).all().catch(() => ({ results: [] }));
  return result.results || [];
}

async function hasPendingActivity(db, telegramId) {
  const checks = [
    [`SELECT session_id AS id FROM telegram_pet_activity_sessions WHERE telegram_id=? AND status IN ('active','pending','ready') LIMIT 1`, [telegramId]],
    [`SELECT run_id AS id FROM telegram_pet_runs WHERE telegram_id=? AND status='active' LIMIT 1`, [telegramId]],
    [`SELECT battle_id AS id FROM telegram_pet_arena_battles WHERE (player1_telegram_id=? OR player2_telegram_id=?) AND status NOT IN ('completed','cancelled','expired') LIMIT 1`, [telegramId, telegramId]],
    [`SELECT match_id AS id FROM telegram_pet_kaiju_matches WHERE telegram_id=? AND status NOT IN ('completed','cancelled','expired') LIMIT 1`, [telegramId]],
  ];
  for (const [sql, bindings] of checks) {
    const pending = await db.prepare(sql).bind(...bindings).first().catch(() => null);
    if (pending) return pending;
  }
  return null;
}

export async function listSanctuaryPets(db, telegramId) {
  const result = await db.prepare(`SELECT sanctuary_id, pet_id, original_season_key, completed_at,
      entered_sanctuary_at, species, variant, stage, legendary_evolution_id,
      identity_snapshot_json, cosmetic_snapshot_json, trait_snapshot_json, memory_snapshot_json
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
    identity: json(row.identity_snapshot_json, {}),
    cosmetics: json(row.cosmetic_snapshot_json, {}),
    traits: json(row.trait_snapshot_json, []),
    memories: json(row.memory_snapshot_json, {}),
  }));
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
      WHERE pet_id=? AND telegram_id=?`).bind(timestamp, petId, telegramId),
    db.prepare(`UPDATE telegram_pet_season_slots SET status='archived', updated_at=?
      WHERE pet_id=? AND telegram_id=?`).bind(timestamp, petId, telegramId),
    db.prepare(`DELETE FROM telegram_pet_active_slots WHERE pet_id=? AND telegram_id=?`).bind(petId, telegramId),
  ];
  const existing = await db.prepare(`SELECT pet_id FROM telegram_pet_sanctuary
    WHERE pet_id=? AND telegram_id=? AND original_season_key=? LIMIT 1`).bind(petId, telegramId, seasonKey).first();
  if (existing) {
    await db.batch(archiveStatements);
    return { accepted: true, duplicate: true, reason: 'already_in_sanctuary', pet_id: petId };
  }
  const pending = options.getPendingActivity
    ? await options.getPendingActivity(db, telegramId)
    : await hasPendingActivity(db, telegramId);
  if (pending) return { accepted: false, reason: 'pending_activity' };

  const [lifecycle, evolutions, traits, memories, cosmetics, gear, progress] = await Promise.all([
    db.prepare(`SELECT * FROM telegram_pet_lifecycle_by_pet WHERE pet_id=? AND telegram_id=?`).bind(petId, telegramId).first().catch(() => null),
    rows(db, `SELECT evolution_id, stage, cosmetic_unlocks, achievement_unlocks, unlocked_at
      FROM telegram_pet_evolutions_by_pet WHERE pet_id=? AND telegram_id=? ORDER BY stage`, petId, telegramId),
    rows(db, `SELECT trait_id, progress, unlocked_at FROM telegram_pet_personality_traits
      WHERE telegram_id=? ORDER BY trait_id`, telegramId),
    db.prepare(`SELECT * FROM telegram_pet_memories WHERE telegram_id=?`).bind(telegramId).first().catch(() => null),
    rows(db, `SELECT asset_type, asset_key, quantity FROM telegram_pet_inventory
      WHERE telegram_id=? AND asset_type='cosmetic' AND quantity>0 ORDER BY asset_key`, telegramId),
    rows(db, `SELECT item_key, slot, item_level, mastery_tier FROM telegram_pet_equipment_progression
      WHERE telegram_id=? ORDER BY slot, item_key`, telegramId),
    db.prepare(`SELECT * FROM telegram_pet_progression WHERE telegram_id=?`).bind(telegramId).first().catch(() => null),
  ]);
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'resident', ?, ?)`).bind(
    `sanctuary:${petId}`, petId, telegramId, seasonKey, completion.completed_at, timestamp,
    lifecycle?.species_id || pet.species || 'unknown', lifecycle?.rare_morph_id || lifecycle?.palette_id || null,
    finalEvolution?.evolution_id || pet.stage, completion.legendary_evolution_id,
    JSON.stringify({ ...identity, progression: progress }), JSON.stringify({ inventory: cosmetics, equipment, gear }),
    JSON.stringify(traits), JSON.stringify(memories || {}), timestamp, timestamp,
  );
  const results = await db.batch([insert, ...archiveStatements]);
  const duplicate = Number(results?.[0]?.meta?.changes || 0) !== 1;
  return { accepted: true, duplicate, reason: duplicate ? 'already_in_sanctuary' : 'entered_sanctuary', pet_id: petId };
}
