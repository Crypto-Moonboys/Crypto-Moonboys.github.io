import { createSignalQuestGenerator } from './signal-quest-generator.js';

export function createQuestSystem(state, liveIntelligence = null) {
  const QUEST_PULSE_INTERVAL_SECONDS = 20;
  const MAX_SIGNAL_QUEST_CARDS = 2;
  const capitalize = (text) => (text || '').replace(/^./, (char) => char.toUpperCase());
  const signalQuestGenerator = createSignalQuestGenerator(state, liveIntelligence);

  state.quests.active = [
    ...state.quests.model.daily.slice(0, 2),
    ...state.quests.model.weekly.slice(0, 1),
    ...state.quests.model.seasonal.slice(0, 1),
    ...(state.quests.model.prophecy || []).slice(0, 1),
  ];

  let pulse = 0;

  const QUEST_OBJECTIVES = {
    daily: [
      (d) => `Patrol the grid in ${d} — intercept 3 faction couriers before phase end`,
      (d) => `Scan signal nodes in ${d} · collect relay fragments and report anomalies`,
      (d) => `Secure 2 control points in ${d} before the next SAM cycle sweep`,
      (d) => `Mark all contested blocks in ${d} · avoid SAM detection zones`,
      (d) => `Disrupt faction supply lines running through ${d} — 4 routes to close`,
      (d) => `Shadow an Agent in ${d} and track their drop points to the Warden cache`,
    ],
    weekly: [
      (d) => `Monitor SAM broadcast patterns across ${d} for 5 consecutive cycles`,
      (d) => `Shift the faction balance in ${d} — hold 4 districts through this rotation`,
      (d) => `Execute the relay sweep through all contested zones in ${d} this week`,
      (d) => `Hold ground in ${d} — prevent signal node loss for 3 full night phases`,
      (d) => `Coordinate with 2 faction recruits in ${d} to push control above 75%`,
    ],
    seasonal: [
      (d) => `Drive the season arc — bring faction war to critical stage in ${d}`,
      (d) => `Shape the power balance in ${d} before the season resets next cycle`,
      (d) => `Push ${d} to full capture threshold before the season archive closes`,
      (d) => `Seal 3 memory fragments in ${d} before the seasonal wipe clears them`,
    ],
    prophecy: [
      () => `The city remembers — find what was buried before the signals fell silent`,
      () => `Follow the old relay path before the next SAM cycle wipes the trail`,
      () => `The Watcher spoke of this — decode the signal pattern before the next dawn`,
      () => `Beneath Revolt Plaza a cache waits — reach it before the Wardens do`,
    ],
  };

  function buildObjective(quest) {
    if (quest.description) return quest.description;
    const pool = QUEST_OBJECTIVES[quest.type];
    if (pool && pool.length > 0) {
      const seed = quest.id
        ? quest.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
        : 0;
      return pool[seed % pool.length](state.player.districtName || 'the district');
    }
    const typeHint = (quest.type || 'daily');
    return `Complete ${capitalize(typeHint)} operation in ${state.player.districtName || 'the district'}`;
  }

  function getActiveQuestCards() {
    const baseCards = state.quests.active.map((quest) => ({
      id: quest.id,
      title: quest.title,
      type: quest.type,
      xp: quest.xp,
      objective: buildObjective(quest),
    }));
    const signalCards = signalQuestGenerator
      .buildSignalQuestCards(MAX_SIGNAL_QUEST_CARDS)
      .filter((card) => !card?.expiresAt || Date.parse(card.expiresAt) > Date.now());
    return baseCards.concat(signalCards);
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

    const livePulses = liveIntelligence?.getQuestPulses?.(1) || [];
    if (livePulses.length) {
      hooks.onQuestPulse?.(livePulses[0]);
    }
  }

  return {
    getActiveQuestCards,
    completeQuest,
    tick,
  };
}
