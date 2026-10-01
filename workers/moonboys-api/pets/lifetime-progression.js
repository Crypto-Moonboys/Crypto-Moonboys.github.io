// Ownership dates measure a pet's age. Source season keys remain immutable
// receipt provenance; the current competition calendar never measures age.
export function buildPetLifetimeProgression(pet, completion = null, now = new Date()) {
  const createdAt = Date.parse(pet.created_at || '');
  const current = new Date(now).getTime();
  const ageDays = Number.isFinite(createdAt) && Number.isFinite(current)
    ? Math.max(0, Math.floor((current - createdAt) / 86400000)) : null;
  return {
    scope: 'pet_lifetime',
    pet_id: pet.pet_id,
    pet_xp: Math.max(0, Number(pet.pet_xp) || 0),
    created_at: pet.created_at || null,
    age_days: ageDays,
    current_week: ageDays == null ? null : Math.floor(ageDays / 7) + 1,
    detail_hydrated: Boolean(completion),
    completion,
  };
}
