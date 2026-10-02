import { petRecoverableLiveDecisionSql } from './live-system-recovery-proof.js';
import { requirePetFirstReadResult, requirePetReadResult, requirePetMutationResult } from './read-result.js';
import { projectCommittedPetResult } from './committed-result.js';
import { PET_DISTRICT_APPROACHES, PET_DISTRICT_COMPLICATIONS, PET_DISTRICT_ENCOUNTERS, PET_EVENT_CHAINS, PET_FACTION_BONUSES, PET_REGION_CONTENT, PET_SEASONAL_BOSSES } from './content-phase-4.js';
import { PET_COSMETIC_SINKS, PET_CRAFTING_RECIPES, PET_EQUIPMENT_SETS, getPetCraftingRecipe, getPetEquipmentUpgradeCost } from './economy-phase-3.js';
import { buildPetRegionDirectory } from './game-content.js';
import { getPetVisibleLevel, getPetVisibleLevelSql } from './progression-phase-2.js';
import { seasonalRaidChoices, resolveSeasonalRaidAttack } from './seasonal-raid-tactics.js';
import { normalizeFaction } from '../shared/faction-canon.js';
import { boundedRecoveryLimit } from './recovery-limits.js';
import {
  accountWalletRecoveryResolvedSql,
  ensurePetAccountWalletReadyForMutation,
} from './wallet-reconciliation.js';

const integer = (value) => Math.max(0, Math.floor(Number(value) || 0));
const parse = (value, fallback) => { try { return JSON.parse(value || ''); } catch { return fallback; } };
const dayKey = (now = new Date()) => now.toISOString().slice(0, 10);
const nextUtcDayResetAt = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();

function requireLiveMutationResult(result) {
  requirePetMutationResult(result);
  if (!Number.isSafeInteger(result?.meta?.changes) || result.meta.changes < 0) throw new Error('pet_state_write_unavailable');
  return result;
}

function requireLiveMutationBatch(results, expectedLength) {
  if (!Array.isArray(results) || results.length !== expectedLength) throw new Error('pet_state_write_unavailable');
  results.forEach(requireLiveMutationResult);
  return results;
}

function cooldownWindow(expiresAtRaw, now = new Date()) {
  const expiresMs = Date.parse(String(expiresAtRaw || ''));
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(expiresMs) || !Number.isFinite(nowMs)) return null;
  return { expires_at: new Date(expiresMs).toISOString(), remaining_seconds: Math.max(0, Math.ceil((expiresMs - nowMs) / 1000)), server_time: new Date(nowMs).toISOString() };
}

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

function getRuntimePetLevel(pet = {}) {
  return pet && Object.prototype.hasOwnProperty.call(pet, 'pet_xp')
    ? getPetVisibleLevel(pet.pet_xp)
    : integer(pet?.level);
}

function livePetAuthority(telegramId, pet = {}) {
  const owner = String(telegramId || '').trim();
  const petId = String(pet?.pet_id || '').trim();
  const seasonKey = String(pet?.season_key || '').trim();
  return owner && petId && seasonKey ? { telegram_id: owner, pet_id: petId, season_key: seasonKey } : null;
}

async function resolveLivePetAuthority(db, telegramId, pet = {}) {
  const authority = livePetAuthority(telegramId, pet);
  if (!authority) return null;
  // A failed lookup is not evidence that this pet has no saved authority.
  const row = await db.prepare('SELECT 1 AS ok FROM telegram_pet_instances WHERE pet_id=? AND telegram_id=? AND season_key=? LIMIT 1')
    .bind(authority.pet_id, authority.telegram_id, authority.season_key).first().then(requirePetFirstReadResult);
  return row ? authority : null;
}

async function getPetLiveProgressionState(db, telegramId, pet, runtime = {}, resolvedAuthority = null) {
  const authority = resolvedAuthority || await resolveLivePetAuthority(db, telegramId, pet);
  if (!authority) return runtime || {};
  // This row determines the next mission, checkpoint and payout. A database
  // failure must not turn an owned pet's saved mastery into a fresh zero state.
  await db.prepare(`INSERT OR IGNORE INTO telegram_pet_live_progression_state
    (pet_id, telegram_id, season_key, region_mastery_json, completed_regions_json)
    SELECT ?, ?, ?, '{}', '[]'
    WHERE EXISTS (SELECT 1 FROM telegram_pet_instances WHERE pet_id=? AND telegram_id=? AND season_key=?)`)
    .bind(
      authority.pet_id,
      authority.telegram_id,
      authority.season_key,
      authority.pet_id,
      authority.telegram_id,
      authority.season_key,
    ).run();
  const row = await db.prepare(`SELECT * FROM telegram_pet_live_progression_state
    WHERE pet_id=? AND telegram_id=? AND season_key=?`)
    .bind(authority.pet_id, authority.telegram_id, authority.season_key).first().then(requirePetFirstReadResult);
  if (!row) throw new Error('pet_live_progression_unavailable');
  return row;
}

function districtMaterialReward(regionKey, mastery) {
  const materials = PET_REGION_CONTENT[regionKey].reward_focus;
  return materials[Math.floor(integer(mastery) / 25) % materials.length];
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
  const complication = boss ? null : PET_DISTRICT_COMPLICATIONS[stableLiveSystemRoll(telegramId, region.key, today, mastery, encounterKey, 'complication') % PET_DISTRICT_COMPLICATIONS.length];
  const encounter = complication ? {
    ...authored,
    title: `${authored.title} // ${complication.label}`,
    intro: `${authored.intro} ${complication.intro}`,
    objective: `${authored.objective} ${complication.objective}`,
    threat: Math.min(5, integer(authored.threat) + integer(complication.threat_delta)),
    complication: { key: complication.key, label: complication.label },
  } : authored;
  const relief = Math.min(12, Math.floor(getRuntimePetLevel(pet) / 10)) + Math.min(8, Math.floor(mastery / 25));
  const choices = Object.entries(PET_DISTRICT_APPROACHES).map(([key, approach]) => {
    const riskPercent = Math.round(clamp(12 + integer(encounter.threat) * 7 - relief + approach.risk_delta, 8, 70));
    return { key, label: approach.label, detail: approach.detail, risk_percent: riskPercent, success_percent: 100 - riskPercent, mastery_success: approach.mastery_success, mastery_setback: approach.mastery_setback, reward_multiplier: approach.reward_multiplier };
  });
  const materialReward = districtMaterialReward(region.key, mastery);
  return { key: encounterKey, ...encounter, boss, choices, material_reward: materialReward };
}

function getEventChainScene(chain, stepIndex) {
  const step = chain.steps[stepIndex] || chain.steps[0];
  const authored = chain.step_content?.[step] || {};
  return { key: step, title: authored.title || words(step), intro: authored.intro || '', objective: authored.objective || '', choices: (authored.choices || []).map((choice) => ({ key: choice.key, label: choice.label, detail: choice.detail, reward_bonus: { ...(choice.reward_bonus || {}) } })) };
}

