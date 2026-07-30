import {
  PET_PROGRESSION_TRACKS,
  clampPetTrackAward,
  getPetJobRank,
  getPetTrackLevel,
  getPetTraitProgress,
  getUnlockedPetTraits,
} from './progression-phase-2.js';
import {
  clampPetMaterialStack,
  normalizePetMaterial,
  resolvePetRareDrop,
} from './economy-phase-3.js';
import {
  formatPetEquipmentProgression,
  getPetEquipmentMasteryAward,
} from './equipment-progression.js';

const TRACK_COLUMNS = Object.freeze({
  care: Object.freeze({ total: 'care_xp', daily: 'care_daily' }),
  training: Object.freeze({ total: 'training_xp', daily: 'training_daily' }),
  adventure: Object.freeze({ total: 'adventure_xp', daily: 'adventure_daily' }),
  arena: Object.freeze({ total: 'arena_xp', daily: 'arena_daily' }),
  job: Object.freeze({ total: 'job_xp', daily: 'job_daily' }),
  bond: Object.freeze({ total: 'bond_xp', daily: 'bond_daily' }),
});

const ACTION_TRACK_AWARDS = Object.freeze({
  feed: Object.freeze({ care: 8, bond: 5 }),
  play: Object.freeze({ care: 7, bond: 6 }),
  clean: Object.freeze({ care: 6, bond: 4 }),
  sleep: Object.freeze({ care: 5, bond: 3 }),
  train: Object.freeze({ care: 3, training: 12 }),
  timed_train: Object.freeze({ training: 18 }),
  explore: Object.freeze({ adventure: 14 }),
  run_step: Object.freeze({ adventure: 10 }),
  run_extract: Object.freeze({ adventure: 24 }),
  run_boss: Object.freeze({ adventure: 30, arena: 8 }),
  arena_attack: Object.freeze({ arena: 5 }),
  arena_block: Object.freeze({ arena: 5 }),
  arena_complete: Object.freeze({ arena: 20 }),
  job: Object.freeze({ job: 14 }),
  timed_work: Object.freeze({ job: 20 }),
  daily_chest: Object.freeze({ bond: 8 }),
});

const ACTION_DROP_TABLE = Object.freeze({
  job: 'job',
  timed_work: 'job',
  run_extract: 'run',
  run_boss: 'run',
  arena_complete: 'arena',
  kaiju_win: 'kaiju',
});

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function safeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function parseJsonObject(value) {
  try {
    return safeObject(JSON.parse(String(value || '{}')));
  } catch {
    return {};
  }
}

export function normalizePetRuntimeAction(value) {
  const key = String(value || '').trim().toLowerCase();
  return hasOwn(ACTION_TRACK_AWARDS, key) || hasOwn(ACTION_DROP_TABLE, key) ? key : null;
}

export function buildPetRuntimeAwardPlan(action, options = {}) {
  const key = normalizePetRuntimeAction(action);
  if (!key) return null;
  const plan = {
    action: key,
    tracks: { ...(ACTION_TRACK_AWARDS[key] || {}) },
    traits: getPetTraitProgress(key, options.trait_amount ?? 1),
    equipment_action: String(options.equipment_action || key),
    material: null,
  };
  const table = ACTION_DROP_TABLE[key];
  if (table && options.drop_roll !== undefined) {
    plan.material = resolvePetRareDrop(table, options.drop_roll);
  }
  return plan;
}

export function calculatePetRuntimeTrackAwards(plan, state = {}) {
  const awards = {};
  for (const [track, requested] of Object.entries(plan?.tracks || {})) {
    if (!hasOwn(PET_PROGRESSION_TRACKS, track) || !hasOwn(TRACK_COLUMNS, track)) continue;
    const dailyColumn = TRACK_COLUMNS[track].daily;
    const award = clampPetTrackAward(track, requested, state[dailyColumn]);
    if (award > 0) awards[track] = award;
  }
  return awards;
}

export function mergePetTraitProgress(currentJson, traitAwards = {}) {
  const current = parseJsonObject(currentJson);
  const next = { ...current };
  for (const [trait, award] of Object.entries(traitAwards)) {
    next[trait] = Math.max(0, Math.floor(Number(next[trait]) || 0) + Math.max(0, Math.floor(Number(award) || 0)));
  }
  return next;
}

export function buildPetProgressSummary(state = {}) {
  const lines = ['📈 PET PROGRESSION'];
  for (const [track, columns] of Object.entries(TRACK_COLUMNS)) {
    const xp = Math.max(0, Math.floor(Number(state[columns.total]) || 0));
    lines.push(`${PET_PROGRESSION_TRACKS[track].label}: ${xp} · Lv.${getPetTrackLevel(xp)}`);
  }
  lines.push(`Job rank: ${getPetJobRank(state.job_xp)}`);
  const traits = getUnlockedPetTraits(parseJsonObject(state.traits_json));
  lines.push(`Traits: ${traits.length ? traits.join(', ') : 'none unlocked'}`);
  lines.push(`Prestige: ${Math.max(0, Math.floor(Number(state.prestige_count) || 0))}`);
  return lines.join('\n');
}

