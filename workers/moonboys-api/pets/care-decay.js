import { requirePetFirstReadResult, requirePetMutationResult } from './read-result.js';
import { PET_INSTANCE_AUTHORITY_VERSION } from './wallet-reconciliation.js';

const clamp = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
const timestamp = value => {
  if (!value) return null;
  const raw = String(value).trim();
  const parsed = Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw.replace(' ', 'T')}Z`);
  return Number.isFinite(parsed) ? parsed : null;
};
export const PET_CARE_SNAPSHOT_COLUMNS = Object.freeze(['pet_xp', 'hunger', 'health', 'energy', 'happiness', 'cleanliness', 'last_decay_at']);

// Preview and settlement must use exactly the same elapsed-care calculation.
export function applyPetCareDecay(pet, now = new Date()) {
  const last = timestamp(pet.last_decay_at || pet.updated_at || pet.created_at) ?? now.getTime();
  const elapsedHours = Math.max(0, (now.getTime() - last) / 3600000);
  if (elapsedHours < 0.01) return pet;
  pet.hunger = clamp(Number(pet.hunger || 0) + elapsedHours * 4.5);
  pet.happiness = clamp(Number(pet.happiness || 0) - elapsedHours * 2.8);
  pet.cleanliness = clamp(Number(pet.cleanliness || 0) - elapsedHours * 3.2);
  pet.energy = clamp(Number(pet.energy || 0) - elapsedHours * 2.2);
  pet.health = clamp((100 - pet.hunger + pet.happiness + pet.cleanliness + pet.energy) / 4);
  pet.last_decay_at = now.toISOString();
  return pet;
}

export async function readPetInstanceWithAtomicCareDecay(db, source, now = new Date()) {
  const petId = String(source.pet_id || '').trim();
  if (!petId) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const stored = await db.prepare('SELECT * FROM telegram_pet_instances WHERE pet_id = ? LIMIT 1')
      .bind(petId).first().then(requirePetFirstReadResult);
    if (!stored || source.telegram_id && stored.telegram_id !== source.telegram_id
      || source.season_key && stored.season_key !== source.season_key) return null;
    const decayed = applyPetCareDecay({ ...stored }, now);
    if (decayed.last_decay_at === stored.last_decay_at) return decayed;
    const syncedAt = now.toISOString().slice(0, 19).replace('T', ' ');
    // Decay is an authoritative instance mutation, like care/reward writes.
    // Equal-second profile clocks cannot establish a newer care snapshot.
    const profileVersion = PET_INSTANCE_AUTHORITY_VERSION;
    const result = await db.prepare(`UPDATE telegram_pet_instances
      SET hunger = ?, happiness = ?, cleanliness = ?, energy = ?, health = ?, last_decay_at = ?, source_profile_updated_at = ?, updated_at = ?
      WHERE pet_id = ? AND telegram_id = ? AND season_key = ?
        AND updated_at IS ? AND source_profile_updated_at IS ?
        AND ${PET_CARE_SNAPSHOT_COLUMNS.map(column => `${column} IS ?`).join(' AND ')}`)
      .bind(decayed.hunger, decayed.happiness, decayed.cleanliness, decayed.energy, decayed.health,
        decayed.last_decay_at, profileVersion, syncedAt, petId, stored.telegram_id, stored.season_key,
        stored.updated_at ?? null, stored.source_profile_updated_at ?? null,
        ...PET_CARE_SNAPSHOT_COLUMNS.map(column => stored[column] ?? null)).run().then(requirePetMutationResult);
    if (!Number.isSafeInteger(result?.meta?.changes) || result.meta.changes < 0) throw new Error('pet_state_write_unavailable');
    if (result.meta.changes === 1) return { ...decayed, updated_at: syncedAt, source_profile_updated_at: profileVersion };
  }
  throw new Error('pet_decay_sync_conflict');
}
