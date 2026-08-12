import { PET_EVENT_CHAINS, PET_FACTION_BONUSES, PET_REGION_CONTENT, PET_SEASONAL_BOSSES } from './content-phase-4.js';
import { PET_COSMETIC_SINKS, PET_PRESTIGE_REQUIREMENTS, getPetEquipmentUpgradeCost } from './economy-phase-3.js';
import { buildPetRegionDirectory } from './game-content.js';

const integer = (value) => Math.max(0, Math.floor(Number(value) || 0));
const parse = (value, fallback) => { try { return JSON.parse(value || ''); } catch { return fallback; } };
const dayKey = (now = new Date()) => now.toISOString().slice(0, 10);

export function getActiveSeasonalBoss(now = new Date()) {
  const entries = Object.entries(PET_SEASONAL_BOSSES);
  const epochWeek = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 604800000);
  const [key, boss] = entries[((epochWeek % entries.length) + entries.length) % entries.length];
  return { key, ...boss, hp: boss.phases * 300, title: key.replaceAll('_', ' ') };
}

export function applyPetFactionBonus(rewards = {}, factionKey, system) {
  const bonus = PET_FACTION_BONUSES[String(factionKey || '').toLowerCase()];
  const output = { ...rewards };
  if (!bonus || bonus.system !== system) return { rewards: output, bonus: null };
  const pct = integer(bonus.effect.job_reward_pct || bonus.effect.event_reward_pct || bonus.effect.run_reward_pct || bonus.effect.arena_reward_pct || 0);
  if (pct) for (const key of ['moon_gold', 'moon_crystals', 'style_tokens', 'pet_xp']) {
    if (output[key]) output[key] = integer(Number(output[key]) * (100 + pct) / 100);
  }
  if (bonus.effect.style_reward_pct && output.style_tokens) output.style_tokens = integer(Number(output.style_tokens) * (100 + bonus.effect.style_reward_pct) / 100);
  return { rewards: output, bonus: { faction: factionKey, system: bonus.system, effect: bonus.effect } };
}

