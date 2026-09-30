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
  if (result?.success === false) {
    throw new Error('pet_state_read_unavailable', {
      cause: typeof result?.error === 'string' ? new Error(result.error) : undefined,
    });
  }
  return result;
}

// D1 mutations can use the same resolved-failure shape as reads. A failed
// write is not a duplicate, stale request or successful no-op.
export function requirePetMutationResult(result) {
  if (result?.success === false) {
    throw new Error('pet_state_write_unavailable', {
      cause: typeof result?.error === 'string' ? new Error(result.error) : undefined,
    });
  }
  return result;
}
