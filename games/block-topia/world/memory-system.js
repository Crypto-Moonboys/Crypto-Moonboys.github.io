export function createMemorySystem(state) {
  const MAX_MEMORY = 100;

  function pushWithLimit(arr, item) {
    arr.unshift(item);
    if (arr.length > MAX_MEMORY) arr.pop();
  }

  function record(type, message) {
    pushWithLimit(state.memory.log, { at: Date.now(), type, message });

    if (type === 'district') pushWithLimit(state.memory.districtChanges, message);
    if (type === 'sam') pushWithLimit(state.memory.samEvents, message);
    if (type === 'player') pushWithLimit(state.memory.playerActions, message);
  }

  return { record };
}
