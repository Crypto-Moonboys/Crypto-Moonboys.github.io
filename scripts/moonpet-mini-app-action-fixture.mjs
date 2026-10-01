import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';

// Model a current client request using the pet rendered before dispatch.
// Explicit IDs, including null/empty ones, must never be repaired.
// Missing-ID regressions call the real dispatcher directly.
// HTTP/browser request handlers call the real dispatcher directly.
export async function dispatchRenderedPetAction(db, owner, user, body, token) {
  if (Object.hasOwn(body, 'displayed_pet_id')) {
    return hooks.processPetMiniAppAction(db, owner, user, body, token);
  }
  const pet = await hooks.getPetProfile(db, owner);
  return hooks.processPetMiniAppAction(db, owner, user, {
    displayed_pet_id: pet?.pet_id || null,
    ...body,
  }, token);
}
