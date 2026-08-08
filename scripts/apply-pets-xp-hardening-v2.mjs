import fs from 'node:fs';

const workerPath = 'workers/moonboys-api/worker.js';
const testPath = 'scripts/telegram-pets-api.test.mjs';
let worker = fs.readFileSync(workerPath, 'utf8');
let test = fs.readFileSync(testPath, 'utf8');

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one anchor, found ${count}`);
  return source.replace(before, after);
}

worker = replaceOnce(worker,
`const PETS_ACTION_COOLDOWN_SECONDS = 45;\n`,
`const PETS_ACTION_COOLDOWN_SECONDS = 45;\nconst PET_REPEAT_REWARD_RULES = Object.freeze({\n  event: Object.freeze({ full_rewarded: 6, reduced_rewarded: 10, reduced_multiplier: 0.5 }),\n  kaiju: Object.freeze({ full_rewarded: 5, reduced_rewarded: 10, reduced_multiplier: 0.5 }),\n});\n`,
'add repeat reward rules');

worker = replaceOnce(worker,
`function getPetLevel(petXp) {\n  return Math.max(1, Math.floor((Number(petXp) || 0) / 100) + 1);\n}\n`,
`function getPetRepeatRewardMultiplier(mode, completedToday) {\n  const rule = PET_REPEAT_REWARD_RULES[String(mode || '').trim().toLowerCase()];\n  if (!rule) return 1;\n  const completed = Math.max(0, Math.floor(Number(completedToday) || 0));\n  if (completed < rule.full_rewarded) return 1;\n  if (completed < rule.reduced_rewarded) return rule.reduced_multiplier;\n  return 0;\n}\n\nasync function claimPetRepeatRewardSlot(db, telegramId, dayKey, mode) {\n  const id = String(telegramId || '').trim();\n  const day = String(dayKey || '').trim();\n  const normalizedMode = String(mode || '').trim().toLowerCase();\n  const rule = PET_REPEAT_REWARD_RULES[normalizedMode];\n  if (!id || !day || !rule) return { claimed_count: 0, multiplier: 0 };\n  await db.prepare(\`\n    INSERT INTO telegram_pet_repeat_reward_slots (telegram_id, day_key, mode, claimed_count, updated_at)\n    VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)\n    ON CONFLICT(telegram_id, day_key, mode) DO UPDATE SET\n      claimed_count = claimed_count + 1,\n      updated_at = CURRENT_TIMESTAMP\n  \`).bind(id, day, normalizedMode).run();\n  const row = await db.prepare(\`\n    SELECT claimed_count FROM telegram_pet_repeat_reward_slots\n    WHERE telegram_id = ? AND day_key = ? AND mode = ?\n  \`).bind(id, day, normalizedMode).first();\n  const claimedCount = Math.max(1, Math.floor(Number(row?.claimed_count) || 1));\n  return { claimed_count: claimedCount, multiplier: getPetRepeatRewardMultiplier(normalizedMode, claimedCount - 1) };\n}\n\nfunction scalePetRewardRange(value, multiplier) {\n  const scale = Math.max(0, Math.min(1, Number(multiplier) || 0));\n  if (Array.isArray(value)) return value.map((entry) => Math.max(0, Math.floor((Number(entry) || 0) * scale)));\n  return Math.max(0, Math.floor((Number(value) || 0) * scale));\n}\n\nfunction scalePetRandomEventRewards(rewards = {}, multiplier = 1) {\n  return Object.fromEntries(Object.entries(rewards || {}).map(([key, value]) => [key, scalePetRewardRange(value, multiplier)]));\n}\n\nfunction getPetHighLevelGearXpMultiplier(pet) {\n  const level = getPetLevel(pet?.pet_xp);\n  if (level <= 35) return 1;\n  if (level <= 50) return 0.6;\n  return 0.35;\n}\n\nfunction getPetLevel(petXp) {\n  return Math.max(1, Math.floor((Number(petXp) || 0) / 100) + 1);\n}\n`,
'add repeat helpers');

worker = replaceOnce(worker,
`  const outfit = getPetEquippedItem(pet, 'outfit');\n`,
`  const outfit = getPetEquippedItem(pet, 'outfit');\n  const basePetXp = Math.max(0, Math.floor(Number(rewards.pet_xp) || 0));\n`,
'capture base gear xp');

worker = replaceOnce(worker,
`  if (['feed', 'play', 'clean', 'sleep', 'train'].includes(action) && outfit?.key === 'crown_jacket') {\n    rewards.pet_xp += 8;\n    rewards.moon_gold += 2;\n    rewards.style_tokens += 1;\n  }\n}\n`,
`  if (['feed', 'play', 'clean', 'sleep', 'train'].includes(action) && outfit?.key === 'crown_jacket') {\n    rewards.pet_xp += 8;\n    rewards.moon_gold += 2;\n    rewards.style_tokens += 1;\n  }\n\n  const gearBonusXp = Math.max(0, Math.floor(Number(rewards.pet_xp) || 0) - basePetXp);\n  if (gearBonusXp > 0) {\n    const multiplier = getPetHighLevelGearXpMultiplier(pet);\n    rewards.pet_xp = basePetXp + Math.floor(gearBonusXp * multiplier);\n  }\n}\n`,
'gear xp taper');

worker = replaceOnce(worker,
`  const outcome = pickPetRandomEventOutcome(choice);\n  const totals = await getPetWindowTotals(db, telegramId, dayKey, weekKey);\n  const petXpAwarded = Math.min(PETS_DAILY_PET_XP_CAP, Math.max(0, rollPetRange(outcome.rewards.pet_xp, 0)));\n  const applied = applyPetRandomEventDeltas(\n    pet,\n    { ...outcome.rewards, pet_xp: petXpAwarded },\n`,
`  const outcome = pickPetRandomEventOutcome(choice);\n  const totals = await getPetWindowTotals(db, telegramId, dayKey, weekKey);\n  const eventRewardSlot = await claimPetRepeatRewardSlot(db, telegramId, dayKey, 'event');\n  const eventRewards = scalePetRandomEventRewards(outcome.rewards, eventRewardSlot.multiplier);\n  const petXpAwarded = Math.min(PETS_DAILY_PET_XP_CAP, Math.max(0, rollPetRange(eventRewards.pet_xp, 0)));\n  const applied = applyPetRandomEventDeltas(\n    pet,\n    { ...eventRewards, pet_xp: petXpAwarded },\n`,
'event reward slot');

worker = replaceOnce(worker,
`  const totals = await getPetWindowTotals(db, telegramId, dayKey, weekKey);\n  let petXp = Math.max(0, Math.floor(Number(rewards.pet_xp || 0)));\n  let communityXp = Math.max(0, Math.floor(Number(rewards.community_xp || 0)));\n`,
`  const totals = await getPetWindowTotals(db, telegramId, dayKey, weekKey);\n  const kaijuRewardSlot = await claimPetRepeatRewardSlot(db, telegramId, dayKey, 'kaiju');\n  let kaijuRewardMultiplier = kaijuRewardSlot.multiplier;\n  const energyCost = Math.max(0, Math.floor(Number(rewards.energy_cost || 0)));\n  let hasRewardEnergy = energyCost <= 0;\n  if (energyCost > 0) {\n    const energyClaim = await db.prepare(\`\n      UPDATE telegram_pet_profiles\n      SET energy = energy - ?, updated_at = CURRENT_TIMESTAMP\n      WHERE telegram_id = ? AND energy >= ?\n    \`).bind(energyCost, telegramId, energyCost).run();\n    hasRewardEnergy = Number(energyClaim?.meta?.changes || 0) === 1;\n  }\n  if (!hasRewardEnergy) kaijuRewardMultiplier = 0;\n  let petXp = Math.floor(Math.max(0, Number(rewards.pet_xp || 0)) * kaijuRewardMultiplier);\n  let communityXp = Math.floor(Math.max(0, Number(rewards.community_xp || 0)) * kaijuRewardMultiplier);\n`,
'kaiju atomic slot and energy');

worker = replaceOnce(worker,
`  pet.moon_gold = clampPetCurrency(Number(pet.moon_gold || 0) + Math.max(0, Number(rewards.moon_gold || 0)));\n  pet.style_tokens = clampPetCurrency(Number(pet.style_tokens || 0) + Math.max(0, Number(rewards.style_tokens || 0)));\n  pet.happiness = clampPetStat(Number(pet.happiness || 0) + Math.max(0, Number(rewards.happiness || 0)));\n  pet.energy = clampPetStat(Number(pet.energy || 0) - Math.max(0, Number(rewards.energy_cost || 0)));\n`,
`  pet.moon_gold = clampPetCurrency(Number(pet.moon_gold || 0) + Math.floor(Math.max(0, Number(rewards.moon_gold || 0)) * kaijuRewardMultiplier));\n  pet.style_tokens = clampPetCurrency(Number(pet.style_tokens || 0) + Math.floor(Math.max(0, Number(rewards.style_tokens || 0)) * kaijuRewardMultiplier));\n  pet.happiness = clampPetStat(Number(pet.happiness || 0) + Math.floor(Math.max(0, Number(rewards.happiness || 0)) * kaijuRewardMultiplier));\n  if (hasRewardEnergy) pet.energy = clampPetStat(Number(pet.energy || 0) - energyCost);\n`,
'kaiju scaled rewards');

const testMarker = "console.log('telegram-pets-api.test.mjs passed');";
const guards = `\n// XP-farm hardening regression guards.\nassert.ok(worker.includes('PET_REPEAT_REWARD_RULES'), 'repeatable pet modes must define daily rewarded-completion budgets');\nassert.ok(worker.includes("full_rewarded: 6, reduced_rewarded: 10"), 'random events must diminish after six rewarded completions');\nassert.ok(worker.includes("full_rewarded: 5, reduced_rewarded: 10"), 'Kaiju must diminish after five rewarded completions');\nassert.ok(worker.includes("claimPetRepeatRewardSlot(db, telegramId, dayKey, 'event')"), 'random events must atomically claim same-day reward slots');\nassert.ok(worker.includes("claimPetRepeatRewardSlot(db, telegramId, dayKey, 'kaiju')"), 'Kaiju must atomically claim same-day reward slots');\nassert.ok(worker.includes('claimed_count = claimed_count + 1'), 'repeat reward slot claims must increment atomically in D1');\nassert.ok(worker.includes('WHERE telegram_id = ? AND energy >= ?'), 'Kaiju energy must be conditionally claimed in one atomic update');\nassert.ok(worker.includes('Number(energyClaim?.meta?.changes || 0) === 1'), 'Kaiju rewards require a successful atomic energy claim');\nassert.ok(worker.includes('getPetHighLevelGearXpMultiplier'), 'high-level gear XP must use a progression multiplier');\nassert.ok(worker.includes('if (level <= 35) return 1') && worker.includes('if (level <= 50) return 0.6') && worker.includes('return 0.35'), 'gear XP scaling must preserve early progression and taper after level 35');\nconst repeatRewardMigration = fs.readFileSync(new URL('../workers/moonboys-api/migrations/041_telegram_pet_repeat_reward_slots.sql', import.meta.url), 'utf8');\nassert.ok(repeatRewardMigration.includes('PRIMARY KEY (telegram_id, day_key, mode)'), 'repeat reward slot migration must serialize one counter row per player/day/mode');\n\n`;
if (!test.includes('XP-farm hardening regression guards.')) test = replaceOnce(test, testMarker, guards + testMarker, 'append hardening guards');

fs.writeFileSync(workerPath, worker);
fs.writeFileSync(testPath, test);
console.log('Applied Pets XP hardening v2.');