export async function buildPetLiveSystemsState(db, telegramId, pet, runtime, gear = [], materials = [], now = new Date()) {
  const authority = await resolveLivePetAuthority(db, telegramId, pet);
  const liveProgression = await getPetLiveProgressionState(db, telegramId, pet, runtime, authority);
  const visibleLevel = getRuntimePetLevel(pet);
  const mastery = parse(liveProgression?.region_mastery_json, {});
  const completed = parse(liveProgression?.completed_regions_json, []);
  const today = dayKey(now);
  const dailyResetAt = nextUtcDayResetAt(now);
  const dailyCooldown = cooldownWindow(dailyResetAt, now);
  const [chains, bossProgress, cosmetics, factionRow, dailyEvents, pendingBossRewards] = await Promise.all([
    authority
      ? db.prepare('SELECT chain_key, step_index, completed_cycles FROM telegram_pet_event_chain_progress WHERE pet_id=? AND telegram_id=? AND season_key=?').bind(authority.pet_id, telegramId, authority.season_key).all().then(requirePetReadResult)
      : db.prepare("SELECT chain_key, step_index, completed_cycles FROM telegram_pet_event_chain_progress WHERE pet_id='' AND telegram_id = ? AND season_key=''").bind(telegramId).all().then(requirePetReadResult),
    authority
      ? db.prepare('SELECT season_key, boss_key, damage, defeated_at, reward_claimed_at FROM telegram_pet_seasonal_boss_progress WHERE pet_id=? AND telegram_id=? AND pet_season_key=?').bind(authority.pet_id, telegramId, authority.season_key).all().then(requirePetReadResult)
      : db.prepare("SELECT season_key, boss_key, damage, defeated_at, reward_claimed_at FROM telegram_pet_seasonal_boss_progress WHERE pet_id='' AND telegram_id = ? AND pet_season_key=''").bind(telegramId).all().then(requirePetReadResult),
    db.prepare('SELECT cosmetic_key, quantity, unlocked_at FROM telegram_pet_cosmetic_unlocks WHERE telegram_id = ?').bind(telegramId).all().then(requirePetReadResult),
    db.prepare('SELECT faction FROM blocktopia_progression WHERE telegram_id = ?').bind(telegramId).first().then(requirePetFirstReadResult),
    db.prepare(`SELECT system_key, action_key, period_key, status, payload_json, updated_at FROM telegram_pet_system_events
      WHERE pet_id=? AND telegram_id=? AND season_key=? AND status IN ('pending','rejected','settling','completed')
        AND ((system_key IN ('district','event_chain') AND (period_key=? OR status IN ('pending','rejected','settling')))
          OR (system_key='seasonal_boss' AND period_key LIKE ?))
      ORDER BY period_key,id`)
      .bind(authority?.pet_id || '', telegramId, authority?.season_key || '', today, `%:${today}`).all().then(requirePetReadResult),
    db.prepare(`SELECT b.pet_id,b.season_key,b.boss_key FROM telegram_pet_seasonal_boss_progress b
      JOIN telegram_pet_instances p ON p.pet_id=b.pet_id AND p.telegram_id=b.telegram_id AND p.season_key=b.pet_season_key
      JOIN telegram_pet_season_slots s ON s.pet_id=p.pet_id AND s.telegram_id=p.telegram_id AND s.season_key=p.season_key AND s.slot_number=p.slot_number
      WHERE b.telegram_id=? AND b.defeated_at IS NOT NULL AND b.reward_claimed_at IS NULL
        AND b.boss_key IN (${Object.keys(PET_SEASONAL_BOSSES).map(() => '?').join(',')})
      ORDER BY b.defeated_at,b.pet_id,b.season_key LIMIT 10`)
      .bind(telegramId,...Object.keys(PET_SEASONAL_BOSSES)).all().then(requirePetReadResult),
  ]);
  const events = dailyEvents.results || [];
  const busyOrComplete = (row) => {
    const updated = Date.parse(String(row.updated_at || '').replace(' ', 'T').replace(/Z?$/, 'Z'));
    return row.status === 'completed' || row.status === 'settling' && (!Number.isFinite(updated) || updated > now.getTime() - 120000);
  };
  const usedToday = new Set(events.filter((row) => row.status === 'completed').map((row) => `${row.system_key}:${row.action_key}`));
  const busyToday = new Set(events.filter((row) => row.status === 'settling' && busyOrComplete(row)).map((row) => `${row.system_key}:${row.action_key}`));
  const pendingDecision = (system, key) => {
    const event = events.find((entry) => entry.system_key === system && entry.action_key === key && !busyOrComplete(entry));
    return event ? parse(event.payload_json, {}) : null;
  };
  const chainRows = new Map((chains.results || []).map((row) => [row.chain_key, row]));
  const chainState = Object.entries(PET_EVENT_CHAINS).map(([key, chain]) => {
    const row = chainRows.get(key) || { step_index: 0, completed_cycles: 0 };
    const dailyUsed = usedToday.has(`event_chain:${key}`);
    const stepIndex = integer(row.step_index);
    return { key, title: chain.title || words(key), steps: [...chain.steps], current_step: chain.steps[stepIndex] || chain.steps[0], step_index: stepIndex, completed_cycles: integer(row.completed_cycles), scene: getEventChainScene(chain, stepIndex), used_today: dailyUsed, settling: busyToday.has(`event_chain:${key}`), available: !dailyUsed && !busyToday.has(`event_chain:${key}`), pending_choice_key: pendingDecision('event_chain', key)?.choice_key || null };
  });
  const boss = getActiveSeasonalBoss(now);
  const bossRow = (bossProgress.results || []).find((row) => row.boss_key === boss.key && row.season_key === boss.season_instance) || {};
  const materialMap = Object.fromEntries((materials || []).map((row) => [row.material_key || row.key, integer(row.quantity)]));
  const upgradeRows = (gear || []).map((item) => {
    const target = integer(item.item_level) + 1;
    const cost = getPetEquipmentUpgradeCost(target);
    const levelUnlocked = visibleLevel >= 15;
    const affordable = levelUnlocked && cost && Object.entries(cost).every(([key, amount]) => integer(key === 'moon_gold' ? pet.moon_gold : materialMap[key]) >= amount);
    return { ...item, ...getPetEquipmentUpgradeQuote(item.item_key, target), maxed: !cost, unlocked: levelUnlocked, required_level: 15, affordable: Boolean(affordable) };
  });
  const unlockedCosmetics = new Map((cosmetics.results || []).map((row) => [row.cosmetic_key, row]));
  const economyWallet = { moon_gold: integer(pet.moon_gold), moon_crystals: integer(pet.moon_crystals), style_tokens: integer(pet.style_tokens), ...materialMap };
  // Keep legacy badge ownership and receipts, but retire its visible catalog offer.
  const cosmeticState = Object.entries(PET_COSMETIC_SINKS).filter(([key]) => key !== 'rename_badge').map(([key, sink]) => ({
    key, ...sink, unlocked: unlockedCosmetics.has(key), quantity: integer(unlockedCosmetics.get(key)?.quantity),
    affordable: Object.entries(sink.cost).every(([costKey, amount]) => integer(economyWallet[costKey]) >= amount),
  }));
  const crafting = Object.entries(PET_CRAFTING_RECIPES).map(([key, recipe]) => ({
    key, ...recipe, unlocked: visibleLevel >= recipe.min_level,
    affordable: visibleLevel >= recipe.min_level && Object.entries(recipe.cost).every(([costKey, amount]) => integer(materialMap[costKey]) >= amount),
  }));
  const equippedGear = new Set(['food', 'toy', 'outfit', 'armor', 'weapon', 'charm'].map((slot) => pet?.[`equipped_${slot}`]).filter(Boolean));
  const ownedGear = new Set([...(gear || []).map((item) => item.item_key), ...equippedGear]);
  const equipmentSets = Object.entries(PET_EQUIPMENT_SETS).map(([key, set]) => {
    const owned = set.items.filter((item) => ownedGear.has(item));
    const equipped = set.items.filter((item) => equippedGear.has(item));
    const activeBonuses = Object.entries(set.bonuses).filter(([required]) => equipped.length >= Number(required)).map(([required, effects]) => ({ required: Number(required), effects }));
    return { key, pieces: equipped.length, owned_pieces: owned.length, total_pieces: set.items.length, owned, equipped, missing: set.items.filter((item) => !ownedGear.has(item)), active_bonuses: activeBonuses };
  });
  const faction = normalizeFaction(factionRow?.faction);
  const bossUsedToday = usedToday.has(`seasonal_boss:${boss.key}`);
  const bossDefeated = Boolean(bossRow.defeated_at);
  const bossCooldown = bossUsedToday && !bossDefeated ? dailyCooldown : null;
  return {
    regions: buildPetRegionDirectory(visibleLevel, mastery).map((region) => {
      const dailyUsed = usedToday.has(`district:${region.key}`);
      const mission = pendingDecision('district', region.key)?.decision?.mission || getDistrictMission(telegramId, pet, region, today);
    return { ...region, completed: completed.includes(region.key), energy_cost: 10, mastery_gain: 25, mission, used_today: dailyUsed, settling: busyToday.has(`district:${region.key}`), available: region.playable && !dailyUsed && !busyToday.has(`district:${region.key}`), pending_choice_key: pendingDecision('district', region.key)?.approach_key || null, retry_energy_charged: Boolean(pendingDecision('district', region.key)?.energy_charged), cooldown: dailyUsed ? dailyCooldown : null, expires_at: dailyUsed ? dailyCooldown?.expires_at : null, remaining_seconds: dailyUsed ? dailyCooldown?.remaining_seconds || 0 : 0, server_time: dailyUsed ? dailyCooldown?.server_time : null };
    }),
    chains: chainState.map((chain) => ({ ...chain, cooldown: chain.used_today ? dailyCooldown : null, expires_at: chain.used_today ? dailyCooldown?.expires_at : null, remaining_seconds: chain.used_today ? dailyCooldown?.remaining_seconds || 0 : 0, server_time: chain.used_today ? dailyCooldown?.server_time : null })),
    seasonal_boss: { ...boss, damage: integer(bossRow.damage), defeated_at: bossRow.defeated_at || null, reward_claimed_at: bossRow.reward_claimed_at || null, attempted_today: bossUsedToday, settling: busyToday.has(`seasonal_boss:${boss.key}`), available: visibleLevel >= boss.min_level && !bossDefeated && !bossUsedToday && !busyToday.has(`seasonal_boss:${boss.key}`), cooldown: bossCooldown, expires_at: bossCooldown?.expires_at || null, remaining_seconds: bossCooldown?.remaining_seconds || 0, server_time: bossCooldown?.server_time || null,
      choices: seasonalRaidChoices(visibleLevel, boss).map((choice) => ({ ...choice, affordable: integer(pet.energy) >= choice.energy })),
      phase: Math.min(boss.phases, 1 + Math.floor(integer(bossRow.damage) / 300)),
      pending_move: pendingDecision('seasonal_boss', boss.key) ? pendingDecision('seasonal_boss', boss.key).attack?.key || 'strike' : null,
      retry_energy_charged: Boolean(pendingDecision('seasonal_boss', boss.key)?.energy_charged),
      pending_rewards: (pendingBossRewards.results || [])
        .map((entry) => ({ pet_id: entry.pet_id, boss_key: entry.boss_key, season_instance: entry.season_key, title: words(entry.boss_key) })),
    },
    upgrades: upgradeRows,
    cosmetics: cosmeticState,
    crafting,
    equipment_sets: equipmentSets,
    faction: { key: faction, bonus: PET_FACTION_BONUSES[faction] || null },
  };
}

