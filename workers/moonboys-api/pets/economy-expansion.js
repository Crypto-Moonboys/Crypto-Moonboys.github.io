const freeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};

const integer = (value) => Math.max(0, Math.floor(Number(value) || 0));

function hash(value) {
  let result = 2166136261;
  for (const char of String(value || '')) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

function rotate(pool, seed, count) {
  const copy = [...pool];
  const picked = [];
  let cursor = hash(seed);
  while (copy.length && picked.length < count) {
    const index = cursor % copy.length;
    picked.push(copy.splice(index, 1)[0]);
    cursor = hash(`${cursor}:${seed}:${picked.length}`);
  }
  return picked;
}

export const PET_ECONOMY_ROUTES = freeze([
  { key: 'care', label: 'Care actions', loop: 'earn', currency: 'gold/style', limit: 'action cooldown' },
  { key: 'jobs', label: 'Pet jobs', loop: 'earn', currency: 'gold/crystals/style', limit: 'action cooldown + level/stage gates' },
  { key: 'activities', label: 'Timed activities', loop: 'earn', currency: 'gold/crystals/materials', limit: 'one active timer' },
  { key: 'events', label: 'Random events', loop: 'earn', currency: 'mixed', limit: 'diminishing daily slots' },
  { key: 'runs', label: 'Moon Runs', loop: 'earn', currency: 'mixed/materials', limit: 'energy + bank risk' },
  { key: 'boss', label: 'Weekly Boss', loop: 'earn', currency: 'gold/crystals', limit: 'one attack per UTC day' },
  { key: 'season', label: 'Season rewards', loop: 'earn', currency: 'mixed', limit: 'one claim per tier' },
  { key: 'bounties', label: 'Daily Bounty Board', loop: 'earn', currency: 'gold/crystals/style', limit: 'four verified claims per UTC day' },
  { key: 'expeditions', label: 'Crystal Expeditions', loop: 'earn', currency: 'gold/crystals/materials', limit: 'three attempts per UTC day' },
  { key: 'shop', label: 'Equipment shop', loop: 'spend', currency: 'gold/crystals/style', limit: 'permanent upgrades' },
  { key: 'market', label: 'Moon Market', loop: 'spend', currency: 'gold/crystals/style', limit: 'four rotating one-buy offers per UTC day' },
  { key: 'trade', label: 'Moon Gold trade', loop: 'spend', currency: 'gold', limit: 'risk/reward' },
  { key: 'evolution', label: 'Evolution', loop: 'upgrade', currency: 'XP/items/materials', limit: 'stage requirements' },
  { key: 'gear', label: 'Equipment mastery', loop: 'upgrade', currency: 'gold/materials', limit: 'level ladder' },
  { key: 'unlock', label: 'Level and stage unlocks', loop: 'unlock', currency: 'progress', limit: 'jobs, encounters and rewards' },
]);

export const PET_DAILY_BOUNTIES = freeze([
  { key: 'care_pair', title: 'Care Pair', detail: 'Complete any 2 care actions.', event_types: ['feed', 'play', 'clean', 'sleep', 'train'], required: 2, reward: { moon_gold: 30 } },
  { key: 'triple_care', title: 'Full Care Circuit', detail: 'Complete any 3 care actions.', event_types: ['feed', 'play', 'clean', 'sleep', 'train'], required: 3, reward: { moon_gold: 45, style_tokens: 1 } },
  { key: 'job_shift', title: 'Clock In', detail: 'Complete 1 Pet Job.', event_types: ['work'], required: 1, reward: { moon_gold: 35 } },
  { key: 'job_double', title: 'Double Shift', detail: 'Complete 2 Pet Jobs.', event_types: ['work'], required: 2, reward: { moon_gold: 55, style_tokens: 1 } },
  { key: 'event_scout', title: 'Street Scout', detail: 'Resolve 1 random event.', event_types: ['random_event'], required: 1, reward: { moon_gold: 30, style_tokens: 1 } },
  { key: 'activity_claim', title: 'Patient Worker', detail: 'Claim 1 timed activity.', event_types: ['activity_claim'], required: 1, reward: { moon_gold: 40 } },
  { key: 'run_bank', title: 'Bring It Home', detail: 'Complete or extract 1 Moon Run.', event_types: ['run_complete', 'run_extract', 'adventure'], required: 1, reward: { moon_gold: 55, moon_crystals: 1 } },
  { key: 'arena_card', title: 'Arena Card', detail: 'Complete 1 Arena battle.', event_types: ['arena_battle'], required: 1, reward: { moon_gold: 40, style_tokens: 2 }, min_level: 10 },
  { key: 'kaiju_watch', title: 'Kaiju Watch', detail: 'Complete 1 Kaiju battle.', event_types: ['kaiju_battle'], required: 1, reward: { moon_gold: 45, moon_crystals: 1 } },
  { key: 'item_user', title: 'Prepared Moonpet', detail: 'Use 1 consumable item.', event_types: ['use_item', 'use_item_reward'], required: 1, reward: { moon_gold: 25, style_tokens: 1 } },
]);

export const PET_MARKET_OFFERS = freeze([
  { key: 'snack_crate', title: 'Snack Crate', detail: '3 Moon Snacks for long care streaks.', cost: { moon_gold: 70 }, reward: { items: { moon_snack: 3 } }, min_level: 1 },
  { key: 'clean_kit', title: 'Clean Kit', detail: '3 Clean Wipes for missions and recovery.', cost: { moon_gold: 60 }, reward: { items: { clean_wipe: 3 } }, min_level: 1 },
  { key: 'battery_pack', title: 'Battery Pack', detail: '2 Energy Drinks for runs and bosses.', cost: { moon_gold: 120 }, reward: { items: { energy_drink: 2 } }, min_level: 5 },
  { key: 'runner_bundle', title: 'Runner Bundle', detail: 'An Adventure Map plus Energy Drink.', cost: { moon_gold: 160, style_tokens: 2 }, reward: { items: { adventure_map: 1, energy_drink: 1 } }, min_level: 8 },
  { key: 'fabric_roll', title: 'Moon Fabric Roll', detail: 'Materials for future equipment upgrades.', cost: { moon_gold: 90 }, reward: { materials: { moon_fabric: 3 } }, min_level: 1 },
  { key: 'scrap_box', title: 'Scrap Box', detail: 'Reliable upgrade material without a lucky drop.', cost: { moon_gold: 110 }, reward: { materials: { scrap_metal: 4 } }, min_level: 1 },
  { key: 'cell_case', title: 'Cell Case', detail: 'Battery Cells used by advanced equipment.', cost: { moon_gold: 150 }, reward: { materials: { battery_cell: 3 } }, min_level: 10 },
  { key: 'shard_pouch', title: 'Shard Pouch', detail: 'Crystal Shards for higher upgrade tiers.', cost: { moon_gold: 220 }, reward: { materials: { crystal_shard: 2 } }, min_level: 12 },
  { key: 'style_cache', title: 'Style Cache', detail: 'Convert crystals into cosmetic currency.', cost: { moon_crystals: 3 }, reward: { style_tokens: 12 }, min_level: 8 },
  { key: 'crystal_exchange', title: 'Crystal Exchange', detail: 'A costly direct crystal route, limited to this daily offer.', cost: { moon_gold: 300 }, reward: { moon_crystals: 1 }, min_level: 15 },
  { key: 'lucky_loadout', title: 'Lucky Loadout', detail: 'A Lucky Charm and Style Patch.', cost: { moon_crystals: 2, style_tokens: 8 }, reward: { items: { lucky_charm: 1, style_patch: 1 } }, min_level: 18 },
  { key: 'spray_core', title: 'Spray Core Case', detail: 'Rare style-tech material for advanced gear.', cost: { moon_gold: 240, style_tokens: 4 }, reward: { materials: { spray_core: 2 } }, min_level: 20 },
]);

export const PET_EXPEDITION_TIERS = freeze([
  { key: 'dust_tunnels', title: 'Dust Tunnels', min_level: 1, energy: 12, rewards: [{ moon_gold: 24, materials: { scrap_metal: 1 } }, { moon_gold: 32, style_tokens: 1 }, { moon_gold: 20, moon_crystals: 1 }] },
  { key: 'crystal_caves', title: 'Crystal Caves', min_level: 10, energy: 18, rewards: [{ moon_gold: 34, materials: { crystal_shard: 1 } }, { moon_gold: 42, moon_crystals: 1 }, { moon_gold: 28, materials: { battery_cell: 2 } }] },
  { key: 'guardian_rift', title: 'Guardian Rift', min_level: 25, energy: 24, rewards: [{ moon_gold: 55, moon_crystals: 1 }, { moon_gold: 40, style_tokens: 3, materials: { spray_core: 1 } }, { moon_gold: 30, moon_crystals: 2 }] },
]);

export function getPetDailyBounties(dayKey, level = 1) {
  const unlocked = PET_DAILY_BOUNTIES.filter((bounty) => integer(level) >= integer(bounty.min_level || 1));
  return rotate(unlocked, `bounty:${dayKey}`, Math.min(4, unlocked.length));
}

export function getPetMarketOffers(dayKey, level = 1) {
  const unlocked = PET_MARKET_OFFERS.filter((offer) => integer(level) >= offer.min_level);
  return rotate(unlocked, `market:${dayKey}`, Math.min(4, unlocked.length));
}

export function getPetExpedition(level = 1) {
  return [...PET_EXPEDITION_TIERS].reverse().find((tier) => integer(level) >= tier.min_level) || PET_EXPEDITION_TIERS[0];
}

export function resolvePetExpeditionReward(dayKey, telegramId, attempt, level = 1) {
  const expedition = getPetExpedition(level);
  const rewards = expedition.rewards;
  return { expedition, reward: rewards[hash(`${dayKey}:${telegramId}:${attempt}:${expedition.key}`) % rewards.length] };
}

export function formatPetEconomyValue(value = {}) {
  const labels = { moon_gold: '🪙 gold', moon_crystals: '💎 crystals', style_tokens: '🎨 style' };
  const parts = [];
  for (const [key, label] of Object.entries(labels)) if (integer(value[key])) parts.push(`${integer(value[key])} ${label}`);
  for (const [key, amount] of Object.entries(value.materials || {})) parts.push(`${integer(amount)} ${key.replaceAll('_', ' ')}`);
  for (const [key, amount] of Object.entries(value.items || {})) parts.push(`${integer(amount)} ${key.replaceAll('_', ' ')}`);
  return parts.join(' · ') || 'free';
}

export function buildPetEconomyGuidanceActions(state = {}) {
  const actions = [];
  const claimable = (state.bounties || []).find((entry) => entry.complete && !entry.claimed);
  if (claimable) actions.push({
    key: `bounty:${claimable.key}`, priority: 86, title: `Claim ${claimable.title}`,
    detail: `Completed ${claimable.progress}/${claimable.required}. Reward: ${formatPetEconomyValue(claimable.reward)}.`,
    label: '📜 Claim Bounty', callback_data: `pet:bounty:${claimable.key}`,
  });
  if (integer(state.expedition_attempts_left) > 0 && integer(state.pet?.energy) >= integer(state.expedition?.energy)) actions.push({
    key: 'economy:expedition', priority: 43, title: `Explore ${state.expedition.title}`,
    detail: `${state.expedition_attempts_left}/3 attempts remain today. Costs ${state.expedition.energy} Energy; earns gold and can find crystals or upgrade materials.`,
    label: '⛏️ Expedition', callback_data: 'pet:expedition',
  });
  const affordable = (state.market_offers || []).find((offer) => !offer.purchased && offer.affordable);
  if (affordable) actions.push({
    key: `market:${affordable.key}`, priority: 34, title: `Buy ${affordable.title}`,
    detail: `Cost: ${formatPetEconomyValue(affordable.cost)}. Gives: ${formatPetEconomyValue(affordable.reward)}. Daily stock: 1.`,
    label: '🌙 Moon Market', callback_data: 'pet:market',
  });
  return actions.sort((left, right) => right.priority - left.priority);
}
