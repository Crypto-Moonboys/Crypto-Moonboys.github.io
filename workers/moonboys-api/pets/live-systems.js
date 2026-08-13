import { PET_DISTRICT_APPROACHES, PET_DISTRICT_ENCOUNTERS, PET_EVENT_CHAINS, PET_FACTION_BONUSES, PET_REGION_CONTENT, PET_SEASONAL_BOSSES } from './content-phase-4.js';
import { PET_COSMETIC_SINKS, PET_CRAFTING_RECIPES, PET_PRESTIGE_REQUIREMENTS, getPetCraftingRecipe, getPetEquipmentUpgradeCost } from './economy-phase-3.js';
import { buildPetRegionDirectory } from './game-content.js';
import { normalizeFaction } from '../shared/faction-canon.js';

const integer = (value) => Math.max(0, Math.floor(Number(value) || 0));
const parse = (value, fallback) => { try { return JSON.parse(value || ''); } catch { return fallback; } };
const dayKey = (now = new Date()) => now.toISOString().slice(0, 10);

export function getActiveSeasonalBoss(now = new Date()) {
  const entries = Object.entries(PET_SEASONAL_BOSSES);
  const epochWeek = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 604800000);
  const [key, boss] = entries[((epochWeek % entries.length) + entries.length) % entries.length];
  return { key, ...boss, season_instance: `${boss.season}:w${epochWeek}`, rotation_week: epochWeek, hp: boss.phases * 300, title: key.replaceAll('_', ' ') };
}

export function applyPetFactionBonus(rewards = {}, factionKey, system) {
  const faction = normalizeFaction(factionKey);
  const bonus = PET_FACTION_BONUSES[faction];
  const output = { ...rewards };
  if (!bonus || bonus.system !== system) return { rewards: output, bonus: null };
  const pct = integer(bonus.effect.job_reward_pct || bonus.effect.event_reward_pct || bonus.effect.run_reward_pct || bonus.effect.arena_reward_pct || 0);
  if (pct) for (const key of ['moon_gold', 'moon_crystals', 'style_tokens', 'pet_xp']) {
    if (output[key]) output[key] = integer(Number(output[key]) * (100 + pct) / 100);
  }
  if (bonus.effect.style_reward_pct && output.style_tokens) output.style_tokens = integer(Number(output.style_tokens) * (100 + bonus.effect.style_reward_pct) / 100);
  const activeEffect = Object.fromEntries(Object.entries(bonus.effect).filter(([key]) => [
    'training_xp_pct', 'run_reward_pct', 'event_reward_pct', 'style_reward_pct', 'arena_reward_pct', 'job_reward_pct',
  ].includes(key)));
  return { rewards: output, bonus: { faction, system: bonus.system, effect: activeEffect } };
}

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value) || 0));