export async function processPetCraftRecipe(db, telegramId, recipeKey, requestKey) {
  const recipe = getPetCraftingRecipe(recipeKey);
  if (!recipe) return { accepted: false, reason: 'crafting_recipe_invalid' };
  const replay = await getCompletedRequest(db, telegramId, 'crafting', recipe.key, requestKey);
  if (replay) return { accepted: true, duplicate: true, reason: 'crafting_already_completed', recipe: parse(replay.payload_json, {}) };
  const pet = await db.prepare('SELECT pet_xp, level FROM telegram_pet_profiles WHERE telegram_id=?').bind(telegramId).first().then(requirePetFirstReadResult);
  if (!pet) return { accepted: false, reason: 'pet_not_adopted' };
  if (getRuntimePetLevel(pet) < recipe.min_level) return { accepted: false, reason: 'crafting_locked', required_level: recipe.min_level };
  const balances = await db.prepare('SELECT material_key, quantity FROM telegram_pet_material_balances WHERE telegram_id=?').bind(telegramId).all().then(requirePetReadResult);
  const wallet = Object.fromEntries((balances.results || []).map((row) => [row.material_key, integer(row.quantity)]));
  if (!Object.entries(recipe.cost).every(([key, amount]) => integer(wallet[key]) >= amount)) return { accepted: false, reason: 'crafting_materials_missing', cost: recipe.cost };
  const outputBalance = await db.prepare("SELECT quantity FROM telegram_pet_inventory WHERE telegram_id=? AND asset_type='item' AND asset_key=?").bind(telegramId, recipe.output.item_key).first().then(requirePetFirstReadResult);
  if (integer(outputBalance?.quantity) > 999999 - integer(recipe.output.quantity)) return { accepted: false, reason: 'crafting_inventory_full', recipe: { key: recipe.key, output: recipe.output } };
  const reservation = await reserveSystemEvent(db, telegramId, 'crafting', recipe.key, String(requestKey || crypto.randomUUID()), { cost: recipe.cost, output: recipe.output });
  if (reservation.status === 'completed') return { accepted: true, duplicate: true, reason: 'crafting_already_completed', recipe };
  const costs = Object.entries(recipe.cost).filter(([, amount]) => integer(amount) > 0);
  const checks = costs.map(() => 'AND EXISTS (SELECT 1 FROM telegram_pet_material_balances WHERE telegram_id=? AND material_key=? AND quantity>=?)').join(' ');
  const results = await db.batch([
    db.prepare(`UPDATE telegram_pet_system_events SET status='settling', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','rejected') ${checks}
      AND EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id=? AND ${getPetVisibleLevelSql('pet_xp')}>=?)
      AND (NOT EXISTS (SELECT 1 FROM telegram_pet_inventory WHERE telegram_id=? AND asset_type='item' AND asset_key=?)
        OR EXISTS (SELECT 1 FROM telegram_pet_inventory WHERE telegram_id=? AND asset_type='item' AND asset_key=? AND quantity<=?))`)
      .bind(reservation.id, ...costs.flatMap(([key, amount]) => [telegramId, key, amount]), telegramId, recipe.min_level, telegramId, recipe.output.item_key, telegramId, recipe.output.item_key, 999999 - integer(recipe.output.quantity)),
    ...costs.map(([key, amount]) => db.prepare("UPDATE telegram_pet_material_balances SET quantity=quantity-?, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND material_key=? AND EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling')").bind(amount, telegramId, key, reservation.id)),
    db.prepare(`INSERT INTO telegram_pet_inventory (telegram_id, asset_type, asset_key, quantity)
      SELECT ?, 'item', ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling')
      ON CONFLICT(telegram_id, asset_type, asset_key) DO UPDATE SET quantity=quantity+excluded.quantity`)
      .bind(telegramId, recipe.output.item_key, recipe.output.quantity, reservation.id),
    db.prepare("UPDATE telegram_pet_system_events SET status='completed', payload_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='settling'")
      .bind(JSON.stringify({ key: recipe.key, title: recipe.title, cost: recipe.cost, output: recipe.output }), reservation.id),
  ]);
  requireLiveMutationBatch(results, costs.length + 3);
  if (Number(results[0]?.meta?.changes || 0) < 1 || Number(results.at(-2)?.meta?.changes || 0) < 1) {
    await db.prepare("UPDATE telegram_pet_system_events SET status='rejected', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status<>'completed'").bind(reservation.id).run();
    return { accepted: false, reason: 'crafting_settlement_conflict', cost: recipe.cost };
  }
  return { accepted: true, reason: 'crafting_complete', recipe: { key: recipe.key, title: recipe.title, output: recipe.output }, cost: recipe.cost, rewards: { items: { [recipe.output.item_key]: recipe.output.quantity } } };
}

async function reserveSystemEvent(db, telegramId, system, action, period, payload = {}, authority = null, progressGuard = null) {
  const id = crypto.randomUUID();
  const petId = authority?.pet_id || '';
  const seasonKey = authority?.season_key || '';
  // District checkpoints and story scenes advance in order. Across midnight,
  // another request can change their source after the preview read. Freeze a
  // new choice only while that progress and its unfinished predecessor agree.
  const sequenceGuard = progressGuard ? `${progressGuard.sql} AND NOT EXISTS (
    SELECT 1 FROM telegram_pet_system_events previous WHERE previous.pet_id=? AND previous.telegram_id=?
      AND previous.season_key=? AND previous.system_key=? AND previous.action_key=? AND previous.period_key<>?
      AND (previous.period_key>? OR previous.status IN ('pending','rejected','settling')))` : '';
  const result = await db.prepare(`INSERT OR IGNORE INTO telegram_pet_system_events
    (id, pet_id, telegram_id, season_key, system_key, action_key, period_key, payload_json)
    SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE 1=1 ${sequenceGuard}`)
    .bind(id, petId, telegramId, seasonKey, system, action, period, JSON.stringify({ ...payload, pet_id: petId || null, season_key: seasonKey || null }),
      ...(progressGuard ? [...progressGuard.args, petId, telegramId, seasonKey, system, action, period, period] : [])).run().then(requireLiveMutationResult);
  if (Number(result?.meta?.changes || 0) > 0) return { id, fresh: true, status: 'pending', payload_json: JSON.stringify(payload) };
  const existing = await db.prepare(`SELECT id, status, payload_json FROM telegram_pet_system_events
    WHERE pet_id = ? AND telegram_id = ? AND season_key = ? AND system_key = ? AND action_key = ? AND period_key = ?`)
    .bind(petId, telegramId, seasonKey, system, action, period).first().then(requirePetFirstReadResult);
  return { ...existing, fresh: false, ...(!existing && progressGuard ? { status: 'stale' } : {}) };
}

async function readSystemEvent(db, authority, system, action, period) {
  // Finish an older district/story decision before starting today's step.
  // Raid rotations have independent bosses and are recovered by saved period.
  return db.prepare(`SELECT id, status, payload_json, period_key FROM telegram_pet_system_events
    WHERE pet_id=? AND telegram_id=? AND season_key=? AND system_key=? AND action_key=?
      AND (period_key=? OR (?=1 AND period_key<? AND status IN ('pending','rejected','settling')))
    ORDER BY period_key, id LIMIT 1`)
    .bind(authority.pet_id, authority.telegram_id, authority.season_key, system, action, period, system === 'seasonal_boss' ? 0 : 1, period).first().then(requirePetFirstReadResult);
}

// Freeze the decision before awarding. Retries retain the first choice, odds,
// rewards and progression even if the client submits another choice or levels up.
async function frozenSystemDecision(db, reservation, token, create) {
  const read = () => db.prepare(`SELECT payload_json FROM telegram_pet_system_events
    WHERE id=? AND status='settling' AND json_extract(payload_json, '$.claim_token')=?`).bind(reservation.id, token).first().then(requirePetFirstReadResult);
  const row = await read();
  if (!row) return null;
  const payload = parse(row.payload_json, {});
  if (payload.decision) return payload.decision;
  const decision = create(payload);
  await db.prepare(`UPDATE telegram_pet_system_events SET payload_json=json_set(payload_json, '$.decision', json(?))
    WHERE id=? AND status='settling' AND json_extract(payload_json, '$.claim_token')=? AND json_type(payload_json, '$.decision') IS NULL`)
    .bind(JSON.stringify(decision), reservation.id, token).run();
  return parse((await read())?.payload_json, {}).decision || null;
}

async function getCompletedRequest(db, telegramId, system, action, requestKey, authority = null) {
  if (!requestKey) return null;
  // A failed replay lookup is not evidence that this request is new. Let the
  // action route return a retryable outage before it reserves or spends.
  return db.prepare(`SELECT id, status, payload_json FROM telegram_pet_system_events
    WHERE pet_id=? AND telegram_id=? AND season_key=? AND system_key=? AND action_key=? AND period_key=? AND status='completed'`)
    .bind(authority?.pet_id || '', telegramId, authority?.season_key || '', system, action, String(requestKey)).first().then(requirePetFirstReadResult);
}

