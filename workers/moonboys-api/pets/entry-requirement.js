import { requirePetFirstReadResult } from './read-result.js';

export const PET_ENTRY_ARCADE_XP = 1000;

export function petEntryNext(requirement) {
  return {
    key: 'adopt', title: 'Activate EGGYONE', action: 'adopt', destination: 'home',
    available: requirement.eligible,
    disabled_reason: requirement.eligible ? null : 'arcade_xp_entry_required',
    detail: requirement.eligible
      ? 'Awaken your first Secret Bot. Your Arcade XP is kept.'
      : `Earn ${requirement.remaining_arcade_xp.toLocaleString('en-US')} more Arcade XP on the website to unlock your first pet.`,
  };
}

// Arcade progression is the server's lifetime earned XP, never the spendable
// wallet, Community XP, Telegram profile level or a client-provided balance.
export async function getPetEntryRequirement(db, telegramId) {
  const owner = String(telegramId || '').trim();
  if (!owner) throw new Error('missing_telegram_id');
  const row = await db.prepare(`SELECT
    COALESCE((SELECT arcade_xp_total FROM arcade_progression_state WHERE telegram_id=?),0) AS lifetime_xp,
    EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id=?) AS existing_owner`)
    .bind(owner,owner).first().then(requirePetFirstReadResult);
  if (!row || !Number.isFinite(Number(row.lifetime_xp))) throw new Error('pet_state_read_unavailable');
  const earned = Math.max(0, Math.floor(Number(row.lifetime_xp)));
  const existingOwner = Number(row.existing_owner) === 1;
  return {
    required_arcade_xp: PET_ENTRY_ARCADE_XP,
    arcade_xp_lifetime: earned,
    remaining_arcade_xp: Math.max(0, PET_ENTRY_ARCADE_XP - earned),
    eligible: existingOwner || earned >= PET_ENTRY_ARCADE_XP,
    existing_owner: existingOwner,
    spends_arcade_xp: false,
  };
}