function stableLiveSystemRoll(...parts) {
  let hash = 2166136261;
  for (const character of parts.join('|')) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

function words(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getDistrictMission(telegramId, pet, region, today = dayKey()) {
  const content = PET_REGION_CONTENT[region.key];
  const mastery = integer(region.mastery_xp);
  const boss = mastery > 0 && mastery % 100 >= 70;
  const encounterKey = boss ? content.boss : content.encounters[stableLiveSystemRoll(telegramId, region.key, today, mastery) % content.encounters.length];
  const authored = boss ? {
    title: `${words(content.boss)} // Checkpoint`,
    intro: `${words(content.boss)} blocks the next district tier.`,
    objective: 'Win the checkpoint and carry mastery across the line.',
    threat: 5,
    opponent: { name: words(content.boss), role: 'district boss', intro: 'A permanent street-memory checkpoint.' },
  } : PET_DISTRICT_ENCOUNTERS[encounterKey];
  const relief = Math.min(12, Math.floor(integer(pet?.level) / 10)) + Math.min(8, Math.floor(mastery / 25));
  const choices = Object.entries(PET_DISTRICT_APPROACHES).map(([key, approach]) => {
    const riskPercent = Math.round(clamp(12 + integer(authored.threat) * 7 - relief + approach.risk_delta, 8, 70));
    return { key, label: approach.label, detail: approach.detail, risk_percent: riskPercent, success_percent: 100 - riskPercent, mastery_success: approach.mastery_success, mastery_setback: approach.mastery_setback, reward_multiplier: approach.reward_multiplier };
  });
  return { key: encounterKey, ...authored, boss, choices };
}

function getEventChainScene(chain, stepIndex) {
  const step = chain.steps[stepIndex] || chain.steps[0];
  const authored = chain.step_content?.[step] || {};
  return { key: step, title: authored.title || words(step), intro: authored.intro || '', objective: authored.objective || '', choices: (authored.choices || []).map((choice) => ({ key: choice.key, label: choice.label, detail: choice.detail, reward_bonus: { ...(choice.reward_bonus || {}) } })) };
}

export async function buildPetLiveSystemsState(db, telegramId, pet, runtime, gear = [], materials = []) {
  const mastery = parse(runtime?.region_mastery_json, {});
  const completed = parse(runtime?.completed_regions_json, []);
  const today = dayKey();
  const [chains, bossProgress, cosmetics, factionRow, dailyEvents] = await Promise.all([
    db.prepare('SELECT chain_key, step_index, completed_cycles FROM telegram_pet_event_chain_progress WHERE telegram_id = ?').bind(telegramId).all().catch(() => ({ results: [] })),
    db.prepare('SELECT season_key, boss_key, damage, defeated_at, reward_claimed_at FROM telegram_pet_seasonal_boss_progress WHERE telegram_id = ?').bind(telegramId).all().catch(() => ({ results: [] })),
    db.prepare('SELECT cosmetic_key, quantity, unlocked_at FROM telegram_pet_cosmetic_unlocks WHERE telegram_id = ?').bind(telegramId).all().catch(() => ({ results: [] })),
    db.prepare('SELECT faction FROM blocktopia_progression WHERE telegram_id = ?').bind(telegramId).first().catch(() => null),
    db.prepare(`SELECT system_key, action_key, period_key, status FROM telegram_pet_system_events
      WHERE telegram_id=? AND status IN ('settling','completed')
        AND ((system_key IN ('district','event_chain') AND period_key=?)
          OR (system_key='seasonal_boss' AND period_key LIKE ?))`)
      .bind(telegramId, today, `%:${today}`).all().catch(() => ({ results: [] })),
  ]);
  const usedToday = new Set((dailyEvents.results || []).map((row) => `${row.system_key}:${row.action_key}`));
  const chainRows = new Map((chains.results || []).map((row) => [row.chain_key, row]));
  const chainState = Object.entries(PET_EVENT_CHAINS).map(([key, chain]) => {
    const row = chainRows.get(key) || { step_index: 0, completed_cycles: 0 };
    const dailyUsed = usedToday.has(`event_chain:${key}`);
    const stepIndex = integer(row.step_index);
    return { key, title: chain.title || words(key), steps: [...chain.steps], current_step: chain.steps[stepIndex] || chain.steps[0], step_index: stepIndex, completed_cycles: integer(row.completed_cycles), final_outcomes: [...chain.final_outcomes], scene: getEventChainScene(chain, stepIndex), used_today: dailyUsed, available: !dailyUsed };
  });
  const boss = getActiveSeasonalBoss();
  const bossRow = (bossProgress.results || []).find((row) => row.boss_key === boss.key && row.season_key === boss.season_instance) || {};
  const materialMap = Object.fromEntries((materials || []).map((row) => [row.material_key || row.key, integer(row.quantity)]));
  const upgradeRows = (gear || []).map((item) => {
    const target = integer(item.item_level) + 1;
    const cost = getPetEquipmentUpgradeCost(target);
    const levelUnlocked = integer(pet.level) >= 15;
    const affordable = levelUnlocked && cost && Object.entries(cost).every(([key, amount]) => integer(key === 'moon_gold' ? pet.moon_gold : materialMap[key]) >= amount);
    return { ...item, target_level: target, cost, maxed: !cost, unlocked: levelUnlocked, required_level: 15, affordable: Boolean(affordable) };
  });
  const unlockedCosmetics = new Map((cosmetics.results || []).map((row) => [row.cosmetic_key, row]));
  const economyWallet = { moon_gold: integer(pet.moon_gold), moon_crystals: integer(pet.moon_crystals), style_tokens: integer(pet.style_tokens), ...materialMap };
  const cosmeticState = Object.entries(PET_COSMETIC_SINKS).map(([key, sink]) => ({
    key, ...sink, unlocked: unlockedCosmetics.has(key), quantity: integer(unlockedCosmetics.get(key)?.quantity),
    affordable: Object.entries(sink.cost).every(([costKey, amount]) => integer(economyWallet[costKey]) >= amount),
  }));
  const crafting = Object.entries(PET_CRAFTING_RECIPES).map(([key, recipe]) => ({
    key, ...recipe, unlocked: integer(pet.level) >= recipe.min_level,
    affordable: integer(pet.level) >= recipe.min_level && Object.entries(recipe.cost).every(([costKey, amount]) => integer(materialMap[costKey]) >= amount),
  }));
  const masteredItems = gear.filter((item) => integer(item.mastery_tier) >= 5).length;
  const prestige = {
    requirements: PET_PRESTIGE_REQUIREMENTS,
    mastered_items: masteredItems,
    completed_regions: completed.length,
    count: integer(runtime?.prestige_count),
    ready: integer(pet.level) >= PET_PRESTIGE_REQUIREMENTS.min_level && masteredItems >= 3 && completed.length >= 4
      && integer(pet.moon_gold) >= 5000 && integer(pet.moon_crystals) >= 50,
  };
  const faction = normalizeFaction(factionRow?.faction);
  const bossUsedToday = usedToday.has(`seasonal_boss:${boss.key}`);
  return {
    regions: buildPetRegionDirectory(pet.level, mastery).map((region) => {
      const dailyUsed = usedToday.has(`district:${region.key}`);
      const mission = getDistrictMission(telegramId, pet, region, today);
      return { ...region, completed: completed.includes(region.key), energy_cost: 10, mastery_gain: 25, mission, used_today: dailyUsed, available: region.playable && !dailyUsed };
    }),
    chains: chainState,
    seasonal_boss: { ...boss, damage: integer(bossRow.damage), defeated_at: bossRow.defeated_at || null, reward_claimed_at: bossRow.reward_claimed_at || null, attempted_today: bossUsedToday, available: integer(pet.level) >= boss.min_level && !bossRow.defeated_at && !bossUsedToday },
    upgrades: upgradeRows,
    cosmetics: cosmeticState,
    crafting,
    prestige,
    faction: { key: faction, bonus: PET_FACTION_BONUSES[faction] || null },
  };
}

export async function processPetCraftRecipe(db, telegramId, recipeKey, requestKey) {
  const recipe = getPetCraftingRecipe(recipeKey);
  if (!recipe) return { accepted: false, reason: 'crafting_recipe_invalid' };
  const replay = await getCompletedRequest(db, telegramId, 'crafting', recipe.key, requestKey);
  if (replay) return { accepted: true, duplicate: true, reason: 'crafting_already_completed', recipe: parse(replay.payload_json, {}) };
  const pet = await db.prepare('SELECT level FROM telegram_pet_profiles WHERE telegram_id=?').bind(telegramId).first();
  if (!pet) return { accepted: false, reason: 'pet_not_adopted' };
  if (integer(pet.level) < recipe.min_level) return { accepted: false, reason: 'crafting_locked', required_level: recipe.min_level };
  const balances = await db.prepare('SELECT material_key, quantity FROM telegram_pet_material_balances WHERE telegram_id=?').bind(telegramId).all();
  const wallet = Object.fromEntries((balances.results || []).map((row) => [row.material_key, integer(row.quantity)]));
  if (!Object.entries(recipe.cost).every(([key, amount]) => integer(wallet[key]) >= amount)) return { accepted: false, reason: 'crafting_materials_missing', cost: recipe.cost };
  const reservation = await reserveSystemEvent(db, telegramId, 'crafting', recipe.key, String(requestKey || crypto.randomUUID()), { cost: recipe.cost, output: recipe.output });
  if (reservation.status === 'completed') return { accepted: true, duplicate: true, reason: 'crafting_already_completed', recipe };
  const costs = Object.entries(recipe.cost).filter(([, amount]) => integer(amount) > 0);
  const checks = costs.map(() => 'AND EXISTS (SELECT 1 FROM telegram_pet_material_balances WHERE telegram_id=? AND material_key=? AND quantity>=?)').join(' ');
  const results = await db.batch([
    db.prepare(`UPDATE telegram_pet_system_events SET status='settling', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','rejected') ${checks}`)
      .bind(reservation.id, ...costs.flatMap(([key, amount]) => [telegramId, key, amount])),
    ...costs.map(([key, amount]) => db.prepare("UPDATE telegram_pet_material_balances SET quantity=quantity-?, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND material_key=? AND EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling')").bind(amount, telegramId, key, reservation.id)),
    db.prepare(`INSERT INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity)
      SELECT ?, 'item', ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling')
      ON CONFLICT(telegram_id, asset_type, asset_key) DO UPDATE SET quantity=MIN(9999, quantity+excluded.quantity)`)
      .bind(telegramId, recipe.output.item_key, recipe.output.quantity, reservation.id),
    db.prepare("UPDATE telegram_pet_system_events SET status='completed', payload_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='settling'")
      .bind(JSON.stringify({ key: recipe.key, title: recipe.title, cost: recipe.cost, output: recipe.output }), reservation.id),
  ]);
  if (Number(results[0]?.meta?.changes || 0) < 1 || Number(results.at(-2)?.meta?.changes || 0) < 1) {
    await db.prepare("UPDATE telegram_pet_system_events SET status='rejected', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status<>'completed'").bind(reservation.id).run();
    return { accepted: false, reason: 'crafting_settlement_conflict', cost: recipe.cost };
  }
  return { accepted: true, reason: 'crafting_complete', recipe: { key: recipe.key, title: recipe.title, output: recipe.output }, cost: recipe.cost, rewards: { items: { [recipe.output.item_key]: recipe.output.quantity } } };
}

async function reserveSystemEvent(db, telegramId, system, action, period, payload = {}) {
  const id = crypto.randomUUID();
  const result = await db.prepare(`INSERT OR IGNORE INTO telegram_pet_system_events
    (id, telegram_id, system_key, action_key, period_key, payload_json) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(id, telegramId, system, action, period, JSON.stringify(payload)).run();
  if (Number(result?.meta?.changes || 0) > 0) return { id, fresh: true };
  const existing = await db.prepare(`SELECT id, status, payload_json FROM telegram_pet_system_events
    WHERE telegram_id = ? AND system_key = ? AND action_key = ? AND period_key = ?`)
    .bind(telegramId, system, action, period).first();
  return { ...existing, fresh: false };
}

async function getCompletedRequest(db, telegramId, system, action, requestKey) {
  if (!requestKey) return null;
  return db.prepare(`SELECT id, status, payload_json FROM telegram_pet_system_events
    WHERE telegram_id=? AND system_key=? AND action_key=? AND period_key=? AND status='completed'`)
    .bind(telegramId, system, action, String(requestKey)).first().catch(() => null);
}

async function claimEnergySettlement(db, reservation, telegramId, energyCost) {
  if (reservation.status === 'completed') return 'completed';
  const token = crypto.randomUUID();
  const priorPayload = parse(reservation.payload_json, {});
  const alreadyCharged = priorPayload.energy_charged === true || priorPayload.energy_charged === 1;
  const results = await db.batch([
    db.prepare(`UPDATE telegram_pet_system_events
      SET status='settling', payload_json=json_set(COALESCE(payload_json, '{}'), '$.claim_token', ?, '$.energy_charged', 1,
        '$.energy_charge_token', CASE WHEN COALESCE(json_extract(payload_json, '$.energy_charged'), 0)=1 THEN COALESCE(json_extract(payload_json, '$.energy_charge_token'), '') ELSE ? END),
        updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND (status IN ('pending','rejected') OR (status='settling' AND updated_at < datetime('now','-2 minutes')))
        AND (COALESCE(json_extract(payload_json, '$.energy_charged'), 0)=1
          OR EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id=? AND energy>=?))`)
      .bind(token, token, reservation.id, telegramId, energyCost),
    db.prepare(`UPDATE telegram_pet_profiles SET energy=energy-?, updated_at=CURRENT_TIMESTAMP
      WHERE telegram_id=? AND energy>=?
        AND EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling'
          AND json_extract(payload_json, '$.claim_token')=? AND json_extract(payload_json, '$.energy_charge_token')=?)`)
      .bind(energyCost, telegramId, energyCost, reservation.id, token, token),
  ]);
  if (Number(results?.[0]?.meta?.changes || 0) < 1) return { state: reservation.status === 'settling' ? 'busy' : 'rejected', token: null };
  if (!alreadyCharged && Number(results?.[1]?.meta?.changes || 0) < 1) {
    await releaseSettlement(db, reservation.id, token);
    return { state: 'rejected', token: null };
  }
  return { state: 'settling', token };
}

async function claimNoCostSettlement(db, reservation) {
  if (reservation.status === 'completed') return { state: 'completed', token: null };
  const token = crypto.randomUUID();
  const result = await db.prepare(`UPDATE telegram_pet_system_events
    SET status='settling', payload_json=json_set(COALESCE(payload_json, '{}'), '$.claim_token', ?), updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND (status IN ('pending','rejected') OR (status='settling' AND updated_at < datetime('now','-2 minutes')))`)
    .bind(token, reservation.id).run();
  return Number(result?.meta?.changes || 0) > 0 ? { state: 'settling', token } : { state: 'busy', token: null };
}

async function releaseSettlement(db, reservationId, token) {
  return db.prepare(`UPDATE telegram_pet_system_events SET status='rejected',
    payload_json=json_remove(COALESCE(payload_json, '{}'), '$.claim_token'), updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND status='settling' AND json_extract(payload_json, '$.claim_token')=?`).bind(reservationId, token).run();
}

export async function processPetDistrictMission(db, telegramId, regionKey, pet, runtime, awardReward, factionKey, approachKey) {
  const directory = buildPetRegionDirectory(pet.level, parse(runtime?.region_mastery_json, {}));
  const region = directory.find((entry) => entry.key === String(regionKey || ''));
  if (!region) return { accepted: false, reason: 'district_invalid' };
  if (!region.playable) return { accepted: false, reason: 'district_locked', region };
  if (integer(pet.energy) < 10) return { accepted: false, reason: 'pet_tired' };
  const mission = getDistrictMission(telegramId, pet, region);
  const explicitApproach = String(approachKey || '');
  const choice = mission.choices.find((entry) => entry.key === explicitApproach) || (!explicitApproach ? mission.choices.find((entry) => entry.key === 'tactical') : null);
  if (!choice) return { accepted: false, reason: 'district_approach_invalid', mission };
  const reservation = await reserveSystemEvent(db, telegramId, 'district', region.key, dayKey(), { region_key: region.key, mission_key: mission.key, approach_key: choice.key });
  if (reservation.status === 'completed') return { accepted: true, duplicate: true, reason: 'district_completed_today', region };
  const claim = await claimEnergySettlement(db, reservation, telegramId, 10);
  if (claim.state !== 'settling') return { accepted: false, reason: claim.state === 'busy' ? 'district_busy' : 'pet_tired' };
  const content = PET_REGION_CONTENT[region.key];
  const mastery = parse(runtime?.region_mastery_json, {});
  const currentMastery = integer(mastery[region.key]);
  const succeeded = !explicitApproach || stableLiveSystemRoll(telegramId, region.key, dayKey(), mission.key, choice.key) % 100 >= choice.risk_percent;
  const nextCheckpoint = (Math.floor(currentMastery / 100) + 1) * 100;
  const masteryGain = succeeded
    ? choice.mastery_success
    : Math.min(choice.mastery_setback, Math.max(0, nextCheckpoint - currentMastery - 1));
  const nextMastery = currentMastery + masteryGain;
  const bossVictory = succeeded && mission.boss && currentMastery < nextCheckpoint && nextMastery >= nextCheckpoint;
  const rewardMaterial = content.reward_focus[Math.floor(currentMastery / 25) % content.reward_focus.length];
  const scale = succeeded ? choice.reward_multiplier : 0.55;
  const baseRewards = { pet_xp: Math.max(8, Math.floor((bossVictory ? 55 : 25) * scale)), moon_gold: Math.max(6, Math.floor((bossVictory ? 65 : 28) * scale)), materials: { [rewardMaterial]: bossVictory ? 3 : succeeded ? 1 : 0 } };
  const adjusted = applyPetFactionBonus(baseRewards, factionKey, 'runs');
  const resultCopy = bossVictory ? `${mission.opponent.name} falls. Your crew owns the next district tier.` : succeeded ? `${mission.title} cleared via ${choice.label}. The district remembers the play.` : `${choice.label} breaks under pressure. You save the route and keep partial mastery.`;
  let awarded;
  try { awarded = await awardReward({
    telegram_id: telegramId, source: 'pet_district', idempotency_key: `district:${reservation.id}`, event_key: `district:${reservation.id}`,
    event_type: 'district_mission', reason: `${region.key}:${mission.key}:${choice.key}:${succeeded ? 'clear' : 'setback'}`, rewards: adjusted.rewards,
    touch_streak: true, context: { system_event_id: reservation.id, region_key: region.key, mission_key: mission.key, approach_key: choice.key, succeeded, boss: bossVictory ? content.boss : null, faction_bonus: adjusted.bonus },
  }); } catch (error) { await releaseSettlement(db, reservation.id, claim.token); throw error; }
  if (!awarded.accepted) { await releaseSettlement(db, reservation.id, claim.token); return awarded; }
  const completionPayload = JSON.stringify({ region_key: region.key, mission_key: mission.key, approach_key: choice.key, succeeded, mastery: nextMastery, mastery_gain: masteryGain, boss: bossVictory, result_copy: resultCopy });
  const results = await db.batch([
    db.prepare(`UPDATE telegram_pet_progression_state SET
      region_mastery_json=json_set(COALESCE(region_mastery_json, '{}'), '$.' || ?, COALESCE(json_extract(region_mastery_json, '$.' || ?), 0) + ?),
      completed_regions_json=CASE
        WHEN COALESCE(json_extract(region_mastery_json, '$.' || ?), 0) + ? >= 100
          AND NOT EXISTS (SELECT 1 FROM json_each(COALESCE(completed_regions_json, '[]')) WHERE value=?)
        THEN json_insert(COALESCE(completed_regions_json, '[]'), '$[#]', ?)
        ELSE COALESCE(completed_regions_json, '[]') END,
      adventure_xp=adventure_xp+?, updated_at=CURRENT_TIMESTAMP
      WHERE telegram_id=? AND EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling' AND json_extract(payload_json, '$.claim_token')=?)`)
      .bind(region.key, region.key, masteryGain, region.key, masteryGain, region.key, region.key, masteryGain, telegramId, reservation.id, claim.token),
    db.prepare("UPDATE telegram_pet_system_events SET status='completed', payload_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='settling' AND json_extract(payload_json, '$.claim_token')=?").bind(completionPayload, reservation.id, claim.token),
  ]);
  if (Number(results?.[1]?.meta?.changes || 0) < 1) return { accepted: false, reason: 'district_busy' };
  return { ...awarded, reason: bossVictory ? 'district_boss_defeated' : succeeded ? 'district_mission_complete' : 'district_mission_setback', region: { ...region, mastery_xp: nextMastery }, mission: { key: mission.key, title: mission.title, boss: mission.boss }, choice: { key: choice.key, label: choice.label }, outcome: { success: succeeded, copy: resultCopy, risk_percent: choice.risk_percent, mastery_gain: masteryGain }, result_copy: resultCopy, boss: bossVictory ? content.boss : null, faction_bonus: adjusted.bonus };
}

