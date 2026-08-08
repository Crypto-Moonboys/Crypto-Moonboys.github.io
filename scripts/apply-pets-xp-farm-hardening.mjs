import fs from 'node:fs';

const workerPath = 'workers/moonboys-api/worker.js';
const testPath = 'scripts/telegram-pets-api.test.mjs';
let worker = fs.readFileSync(workerPath, 'utf8');
let test = fs.readFileSync(testPath, 'utf8');

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one anchor, found ${count}`);
  return source.replace(before, after);
}

worker = replaceOnce(
  worker,
  "const PETS_ACTION_COOLDOWN_SECONDS = 45;\n",
  `const PETS_ACTION_COOLDOWN_SECONDS = 45;\nconst PET_REPEAT_REWARD_RULES = Object.freeze({\n  event: Object.freeze({ full_rewarded: 6, reduced_rewarded: 10, reduced_multiplier: 0.5 }),\n  kaiju: Object.freeze({ full_rewarded: 5, reduced_rewarded: 10, reduced_multiplier: 0.5 }),\n});\n`,
  'repeat reward constants',
);

worker = replaceOnce(
  worker,
  `function clampPetCurrency(value) {\n  return Math.max(0, Math.min(999999, Math.floor(Number(value) || 0)));\n}\n\nfunction getPetLevel(petXp) {`,
  `function clampPetCurrency(value) {\n  return Math.max(0, Math.min(999999, Math.floor(Number(value) || 0)));\n}\n\nfunction getPetRepeatRewardMultiplier(mode, completedToday) {\n  const rule = PET_REPEAT_REWARD_RULES[String(mode || '').trim().toLowerCase()];\n  if (!rule) return 1;\n  const completed = Math.max(0, Math.floor(Number(completedToday) || 0));\n  if (completed < rule.full_rewarded) return 1;\n  if (completed < rule.reduced_rewarded) return rule.reduced_multiplier;\n  return 0;\n}\n\nasync function getPetDailyRepeatCompletionCount(db, telegramId, dayKey, mode) {\n  const id = String(telegramId || '').trim();\n  const day = String(dayKey || '').trim();\n  if (!id || !day) return 0;\n  let row = null;\n  if (mode === 'event') {\n    row = await db.prepare(\`SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id = ? AND day_key = ? AND event_type = 'random_event' AND status = 'accepted'\`).bind(id, day).first().catch(() => null);\n  } else if (mode === 'kaiju') {\n    row = await db.prepare(\`SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id = ? AND day_key = ? AND event_type LIKE 'kaiju_%' AND status = 'accepted'\`).bind(id, day).first().catch(() => null);\n  }\n  return Math.max(0, Math.floor(Number(row?.count) || 0));\n}\n\nfunction scalePetRewardRange(value, multiplier) {\n  const scale = Math.max(0, Math.min(1, Number(multiplier) || 0));\n  if (Array.isArray(value)) return value.map((entry) => Math.max(0, Math.floor((Number(entry) || 0) * scale)));\n  return Math.max(0, Math.floor((Number(value) || 0) * scale));\n}\n\nfunction scalePetRandomEventRewards(rewards = {}, multiplier = 1) {\n  return Object.fromEntries(Object.entries(rewards || {}).map(([key, value]) => [key, scalePetRewardRange(value, multiplier)]));\n}\n\nfunction getPetHighLevelGearXpMultiplier(pet) {\n  const level = getPetLevel(pet?.pet_xp);\n  if (level <= 35) return 1;\n  if (level <= 50) return 0.6;\n  return 0.35;\n}\n\nfunction getPetLevel(petXp) {`,
  'repeat reward helpers',
);

const oldBonusFunction = `function applyPetItemActionBonuses(pet, action, rule, rewards) {\n  const food = getPetEquippedItem(pet, 'food');\n  const toy = getPetEquippedItem(pet, 'toy');\n  const outfit = getPetEquippedItem(pet, 'outfit');\n\n  if (action === 'feed' && food?.key === 'moon_kibble') {\n    rule.hunger -= 12;\n    rewards.pet_xp += 4;\n  }\n  if (action === 'feed' && food?.key === 'crystal_bowl') {\n    rule.hunger -= 32;\n    rule.energy += 10;\n    rewards.pet_xp += 18;\n  }\n  if (action === 'feed' && food?.key === 'nebula_snack') {\n    rule.hunger -= 22;\n    rule.energy += 6;\n    rewards.pet_xp += 10;\n  }\n  if (action === 'play' && toy?.key === 'laser_ball') {\n    rule.happiness += 10;\n    rewards.pet_xp += 5;\n  }\n  if (action === 'play' && toy?.key === 'hoverboard') {\n    rule.happiness += 16;\n    rewards.pet_xp += 8;\n    rewards.moon_gold += 2;\n  }\n  if (outfit?.key === 'street_hoodie') {\n    rewards.pet_xp += 2;\n  }\n  if (outfit?.key === 'moon_armor') {\n    rewards.pet_xp += 5;\n    rewards.moon_gold += 1;\n  }\n  if (['feed', 'play', 'clean', 'sleep', 'train'].includes(action) && outfit?.key === 'crown_jacket') {\n    rewards.pet_xp += 8;\n    rewards.moon_gold += 2;\n    rewards.style_tokens += 1;\n  }\n}\n`;
const newBonusFunction = `function applyPetItemActionBonuses(pet, action, rule, rewards) {\n  const food = getPetEquippedItem(pet, 'food');\n  const toy = getPetEquippedItem(pet, 'toy');\n  const outfit = getPetEquippedItem(pet, 'outfit');\n  const basePetXp = Math.max(0, Math.floor(Number(rewards.pet_xp) || 0));\n\n  if (action === 'feed' && food?.key === 'moon_kibble') {\n    rule.hunger -= 12;\n    rewards.pet_xp += 4;\n  }\n  if (action === 'feed' && food?.key === 'crystal_bowl') {\n    rule.hunger -= 32;\n    rule.energy += 10;\n    rewards.pet_xp += 18;\n  }\n  if (action === 'feed' && food?.key === 'nebula_snack') {\n    rule.hunger -= 22;\n    rule.energy += 6;\n    rewards.pet_xp += 10;\n  }\n  if (action === 'play' && toy?.key === 'laser_ball') {\n    rule.happiness += 10;\n    rewards.pet_xp += 5;\n  }\n  if (action === 'play' && toy?.key === 'hoverboard') {\n    rule.happiness += 16;\n    rewards.pet_xp += 8;\n    rewards.moon_gold += 2;\n  }\n  if (outfit?.key === 'street_hoodie') {\n    rewards.pet_xp += 2;\n  }\n  if (outfit?.key === 'moon_armor') {\n    rewards.pet_xp += 5;\n    rewards.moon_gold += 1;\n  }\n  if (['feed', 'play', 'clean', 'sleep', 'train'].includes(action) && outfit?.key === 'crown_jacket') {\n    rewards.pet_xp += 8;\n    rewards.moon_gold += 2;\n    rewards.style_tokens += 1;\n  }\n\n  const gearBonusXp = Math.max(0, Math.floor(Number(rewards.pet_xp) || 0) - basePetXp);\n  if (gearBonusXp > 0) {\n    const multiplier = getPetHighLevelGearXpMultiplier(pet);\n    rewards.pet_xp = basePetXp + Math.floor(gearBonusXp * multiplier);\n  }\n}\n`;
worker = replaceOnce(worker, oldBonusFunction, newBonusFunction, 'high-level gear XP scaling');

worker = replaceOnce(
  worker,
  `  const outcome = pickPetRandomEventOutcome(choice);\n  const totals = await getPetWindowTotals(db, telegramId, dayKey, weekKey);\n  const petXpAwarded = Math.min(PETS_DAILY_PET_XP_CAP, Math.max(0, rollPetRange(outcome.rewards.pet_xp, 0)));\n  const applied = applyPetRandomEventDeltas(\n    pet,\n    { ...outcome.rewards, pet_xp: petXpAwarded },\n    outcome.costs,\n  );`,
  `  const outcome = pickPetRandomEventOutcome(choice);\n  const totals = await getPetWindowTotals(db, telegramId, dayKey, weekKey);\n  const eventCompletionCount = await getPetDailyRepeatCompletionCount(db, telegramId, dayKey, 'event');\n  const eventRewardMultiplier = getPetRepeatRewardMultiplier('event', eventCompletionCount);\n  const eventRewards = scalePetRandomEventRewards(outcome.rewards, eventRewardMultiplier);\n  const petXpAwarded = Math.min(PETS_DAILY_PET_XP_CAP, Math.max(0, rollPetRange(eventRewards.pet_xp, 0)));\n  const applied = applyPetRandomEventDeltas(\n    pet,\n    { ...eventRewards, pet_xp: petXpAwarded },\n    outcome.costs,\n  );`,
  'event diminishing rewards',
);

worker = replaceOnce(
  worker,
  `  let petXp = Math.max(0, Math.floor(Number(rewards.pet_xp || 0)));\n  let communityXp = Math.max(0, Math.floor(Number(rewards.community_xp || 0)));\n  if (totals.day.pet_xp >= PETS_DAILY_PET_XP_CAP) petXp = 0;`,
  `  const kaijuCompletionCount = await getPetDailyRepeatCompletionCount(db, telegramId, dayKey, 'kaiju');\n  let kaijuRewardMultiplier = getPetRepeatRewardMultiplier('kaiju', kaijuCompletionCount);\n  const energyCost = Math.max(0, Math.floor(Number(rewards.energy_cost || 0)));\n  const hasRewardEnergy = Math.max(0, Math.floor(Number(pet.energy) || 0)) >= energyCost;\n  if (!hasRewardEnergy) kaijuRewardMultiplier = 0;\n  let petXp = Math.floor(Math.max(0, Number(rewards.pet_xp || 0)) * kaijuRewardMultiplier);\n  let communityXp = Math.floor(Math.max(0, Number(rewards.community_xp || 0)) * kaijuRewardMultiplier);\n  if (totals.day.pet_xp >= PETS_DAILY_PET_XP_CAP) petXp = 0;`,
  'kaiju reward budget and energy gate',
);

worker = replaceOnce(
  worker,
  `  pet.moon_gold = clampPetCurrency(Number(pet.moon_gold || 0) + Math.max(0, Number(rewards.moon_gold || 0)));\n  pet.style_tokens = clampPetCurrency(Number(pet.style_tokens || 0) + Math.max(0, Number(rewards.style_tokens || 0)));\n  pet.happiness = clampPetStat(Number(pet.happiness || 0) + Math.max(0, Number(rewards.happiness || 0)));\n  pet.energy = clampPetStat(Number(pet.energy || 0) - Math.max(0, Number(rewards.energy_cost || 0)));`,
  `  pet.moon_gold = clampPetCurrency(Number(pet.moon_gold || 0) + Math.floor(Math.max(0, Number(rewards.moon_gold || 0)) * kaijuRewardMultiplier));\n  pet.style_tokens = clampPetCurrency(Number(pet.style_tokens || 0) + Math.floor(Math.max(0, Number(rewards.style_tokens || 0)) * kaijuRewardMultiplier));\n  pet.happiness = clampPetStat(Number(pet.happiness || 0) + Math.floor(Math.max(0, Number(rewards.happiness || 0)) * kaijuRewardMultiplier));\n  if (hasRewardEnergy) pet.energy = clampPetStat(Number(pet.energy || 0) - energyCost);`,
  'kaiju scaled non-XP rewards',
);

const testMarker = "console.log('telegram-pets-api.test.mjs passed');";
const guardAssertions = `\n// XP-farm hardening regression guards.\nassert.ok(worker.includes('PET_REPEAT_REWARD_RULES'), 'repeatable pet modes must define daily rewarded-completion budgets');\nassert.ok(worker.includes("full_rewarded: 6, reduced_rewarded: 10"), 'random events must diminish after six rewarded completions');\nassert.ok(worker.includes("full_rewarded: 5, reduced_rewarded: 10"), 'Kaiju must diminish after five rewarded completions');\nassert.ok(worker.includes("getPetDailyRepeatCompletionCount(db, telegramId, dayKey, 'event')"), 'random events must count same-day completions before rewards');\nassert.ok(worker.includes("getPetDailyRepeatCompletionCount(db, telegramId, dayKey, 'kaiju')"), 'Kaiju must count same-day completions before rewards');\nassert.ok(worker.includes('if (!hasRewardEnergy) kaijuRewardMultiplier = 0'), 'Kaiju must not award progression when the pet cannot pay the energy cost');\nassert.ok(worker.includes('getPetHighLevelGearXpMultiplier'), 'high-level gear XP must use a progression multiplier');\nassert.ok(worker.includes('if (level <= 35) return 1') && worker.includes('if (level <= 50) return 0.6') && worker.includes('return 0.35'), 'gear XP scaling must preserve early progression and taper after level 35');\n\n`;
if (!test.includes('XP-farm hardening regression guards.')) {
  test = replaceOnce(test, testMarker, guardAssertions + testMarker, 'test guard insertion');
}

fs.writeFileSync(workerPath, worker);
fs.writeFileSync(testPath, test);
console.log('Applied Crypto Moonboy Pets XP-farm hardening.');
