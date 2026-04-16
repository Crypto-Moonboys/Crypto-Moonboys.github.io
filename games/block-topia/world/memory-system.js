export function createMemorySystem(state) {
  const MAX_MEMORY_LOG_SIZE = 200;

  function record(type, message) {
    state.memory.log.unshift({ at: Date.now(), type, message });
    if (state.memory.log.length > MAX_MEMORY_LOG_SIZE) {
      state.memory.log.length = MAX_MEMORY_LOG_SIZE;
    }

    if (type === 'district') state.memory.districtChanges.unshift(message);
    if (type === 'sam') state.memory.samEvents.unshift(message);
    if (type === 'player') state.memory.playerActions.unshift(message);
  }

  return { record };
}
