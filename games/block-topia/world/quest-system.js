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

  const QUEST_OBJECTIVES = {
    daily: [
      (d) => `Patrol ${d} — report faction movement at signal nodes`,
      (d) => `Scan the grid in ${d} · collect 3 relay fragments`,
      (d) => `Secure control points in ${d} before the next phase shift`,
      (d) => `Mark contested blocks in ${d} · avoid SAM sweeps`,
      (d) => `Intercept faction couriers operating through ${d}`,
    ],
    weekly: [
      (d) => `Track SAM activity across ${d} for 5 consecutive cycles`,
      (d) => `Shift the faction balance in ${d} — hold 4 districts this rotation`,
      (d) => `Complete the relay sweep through all contested zones`,
      (d) => `Hold ground in ${d} — prevent loss of key signal nodes`,
    ],
    seasonal: [
      (d) => `Advance the season arc — faction war reaches critical stage in ${d}`,
      (d) => `Shape the power balance in ${d} before the season resets`,
      (d) => `Push ${d} to capture threshold before the season closes`,
    ],
    prophecy: [
      () => `The city remembers — find what was buried before signals fell silent`,
      () => `Follow the old relay path before the next SAM cycle wipes it`,
      () => `The Watcher spoke of this — decode the signal pattern before dawn`,
    ],
  };

  function buildObjective(quest) {
    if (quest.description) return quest.description;
    const pool = QUEST_OBJECTIVES[quest.type];
    if (pool && pool.length > 0) {
      // Deterministic pick based on quest id so the same quest always shows the same objective.
      const seed = quest.id
        ? quest.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
        : 0;
      return pool[seed % pool.length](state.player.districtName);
    }
    const typeHint = (quest.type || 'daily');
    return `Complete ${capitalize(typeHint)} operation in ${state.player.districtName}`;
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
