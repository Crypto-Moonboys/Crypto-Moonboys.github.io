export function createNpcSystem(state) {
  const factionPool = ['Liberators', 'Wardens', 'Neutral'];

  if (state.npc.entities.length === 0) {
    for (let activeIndex = 0; activeIndex < state.npc.activeTarget; activeIndex += 1) {
      state.npc.entities.push({
        id: `active-${activeIndex}`,
        role: state.npc.archetypes[activeIndex % state.npc.archetypes.length]?.id || 'drifter',
        mode: 'active',
        faction: factionPool[activeIndex % factionPool.length],
        memoryHooks: [],
        dialogueHooks: [],
        routine: 'district_patrol',
      });
    }

    for (let crowdIndex = 0; crowdIndex < state.npc.crowdTarget; crowdIndex += 1) {
      state.npc.entities.push({
        id: `crowd-${crowdIndex}`,
        role: 'crowd',
        mode: 'crowd',
        faction: 'Neutral',
        memoryHooks: [],
        dialogueHooks: [],
        routine: 'ambient_flow',
      });
    }
  }

  function tick() {
    if (state.npc.entities.length === 0) return;

    const sample = state.npc.entities[Math.floor(Math.random() * state.npc.entities.length)];
    if (!sample) return;

    sample.dialogueHooks = ['react_to_player_presence', 'district_rumor_ping'];
    sample.memoryHooks = ['track_faction_shift', 'track_daily_routine'];

    if (sample.mode === 'active' && Math.random() < 0.005) {
      sample.faction = sample.faction === 'Liberators' ? 'Wardens' : 'Liberators';
    }
  }

  return { tick };
}
