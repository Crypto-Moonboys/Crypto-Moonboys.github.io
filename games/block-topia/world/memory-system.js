export function createMemorySystem(state) {
  function record(type, message) {
    state.memory.log.unshift({ at: new Date().toISOString(), type, message });
    if (state.memory.log.length > 200) {
      state.memory.log.length = 200;
    }

    if (type === 'district') state.memory.districtChanges.unshift(message);
    if (type === 'sam') state.memory.samEvents.unshift(message);
    if (type === 'player') state.memory.playerActions.unshift(message);
  }

  return { record };
}
