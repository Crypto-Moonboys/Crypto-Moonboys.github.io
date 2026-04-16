export function createQuestSystem(state) {
  const QUEST_PULSE_INTERVAL_SECONDS = 20;
  state.quests.active = [
    ...state.quests.model.daily.slice(0, 2),
    ...state.quests.model.weekly.slice(0, 1),
    ...state.quests.model.seasonal.slice(0, 1),
  ];

  let pulse = 0;

  function getActiveQuestCards() {
    return state.quests.active.map((quest) => `${quest.title} (${quest.type})`);
  }

  function tick(dt, hooks = {}) {
    pulse += dt;
    if (pulse < QUEST_PULSE_INTERVAL_SECONDS) return;
    pulse = 0;

    const dynamic = state.quests.model.dynamicHooks?.[0];
    if (dynamic) {
      hooks.onQuestPulse?.(`${dynamic.id}: ${dynamic.description}`);
    }
  }

  return {
    getActiveQuestCards,
    tick,
  };
}