async function claimEnergySettlement(db, reservation, telegramId, energyCost, authority = null) {
  if (reservation.status === 'completed') return { state: 'completed', token: null };
  const token = crypto.randomUUID();
  const priorPayload = parse(reservation.payload_json, {});
  const alreadyCharged = priorPayload.energy_charged === true || priorPayload.energy_charged === 1;
  const results = await db.batch(authority ? [
    db.prepare(`UPDATE telegram_pet_system_events
      SET status='settling', payload_json=json_set(COALESCE(payload_json, '{}'), '$.claim_token', ?, '$.energy_charged', 1,
        '$.energy_charge_token', CASE WHEN COALESCE(json_extract(payload_json, '$.energy_charged'), 0)=1 THEN COALESCE(json_extract(payload_json, '$.energy_charge_token'), '') ELSE ? END),
        updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND pet_id=? AND telegram_id=? AND season_key=?
        AND (status IN ('pending','rejected') OR (status='settling' AND updated_at < datetime('now','-2 minutes')))
        AND COALESCE(json_extract(payload_json, '$.expired_uncharged'), 0)<>1
        AND (COALESCE(json_extract(payload_json, '$.energy_charged'), 0)=1
          OR EXISTS (SELECT 1 FROM telegram_pet_instances WHERE pet_id=? AND telegram_id=? AND season_key=? AND energy>=?))`)
      .bind(token, token, reservation.id, authority.pet_id, telegramId, authority.season_key, authority.pet_id, telegramId, authority.season_key, energyCost),
    db.prepare(`UPDATE telegram_pet_instances SET energy=energy-?, updated_at=CURRENT_TIMESTAMP
      WHERE pet_id=? AND telegram_id=? AND season_key=? AND energy>=?
        AND EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling'
          AND json_extract(payload_json, '$.claim_token')=? AND json_extract(payload_json, '$.energy_charge_token')=?)`)
      .bind(energyCost, authority.pet_id, telegramId, authority.season_key, energyCost, reservation.id, token, token),
    db.prepare(`UPDATE telegram_pet_profiles SET energy=(
        SELECT energy FROM telegram_pet_instances WHERE pet_id=? AND telegram_id=? AND season_key=?
      ), updated_at=CURRENT_TIMESTAMP
      WHERE telegram_id=? AND EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling'
        AND json_extract(payload_json, '$.claim_token')=?)
        AND EXISTS (SELECT 1 FROM telegram_pet_active_slots WHERE telegram_id=? AND pet_id=? AND season_key=?)`)
      .bind(authority.pet_id, telegramId, authority.season_key, telegramId, reservation.id, token, telegramId, authority.pet_id, authority.season_key),
  ] : [
    db.prepare(`UPDATE telegram_pet_system_events
      SET status='settling', payload_json=json_set(COALESCE(payload_json, '{}'), '$.claim_token', ?, '$.energy_charged', 1,
        '$.energy_charge_token', CASE WHEN COALESCE(json_extract(payload_json, '$.energy_charged'), 0)=1 THEN COALESCE(json_extract(payload_json, '$.energy_charge_token'), '') ELSE ? END),
        updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND (status IN ('pending','rejected') OR (status='settling' AND updated_at < datetime('now','-2 minutes')))
        AND COALESCE(json_extract(payload_json, '$.expired_uncharged'), 0)<>1
        AND (COALESCE(json_extract(payload_json, '$.energy_charged'), 0)=1
          OR EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id=? AND energy>=?))`)
      .bind(token, token, reservation.id, telegramId, energyCost),
    db.prepare(`UPDATE telegram_pet_profiles SET energy=energy-?, updated_at=CURRENT_TIMESTAMP
      WHERE telegram_id=? AND energy>=?
        AND EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling'
          AND json_extract(payload_json, '$.claim_token')=? AND json_extract(payload_json, '$.energy_charge_token')=?)`)
      .bind(energyCost, telegramId, energyCost, reservation.id, token, token),
  ]);
  requireLiveMutationBatch(results, authority ? 3 : 2);
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
    .bind(token, reservation.id).run().then(requireLiveMutationResult);
  return Number(result?.meta?.changes || 0) > 0 ? { state: 'settling', token } : { state: 'busy', token: null };
}

async function releaseSettlement(db, reservationId, token) {
  return db.prepare(`UPDATE telegram_pet_system_events SET status='rejected',
    payload_json=json_remove(COALESCE(payload_json, '{}'), '$.claim_token'), updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND status='settling' AND json_extract(payload_json, '$.claim_token')=?`).bind(reservationId, token).run();
}

export async function processPetDistrictMission(db, telegramId, regionKey, pet, runtime, awardReward, factionKey, approachKey, runtimeEventKey = null, now = new Date()) {
  const authority = await resolveLivePetAuthority(db, telegramId, pet);
  if (!authority) return { accepted: false, reason: 'source_pet_authority_required' };
  const liveProgression = await getPetLiveProgressionState(db, telegramId, pet, runtime, authority);
  const visibleLevel = getRuntimePetLevel(pet);
  const directory = buildPetRegionDirectory(visibleLevel, parse(liveProgression?.region_mastery_json, {}));
  const region = directory.find((entry) => entry.key === String(regionKey || ''));
  if (!region) return { accepted: false, reason: 'district_invalid' };
  if (!region.playable) return { accepted: false, reason: 'district_locked', region };
  const saved = await readSystemEvent(db, authority, 'district', region.key, dayKey(now));
  const period = saved?.period_key || dayKey(now);
  const savedPayload = parse(saved?.payload_json, {});
  let mission = savedPayload.decision?.mission || getDistrictMission(telegramId, pet, region, period);
  const explicitApproach = String(savedPayload.approach_key || approachKey || '');
  let choice = mission.choices.find((entry) => entry.key === explicitApproach) || (!explicitApproach ? mission.choices.find((entry) => entry.key === 'tactical') : null);
  if (!choice) return { accepted: false, reason: 'district_approach_invalid', mission };
  if (!saved && integer(pet.energy) < 10) return { accepted: false, reason: 'pet_tired' };
  const content = PET_REGION_CONTENT[region.key];
  const decide = (payload) => {
    choice = mission.choices.find((entry) => entry.key === (payload.approach_key || 'tactical')) || choice;
    const currentMastery = integer(parse(liveProgression?.region_mastery_json, {})[region.key]);
    const succeeded = stableLiveSystemRoll(telegramId, region.key, period, mission.key, choice.key) % 100 >= choice.risk_percent;
    const nextCheckpoint = (Math.floor(currentMastery / 100) + 1) * 100;
    const masteryGain = succeeded ? choice.mastery_success : Math.min(choice.mastery_setback, Math.max(0, nextCheckpoint - currentMastery - 1));
    const nextMastery = currentMastery + masteryGain;
    const bossVictory = succeeded && mission.boss && currentMastery < nextCheckpoint && nextMastery >= nextCheckpoint;
    const rewardMaterial = districtMaterialReward(region.key, currentMastery);
    const scale = succeeded ? choice.reward_multiplier : 0.55;
    const baseRewards = { pet_xp: Math.max(8, Math.floor((bossVictory ? 55 : 25) * scale)), moon_gold: Math.max(6, Math.floor((bossVictory ? 65 : 28) * scale)), materials: { [rewardMaterial]: bossVictory ? 3 : succeeded ? 1 : 0 } };
    const adjusted = applyPetFactionBonus(baseRewards, factionKey, 'runs');
    const resultCopy = bossVictory ? `${mission.opponent.name} falls. Your crew owns the next district tier.` : succeeded ? `${mission.title} cleared via ${choice.label}. The district remembers the play.` : `${choice.label} breaks under pressure. You save the route and keep partial mastery.`;
    return { mission, choice, succeeded, masteryGain, nextMastery, bossVictory, adjusted, resultCopy };
  };
  const reservation = saved || await reserveSystemEvent(db, telegramId, 'district', region.key, period, {
    region_key: region.key, mission_key: mission.key, approach_key: choice.key, runtime_event_key: runtimeEventKey,
    decision: decide({ approach_key: choice.key }),
  }, authority, {
    sql: `AND EXISTS (SELECT 1 FROM telegram_pet_live_progression_state WHERE pet_id=? AND telegram_id=? AND season_key=?
      AND COALESCE(json_extract(region_mastery_json,'$.'||?),0)=?)`,
    args: [authority.pet_id, telegramId, authority.season_key, region.key, integer(parse(liveProgression?.region_mastery_json, {})[region.key])],
  });
  if (reservation.status === 'stale') return { accepted: false, reason: 'district_state_changed', refresh_state: true };
  if (reservation.status === 'completed') return { accepted: true, duplicate: true, reason: 'district_completed_today', region };
  const claim = await claimEnergySettlement(db, reservation, telegramId, 10, authority);
  if (claim.state !== 'settling') return { accepted: false, reason: claim.state === 'busy' ? 'district_busy' : 'pet_tired' };
  const savedChoice = { accepted: true, reason: 'district_settlement_pending', reward_pending: true,
    region, result_copy: 'Your district choice and energy cost are saved. The pending result will recover.' };
  const finish = async (decision) => {
    if (!decision) return { ...savedChoice, refresh_state: true };
    ({ mission, choice } = decision);
    const { succeeded, masteryGain, nextMastery, bossVictory, adjusted, resultCopy } = decision;
    let awarded;
    try { awarded = await awardReward({
      telegram_id: telegramId, pet_id: authority.pet_id, season_key: authority.season_key, source: 'pet_district', idempotency_key: `district:${reservation.id}`, event_key: `district:${reservation.id}`,
      event_type: 'district_mission', reason: `${region.key}:${mission.key}:${choice.key}:${succeeded ? 'clear' : 'setback'}`, rewards: adjusted.rewards,
      touch_streak: true, context: { runtime_event_key: parse(reservation.payload_json, {}).runtime_event_key || null, system_event_id: reservation.id, pet_id: authority.pet_id, pet_season_key: authority.season_key, region_key: region.key, mission_key: mission.key, approach_key: choice.key, succeeded, boss: bossVictory ? content.boss : null, faction_bonus: adjusted.bonus },
    }); } catch (error) { await releaseSettlement(db, reservation.id, claim.token).catch(() => null); throw error; }
    if (!awarded.accepted) {
      await releaseSettlement(db, reservation.id, claim.token).catch(() => null);
      return { ...savedChoice, refresh_state: true };
    }
    const rewardSaved = { ...awarded, reason: 'district_settlement_pending', reward_pending: true,
      region, result_copy: 'Your district reward is saved. The pending district progress will recover.' };
    return projectCommittedPetResult(rewardSaved, async () => {
      const completionPayload = JSON.stringify({ region_key: region.key, mission_key: mission.key, approach_key: choice.key, succeeded, mastery: nextMastery, mastery_gain: masteryGain, boss: bossVictory, result_copy: resultCopy });
      const results = await db.batch([
        db.prepare(`UPDATE telegram_pet_live_progression_state SET
          region_mastery_json=json_set(COALESCE(region_mastery_json, '{}'), '$.' || ?, COALESCE(json_extract(region_mastery_json, '$.' || ?), 0) + ?),
          completed_regions_json=CASE
            WHEN COALESCE(json_extract(region_mastery_json, '$.' || ?), 0) + ? >= 100
              AND NOT EXISTS (SELECT 1 FROM json_each(COALESCE(completed_regions_json, '[]')) WHERE value=?)
            THEN json_insert(COALESCE(completed_regions_json, '[]'), '$[#]', ?)
            ELSE COALESCE(completed_regions_json, '[]') END,
          updated_at=CURRENT_TIMESTAMP
          WHERE pet_id=? AND telegram_id=? AND season_key=? AND EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling' AND json_extract(payload_json, '$.claim_token')=?)`)
          .bind(region.key, region.key, masteryGain, region.key, masteryGain, region.key, region.key, authority.pet_id, telegramId, authority.season_key, reservation.id, claim.token),
        db.prepare("UPDATE telegram_pet_system_events SET status='completed', payload_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='settling' AND json_extract(payload_json, '$.claim_token')=?").bind(completionPayload, reservation.id, claim.token),
      ]);
      requireLiveMutationBatch(results, 2);
      if (Number(results?.[1]?.meta?.changes || 0) < 1) return { ...rewardSaved, refresh_state: true };
      return { ...awarded, reward_pending: false, reason: bossVictory ? 'district_boss_defeated' : succeeded ? 'district_mission_complete' : 'district_mission_setback', region: { ...region, mastery_xp: nextMastery }, mission: { key: mission.key, title: mission.title, boss: mission.boss }, choice: { key: choice.key, label: choice.label }, outcome: { success: succeeded, copy: resultCopy, risk_percent: choice.risk_percent, mastery_gain: masteryGain }, result_copy: resultCopy, boss: bossVictory ? content.boss : null, faction_bonus: adjusted.bonus };
    });
  };
  // New reservations already contain a frozen decision. Their successful
  // charge remains recoverable even if the very next scoped read fails.
  const frozen = parse(reservation.payload_json, {}).decision;
  if (frozen && typeof frozen === 'object' && !Array.isArray(frozen)) {
    return projectCommittedPetResult(savedChoice, async () => finish(await frozenSystemDecision(db, reservation, claim.token, decide)));
  }
  // Legacy reservations must establish saved decision proof before a failed
  // follow-up may be reported as an accepted, recoverable settlement.
  const decision = await frozenSystemDecision(db, reservation, claim.token, decide);
  if (!decision) return { accepted: false, reason: 'district_busy' };
  return projectCommittedPetResult(savedChoice, async () => finish(decision));
}

