// Only use this after the action's durable receipt/mutation has committed.
// A later display read or recoverable follow-up cannot undo that saved result.
export async function projectCommittedPetResult(result, project) {
  try {
    return await project();
  } catch (error) {
    if (result?.accepted !== true) throw error;
    return { ...result, refresh_state: true };
  }
}