export async function processPetEventChain(db, telegramId, chainKey, awardReward, factionKey, choiceKey) {
  const chain = PET_EVENT_CHAINS[String(chainKey || '')];
  if (!chain) return { accepted: false, reason: 'event_chain_invalid' };
  const row = await db.prepare('SELECT step_index, completed_cycles FROM telegram_pet_event_chain_progress WHERE telegram_id=? AND chain_key=?').bind(telegramId, chainKey).first();
  const stepIndex = integer(row?.step_index);
  const scene = getEventChainScene(chain, stepIndex);
  const explicitChoice = String(choiceKey || '');
  const authoredChoices = chain.step_content?.[scene.key]?.choices || [];
  const selectedChoice = authoredChoices.find((choice) => choice.key === explicitChoice) || (!explicitChoice ? authoredChoices[0] : null);
  if (!selectedChoice) return { accepted: false, reason: 'event_chain_choice_invalid', scene };
  const reservation = await reserveSystemEvent(db, telegramId, 'event_chain', chainKey, dayKey(), { step_index: stepIndex, step: scene.key, choice_key: selectedChoice.key });
  if (reservation.status === 'completed') return { accepted: true, duplicate: true, reason: 'event_chain_step_used_today' };
  const claim = await claimNoCostSettlement(db, reservation);
  if (claim.state !== 'settling') return { accepted: false, reason: 'event_chain_busy' };
  const final = stepIndex >= chain.steps.length - 1;
  const baseRewards = { pet_xp: final ? 45 : 18, moon_gold: final ? 50 : 16, style_tokens: final ? 4 : 1 };
  for (const [key, amount] of Object.entries(selectedChoice.reward_bonus || {})) baseRewards[key] = integer(baseRewards[key]) + integer(amount);
  const reward = applyPetFactionBonus(baseRewards, factionKey, 'events');
  let awarded;
  try { awarded = await awardReward({ telegram_id: telegramId, source: 'pet_event_chain', idempotency_key: `chain:${reservation.id}`, event_key: `chain:${reservation.id}`, event_type: 'event_chain', reason: `${chainKey}:${scene.key}:${selectedChoice.key}`, rewards: reward.rewards, touch_streak: true, context: { system_event_id: reservation.id, chain_key: chainKey, step: scene.key, choice_key: selectedChoice.key, final, faction_bonus: reward.bonus } }); }
  catch (error) { await releaseSettlement(db, reservation.id, claim.token); throw error; }
  if (!awarded.accepted) { await releaseSettlement(db, reservation.id, claim.token); return awarded; }
  const resultCopy = selectedChoice.result_copy || `${selectedChoice.label} advances ${chain.title || words(chainKey)}.`;
  const completionPayload = JSON.stringify({ chain_key: chainKey, step: scene.key, choice_key: selectedChoice.key, final, result_copy: resultCopy });
  const results = await db.batch([
    db.prepare(`INSERT INTO telegram_pet_event_chain_progress (telegram_id, chain_key, step_index, completed_cycles)
      SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling' AND json_extract(payload_json, '$.claim_token')=?)
      ON CONFLICT(telegram_id, chain_key) DO UPDATE SET step_index=excluded.step_index, completed_cycles=excluded.completed_cycles, updated_at=CURRENT_TIMESTAMP
      WHERE EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling' AND json_extract(payload_json, '$.claim_token')=?)`)
      .bind(telegramId, chainKey, final ? 0 : stepIndex + 1, integer(row?.completed_cycles) + (final ? 1 : 0), reservation.id, claim.token, reservation.id, claim.token),
    db.prepare("UPDATE telegram_pet_system_events SET status='completed', payload_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='settling' AND json_extract(payload_json, '$.claim_token')=?").bind(completionPayload, reservation.id, claim.token),
  ]);
  if (Number(results?.[1]?.meta?.changes || 0) < 1) return { accepted: false, reason: 'event_chain_busy' };
  return { ...awarded, reason: final ? 'event_chain_completed' : 'event_chain_advanced', chain_key: chainKey, step: scene.key, choice: { key: selectedChoice.key, label: selectedChoice.label }, result_copy: resultCopy, final, faction_bonus: reward.bonus };
}

