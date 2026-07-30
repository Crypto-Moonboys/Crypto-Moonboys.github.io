import {
  PET_PROGRESSION_TRACKS,
  clampPetTrackAward,
  getPetJobRank,
  getPetTrackLevel,
  getPetTraitProgress,
  getUnlockedPetTraits,
} from './progression-phase-2.js';
import {
  PET_CRAFTING_MATERIALS,
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

function firstBatchRow(result) {
  return Array.isArray(result?.results) ? (result.results[0] || null) : null;
}

function buildAtomicStateUpdate(plan, claimId, telegramId, dayKey) {
  const assignments = ['daily_key = ?', 'updated_at = CURRENT_TIMESTAMP'];
  const bindings = [dayKey];
  const claimSql = 'EXISTS (SELECT 1 FROM telegram_pet_runtime_events WHERE id = ?)';

  for (const [track, columns] of Object.entries(TRACK_COLUMNS)) {
    const requested = Math.max(0, Math.floor(Number(plan.tracks?.[track]) || 0));
    const cap = PET_PROGRESSION_TRACKS[track].max_daily_award;
    const priorDaily = `CASE WHEN daily_key = ? THEN ${columns.daily} ELSE 0 END`;
    const credited = `CASE WHEN ${claimSql} THEN MIN(?, MAX(0, ? - ${priorDaily})) ELSE 0 END`;
    assignments.push(`${columns.total} = ${columns.total} + ${credited}`);
    bindings.push(claimId, requested, cap, dayKey);
    assignments.push(`${columns.daily} = ${priorDaily} + ${credited}`);
    bindings.push(dayKey, claimId, requested, cap, dayKey);
  }

  const traitEntries = Object.entries(plan.traits || {});
  if (traitEntries.length) {
    const jsonArgs = [];
    const jsonBindings = [];
    for (const [trait, rawAward] of traitEntries) {
      const award = Math.max(0, Math.floor(Number(rawAward) || 0));
      jsonArgs.push(`'$.${trait}', COALESCE(json_extract(CASE WHEN json_valid(traits_json) THEN traits_json ELSE '{}' END, '$.${trait}'), 0) + CASE WHEN ${claimSql} THEN ? ELSE 0 END`);
      jsonBindings.push(claimId, award);
    }
    assignments.push(`traits_json = json_set(CASE WHEN json_valid(traits_json) THEN traits_json ELSE '{}' END, ${jsonArgs.join(', ')})`);
    bindings.push(...jsonBindings);
  }

  bindings.push(telegramId, claimId);
  return {
    sql: `UPDATE telegram_pet_progression_state SET ${assignments.join(', ')} WHERE telegram_id = ? AND EXISTS (SELECT 1 FROM telegram_pet_runtime_events WHERE id = ?) RETURNING *`,
    bindings,
  };
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

export function calculateCreditedMaterialAmount(beforeQuantity, afterQuantity) {
  const before = Math.max(0, Math.floor(Number(beforeQuantity) || 0));
  const after = Math.max(0, Math.floor(Number(afterQuantity) || 0));
  return Math.max(0, after - before);
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
  if (!id || !stableEventKey || !plan || typeof db?.batch !== 'function') return { ok: false, code: 'invalid_runtime_award' };

  const dayKey = String(options.day_key || new Date().toISOString().slice(0, 10));
  const claimId = crypto.randomUUID();
  const stateUpdate = buildAtomicStateUpdate(plan, claimId, id, dayKey);
  const statements = [
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_progression_state (telegram_id, daily_key) VALUES (?, ?)`).bind(id, dayKey),
    db.prepare(`SELECT * FROM telegram_pet_progression_state WHERE telegram_id = ?`).bind(id),
    db.prepare(`INSERT INTO telegram_pet_runtime_events (id, telegram_id, event_key, action, payload_json) VALUES (?, ?, ?, ?, ?) ON CONFLICT (telegram_id, event_key) DO NOTHING RETURNING id`).bind(claimId, id, stableEventKey, plan.action, JSON.stringify(plan)),
    db.prepare(stateUpdate.sql).bind(...stateUpdate.bindings),
  ];

  let materialBeforeIndex = -1;
  let materialAfterIndex = -1;
  let requestedMaterialQuantity = 0;
  if (plan.material && normalizePetMaterial(plan.material)) {
    requestedMaterialQuantity = Math.max(1, Math.min(25, Math.floor(Number(options.material_amount) || 1)));
    const maxStack = PET_CRAFTING_MATERIALS[plan.material].max_stack;
    materialBeforeIndex = statements.length;
    statements.push(db.prepare(`SELECT quantity FROM telegram_pet_material_balances WHERE telegram_id = ? AND material_key = ?`).bind(id, plan.material));
    materialAfterIndex = statements.length;
    statements.push(db.prepare(`INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity)
      SELECT ?, ?, MIN(?, ?) WHERE EXISTS (SELECT 1 FROM telegram_pet_runtime_events WHERE id = ?)
      ON CONFLICT (telegram_id, material_key) DO UPDATE SET quantity = MIN(?, telegram_pet_material_balances.quantity + excluded.quantity), updated_at = CURRENT_TIMESTAMP
      RETURNING quantity`).bind(id, plan.material, requestedMaterialQuantity, maxStack, claimId, maxStack));
  }

  // Cloudflare D1 executes db.batch() as one transaction. A failed statement rolls back
  // the event claim, progression update and material mutation together.
  const results = await db.batch(statements);
  const priorState = firstBatchRow(results[1]) || {};
  const claim = firstBatchRow(results[2]);
  if (!claim || claim.id !== claimId) return { ok: true, duplicate: true, tracks: {}, traits: {}, material: null, equipment_awards: [] };

  const capState = priorState.daily_key === dayKey
    ? priorState
    : { ...priorState, care_daily: 0, training_daily: 0, adventure_daily: 0, arena_daily: 0, job_daily: 0, bond_daily: 0 };
  const trackAwards = calculatePetRuntimeTrackAwards(plan, capState);

  let material = null;
  if (materialAfterIndex >= 0) {
    const before = firstBatchRow(results[materialBeforeIndex])?.quantity || 0;
    const after = firstBatchRow(results[materialAfterIndex])?.quantity || before;
    const credited = calculateCreditedMaterialAmount(before, after);
    material = { key: plan.material, quantity_awarded: credited, balance: Math.max(0, Math.floor(Number(after) || 0)), requested: requestedMaterialQuantity };
  }

  const equipmentAwards = [];
  for (const row of Array.isArray(options.equipment_rows) ? options.equipment_rows : []) {
    const mastery = getPetEquipmentMasteryAward(row.item_key, plan.equipment_action, options.equipment_mastery_amount ?? 1);
    if (mastery > 0) equipmentAwards.push({ item_key: row.item_key, mastery_xp: mastery });
  }

  return { ok: true, duplicate: false, tracks: trackAwards, traits: plan.traits, material, equipment_awards: equipmentAwards };
}
