import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

// Model a current client request using the pet and activity rendered before dispatch.
// Explicit IDs, including null/empty ones, must never be repaired.
// Missing-ID regressions call the real dispatcher directly.
// HTTP/browser request handlers call the real dispatcher directly.
export async function dispatchRenderedPetAction(db, owner, user, body, token) {
  if (['activity_claim', 'activity_cancel'].includes(body.action) && !Object.hasOwn(body, 'session_id')) {
    const activity = await db.prepare(`SELECT id FROM telegram_pet_activity_sessions
      WHERE telegram_id=? AND (status='active' OR (status='completed' AND json_valid(metadata)=1
        AND json_extract(metadata,'$.claim_state')='claiming'))
      ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END, claimed_at ASC LIMIT 1`).bind(String(owner)).first();
    body = { ...body, session_id: activity?.id || null };
  }
  if (Object.hasOwn(body, 'displayed_pet_id')) {
    return hooks.processPetMiniAppAction(db, owner, user, body, token);
  }
  const pet = await hooks.getPetProfile(db, owner);
  return hooks.processPetMiniAppAction(db, owner, user, {
    displayed_pet_id: pet?.pet_id || null,
    ...body,
  }, token);
}
