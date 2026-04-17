export function createQuestSystem(state) {
  const QUEST_PULSE_INTERVAL_SECONDS = 20;

  state.quests.active = [
    ...state.quests.model.daily.slice(0, 2),
    ...state.quests.model.weekly.slice(0, 1),
    ...state.quests.model.seasonal.slice(0, 1),
    ...(state.quests.model.prophecy || []).slice(0, 1),
  ];

  let pulse = 0;

  function getActiveQuestCards() {
    return state.quests.active.map((quest) => ({
      id: quest.id,
      title: quest.title,
      type: quest.type,
      xp: quest.xp,
      objective: `Objective: complete ${(quest.type || 'daily').replace(/^./, (ch) => ch.toUpperCase())} operation in ${state.player.districtName} · Reward: +${quest.xp} XP`,
    }));
  }

  /**
   * Complete a quest by id (or by server push).
   * Removes quest from active list, records memory, and returns awarded XP.
   * Does NOT apply XP/score to state directly — caller must use awardXp() so
   * XP is incremented exactly once (avoids double-counting when main.js calls
   * awardXp after this function returns).
   */
  function completeQuest(questId, xpOverride) {
    const questIndex = state.quests.active.findIndex((q) => q.id === questId);
    if (questIndex === -1) return null;
    const quest = state.quests.active[questIndex];
    const awarded = xpOverride ?? quest.xp ?? 0;
    state.quests.active.splice(questIndex, 1);
    state.memory.playerActions.unshift({ at: Date.now(), action: `quest_complete:${quest.id}` });
    return { awarded, quest };
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
    completeQuest,
    tick,
  };
}
