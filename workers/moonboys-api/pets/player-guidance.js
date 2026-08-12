const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

export const PET_GUIDANCE_PRIORITY = deepFreeze({
  evolution_ready: 100,
  season_reward: 90,
  personality: 80,
  achievement: 70,
  feature: 60,
  job: 50,
  shop: 40,
});

function positiveInteger(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export function buildPetGuidanceCandidates(state = {}) {
  const candidates = [];
  const evolution = state.evolution || null;
  if (evolution?.ready && evolution.evolution_id) {
    candidates.push({
      key: `evolution-ready:${evolution.evolution_id}`,
      type: 'evolution_ready',
      title: `${evolution.name} evolution is ready`,
      detail: 'All requirements are complete. Evolve now to unlock its new content and power.',
      callback_data: 'pet:evolve',
    });
  }
  for (const tier of state.season?.tiers || []) {
    if (!tier.unlocked || tier.claimed_at) continue;
    candidates.push({
      key: `season-ready:${state.season.key}:${tier.tier_id}`,
      type: 'season_reward',
      title: `${tier.title} is ready to claim`,
      detail: `${positiveInteger(tier.required_xp)} season XP milestone reached.`,
      callback_data: `pet:season:claim:${tier.tier_id}`,
    });
  }
  for (const trait of state.personalities || []) {
    if (!trait?.unlocked_at || !trait.trait_id) continue;
    candidates.push({
      key: `personality:${trait.trait_id}`,
      type: 'personality',
      title: `Personality unlocked: ${trait.name || trait.trait_id}`,
      detail: 'Your Moonpet now uses this trait in reactions and compatible encounters.',
      callback_data: 'pet:identity:personality',
    });
  }
  for (const achievement of state.achievements || []) {
    if (!achievement?.unlocked_at || !achievement.achievement_id) continue;
    candidates.push({
      key: `achievement:${achievement.achievement_id}`,
      type: 'achievement',
      title: `Achievement unlocked: ${achievement.title || achievement.achievement_id}`,
      detail: achievement.description || 'A permanent Moonpet achievement was added to your record.',
      callback_data: 'pet:achievements',
    });
  }
  for (const feature of state.features || []) {
    if (!feature?.key || !feature.available) continue;
    candidates.push({
      key: `feature:${feature.key}`,
      type: 'feature',
      title: `${feature.title} unlocked`,
      detail: feature.detail || 'A new Moonpet activity is now available.',
      callback_data: feature.callback_data || 'pet:coach',
    });
  }
  for (const job of state.jobs || []) {
    if (!job?.key || !job.available) continue;
    candidates.push({
      key: `job:${job.key}`,
      type: 'job',
      title: `New job available: ${job.title}`,
      detail: `Requires Level ${positiveInteger(job.min_level)} and evolution stage ${positiveInteger(job.min_evolution_stage)}.`,
      callback_data: 'pet:work',
    });
  }
  for (const item of state.shop_items || []) {
    if (!item?.key || !item.unlocked) continue;
    candidates.push({
      key: `shop:${item.key}`,
      type: 'shop',
      title: `Shop upgrade unlocked: ${item.title}`,
      detail: item.affordable ? 'You can afford it now.' : 'It is available once you collect the listed currency.',
      callback_data: 'pet:shop',
    });
  }
  return candidates.sort((left, right) => (PET_GUIDANCE_PRIORITY[right.type] || 0) - (PET_GUIDANCE_PRIORITY[left.type] || 0));
}

function missionAction(mission = {}) {
  const key = `${mission.key || ''} ${mission.title || ''}`.toLowerCase();
  if (key.includes('feed')) return { label: '🍖 Feed Now', callback_data: 'pet:feed' };
  if (key.includes('train')) return { label: '🏋️ Train Now', callback_data: 'pet:train' };
  if (key.includes('trade')) return { label: '💱 Open Trade', callback_data: 'pet:trade' };
  if (key.includes('shop') || key.includes('buy') || key.includes('equip')) return { label: '🛒 Open Shop', callback_data: 'pet:shop' };
  if (key.includes('adventure') || key.includes('run')) return { label: '🏃 Start Moon Run', callback_data: 'pet:run' };
  return { label: '🎯 View Missions', callback_data: 'pet:missions' };
}

export function choosePetNextAction(state = {}) {
  const pet = state.pet || null;
  if (!pet) return null;
  if (state.activity) {
    return state.activity.ready
      ? { key: 'claim_activity', title: 'Claim the finished activity', detail: 'Rewards are ready now.', label: '🎁 Claim', callback_data: 'pet:claim' }
      : { key: 'activity_running', title: `Let ${pet.pet_name || 'Moonpet'} finish ${state.activity.activity_type || 'the activity'}`, detail: state.activity.detail || 'Return when the claim timer is ready.', label: '⏱ Check Activity', callback_data: 'pet:activity' };
  }
  if (state.active_run) {
    const runId = String(state.active_run.run_id || '');
    if (state.active_run.status === 'extractable' && runId) {
      return { key: 'extract-run', title: 'Bank your Moon Run rewards', detail: 'The current run can be safely extracted now.', label: '🏦 Extract', callback_data: `pet:run:${runId}:extract` };
    }
    return { key: 'continue-run', title: 'Continue your active Moon Run', detail: 'Resolve the current route before starting another grind.', label: '🏃 Continue Run', callback_data: 'pet:run' };
  }
  if (positiveInteger(pet.health) <= 45) return { key: 'health', title: 'Stabilise health first', detail: 'Feed, clean, rest and play before taking risks.', label: '📋 Check Needs', callback_data: 'pet:details' };
  if (positiveInteger(pet.hunger) >= 75) return { key: 'feed', title: 'Feed your Moonpet', detail: 'Hunger is high and will drag health down.', label: '🍖 Feed Now', callback_data: 'pet:feed' };
  if (positiveInteger(pet.cleanliness) <= 35) return { key: 'clean', title: 'Clean your Moonpet', detail: 'Cleanliness is low and needs attention.', label: '🧼 Clean Now', callback_data: 'pet:clean' };
  if (positiveInteger(pet.energy) <= 25) return { key: 'sleep', title: 'Restore energy', detail: 'Sleep before training, boss fights or Moon Runs.', label: '😴 Sleep Now', callback_data: 'pet:sleep' };
  if (positiveInteger(pet.happiness) <= 35) return { key: 'play', title: 'Raise happiness', detail: 'A quick play session is the best move.', label: '🎮 Play Now', callback_data: 'pet:play' };
  const readyTier = (state.season?.tiers || []).find((tier) => tier.unlocked && !tier.claimed_at);
  if (readyTier) return { key: `season:${readyTier.tier_id}`, title: `Claim ${readyTier.title}`, detail: 'This reward is unlocked and waiting.', label: '🎁 Claim Reward', callback_data: `pet:season:claim:${readyTier.tier_id}` };
  if (state.evolution?.ready) return { key: 'evolve', title: `Evolve into ${state.evolution.name}`, detail: 'Every requirement is complete; this unlocks the next content tier.', label: '🧬 Evolve Now', callback_data: 'pet:evolve' };
  if (state.evolution && Array.isArray(state.evolution.missing) && state.evolution.missing.length) {
    const missing = state.evolution.missing[0];
    return { key: `evolution-grind:${missing.key || 'requirement'}`, title: `Work toward ${state.evolution.name}`, detail: `${missing.label}: ${positiveInteger(missing.current)}/${positiveInteger(missing.required)}. ${missing.source || 'Keep progressing to obtain it.'}`, label: missing.callback_data?.includes('boss') ? '👑 Fight Boss' : '🏃 Start Moon Run', callback_data: missing.callback_data || 'pet:run' };
  }
  const economyAction = [...(state.economy_actions || [])]
    .filter((entry) => entry?.callback_data)
    .sort((left, right) => positiveInteger(right.priority) - positiveInteger(left.priority))[0];
  if (economyAction && positiveInteger(economyAction.priority) >= 80) return economyAction;
  const mission = (state.missions || []).find((entry) => !entry.completed);
  if (mission) return { key: `mission:${mission.key}`, title: mission.title, detail: 'Complete this next to advance today’s mission set.', ...missionAction(mission) };
  if (state.weekly_boss?.available) return { key: 'weekly-boss', title: `Use today’s attack on ${state.weekly_boss.title || 'the Weekly Boss'}`, detail: 'One attempt is available before the UTC reset.', label: '👑 Weekly Boss', callback_data: 'pet:boss' };
  if (economyAction) return economyAction;
  const upgrade = (state.shop_items || []).find((item) => item.unlocked && item.affordable && !item.equipped);
  if (upgrade) return { key: `buy:${upgrade.key}`, title: `Equip ${upgrade.title}`, detail: 'You already have enough currency for this upgrade.', label: '🛒 Open Shop', callback_data: 'pet:shop' };
  return { key: 'timed-work', title: 'Start a timed activity', detail: 'Timed work builds resources while you are away.', label: '⏱ Activities', callback_data: 'pet:activity' };
}

export function mergePetGuidanceReplyMarkup(replyMarkup = null, nextAction = null) {
  const existing = Array.isArray(replyMarkup?.inline_keyboard) ? replyMarkup.inline_keyboard : [];
  if (!nextAction?.callback_data) return { inline_keyboard: existing };
  const guidanceRow = [
    { text: nextAction.label || '🧭 Next Move', callback_data: nextAction.callback_data },
    { text: '🧭 Coach', callback_data: 'pet:coach' },
  ];
  const duplicate = existing.some((row) => row.some((button) => button.callback_data === nextAction.callback_data));
  return { inline_keyboard: [duplicate ? [{ text: '🧭 Coach', callback_data: 'pet:coach' }] : guidanceRow, ...existing] };
}