export async function buildPetLiveSystemsState(db, telegramId, pet, runtime, gear = [], materials = []) {
  const mastery = parse(runtime?.region_mastery_json, {});
  const completed = parse(runtime?.completed_regions_json, []);
  const [chains, bossProgress, cosmetics, factionRow] = await Promise.all([
    db.prepare('SELECT chain_key, step_index, completed_cycles FROM telegram_pet_event_chain_progress WHERE telegram_id = ?').bind(telegramId).all().catch(() => ({ results: [] })),
    db.prepare('SELECT season_key, boss_key, damage, defeated_at, reward_claimed_at FROM telegram_pet_seasonal_boss_progress WHERE telegram_id = ?').bind(telegramId).all().catch(() => ({ results: [] })),
    db.prepare('SELECT cosmetic_key, quantity, unlocked_at FROM telegram_pet_cosmetic_unlocks WHERE telegram_id = ?').bind(telegramId).all().catch(() => ({ results: [] })),
    db.prepare('SELECT faction FROM telegram_progression WHERE telegram_id = ?').bind(telegramId).first().catch(() => null),
  ]);
  const chainRows = new Map((chains.results || []).map((row) => [row.chain_key, row]));
  const chainState = Object.entries(PET_EVENT_CHAINS).map(([key, chain]) => {
    const row = chainRows.get(key) || { step_index: 0, completed_cycles: 0 };
    return { key, steps: [...chain.steps], current_step: chain.steps[integer(row.step_index)] || chain.steps[0], step_index: integer(row.step_index), completed_cycles: integer(row.completed_cycles), final_outcomes: [...chain.final_outcomes] };
  });
  const boss = getActiveSeasonalBoss();
  const bossRow = (bossProgress.results || []).find((row) => row.boss_key === boss.key && row.season_key === boss.season) || {};
  const materialMap = Object.fromEntries((materials || []).map((row) => [row.material_key || row.key, integer(row.quantity)]));
  const upgradeRows = (gear || []).map((item) => {
    const target = integer(item.item_level) + 1;
    const cost = getPetEquipmentUpgradeCost(target);
    const affordable = cost && Object.entries(cost).every(([key, amount]) => integer(key === 'moon_gold' ? pet.moon_gold : materialMap[key]) >= amount);
    return { ...item, target_level: target, cost, maxed: !cost, affordable: Boolean(affordable) };
  });
  const unlockedCosmetics = new Map((cosmetics.results || []).map((row) => [row.cosmetic_key, row]));
  const cosmeticState = Object.entries(PET_COSMETIC_SINKS).map(([key, sink]) => ({ key, ...sink, unlocked: unlockedCosmetics.has(key), quantity: integer(unlockedCosmetics.get(key)?.quantity) }));
  const masteredItems = gear.filter((item) => integer(item.mastery_tier) >= 5).length;
  const prestige = {
    requirements: PET_PRESTIGE_REQUIREMENTS,
    mastered_items: masteredItems,
    completed_regions: completed.length,
    count: integer(runtime?.prestige_count),
    ready: integer(pet.level) >= PET_PRESTIGE_REQUIREMENTS.min_level && masteredItems >= 3 && completed.length >= 4
      && integer(pet.moon_gold) >= 5000 && integer(pet.moon_crystals) >= 50,
  };
  const faction = String(factionRow?.faction || 'unaligned');
  return {
    regions: buildPetRegionDirectory(pet.level, mastery).map((region) => ({ ...region, completed: completed.includes(region.key), energy_cost: 10, mastery_gain: 25 })),
    chains: chainState,
    seasonal_boss: { ...boss, damage: integer(bossRow.damage), defeated_at: bossRow.defeated_at || null, reward_claimed_at: bossRow.reward_claimed_at || null, available: integer(pet.level) >= boss.min_level && !bossRow.defeated_at },
    upgrades: upgradeRows,
    cosmetics: cosmeticState,
    prestige,
    faction: { key: faction, bonus: PET_FACTION_BONUSES[faction] || null },
  };
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

export async function processPetDistrictMission(db, telegramId, regionKey, pet, runtime, awardReward, factionKey) {
  const directory = buildPetRegionDirectory(pet.level, parse(runtime?.region_mastery_json, {}));
  const region = directory.find((entry) => entry.key === String(regionKey || ''));
  if (!region) return { accepted: false, reason: 'district_invalid' };
  if (!region.playable) return { accepted: false, reason: 'district_locked', region };
  if (integer(pet.energy) < 10) return { accepted: false, reason: 'pet_tired' };
  const reservation = await reserveSystemEvent(db, telegramId, 'district', region.key, dayKey(), { region_key: region.key });
  if (!reservation.fresh && reservation.status === 'completed') return { accepted: true, duplicate: true, reason: 'district_completed_today', region };
  if (reservation.fresh) {
    const charged = await db.prepare('UPDATE telegram_pet_profiles SET energy = energy - 10, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ? AND energy >= 10').bind(telegramId).run();
    if (Number(charged?.meta?.changes || 0) < 1) {
      await db.prepare("UPDATE telegram_pet_system_events SET status='rejected', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(reservation.id).run();
      return { accepted: false, reason: 'pet_tired' };
    }
  }
  const content = PET_REGION_CONTENT[region.key];
  const mastery = parse(runtime?.region_mastery_json, {});
  const nextMastery = integer(mastery[region.key]) + 25;
  const bossVictory = nextMastery % 100 === 0;
  const rewardMaterial = content.reward_focus[(Math.floor(nextMastery / 25) - 1) % content.reward_focus.length];
  const baseRewards = { pet_xp: bossVictory ? 55 : 25, moon_gold: bossVictory ? 65 : 28, materials: { [rewardMaterial]: bossVictory ? 3 : 1 } };
  const adjusted = applyPetFactionBonus(baseRewards, factionKey, 'runs');
  const awarded = await awardReward({
    telegram_id: telegramId, source: 'pet_district', idempotency_key: `district:${reservation.id}`, event_key: `district:${reservation.id}`,
    event_type: 'district_mission', reason: `${region.key}:${bossVictory ? 'boss' : 'encounter'}`, rewards: adjusted.rewards,
    touch_streak: true, context: { region_key: region.key, boss: bossVictory ? content.boss : null, faction_bonus: adjusted.bonus },
  });
  if (!awarded.accepted) return awarded;
  mastery[region.key] = nextMastery;
  const completed = new Set(parse(runtime?.completed_regions_json, []));
  if (nextMastery >= 100) completed.add(region.key);
  await db.batch([
    db.prepare(`UPDATE telegram_pet_progression_state SET region_mastery_json=?, completed_regions_json=?, adventure_xp=adventure_xp+25, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?`).bind(JSON.stringify(mastery), JSON.stringify([...completed]), telegramId),
    db.prepare("UPDATE telegram_pet_system_events SET status='completed', payload_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(JSON.stringify({ region_key: region.key, mastery: nextMastery, boss: bossVictory }), reservation.id),
  ]);
  return { ...awarded, reason: bossVictory ? 'district_boss_defeated' : 'district_mission_complete', region: { ...region, mastery_xp: nextMastery }, boss: bossVictory ? content.boss : null, faction_bonus: adjusted.bonus };
}

export async function processPetEventChain(db, telegramId, chainKey, awardReward, factionKey) {
  const chain = PET_EVENT_CHAINS[String(chainKey || '')];
  if (!chain) return { accepted: false, reason: 'event_chain_invalid' };
  const row = await db.prepare('SELECT step_index, completed_cycles FROM telegram_pet_event_chain_progress WHERE telegram_id=? AND chain_key=?').bind(telegramId, chainKey).first();
  const stepIndex = integer(row?.step_index);
  const reservation = await reserveSystemEvent(db, telegramId, 'event_chain', chainKey, dayKey(), { step_index: stepIndex });
  if (!reservation.fresh) return { accepted: true, duplicate: true, reason: 'event_chain_step_used_today' };
  const final = stepIndex >= chain.steps.length - 1;
  const reward = applyPetFactionBonus({ pet_xp: final ? 45 : 18, moon_gold: final ? 50 : 16, style_tokens: final ? 4 : 1 }, factionKey, 'events');
  const awarded = await awardReward({ telegram_id: telegramId, source: 'pet_event_chain', idempotency_key: `chain:${reservation.id}`, event_key: `chain:${reservation.id}`, event_type: 'event_chain', reason: `${chainKey}:${chain.steps[stepIndex]}`, rewards: reward.rewards, touch_streak: true, context: { chain_key: chainKey, step: chain.steps[stepIndex], final, faction_bonus: reward.bonus } });
  if (!awarded.accepted) return awarded;
  await db.batch([
    db.prepare(`INSERT INTO telegram_pet_event_chain_progress (telegram_id, chain_key, step_index, completed_cycles) VALUES (?, ?, ?, ?)
      ON CONFLICT(telegram_id, chain_key) DO UPDATE SET step_index=excluded.step_index, completed_cycles=excluded.completed_cycles, updated_at=CURRENT_TIMESTAMP`)
      .bind(telegramId, chainKey, final ? 0 : stepIndex + 1, integer(row?.completed_cycles) + (final ? 1 : 0)),
    db.prepare("UPDATE telegram_pet_system_events SET status='completed', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(reservation.id),
  ]);
  return { ...awarded, reason: final ? 'event_chain_completed' : 'event_chain_advanced', chain_key: chainKey, step: chain.steps[stepIndex], final, faction_bonus: reward.bonus };
}

export async function processPetSeasonalBoss(db, telegramId, pet, awardReward) {
  const boss = getActiveSeasonalBoss();
  if (integer(pet.level) < boss.min_level) return { accepted: false, reason: 'seasonal_boss_locked', required_level: boss.min_level };
  const existing = await db.prepare('SELECT damage, defeated_at FROM telegram_pet_seasonal_boss_progress WHERE telegram_id=? AND season_key=? AND boss_key=?').bind(telegramId, boss.season, boss.key).first();
  if (existing?.defeated_at) return { accepted: false, reason: 'seasonal_boss_defeated', boss };
  if (integer(pet.energy) < 18) return { accepted: false, reason: 'pet_tired' };
  const reservation = await reserveSystemEvent(db, telegramId, 'seasonal_boss', boss.key, dayKey(), {});
  if (!reservation.fresh) return { accepted: true, duplicate: true, reason: 'seasonal_boss_attempt_used' };
  const charged = await db.prepare('UPDATE telegram_pet_profiles SET energy=energy-18, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND energy>=18').bind(telegramId).run();
  if (Number(charged?.meta?.changes || 0) < 1) return { accepted: false, reason: 'pet_tired' };
  const damage = 35 + integer(pet.level) * 2;
  const total = Math.min(boss.hp, integer(existing?.damage) + damage);
  const defeated = total >= boss.hp;
  await db.prepare(`INSERT INTO telegram_pet_seasonal_boss_progress (telegram_id, season_key, boss_key, damage, defeated_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(telegram_id, season_key, boss_key) DO UPDATE SET damage=excluded.damage, defeated_at=COALESCE(telegram_pet_seasonal_boss_progress.defeated_at, excluded.defeated_at), updated_at=CURRENT_TIMESTAMP`)
    .bind(telegramId, boss.season, boss.key, total, defeated ? new Date().toISOString() : null).run();
  let reward = null;
  if (defeated) reward = await awardReward({ telegram_id: telegramId, source: 'pet_seasonal_boss', idempotency_key: `seasonal:${boss.season}:${telegramId}`, event_key: `seasonal:${boss.season}:${telegramId}`, event_type: 'seasonal_boss', reason: boss.key, rewards: { pet_xp: 150, moon_gold: 250, moon_crystals: 8, materials: { [boss.reward]: 8, mastery_token: 1 } }, touch_streak: true, context: { boss_key: boss.key, season_key: boss.season } });
  await db.prepare("UPDATE telegram_pet_system_events SET status='completed', payload_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(JSON.stringify({ damage, total, defeated }), reservation.id).run();
  return { accepted: true, reason: defeated ? 'seasonal_boss_defeated' : 'seasonal_boss_hit', damage, progress: { damage: total, hp: boss.hp, defeated }, boss, rewards: reward?.rewards || null };
}

export async function processPetEquipmentUpgrade(db, telegramId, itemKey) {
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
  const period = `level:${target}`;
  const reservation = await reserveSystemEvent(db, telegramId, 'equipment_upgrade', itemKey, period, { target, cost });
  if (!reservation.fresh) return { accepted: true, duplicate: true, reason: 'equipment_already_upgraded' };
  const statements = [
    db.prepare('UPDATE telegram_pet_profiles SET moon_gold=moon_gold-?, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND moon_gold>=?').bind(integer(cost.moon_gold), telegramId, integer(cost.moon_gold)),
    ...Object.entries(cost).filter(([key]) => key !== 'moon_gold').map(([key, amount]) => db.prepare('UPDATE telegram_pet_material_balances SET quantity=quantity-?, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND material_key=? AND quantity>=?').bind(amount, telegramId, key, amount)),
    db.prepare('UPDATE telegram_pet_equipment_progression SET item_level=?, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND item_key=? AND item_level=?').bind(target, telegramId, itemKey, target - 1),
    db.prepare("UPDATE telegram_pet_system_events SET status='completed', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(reservation.id),
  ];
  const results = await db.batch(statements);
  if (Number(results[results.length - 2]?.meta?.changes || 0) < 1) return { accepted: false, reason: 'upgrade_conflict' };
  return { accepted: true, reason: 'equipment_upgraded', item: { item_key: itemKey, item_level: target }, cost };
}

export async function processPetCosmeticUnlock(db, telegramId, cosmeticKey) {
  const sink = PET_COSMETIC_SINKS[String(cosmeticKey || '')];
  if (!sink) return { accepted: false, reason: 'cosmetic_invalid' };
  const owned = await db.prepare('SELECT quantity FROM telegram_pet_cosmetic_unlocks WHERE telegram_id=? AND cosmetic_key=?').bind(telegramId, cosmeticKey).first();
  if (owned && !sink.repeatable) return { accepted: false, reason: 'cosmetic_owned' };
  const pet = await db.prepare('SELECT moon_gold, moon_crystals, style_tokens FROM telegram_pet_profiles WHERE telegram_id=?').bind(telegramId).first();
  const mats = await db.prepare('SELECT material_key, quantity FROM telegram_pet_material_balances WHERE telegram_id=?').bind(telegramId).all();
  const wallet = { ...pet, ...Object.fromEntries((mats.results || []).map((row) => [row.material_key, row.quantity])) };
  if (!Object.entries(sink.cost).every(([key, amount]) => integer(wallet[key]) >= amount)) return { accepted: false, reason: 'cosmetic_cost_missing', cost: sink.cost };
  const serial = sink.repeatable ? integer(owned?.quantity) + 1 : 1;
  const reservation = await reserveSystemEvent(db, telegramId, 'cosmetic', cosmeticKey, `unlock:${serial}`, { cost: sink.cost });
  const profileKeys = ['moon_gold', 'moon_crystals', 'style_tokens'];
  const profileCosts = Object.fromEntries(Object.entries(sink.cost).filter(([key]) => profileKeys.includes(key)));
  await db.batch([
    ...Object.entries(profileCosts).map(([key, amount]) => db.prepare(`UPDATE telegram_pet_profiles SET ${key}=${key}-?, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND ${key}>=?`).bind(amount, telegramId, amount)),
    ...Object.entries(sink.cost).filter(([key]) => !profileKeys.includes(key)).map(([key, amount]) => db.prepare('UPDATE telegram_pet_material_balances SET quantity=quantity-?, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND material_key=? AND quantity>=?').bind(amount, telegramId, key, amount)),
    db.prepare(`INSERT INTO telegram_pet_cosmetic_unlocks (telegram_id, cosmetic_key, quantity) VALUES (?, ?, 1)
      ON CONFLICT(telegram_id, cosmetic_key) DO UPDATE SET quantity=quantity+1, updated_at=CURRENT_TIMESTAMP`).bind(telegramId, cosmeticKey),
    db.prepare("UPDATE telegram_pet_system_events SET status='completed', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(reservation.id),
  ]);
  return { accepted: true, reason: 'cosmetic_unlocked', cosmetic: { key: cosmeticKey, quantity: serial }, cost: sink.cost };
}

export async function processPetPrestige(db, telegramId, liveState) {
  if (!liveState?.prestige?.ready) return { accepted: false, reason: 'prestige_requirements_missing', prestige: liveState?.prestige };
  const target = integer(liveState.prestige.count) + 1;
  const reservation = await reserveSystemEvent(db, telegramId, 'prestige', 'ascend', `rank:${target}`, {});
  if (!reservation.fresh) return { accepted: true, duplicate: true, reason: 'prestige_already_applied' };
  await db.batch([
    db.prepare('UPDATE telegram_pet_profiles SET moon_gold=moon_gold-5000, moon_crystals=moon_crystals-50, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND moon_gold>=5000 AND moon_crystals>=50').bind(telegramId),
    db.prepare('UPDATE telegram_pet_progression_state SET prestige_count=prestige_count+1, updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?').bind(telegramId),
    db.prepare(`INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity) VALUES (?, 'mastery_token', 3)
      ON CONFLICT(telegram_id, material_key) DO UPDATE SET quantity=MIN(9999, quantity+3), updated_at=CURRENT_TIMESTAMP`).bind(telegramId),
    db.prepare("UPDATE telegram_pet_system_events SET status='completed', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(reservation.id),
  ]);
  return { accepted: true, reason: 'prestige_complete', prestige_count: target, rewards: { mastery_token: 3 } };
}