export async function processPetEventChain(db, telegramId, chainKey, awardReward, factionKey, choiceKey, pet = {}, runtimeEventKey = null, now = new Date()) {
  const authority = await resolveLivePetAuthority(db, telegramId, pet);
  if (!authority) return { accepted: false, reason: 'source_pet_authority_required' };
  const chain = Object.hasOwn(PET_EVENT_CHAINS, String(chainKey || '')) ? PET_EVENT_CHAINS[String(chainKey)] : null;
  if (!chain) return { accepted: false, reason: 'event_chain_invalid' };
  const saved = await readSystemEvent(db, authority, 'event_chain', chainKey, dayKey(now));
  const period = saved?.period_key || dayKey(now);
  if (saved?.status === 'completed') return { accepted: true, duplicate: true, reason: 'event_chain_step_used_today' };
  const savedPayload = parse(saved?.payload_json, {});
  const row = await db.prepare('SELECT step_index, completed_cycles FROM telegram_pet_event_chain_progress WHERE pet_id=? AND telegram_id=? AND season_key=? AND chain_key=?').bind(authority.pet_id, telegramId, authority.season_key, chainKey).first().then(requirePetFirstReadResult);
  let stepIndex = integer(saved ? savedPayload.step_index : row?.step_index);
  let scene = getEventChainScene(chain, stepIndex);
  const explicitChoice = String((saved ? savedPayload.choice_key : choiceKey) || '');
  const authoredChoices = chain.step_content?.[scene.key]?.choices || [];
  let selectedChoice = authoredChoices.find((choice) => choice.key === explicitChoice) || (!explicitChoice ? authoredChoices[0] : null);
  if (!selectedChoice) return { accepted: false, reason: 'event_chain_choice_invalid', scene };
  const decide = (payload) => {
    stepIndex = integer(payload.step_index);
    scene = getEventChainScene(chain, stepIndex);
    const choices = chain.step_content[scene.key].choices;
    selectedChoice = choices.find((choice) => choice.key === payload.choice_key) || choices[0];
    const final = stepIndex >= chain.steps.length - 1;
    const baseRewards = { pet_xp: final ? 45 : 18, moon_gold: final ? 50 : 16, style_tokens: final ? 4 : 1 };
    for (const [key, amount] of Object.entries(selectedChoice.reward_bonus || {})) baseRewards[key] = integer(baseRewards[key]) + integer(amount);
    return { stepIndex, scene, selectedChoice, final, completedCycles: integer(payload.completed_cycles ?? row?.completed_cycles) + (final ? 1 : 0), reward: applyPetFactionBonus(baseRewards, factionKey, 'events') };
  };
  const initial = { step_index: stepIndex, step: scene.key, choice_key: selectedChoice.key, completed_cycles: integer(row?.completed_cycles), runtime_event_key: runtimeEventKey };
  const reservation = saved || await reserveSystemEvent(db, telegramId, 'event_chain', chainKey, period, { ...initial, decision: decide(initial) }, authority, {
    sql: `AND COALESCE((SELECT step_index FROM telegram_pet_event_chain_progress WHERE pet_id=? AND telegram_id=? AND season_key=? AND chain_key=?),0)=?
      AND COALESCE((SELECT completed_cycles FROM telegram_pet_event_chain_progress WHERE pet_id=? AND telegram_id=? AND season_key=? AND chain_key=?),0)=?`,
    args: [authority.pet_id, telegramId, authority.season_key, chainKey, stepIndex,
      authority.pet_id, telegramId, authority.season_key, chainKey, integer(row?.completed_cycles)],
  });
  if (reservation.status === 'stale') return { accepted: false, reason: 'event_chain_state_changed', refresh_state: true };
  if (reservation.status === 'completed') return { accepted: true, duplicate: true, reason: 'event_chain_step_used_today' };
  const claim = await claimNoCostSettlement(db, reservation);
  if (claim.state !== 'settling') return { accepted: false, reason: 'event_chain_busy' };
  const savedChoice = { accepted: true, reason: 'event_chain_settlement_pending', reward_pending: true,
    chain_key: chainKey, result_copy: 'Your story choice is saved. The pending result will recover.' };
  const finish = async (decision) => {
    if (!decision) return { ...savedChoice, refresh_state: true };
    ({ stepIndex, scene, selectedChoice } = decision);
    const { final, reward, completedCycles } = decision;
    let awarded;
    try { awarded = await awardReward({ telegram_id: telegramId, pet_id: authority.pet_id, season_key: authority.season_key, source: 'pet_event_chain', idempotency_key: `chain:${reservation.id}`, event_key: `chain:${reservation.id}`, event_type: 'event_chain', reason: `${chainKey}:${scene.key}:${selectedChoice.key}`, rewards: reward.rewards, touch_streak: true, context: { runtime_event_key: parse(reservation.payload_json, {}).runtime_event_key || null, system_event_id: reservation.id, pet_id: authority.pet_id, pet_season_key: authority.season_key, chain_key: chainKey, step: scene.key, choice_key: selectedChoice.key, final, faction_bonus: reward.bonus } }); }
    catch (error) { await releaseSettlement(db, reservation.id, claim.token).catch(() => null); throw error; }
    if (!awarded.accepted) {
      await releaseSettlement(db, reservation.id, claim.token).catch(() => null);
      return { ...savedChoice, refresh_state: true };
    }
    const rewardSaved = { ...awarded, reason: 'event_chain_settlement_pending', reward_pending: true,
      chain_key: chainKey, result_copy: 'Your story reward is saved. The pending story progress will recover.' };
    return projectCommittedPetResult(rewardSaved, async () => {
      const resultCopy = selectedChoice.result_copy || `${selectedChoice.label} advances ${chain.title || words(chainKey)}.`;
      const completionPayload = JSON.stringify({ chain_key: chainKey, step: scene.key, choice_key: selectedChoice.key, final, result_copy: resultCopy });
      const results = await db.batch([
        db.prepare(`INSERT INTO telegram_pet_event_chain_progress (pet_id, telegram_id, season_key, chain_key, step_index, completed_cycles)
          SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling' AND json_extract(payload_json, '$.claim_token')=?)
          ON CONFLICT(pet_id, telegram_id, season_key, chain_key) DO UPDATE SET step_index=excluded.step_index, completed_cycles=excluded.completed_cycles, updated_at=CURRENT_TIMESTAMP
          WHERE EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling' AND json_extract(payload_json, '$.claim_token')=?)
            AND NOT EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE pet_id=? AND telegram_id=? AND season_key=?
              AND system_key='event_chain' AND action_key=? AND period_key>? AND status='completed')`)
          .bind(authority.pet_id, telegramId, authority.season_key, chainKey, final ? 0 : stepIndex + 1, completedCycles, reservation.id, claim.token, reservation.id, claim.token,
            authority.pet_id, telegramId, authority.season_key, chainKey, period),
        db.prepare("UPDATE telegram_pet_system_events SET status='completed', payload_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='settling' AND json_extract(payload_json, '$.claim_token')=?").bind(completionPayload, reservation.id, claim.token),
      ]);
      requireLiveMutationBatch(results, 2);
      if (Number(results?.[1]?.meta?.changes || 0) < 1) return { ...rewardSaved, refresh_state: true };
      return { ...awarded, reward_pending: false, reason: final ? 'event_chain_completed' : 'event_chain_advanced', chain_key: chainKey, step: scene.key, choice: { key: selectedChoice.key, label: selectedChoice.label }, result_copy: resultCopy, final, faction_bonus: reward.bonus };
    });
  };
  const frozen = parse(reservation.payload_json, {}).decision;
  if (frozen && typeof frozen === 'object' && !Array.isArray(frozen)) {
    return projectCommittedPetResult(savedChoice, async () => finish(await frozenSystemDecision(db, reservation, claim.token, decide)));
  }
  const decision = await frozenSystemDecision(db, reservation, claim.token, decide);
  if (!decision) return { accepted: false, reason: 'event_chain_busy' };
  return projectCommittedPetResult(savedChoice, async () => finish(decision));
}

