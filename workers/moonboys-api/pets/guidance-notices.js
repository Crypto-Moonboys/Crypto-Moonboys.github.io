// The existing notice ledger retains legacy rows. Versioned keys bind new
// notices to immutable provenance without guessing which pet earned old rows.
async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function guidanceNoticeSource(notice, pet) {
  if (notice.scope === 'account' && notice.type === 'season_reward' && notice.season_key) {
    return { scope: 'account', pet_id: null, season_key: String(notice.season_key) };
  }
  if (!pet?.pet_id || !pet?.season_key) throw new Error('pet_guidance_source_required');
  return { scope: 'pet', pet_id: String(pet.pet_id), season_key: String(pet.season_key) };
}

export async function guidanceNoticePrefix(owner, source) {
  if (!owner || !source?.season_key || !['pet', 'account'].includes(source.scope)
    || (source.scope === 'pet' && !source.pet_id) || (source.scope === 'account' && source.pet_id)) {
    throw new Error('pet_guidance_source_required');
  }
  return `gn2:${await digest([String(owner), source.scope, source.pet_id || null, String(source.season_key)])}:`;
}

export async function scopedGuidanceNotice(owner, notice, pet) {
  const source = guidanceNoticeSource(notice, pet);
  return { ...notice, ...source, key: `${await guidanceNoticePrefix(owner, source)}${await digest(String(notice.key))}` };
}

export async function validateGuidanceNoticeAcknowledgements(owner, notices) {
  if (!Array.isArray(notices) || notices.length > 50) throw new Error('pet_guidance_source_required');
  const result = [];
  for (const notice of notices) {
    const key = String(notice?.key || '');
    const prefix = await guidanceNoticePrefix(owner, notice);
    if (!key.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(key.slice(prefix.length))) {
      throw new Error('pet_guidance_source_mismatch');
    }
    if (!result.some(saved => saved.key === key)) result.push({ key, scope: notice.scope,
      pet_id: notice.pet_id || null, season_key: notice.season_key });
  }
  return result;
}
