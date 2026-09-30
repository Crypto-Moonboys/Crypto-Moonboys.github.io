// D1 can resolve an unsuccessful query instead of rejecting its promise.
// A failed/malformed read is never evidence of empty saved player state.
export function requirePetReadResult(result) {
  if (result?.success === false || !Array.isArray(result?.results)) {
    throw new Error('pet_state_read_unavailable', {
      cause: typeof result?.error === 'string' ? new Error(result.error) : undefined,
    });
  }
  return result;
}

export function requirePetFirstReadResult(result) {
  if (result?.success === false) throw new Error('pet_state_read_unavailable');
  return result;
}
