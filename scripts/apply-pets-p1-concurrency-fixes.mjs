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

worker = replaceOnce(
  worker,
  `async function getPetDailyRepeatCompletionCount(db, telegramId, dayKey, mode) {\n  const id = String(telegramId || '').trim();\n  const day = String(dayKey || '').trim();\n  if (!id || !day) return 0;\n  let row = null;\n  if (mode === 'event') {\n    row = await db.prepare(\`SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id = ? AND day_key = ? AND event_type = 'random_event' AND status = 'accepted'\`).bind(id, day).first().catch(() => null);\n  } else if (mode === 'kaiju') {\n    row = await db.prepare(\`SELECT COUNT(*) AS count FROM telegram_pet_events WHERE telegram_id = ? AND day_key = ? AND event_type LIKE 'kaiju_%' AND status = 'accepted'\`).bind(id, day).first().catch(() => null);\n  }\n  return Math.max(0, Math.floor(Number(row?.count) || 0));\n}\n`,
  `async function claimPetRepeatRewardSlot(db, telegramId, dayKey, mode) {\n  const id = String(telegramId || '').trim();\n  const day = String(dayKey || '').trim();\n  const normalizedMode = String(mode || '').trim().toLowerCase();\n  const rule = PET_REPEAT_REWARD_RULES[normalizedMode];\n  if (!id || !day || !rule) return { claimed_count: 0, multiplier: 0 };\n  await db.prepare(\`\n    INSERT INTO telegram_pet_repeat_reward_slots (telegram_id, day_key, mode, claimed_count, updated_at)\n    VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)\n    ON CONFLICT(telegram_id, day_key, mode) DO UPDATE SET\n      claimed_count = claimed_count + 1,\n      updated_at = CURRENT_TIMESTAMP\n  \`).bind(id, day, normalizedMode).run();\n  const row = await db.prepare(\`\n    SELECT claimed_count\n    FROM telegram_pet_repeat_reward_slots\n    WHERE telegram_id = ? AND day_key = ? AND mode = ?\n  \`).bind(id, day, normalizedMode).first();\n  const claimedCount = Math.max(1, Math.floor(Number(row?.claimed_count) || 1));\n  return { claimed_count: claimedCount, multiplier: getPetRepeatRewardMultiplier(normalizedMode, claimedCount - 1) };\n}\n`,
  'replace unlocked repeat count helper',
);

worker = replaceOnce(
  worker,
  `  const eventCompletionCount = await getPetDailyRepeatCompletionCount(db, telegramId, dayKey, 'event');\n  const eventRewardMultiplier = getPetRepeatRewardMultiplier('event', eventCompletionCount);\n`,
  `  const eventRewardSlot = await claimPetRepeatRewardSlot(db, telegramId, dayKey, 'event');\n  const eventRewardMultiplier = eventRewardSlot.multiplier;\n`,
  'event atomic slot claim',
);

worker = replaceOnce(
  worker,
  `  const kaijuCompletionCount = await getPetDailyRepeatCompletionCount(db, telegramId, dayKey, 'kaiju');\n  let kaijuRewardMultiplier = getPetRepeatRewardMultiplier('kaiju', kaijuCompletionCount);\n  const energyCost = Math.max(0, Math.floor(Number(rewards.energy_cost || 0)));\n  const hasRewardEnergy = Math.max(0, Math.floor(Number(pet.energy) || 0)) >= energyCost;\n  if (!hasRewardEnergy) kaijuRewardMultiplier = 0;\n`,
  `  const kaijuRewardSlot = await claimPetRepeatRewardSlot(db, telegramId, dayKey, 'kaiju');\n  let kaijuRewardMultiplier = kaijuRewardSlot.multiplier;\n  const energyCost = Math.max(0, Math.floor(Number(rewards.energy_cost || 0)));\n  let hasRewardEnergy = energyCost <= 0;\n  if (energyCost > 0) {\n    const energyClaim = await db.prepare(\`\n      UPDATE telegram_pet_profiles\n      SET energy = energy - ?, updated_at = CURRENT_TIMESTAMP\n      WHERE telegram_id = ? AND energy >= ?\n    \`).bind(energyCost, telegramId, energyCost).run();\n    hasRewardEnergy = Number(energyClaim?.meta?.changes || 0) === 1;\n  }\n  if (!hasRewardEnergy) kaijuRewardMultiplier = 0;\n`,
  'kaiju atomic energy claim',
);

worker = replaceOnce(
  worker,
  `  if (hasRewardEnergy) pet.energy = clampPetStat(Number(pet.energy || 0) - energyCost);\n`,
  `  if (hasRewardEnergy) pet.energy = clampPetStat(Number(pet.energy || 0) - energyCost);\n`,
  'preserve local kaiju energy snapshot',
);

const oldGuards = `assert.ok(worker.includes("getPetDailyRepeatCompletionCount(db, telegramId, dayKey, 'event')"), 'random events must count same-day completions before rewards');\nassert.ok(worker.includes("getPetDailyRepeatCompletionCount(db, telegramId, dayKey, 'kaiju')"), 'Kaiju must count same-day completions before rewards');\nassert.ok(worker.includes('if (!hasRewardEnergy) kaijuRewardMultiplier = 0'), 'Kaiju must not award progression when the pet cannot pay the energy cost');\n`;
const newGuards = `assert.ok(worker.includes("claimPetRepeatRewardSlot(db, telegramId, dayKey, 'event')"), 'random events must atomically claim same-day reward slots');\nassert.ok(worker.includes("claimPetRepeatRewardSlot(db, telegramId, dayKey, 'kaiju')"), 'Kaiju must atomically claim same-day reward slots');\nassert.ok(worker.includes('INSERT INTO telegram_pet_repeat_reward_slots'), 'repeat reward slots must use a dedicated atomic counter row');\nassert.ok(worker.includes('claimed_count = claimed_count + 1'), 'repeat reward slot claims must increment atomically in D1');\nassert.ok(worker.includes('WHERE telegram_id = ? AND energy >= ?'), 'Kaiju energy must be conditionally claimed in one atomic update');\nassert.ok(worker.includes('Number(energyClaim?.meta?.changes || 0) === 1'), 'Kaiju rewards require a successful atomic energy claim');\nassert.ok(worker.includes('if (!hasRewardEnergy) kaijuRewardMultiplier = 0'), 'Kaiju must not award progression when the pet cannot pay the energy cost');\n`;
test = replaceOnce(test, oldGuards, newGuards, 'replace concurrency guards');

const marker = "console.log('telegram-pets-api.test.mjs passed');";
const migrationGuard = `const repeatRewardMigrationPath = new URL('../workers/moonboys-api/migrations/041_telegram_pet_repeat_reward_slots.sql', import.meta.url);\nconst repeatRewardMigration = fs.readFileSync(repeatRewardMigrationPath, 'utf8');\nassert.ok(repeatRewardMigration.includes('telegram_pet_repeat_reward_slots'), 'repeat reward slot migration must create the counter table');\nassert.ok(repeatRewardMigration.includes('PRIMARY KEY (telegram_id, day_key, mode)'), 'repeat reward slot migration must serialize one counter row per player/day/mode');\n\n`;
if (!test.includes('repeatRewardMigrationPath')) test = replaceOnce(test, marker, migrationGuard + marker, 'insert migration guards');

fs.writeFileSync(workerPath, worker);
fs.writeFileSync(testPath, test);
console.log('Applied Pets P1 concurrency fixes.');