export async function processPetSeasonalBoss(db, telegramId, pet, awardReward) {
  const boss = getActiveSeasonalBoss();
  if (integer(pet.level) < boss.min_level) return { accepted: false, reason: 'seasonal_boss_locked', required_level: boss.min_level };
  const existing = await db.prepare('SELECT damage, defeated_at, reward_claimed_at FROM telegram_pet_seasonal_boss_progress WHERE telegram_id=? AND season_key=? AND boss_key=?').bind(telegramId, boss.season_instance, boss.key).first();
  const settleReward = async () => {
    const reward = await awardReward({ telegram_id: telegramId, source: 'pet_seasonal_boss', idempotency_key: `seasonal:${boss.season_instance}:${telegramId}`, event_key: `seasonal:${boss.season_instance}:${telegramId}`, event_type: 'seasonal_boss', reason: boss.key, rewards: { pet_xp: 150, moon_gold: 250, moon_crystals: 8, materials: { [boss.reward]: 8, mastery_token: 1 } }, touch_streak: true, context: { boss_key: boss.key, season_key: boss.season_instance } });
    if (reward.accepted) await db.prepare(`UPDATE telegram_pet_seasonal_boss_progress SET reward_claimed_at=COALESCE(reward_claimed_at, CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND season_key=? AND boss_key=? AND defeated_at IS NOT NULL`).bind(telegramId, boss.season_instance, boss.key).run();
    return reward;
  };
  if (existing?.defeated_at) {
    if (existing.reward_claimed_at) return { accepted: false, reason: 'seasonal_boss_defeated', boss };
    const recovered = await settleReward();
    return { ...recovered, accepted: Boolean(recovered.accepted), duplicate: true, reason: 'seasonal_boss_reward_recovered', boss, progress: { damage: boss.hp, hp: boss.hp, defeated: true } };
  }
  if (integer(pet.energy) < 18) return { accepted: false, reason: 'pet_tired' };
  const reservation = await reserveSystemEvent(db, telegramId, 'seasonal_boss', boss.key, `${boss.season_instance}:${dayKey()}`, {});
  if (reservation.status === 'completed') return { accepted: true, duplicate: true, reason: 'seasonal_boss_attempt_used' };
  const claim = await claimEnergySettlement(db, reservation, telegramId, 18);
  if (claim.state !== 'settling') return { accepted: false, reason: claim.state === 'busy' ? 'seasonal_boss_busy' : 'pet_tired' };
  const damage = 35 + integer(pet.level) * 2;
  const total = Math.min(boss.hp, integer(existing?.damage) + damage);
  const defeated = total >= boss.hp;
  const settlement = await db.batch([
    db.prepare(`INSERT INTO telegram_pet_seasonal_boss_progress (telegram_id, season_key, boss_key, damage, defeated_at)
      SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling' AND json_extract(payload_json, '$.claim_token')=?)
      ON CONFLICT(telegram_id, season_key, boss_key) DO UPDATE SET damage=excluded.damage, defeated_at=COALESCE(telegram_pet_seasonal_boss_progress.defeated_at, excluded.defeated_at), updated_at=CURRENT_TIMESTAMP
      WHERE EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling' AND json_extract(payload_json, '$.claim_token')=?)`)
      .bind(telegramId, boss.season_instance, boss.key, total, defeated ? new Date().toISOString() : null, reservation.id, claim.token, reservation.id, claim.token),
    db.prepare("UPDATE telegram_pet_system_events SET status='completed', payload_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='settling' AND json_extract(payload_json, '$.claim_token')=?").bind(JSON.stringify({ damage, total, defeated }), reservation.id, claim.token),
  ]);
  if (Number(settlement?.[1]?.meta?.changes || 0) < 1) return { accepted: false, reason: 'seasonal_boss_busy' };
  let reward = null;
  if (defeated) reward = await settleReward();
  return { accepted: true, reason: defeated ? 'seasonal_boss_defeated' : 'seasonal_boss_hit', damage, progress: { damage: total, hp: boss.hp, defeated }, boss, rewards: reward?.rewards || null };
}