export async function claimPetSeasonalBossReward(db, telegramId, pet, awardReward, request) {
  // Claims belong to the saved victor, including archived pets. The current
  // companion's level, phase and active slot cannot redirect an earned reward.
  const authority = typeof request?.pet_id === 'string' ? await db.prepare(`SELECT p.pet_id,p.season_key FROM telegram_pet_instances p
    JOIN telegram_pet_season_slots s ON s.pet_id=p.pet_id AND s.telegram_id=p.telegram_id AND s.season_key=p.season_key AND s.slot_number=p.slot_number
    WHERE p.pet_id=? AND p.telegram_id=?`).bind(request.pet_id,telegramId).first().then(requirePetFirstReadResult) : null;
  if (!authority) return { accepted: false, reason: 'source_pet_authority_required' };
  const key = request.boss_key, seasonInstance = request.season_instance;
  if (typeof key !== 'string' || !Object.hasOwn(PET_SEASONAL_BOSSES, key) || typeof seasonInstance !== 'string') return { accepted: false, reason: 'seasonal_boss_reward_invalid' };
  const boss = PET_SEASONAL_BOSSES[key];
  const row = await db.prepare(`SELECT defeated_at, reward_claimed_at FROM telegram_pet_seasonal_boss_progress
    WHERE pet_id=? AND telegram_id=? AND pet_season_key=? AND season_key=? AND boss_key=?`)
    .bind(authority.pet_id, telegramId, authority.season_key, seasonInstance, key).first().then(requirePetFirstReadResult);
  if (!row?.defeated_at) return { accepted: false, reason: 'seasonal_boss_not_defeated' };
  if (row.reward_claimed_at) return { accepted: true, duplicate: true, reason: 'seasonal_boss_reward_claimed' };
  const reward = await awardReward({ telegram_id: telegramId, pet_id: authority.pet_id, season_key: authority.season_key,
    source: 'pet_seasonal_boss', idempotency_key: `seasonal:${seasonInstance}:${telegramId}:${authority.pet_id}`, event_key: `seasonal:${seasonInstance}:${telegramId}:${authority.pet_id}`,
    event_type: 'seasonal_boss', reason: key, rewards: { pet_xp: 150, moon_gold: 250, moon_crystals: 8, materials: { [boss.reward]: 8, mastery_token: 1 } },
    touch_streak: true, context: { pet_id: authority.pet_id, season_key: seasonInstance, boss_key: key, pet_season_key: authority.season_key } });
  const result = { ...reward, reason: reward.accepted ? 'seasonal_boss_reward_recovered' : reward.reason, reward_pending: !reward.accepted };
  if (!reward.accepted) return result;
  return projectCommittedPetResult({ ...result, reward_pending: true }, async () => {
    await db.prepare(`UPDATE telegram_pet_seasonal_boss_progress SET reward_claimed_at=COALESCE(reward_claimed_at, CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP
      WHERE pet_id=? AND telegram_id=? AND pet_season_key=? AND season_key=? AND boss_key=? AND defeated_at IS NOT NULL`)
      .bind(authority.pet_id, telegramId, authority.season_key, seasonInstance, key).run();
    return result;
  });
}

export async function processPetSeasonalBoss(db, telegramId, pet, awardReward, move, now = new Date()) {
  const authority = await resolveLivePetAuthority(db, telegramId, pet);
  if (!authority) return { accepted: false, reason: 'source_pet_authority_required' };
  const boss = getActiveSeasonalBoss(now);
  const visibleLevel = getRuntimePetLevel(pet);
  const period = `${boss.season_instance}:${dayKey(now)}`;
  const saved = await readSystemEvent(db, authority, 'seasonal_boss', boss.key, period);
  const charged = Boolean(parse(saved?.payload_json, {}).energy_charged);
  const existing = await db.prepare('SELECT damage, defeated_at, reward_claimed_at FROM telegram_pet_seasonal_boss_progress WHERE pet_id=? AND telegram_id=? AND pet_season_key=? AND season_key=? AND boss_key=?').bind(authority.pet_id, telegramId, authority.season_key, boss.season_instance, boss.key).first().then(requirePetFirstReadResult);
  const settleReward = () => claimPetSeasonalBossReward(db, telegramId, pet, awardReward, { pet_id: authority.pet_id, boss_key: boss.key, season_instance: boss.season_instance });
  if (existing?.defeated_at && !charged) {
    if (existing.reward_claimed_at) return { accepted: false, reason: 'seasonal_boss_defeated', boss };
    const recovered = await settleReward();
    return { ...recovered, accepted: Boolean(recovered.accepted), duplicate: Boolean(recovered.duplicate), attempt_replayed: true,
      boss, progress: { damage: boss.hp, hp: boss.hp, defeated: true } };
  }
  if (!charged && visibleLevel < boss.min_level) return { accepted: false, reason: 'seasonal_boss_locked', required_level: boss.min_level };
  const choice = seasonalRaidChoices(visibleLevel, boss).find((entry) => entry.key === (move === undefined ? 'strike' : move));
  if (!choice) return { accepted: false, reason: 'seasonal_boss_move_invalid' };
  if (!saved && integer(pet.energy) < choice.energy) return { accepted: false, reason: 'pet_tired' };
  const reservation = saved || await reserveSystemEvent(db, telegramId, 'seasonal_boss', boss.key, period,
    { attack: resolveSeasonalRaidAttack(visibleLevel, boss, choice.key, crypto.getRandomValues(new Uint32Array(1))[0] % 100) }, authority);
  if (reservation.status === 'completed') return { accepted: true, duplicate: true, reason: 'seasonal_boss_attempt_used' };
  // Existing pre-tactics reservations retain the original 18-energy strike.
  const attack = parse(reservation.payload_json, {}).attack || resolveSeasonalRaidAttack(visibleLevel, boss, 'strike');
  const claim = await claimEnergySettlement(db, reservation, telegramId, attack.energy, authority);
  if (claim.state !== 'settling') return { accepted: false, reason: claim.state === 'busy' ? 'seasonal_boss_busy' : 'pet_tired' };
  const savedChoice = { accepted: true, reason: 'seasonal_boss_settlement_pending', reward_pending: true,
    boss, result_copy: 'Your raid choice and energy cost are saved. The pending hit will recover.' };
  return projectCommittedPetResult(savedChoice, async () => {
    const decision = await frozenSystemDecision(db, reservation, claim.token, () => ({ attack }));
    if (!decision) return { ...savedChoice, refresh_state: true };
    const damage = decision.attack.damage;
    const settlement = await db.batch([
      db.prepare(`INSERT INTO telegram_pet_seasonal_boss_progress (pet_id, telegram_id, pet_season_key, season_key, boss_key, damage, defeated_at)
        SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling' AND json_extract(payload_json, '$.claim_token')=?)
        ON CONFLICT(pet_id, telegram_id, pet_season_key, season_key, boss_key) DO UPDATE SET
          damage=MIN(?, telegram_pet_seasonal_boss_progress.damage + excluded.damage),
          defeated_at=COALESCE(telegram_pet_seasonal_boss_progress.defeated_at, CASE WHEN telegram_pet_seasonal_boss_progress.damage + excluded.damage >= ? THEN ? ELSE NULL END), updated_at=CURRENT_TIMESTAMP
        WHERE EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling' AND json_extract(payload_json, '$.claim_token')=?)`)
        .bind(authority.pet_id, telegramId, authority.season_key, boss.season_instance, boss.key, Math.min(boss.hp, damage), damage >= boss.hp ? now.toISOString() : null, reservation.id, claim.token, boss.hp, boss.hp, now.toISOString(), reservation.id, claim.token),
      db.prepare("UPDATE telegram_pet_system_events SET status='completed', payload_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='settling' AND json_extract(payload_json, '$.claim_token')=?").bind(JSON.stringify({ damage, attack: decision.attack }), reservation.id, claim.token),
    ]);
    requireLiveMutationBatch(settlement, 2);
    if (Number(settlement?.[1]?.meta?.changes || 0) < 1) return { ...savedChoice, refresh_state: true };
    const hitSaved = { accepted: true, reason: 'seasonal_boss_hit', damage, choice: decision.attack, boss,
      reward_pending: Boolean(existing?.defeated_at || integer(existing?.damage) + damage >= boss.hp),
      result_copy: 'Your raid hit is saved. Refresh to read its progress and any pending reward.' };
    return projectCommittedPetResult(hitSaved, async () => {
      const progress = await db.prepare('SELECT damage, defeated_at FROM telegram_pet_seasonal_boss_progress WHERE pet_id=? AND telegram_id=? AND pet_season_key=? AND season_key=? AND boss_key=?')
        .bind(authority.pet_id, telegramId, authority.season_key, boss.season_instance, boss.key).first().then(requirePetFirstReadResult);
      const total = integer(progress?.damage), defeated = Boolean(progress?.defeated_at);
      let reward = null;
      if (defeated) {
        try { reward = await settleReward(); }
        catch { reward = { accepted: false, reward_pending: true }; }
      }
      const resultCopy = `${decision.attack.label}: ${damage} damage${decision.attack.success ? '.' : ' after a setback.'} ${defeated ? 'Boss defeated.' : 'Your raid progress is saved.'}`;
      return { accepted: true, reason: defeated ? 'seasonal_boss_defeated' : 'seasonal_boss_hit', damage, choice: decision.attack, result_copy: resultCopy,
        progress: { damage: total, hp: boss.hp, defeated }, boss, rewards: reward?.rewards || null,
        reward_pending: defeated && (!reward?.accepted || Boolean(reward?.reward_pending)), ...(reward?.refresh_state ? { refresh_state: true } : {}) };
    });
  });
}

