/** Capture immutable gameplay ownership exactly once, at participation time. */
export async function captureGameplayAuthority(db, telegramId) {
  const owner = String(telegramId || '').trim();
  if (!owner) throw new Error('gameplay_owner_required');
  const row = await db.prepare(`SELECT a.pet_id, i.telegram_id, i.season_key
    FROM telegram_pet_active_slots a
    JOIN telegram_pet_instances i ON i.pet_id=a.pet_id AND i.telegram_id=a.telegram_id
    WHERE a.telegram_id=? AND i.status='active' LIMIT 1`).bind(owner).first();
  if (!row?.pet_id || String(row.telegram_id) !== owner) throw new Error('active_pet_authority_unavailable');
  return Object.freeze({ telegram_id: owner, pet_id: String(row.pet_id), season_key: String(row.season_key) });
}

/** Settlement accepts persisted participation evidence, never an active selector. */
export function requirePersistedGameplayAuthority(record, telegramId) {
  const owner = String(telegramId || '').trim();
  const petId = String(record?.pet_id || '').trim();
  if (!owner || !petId || String(record?.telegram_id || '') !== owner) throw new Error('persisted_pet_authority_required');
  return Object.freeze({ telegram_id: owner, pet_id: petId, season_key: String(record?.season_key || '') });
}

export function requirePersistedPlayerAuthority(record, playerNumber, telegramId) {
  const side = Number(playerNumber) === 2 ? 'player2' : 'player1';
  return requirePersistedGameplayAuthority({
    telegram_id: record?.[`${side}_telegram_id`],
    pet_id: record?.[`${side}_pet_id`],
    season_key: record?.season_key,
  }, telegramId);
}