export async function processPetEquipmentUpgrade(db, telegramId, itemKey, requestKey) {
  const replay = await getCompletedRequest(db, telegramId, 'equipment_upgrade', itemKey, requestKey);
  if (replay) return { accepted: true, duplicate: true, reason: 'equipment_already_upgraded', item: parse(replay.payload_json, {}) };
  const item = await db.prepare('SELECT item_key, item_level FROM telegram_pet_equipment_progression WHERE telegram_id=? AND item_key=?').bind(telegramId, itemKey).first();
  if (!item) return { accepted: false, reason: 'equipment_not_owned' };
  const target = integer(item.item_level) + 1;
  const cost = getPetEquipmentUpgradeCost(target);
  if (!cost) return { accepted: false, reason: 'equipment_max_level' };
  const pet = await db.prepare('SELECT pet_xp, moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').bind(telegramId).first();
  if (1 + Math.floor(integer(pet?.pet_xp) / 100) < 15) return { accepted: false, reason: 'equipment_upgrades_locked' };
  const balances = await db.prepare('SELECT material_key, quantity FROM telegram_pet_material_balances WHERE telegram_id=?').bind(telegramId).all();
  const wallet = { moon_gold: integer(pet?.moon_gold), ...Object.fromEntries((balances.results || []).map((row) => [row.material_key, integer(row.quantity)])) };
  if (!Object.entries(cost).every(([key, amount]) => integer(wallet[key]) >= amount)) return { accepted: false, reason: 'upgrade_cost_missing', cost };
  const period = String(requestKey || `level:${target}`);
  const reservation = await reserveSystemEvent(db, telegramId, 'equipment_upgrade', itemKey, period, { target, cost });
  if (reservation.status === 'completed') return { accepted: true, duplicate: true, reason: 'equipment_already_upgraded' };
  const payableMaterials = Object.entries(cost).filter(([key, amount]) => key !== 'moon_gold' && integer(amount) > 0);
  const materialChecks = payableMaterials.map(() => 'AND EXISTS (SELECT 1 FROM telegram_pet_material_balances WHERE telegram_id=? AND material_key=? AND quantity>=?)').join(' ');
  const materialArgs = payableMaterials.flatMap(([key, amount]) => [telegramId, key, amount]);
  const statements = [
    db.prepare(`UPDATE telegram_pet_system_events SET status='settling', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','rejected')
      AND EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id=? AND moon_gold>=?) ${materialChecks}
      AND EXISTS (SELECT 1 FROM telegram_pet_equipment_progression WHERE telegram_id=? AND item_key=? AND item_level=?)`)
      .bind(reservation.id, telegramId, integer(cost.moon_gold), ...materialArgs, telegramId, itemKey, target - 1),
    db.prepare("UPDATE telegram_pet_profiles SET moon_gold=moon_gold-?, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling')").bind(integer(cost.moon_gold), telegramId, reservation.id),
    ...payableMaterials.map(([key, amount]) => db.prepare("UPDATE telegram_pet_material_balances SET quantity=quantity-?, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND material_key=? AND EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling')").bind(amount, telegramId, key, reservation.id)),
    db.prepare("UPDATE telegram_pet_equipment_progression SET item_level=?, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND item_key=? AND item_level=? AND EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling')").bind(target, telegramId, itemKey, target - 1, reservation.id),
    db.prepare("UPDATE telegram_pet_system_events SET status='completed', payload_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='settling'").bind(JSON.stringify({ item_key: itemKey, item_level: target, cost }), reservation.id),
  ];
  const results = await db.batch(statements);
  if (Number(results[0]?.meta?.changes || 0) < 1 || Number(results[results.length - 2]?.meta?.changes || 0) < 1) {
    await db.prepare("UPDATE telegram_pet_system_events SET status='rejected', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status<>'completed'").bind(reservation.id).run();
    return { accepted: false, reason: 'upgrade_conflict', cost };
  }
  return { accepted: true, reason: 'equipment_upgraded', item: { item_key: itemKey, item_level: target }, cost };
}