export function buildPetGearSummary(rows = []) {
  const lines = ['🧰 PET GEAR'];
  if (!Array.isArray(rows) || rows.length === 0) return `${lines[0]}\nNo equipment progression recorded yet.`;
  for (const row of rows) {
    const text = formatPetEquipmentProgression(row.item_key, row);
    if (text) lines.push(text);
  }
  return lines.join('\n');
}

export async function getOrCreatePetRuntimeState(db, telegramId, dayKey) {
  const id = String(telegramId || '').trim();
  const day = String(dayKey || '').trim();
  await db.prepare(`INSERT OR IGNORE INTO telegram_pet_progression_state (telegram_id, daily_key) VALUES (?, ?)`).bind(id, day).run();
  let state = await db.prepare(`SELECT * FROM telegram_pet_progression_state WHERE telegram_id = ?`).bind(id).first();
  if (state && state.daily_key !== day) {
    await db.prepare(`UPDATE telegram_pet_progression_state SET daily_key = ?, care_daily = 0, training_daily = 0, adventure_daily = 0, arena_daily = 0, job_daily = 0, bond_daily = 0, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?`).bind(day, id).run();
    state = await db.prepare(`SELECT * FROM telegram_pet_progression_state WHERE telegram_id = ?`).bind(id).first();
  }
  return state;
}

export async function applyPetRuntimeAward(db, telegramId, eventKey, action, options = {}) {
  const id = String(telegramId || '').trim();
  const stableEventKey = String(eventKey || '').trim();
  const plan = buildPetRuntimeAwardPlan(action, options);
  if (!id || !stableEventKey || !plan) return { ok: false, code: 'invalid_runtime_award' };

  const inserted = await db.prepare(`INSERT INTO telegram_pet_runtime_events (id, telegram_id, event_key, action, payload_json) VALUES (?, ?, ?, ?, ?) ON CONFLICT (telegram_id, event_key) DO NOTHING RETURNING id`)
    .bind(crypto.randomUUID(), id, stableEventKey, plan.action, JSON.stringify(plan)).first();
  if (!inserted) return { ok: true, duplicate: true, tracks: {}, traits: {}, material: null };

  const state = await getOrCreatePetRuntimeState(db, id, options.day_key || new Date().toISOString().slice(0, 10));
  const trackAwards = calculatePetRuntimeTrackAwards(plan, state || {});
  const nextTraits = mergePetTraitProgress(state?.traits_json, plan.traits);

  const assignments = ['traits_json = ?', 'updated_at = CURRENT_TIMESTAMP'];
  const values = [JSON.stringify(nextTraits)];
  for (const [track, award] of Object.entries(trackAwards)) {
    const columns = TRACK_COLUMNS[track];
    assignments.push(`${columns.total} = ${columns.total} + ?`, `${columns.daily} = ${columns.daily} + ?`);
    values.push(award, award);
  }
  values.push(id);
  await db.prepare(`UPDATE telegram_pet_progression_state SET ${assignments.join(', ')} WHERE telegram_id = ?`).bind(...values).run();

  let material = null;
  if (plan.material && normalizePetMaterial(plan.material)) {
    const quantity = Math.max(1, Math.min(25, Math.floor(Number(options.material_amount) || 1)));
    const existing = await db.prepare(`SELECT quantity FROM telegram_pet_material_balances WHERE telegram_id = ? AND material_key = ?`).bind(id, plan.material).first();
    const nextQuantity = clampPetMaterialStack(plan.material, existing?.quantity, quantity);
    await db.prepare(`INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity) VALUES (?, ?, ?) ON CONFLICT (telegram_id, material_key) DO UPDATE SET quantity = excluded.quantity, updated_at = CURRENT_TIMESTAMP`).bind(id, plan.material, nextQuantity).run();
    material = { key: plan.material, quantity_awarded: quantity, balance: nextQuantity };
  }

  const equipmentAwards = [];
  for (const row of Array.isArray(options.equipment_rows) ? options.equipment_rows : []) {
    const mastery = getPetEquipmentMasteryAward(row.item_key, plan.equipment_action, options.equipment_mastery_amount ?? 1);
    if (mastery > 0) equipmentAwards.push({ item_key: row.item_key, mastery_xp: mastery });
  }

  return { ok: true, duplicate: false, tracks: trackAwards, traits: plan.traits, material, equipment_awards: equipmentAwards };
}
