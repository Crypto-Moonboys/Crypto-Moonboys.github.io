export function createQuestSystem(state) {
  const QUEST_PULSE_INTERVAL_SECONDS = 20;
  const capitalize = (text) => (text || '').replace(/^./, (ch) => ch.toUpperCase());

  state.quests.active = [
    ...state.quests.model.daily.slice(0, 2),
    ...state.quests.model.weekly.slice(0, 1),
    ...state.quests.model.seasonal.slice(0, 1),
    ...(state.quests.model.prophecy || []).slice(0, 1),
  ];

  let pulse = 0;

  const TYPE_OBJECTIVE = {
    daily: 'Complete today\'s mission',
    weekly: 'Complete this week\'s operation',
    seasonal: 'Progress the season arc',
    prophecy: 'Fulfill the prophecy arc',
  };

  function buildObjective(quest) {
    // Prefer explicit description (prophecy quests carry one), then type hint,
    // then a district-scoped fallback so every card always has visible text.
    if (quest.description) return quest.description;
    const hint = TYPE_OBJECTIVE[quest.type] || `Complete ${capitalize(quest.type || 'daily')} operation`;
    return `${hint} in ${state.player.districtName} · +${quest.xp} XP`;
  }

  function getActiveQuestCards() {
    return state.quests.active.map((quest) => ({
      id: quest.id,
      title: quest.title,
      type: quest.type,
      xp: quest.xp,
      objective: buildObjective(quest),
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