export async function processPetCosmeticUnlock(db, telegramId, cosmeticKey, requestKey) {
  const sink = PET_COSMETIC_SINKS[String(cosmeticKey || '')];
  if (!sink) return { accepted: false, reason: 'cosmetic_invalid' };
  const replay = await getCompletedRequest(db, telegramId, 'cosmetic', cosmeticKey, requestKey);
  if (replay) return { accepted: true, duplicate: true, reason: 'cosmetic_already_unlocked', cosmetic: parse(replay.payload_json, {}) };
  const owned = await db.prepare('SELECT quantity FROM telegram_pet_cosmetic_unlocks WHERE telegram_id=? AND cosmetic_key=?').bind(telegramId, cosmeticKey).first();
  if (owned && !sink.repeatable) return { accepted: false, reason: 'cosmetic_owned' };
  const pet = await db.prepare('SELECT moon_gold, moon_crystals, style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').bind(telegramId).first();
  const mats = await db.prepare('SELECT material_key, quantity FROM telegram_pet_material_balances WHERE telegram_id=?').bind(telegramId).all();
  const wallet = { ...pet, ...Object.fromEntries((mats.results || []).map((row) => [row.material_key, row.quantity])) };
  if (!Object.entries(sink.cost).every(([key, amount]) => integer(wallet[key]) >= amount)) return { accepted: false, reason: 'cosmetic_cost_missing', cost: sink.cost };
  const serial = sink.repeatable ? integer(owned?.quantity) + 1 : 1;
  const reservation = await reserveSystemEvent(db, telegramId, 'cosmetic', cosmeticKey, String(requestKey || `unlock:${serial}`), { cost: sink.cost });
  if (reservation.status === 'completed') return { accepted: true, duplicate: true, reason: 'cosmetic_already_unlocked', cosmetic: { key: cosmeticKey, quantity: integer(owned?.quantity) } };
  const profileKeys = ['moon_gold', 'moon_crystals', 'style_tokens'];
  const profileCosts = Object.fromEntries(Object.entries(sink.cost).filter(([key]) => profileKeys.includes(key)));
  const materialCosts = Object.entries(sink.cost).filter(([key, amount]) => !profileKeys.includes(key) && integer(amount) > 0);
  const profileCheck = Object.entries(profileCosts).map(([key]) => `${key}>=?`).join(' AND ') || '1=1';
  const materialChecks = materialCosts.map(() => 'AND EXISTS (SELECT 1 FROM telegram_pet_material_balances WHERE telegram_id=? AND material_key=? AND quantity>=?)').join(' ');
  const results = await db.batch([
    db.prepare(`UPDATE telegram_pet_system_events SET status='settling', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','rejected')
      AND EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id=? AND ${profileCheck}) ${materialChecks}
      ${sink.repeatable ? '' : 'AND NOT EXISTS (SELECT 1 FROM telegram_pet_cosmetic_unlocks WHERE telegram_id=? AND cosmetic_key=?)'}`)
      .bind(reservation.id, telegramId, ...Object.values(profileCosts), ...materialCosts.flatMap(([key, amount]) => [telegramId, key, amount]), ...(sink.repeatable ? [] : [telegramId, cosmeticKey])),
    ...Object.entries(profileCosts).map(([key, amount]) => db.prepare(`UPDATE telegram_pet_profiles SET ${key}=${key}-?, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling')`).bind(amount, telegramId, reservation.id)),
    ...materialCosts.map(([key, amount]) => db.prepare("UPDATE telegram_pet_material_balances SET quantity=quantity-?, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND material_key=? AND EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling')").bind(amount, telegramId, key, reservation.id)),
    db.prepare(`INSERT INTO telegram_pet_cosmetic_unlocks (telegram_id, cosmetic_key, quantity)
      SELECT ?, ?, 1 WHERE EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling')
      ON CONFLICT(telegram_id, cosmetic_key) DO UPDATE SET quantity=quantity+1, updated_at=CURRENT_TIMESTAMP`).bind(telegramId, cosmeticKey, reservation.id),
    db.prepare("UPDATE telegram_pet_system_events SET status='completed', payload_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='settling'").bind(JSON.stringify({ key: cosmeticKey, quantity: serial, cost: sink.cost }), reservation.id),
  ]);
  if (Number(results[0]?.meta?.changes || 0) < 1) {
    await db.prepare("UPDATE telegram_pet_system_events SET status='rejected', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status<>'completed'").bind(reservation.id).run();
    return { accepted: false, reason: 'cosmetic_settlement_conflict', cost: sink.cost };
  }
  const settled = await db.prepare('SELECT quantity FROM telegram_pet_cosmetic_unlocks WHERE telegram_id=? AND cosmetic_key=?').bind(telegramId, cosmeticKey).first();
  return { accepted: true, reason: 'cosmetic_unlocked', cosmetic: { key: cosmeticKey, quantity: integer(settled?.quantity) }, cost: sink.cost };
}