// Recover only persisted decisions for the authenticated owner's original pet.
// A state read never starts an uncharged energy action or rerolls a choice.
export async function recoverPetLiveSystemEndings(db, telegramId, awardReward, limit = 2) {
  // A raid can only be started on its own day. An outage before its energy
  // charge must not leave an unreachable reservation blocking pet deletion.
  // The same row guards the debit, so a concurrent charge either wins first
  // and remains recoverable, or sees this expiry marker and cannot spend.
  await db.prepare(`UPDATE telegram_pet_system_events AS e
    SET status='rejected', payload_json=json_set(payload_json,'$.expired_uncharged',1), updated_at=CURRENT_TIMESTAMP
    WHERE e.telegram_id=? AND e.system_key='seasonal_boss' AND e.status='pending'
      AND e.action_key IN (${Object.keys(PET_SEASONAL_BOSSES).map(() => '?').join(',')})
      AND json_valid(e.payload_json) AND COALESCE(json_extract(e.payload_json,'$.energy_charged'),0)=0
      AND date(substr(e.period_key,-10),'+0 days')=substr(e.period_key,-10) AND substr(e.period_key,-10)<?
      AND EXISTS (SELECT 1 FROM telegram_pet_instances i JOIN telegram_pet_season_slots s
        ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id AND s.season_key=i.season_key AND s.slot_number=i.slot_number
        WHERE i.pet_id=e.pet_id AND i.telegram_id=e.telegram_id AND i.season_key=e.season_key)`)
    .bind(String(telegramId), ...Object.keys(PET_SEASONAL_BOSSES), dayKey()).run().then(requireLiveMutationResult);
  const rows = await db.prepare(`SELECT p.*, e.id AS ending_id, e.system_key, e.action_key, e.period_key
    FROM telegram_pet_system_events e
    JOIN telegram_pet_instances p ON p.pet_id=e.pet_id AND p.telegram_id=e.telegram_id AND p.season_key=e.season_key
    JOIN telegram_pet_season_slots s ON s.pet_id=p.pet_id AND s.telegram_id=p.telegram_id AND s.season_key=p.season_key AND s.slot_number=p.slot_number
    WHERE e.telegram_id=? AND e.status IN ('pending','rejected','settling')
      AND e.updated_at < datetime('now','-2 minutes')
      AND date(substr(e.period_key,-10),'+0 days')=substr(e.period_key,-10)
      AND substr(e.period_key,-10)<=?
      AND ${petRecoverableLiveDecisionSql('e')}
      AND (e.system_key='seasonal_boss' OR NOT EXISTS (SELECT 1 FROM telegram_pet_system_events earlier
        WHERE earlier.pet_id=e.pet_id AND earlier.telegram_id=e.telegram_id AND earlier.season_key=e.season_key
          AND earlier.system_key=e.system_key AND earlier.action_key=e.action_key AND earlier.period_key<e.period_key
          AND earlier.status IN ('pending','rejected','settling')))
    ORDER BY e.updated_at,e.period_key,e.id LIMIT ?`)
    .bind(String(telegramId), dayKey(), boundedRecoveryLimit(limit, 2)).all().then(requirePetReadResult);
  for (const row of rows.results || []) {
    try {
      const now = new Date(`${row.period_key.slice(-10)}T12:00:00.000Z`);
      let result;
      if (row.system_key === 'district') {
        result = await processPetDistrictMission(db, telegramId, row.action_key, row, {}, awardReward, null, undefined, null, now);
      } else if (row.system_key === 'event_chain') {
        result = await processPetEventChain(db, telegramId, row.action_key, awardReward, null, undefined, row, null, now);
      } else {
        const boss = getActiveSeasonalBoss(now);
        if (row.action_key !== boss.key || row.period_key !== `${boss.season_instance}:${dayKey(now)}`) throw Error('invalid_saved_raid_period');
        result = await processPetSeasonalBoss(db, telegramId, row, awardReward, undefined, now);
      }
      if (!result?.accepted) throw Error(result?.reason || 'saved_ending_not_ready');
    } catch (error) {
      // Back off this source so a persistent failure cannot monopolize the
      // bounded queue. Other pets/quests can still finish on this refresh.
      await db.prepare(`UPDATE telegram_pet_system_events SET updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND telegram_id=? AND status IN ('pending','rejected','settling')`)
        .bind(row.ending_id, String(telegramId)).run().catch(() => null);
      console.error('moonpet_live_ending_pending', row.system_key, error?.message || String(error));
    }
  }
}

// This is a price/version identifier, not a credential. The server derives it
// from the live catalog; clients must return the quote they actually displayed.
export function getPetEquipmentUpgradeQuote(itemKey, targetLevel) {
  const cost = getPetEquipmentUpgradeCost(targetLevel);
  return { target_level: targetLevel, cost, quote_version: cost
    ? JSON.stringify(['equipment-upgrade-v1', itemKey, targetLevel, Object.entries(cost).sort(([a], [b]) => a.localeCompare(b))])
    : null };
}

export async function processPetEquipmentUpgrade(db, telegramId, itemKey, requestKey, displayedQuote = {}) {
  const replay = await getCompletedRequest(db, telegramId, 'equipment_upgrade', itemKey, requestKey);
  if (replay) return { accepted: true, duplicate: true, reason: 'equipment_already_upgraded', item: parse(replay.payload_json, {}) };
  const item = await db.prepare('SELECT item_key, item_level FROM telegram_pet_equipment_progression WHERE telegram_id=? AND item_key=?').bind(telegramId, itemKey).first().then(requirePetFirstReadResult);
  if (!item) return { accepted: false, reason: 'equipment_not_owned' };
  const target = integer(item.item_level) + 1;
  const cost = getPetEquipmentUpgradeCost(target);
  if (!cost) return { accepted: false, reason: 'equipment_max_level' };
  const quote = getPetEquipmentUpgradeQuote(itemKey, target);
  if (displayedQuote?.target_level !== target || displayedQuote?.quote_version !== quote.quote_version) {
    return { accepted: false, reason: 'upgrade_quote_stale', refresh_state: true };
  }
  const pet = await db.prepare('SELECT pet_xp, moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').bind(telegramId).first().then(requirePetFirstReadResult);
  if (getPetVisibleLevel(pet?.pet_xp) < 15) return { accepted: false, reason: 'equipment_upgrades_locked' };
  if (integer(cost.moon_gold) > 0 && !(await ensurePetAccountWalletReadyForMutation(db, telegramId))) {
    return { accepted: false, reason: 'wallet_reconciliation_recovery_pending', cost };
  }
  const walletRow = integer(cost.moon_gold) > 0
    ? await db.prepare('SELECT moon_gold FROM telegram_pet_profiles WHERE telegram_id=?').bind(telegramId).first().then(requirePetFirstReadResult)
    : pet;
  const balances = await db.prepare('SELECT material_key, quantity FROM telegram_pet_material_balances WHERE telegram_id=?').bind(telegramId).all().then(requirePetReadResult);
  const wallet = { moon_gold: integer(walletRow?.moon_gold), ...Object.fromEntries((balances.results || []).map((row) => [row.material_key, integer(row.quantity)])) };
  if (!Object.entries(cost).every(([key, amount]) => integer(wallet[key]) >= amount)) return { accepted: false, reason: 'upgrade_cost_missing', cost };
  const period = String(requestKey || `level:${target}`);
  const reservation = await reserveSystemEvent(db, telegramId, 'equipment_upgrade', itemKey, period, { target, cost, quote_version: quote.quote_version });
  if (reservation.status === 'completed') return { accepted: true, duplicate: true, reason: 'equipment_already_upgraded' };
  const payableMaterials = Object.entries(cost).filter(([key, amount]) => key !== 'moon_gold' && integer(amount) > 0);
  const materialChecks = payableMaterials.map(() => 'AND EXISTS (SELECT 1 FROM telegram_pet_material_balances WHERE telegram_id=? AND material_key=? AND quantity>=?)').join(' ');
  const materialArgs = payableMaterials.flatMap(([key, amount]) => [telegramId, key, amount]);
  const statements = [
    db.prepare(`UPDATE telegram_pet_system_events SET status='settling', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','rejected')
      AND json_valid(payload_json) AND json_extract(payload_json,'$.target')=?
      AND json_extract(payload_json,'$.quote_version')=?
      AND EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id=? AND moon_gold>=? AND ${getPetVisibleLevelSql('pet_xp')}>=15) ${materialChecks}
      AND ${accountWalletRecoveryResolvedSql('?')}
      AND EXISTS (SELECT 1 FROM telegram_pet_equipment_progression WHERE telegram_id=? AND item_key=? AND item_level=?)`)
      .bind(reservation.id, target, quote.quote_version, telegramId, integer(cost.moon_gold), ...materialArgs, telegramId, telegramId, itemKey, target - 1),
    db.prepare("UPDATE telegram_pet_profiles SET moon_gold=moon_gold-?, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling')").bind(integer(cost.moon_gold), telegramId, reservation.id),
    ...payableMaterials.map(([key, amount]) => db.prepare("UPDATE telegram_pet_material_balances SET quantity=quantity-?, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND material_key=? AND EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling')").bind(amount, telegramId, key, reservation.id)),
    db.prepare("UPDATE telegram_pet_equipment_progression SET item_level=?, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND item_key=? AND item_level=? AND EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling')").bind(target, telegramId, itemKey, target - 1, reservation.id),
    db.prepare("UPDATE telegram_pet_system_events SET status='completed', payload_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='settling'").bind(JSON.stringify({ item_key: itemKey, item_level: target, cost }), reservation.id),
  ];
  const results = await db.batch(statements);
  requireLiveMutationBatch(results, statements.length);
  if (Number(results[0]?.meta?.changes || 0) < 1 || Number(results[results.length - 2]?.meta?.changes || 0) < 1) {
    await db.prepare("UPDATE telegram_pet_system_events SET status='rejected', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status<>'completed'").bind(reservation.id).run();
    return { accepted: false, reason: 'upgrade_conflict', cost };
  }
  return { accepted: true, reason: 'equipment_upgraded', item: { item_key: itemKey, item_level: target }, cost };
}

export async function processPetCosmeticUnlock(db, telegramId, cosmeticKey, requestKey) {
  const sink = typeof cosmeticKey === 'string' && Object.prototype.hasOwnProperty.call(PET_COSMETIC_SINKS, cosmeticKey) ? PET_COSMETIC_SINKS[cosmeticKey] : null;
  if (!sink) return { accepted: false, reason: 'cosmetic_invalid' };
  const replay = await getCompletedRequest(db, telegramId, 'cosmetic', cosmeticKey, requestKey);
  if (replay) return { accepted: true, duplicate: true, reason: 'cosmetic_already_unlocked', cosmetic: parse(replay.payload_json, {}) };
  const owned = await db.prepare('SELECT quantity FROM telegram_pet_cosmetic_unlocks WHERE telegram_id=? AND cosmetic_key=?').bind(telegramId, cosmeticKey).first().then(requirePetFirstReadResult);
  if (owned && !sink.repeatable) return { accepted: false, reason: 'cosmetic_owned' };
  const profileKeys = ['moon_gold', 'moon_crystals', 'style_tokens'];
  const profileCosts = Object.fromEntries(Object.entries(sink.cost).filter(([key]) => profileKeys.includes(key)));
  const materialCosts = Object.entries(sink.cost).filter(([key, amount]) => !profileKeys.includes(key) && integer(amount) > 0);
  if (Object.values(profileCosts).some((amount) => integer(amount) > 0) && !(await ensurePetAccountWalletReadyForMutation(db, telegramId))) {
    return { accepted: false, reason: 'wallet_reconciliation_recovery_pending', cost: sink.cost };
  }
  const pet = await db.prepare('SELECT moon_gold, moon_crystals, style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').bind(telegramId).first().then(requirePetFirstReadResult);
  const mats = await db.prepare('SELECT material_key, quantity FROM telegram_pet_material_balances WHERE telegram_id=?').bind(telegramId).all().then(requirePetReadResult);
  const wallet = { ...pet, ...Object.fromEntries((mats.results || []).map((row) => [row.material_key, row.quantity])) };
  if (!Object.entries(sink.cost).every(([key, amount]) => integer(wallet[key]) >= amount)) return { accepted: false, reason: 'cosmetic_cost_missing', cost: sink.cost };
  const serial = sink.repeatable ? integer(owned?.quantity) + 1 : 1;
  const reservation = await reserveSystemEvent(db, telegramId, 'cosmetic', cosmeticKey, String(requestKey || `unlock:${serial}`), { cost: sink.cost });
  if (reservation.status === 'completed') return { accepted: true, duplicate: true, reason: 'cosmetic_already_unlocked', cosmetic: { key: cosmeticKey, quantity: integer(owned?.quantity) } };
  const profileCheck = Object.entries(profileCosts).map(([key]) => `${key}>=?`).join(' AND ') || '1=1';
  const materialChecks = materialCosts.map(() => 'AND EXISTS (SELECT 1 FROM telegram_pet_material_balances WHERE telegram_id=? AND material_key=? AND quantity>=?)').join(' ');
  const results = await db.batch([
    db.prepare(`UPDATE telegram_pet_system_events SET status='settling', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','rejected')
      AND EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id=? AND ${profileCheck}) ${materialChecks}
      AND ${accountWalletRecoveryResolvedSql('?')}
      ${sink.repeatable ? '' : 'AND NOT EXISTS (SELECT 1 FROM telegram_pet_cosmetic_unlocks WHERE telegram_id=? AND cosmetic_key=?)'}`)
      .bind(reservation.id, telegramId, ...Object.values(profileCosts), ...materialCosts.flatMap(([key, amount]) => [telegramId, key, amount]), telegramId, ...(sink.repeatable ? [] : [telegramId, cosmeticKey])),
    ...Object.entries(profileCosts).map(([key, amount]) => db.prepare(`UPDATE telegram_pet_profiles SET ${key}=${key}-?, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling')`).bind(amount, telegramId, reservation.id)),
    ...materialCosts.map(([key, amount]) => db.prepare("UPDATE telegram_pet_material_balances SET quantity=quantity-?, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND material_key=? AND EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling')").bind(amount, telegramId, key, reservation.id)),
    db.prepare(`INSERT INTO telegram_pet_cosmetic_unlocks (telegram_id, cosmetic_key, quantity)
      SELECT ?, ?, 1 WHERE EXISTS (SELECT 1 FROM telegram_pet_system_events WHERE id=? AND status='settling')
      ON CONFLICT(telegram_id, cosmetic_key) DO UPDATE SET quantity=quantity+1, updated_at=CURRENT_TIMESTAMP`).bind(telegramId, cosmeticKey, reservation.id),
    db.prepare("UPDATE telegram_pet_system_events SET status='completed', payload_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='settling'").bind(JSON.stringify({ key: cosmeticKey, quantity: serial, cost: sink.cost }), reservation.id),
  ]);
  requireLiveMutationBatch(results, Object.keys(profileCosts).length + materialCosts.length + 3);
  if (Number(results[0]?.meta?.changes || 0) < 1) {
    await db.prepare("UPDATE telegram_pet_system_events SET status='rejected', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status<>'completed'").bind(reservation.id).run();
    return { accepted: false, reason: 'cosmetic_settlement_conflict', cost: sink.cost };
  }
  const committed = { accepted: true, reason: 'cosmetic_unlocked', cosmetic: { key: cosmeticKey, quantity: serial }, cost: sink.cost };
  return projectCommittedPetResult(committed, async () => {
    const settled = await db.prepare('SELECT quantity FROM telegram_pet_cosmetic_unlocks WHERE telegram_id=? AND cosmetic_key=?').bind(telegramId, cosmeticKey).first().then(requirePetFirstReadResult);
    return { ...committed, cosmetic: { key: cosmeticKey, quantity: integer(settled?.quantity) } };
  });
}