export async function processPetPrestige(db, telegramId, liveState, requestKey) {
  const replay = await getCompletedRequest(db, telegramId, 'prestige', 'ascend', requestKey);
  if (replay) return { accepted: true, duplicate: true, reason: 'prestige_already_applied', prestige: parse(replay.payload_json, {}) };
  if (!liveState?.prestige?.ready) return { accepted: false, reason: 'prestige_requirements_missing', prestige: liveState?.prestige };
  const target = integer(liveState.prestige.count) + 1;
  const reservation = await reserveSystemEvent(db, telegramId, 'prestige', 'ascend', String(requestKey || `rank:${target}`), { target });
  if (reservation.status === 'completed') return { accepted: true, duplicate: true, reason: 'prestige_already_applied', prestige_count: target };
  const results = await db.batch([
    db.prepare(`UPDATE telegram_pet_system_events SET status='settling', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','rejected')
      AND EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id=? AND level>=100 AND moon_gold>=5000 AND moon_crystals>=50)
      AND EXISTS (SELECT 1 FROM telegram_pet_progression_state WHERE telegram_id=? AND prestige_count=? AND json_array_length(completed_regions_json)>=4)
      AND (SELECT COUNT(*) FROM telegram_pet_equipment_progression WHERE telegram_id=? AND mastery_tier>=5)>=3`)
      .bind(reservation.id, telegramId, telegramId, target - 1, telegramId),
    db.prepare("UPDATE telegram_pet_profiles SET moon_gold=moon_gold-5000, moon_crystals=moon_crystals-50, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling')").bind(telegramId, reservation.id),
    db.prepare("UPDATE telegram_pet_progression_state SET prestige_count=prestige_count+1, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND prestige_count=? AND EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling')").bind(telegramId, target - 1, reservation.id),
    db.prepare(`INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity)
      SELECT ?, 'mastery_token', 3 WHERE EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling')
      ON CONFLICT(telegram_id, material_key) DO UPDATE SET quantity=MIN(9999, quantity+3), updated_at=CURRENT_TIMESTAMP`).bind(telegramId, reservation.id),
    db.prepare("UPDATE telegram_pet_system_events SET status='completed', payload_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='settling'").bind(JSON.stringify({ prestige_count: target, rewards: { mastery_token: 3 } }), reservation.id),
  ]);
  if (Number(results[0]?.meta?.changes || 0) < 1 || Number(results[2]?.meta?.changes || 0) < 1) {
    await db.prepare("UPDATE telegram_pet_system_events SET status='rejected', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status<>'completed'").bind(reservation.id).run();
    return { accepted: false, reason: 'prestige_settlement_conflict', prestige: liveState.prestige };
  }
  return { accepted: true, reason: 'prestige_complete', prestige_count: target, rewards: { mastery_token: 3 } };
}
