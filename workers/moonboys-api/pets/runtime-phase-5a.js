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
  PET_RARE_DROP_TABLES,
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
  energy_drink: Object.freeze({ care: 1, bond: 1 }),
  dance: Object.freeze({ care: 2, bond: 3 }),
  cuddles: Object.freeze({ care: 2, bond: 6 }),
  timed_train: Object.freeze({ training: 18 }),
  explore: Object.freeze({ adventure: 14 }),
  run_step: Object.freeze({ adventure: 10 }),
  run_extract: Object.freeze({ adventure: 24 }),
  run_boss: Object.freeze({ adventure: 30, arena: 8 }),
  arena_attack: Object.freeze({ arena: 5 }),
  arena_block: Object.freeze({ arena: 5 }),
  arena_complete: Object.freeze({ arena: 20 }),
  kaiju_win: Object.freeze({ arena: 16 }),
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

export function getPetRuntimeMaterialSources(materialKey) {
  const labels = { job: 'job_material_draw', timed_work: 'timed_work_material_draw',
    run_extract: 'moon_run_extraction_material_draw', run_boss: 'weekly_boss_or_raid_victory_material_draw',
    arena_complete: 'arena_completion_material_draw', kaiju_win: 'kaiju_victory_material_draw' };
  return Object.entries(ACTION_DROP_TABLE).filter(([, table]) =>
    PET_RARE_DROP_TABLES[table].some(entry => entry.item === materialKey)).map(([action]) => labels[action]);
}

// The committed server receipt fixes the draw across surfaces and retries.
// Never derive this from a client request key or accept a client-provided roll.
export async function getPetRuntimeSourceDropRoll(action, owner, sourceEventId) {
  if (!Object.hasOwn(ACTION_DROP_TABLE, action) || !String(sourceEventId || '').trim()) return undefined;
  const bytes = new TextEncoder().encode(JSON.stringify(['moonpet-material-v1', String(owner), action, String(sourceEventId)]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return new DataView(digest).getUint32(0) / 0x100000000;
}

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

function normalizePetSpecialistAuthority(telegramId, options = {}) {
  const id = String(telegramId || '').trim();
  const petId = String(options.pet_id || options.petId || '').trim();
  const seasonKey = String(options.season_key || options.seasonKey || '').trim();
  return id && petId && seasonKey ? { telegram_id: id, pet_id: petId, season_key: seasonKey } : null;
}

// Keep immutable per-day receipts: a late recovery must use its original allowance,
// without rewinding the current-day summary. Legacy receipts carry requested tracks
// only, so count those conservatively rather than creating another allowance.
function buildAtomicClaim(plan, claimId, telegramId, eventKey, dayKey, authority) {
  const stateTable = authority ? 'telegram_pet_specialist_progression' : 'telegram_pet_progression_state';
  const eventTable = authority ? 'telegram_pet_specialist_events' : 'telegram_pet_runtime_events';
  const scope = authority ? 'pet_id = ? AND telegram_id = ? AND season_key = ?' : 'telegram_id = ?';
  const scopeBindings = authority ? [authority.pet_id, telegramId, authority.season_key] : [telegramId];
  const payload = "CASE WHEN json_valid(payload_json) THEN payload_json ELSE '{}' END";
  const usage = [], allowance = [], awards = [], totals = [];
  for (const [track, columns] of Object.entries(TRACK_COLUMNS)) {
    const cap = PET_PROGRESSION_TRACKS[track].max_daily_award;
    const requested = Math.max(0, Math.floor(Number(plan.tracks?.[track]) || 0));
    usage.push(`MAX(COALESCE(SUM(MAX(0, COALESCE(json_extract(${payload}, '$.awarded_tracks.${track}'), json_extract(${payload}, '$.tracks.${track}'), 0))), 0), COALESCE(MAX(json_extract(${payload}, '$.daily_totals.${track}')), 0)) AS ${track}`);
    allowance.push(`MAX(CASE WHEN s.daily_key = ? THEN s.${columns.daily} ELSE 0 END, u.${track}) AS ${track}`);
    const award = `MIN(${requested}, MAX(0, ${cap} - ${track}))`;
    awards.push(`'${track}', ${award}`);
    totals.push(`'${track}', MIN(${cap}, ${track} + ${award})`);
  }
  const columns = authority ? 'id, pet_id, telegram_id, season_key, event_key, action, payload_json' : 'id, telegram_id, event_key, action, payload_json';
  const values = authority ? '?, ?, ?, ?, ?, ?' : '?, ?, ?, ?';
  const keys = authority ? 'pet_id, telegram_id, season_key, event_key' : 'telegram_id, event_key';
  return {
    sql: `WITH daily_usage AS (
      SELECT ${usage.join(', ')} FROM ${eventTable}
      WHERE ${scope} AND COALESCE(json_extract(${payload}, '$.day_key'), substr(created_at, 1, 10)) = ?
    ), allowance AS (
      SELECT ${allowance.join(', ')} FROM ${stateTable} s CROSS JOIN daily_usage u WHERE ${scope}
    ) INSERT INTO ${eventTable} (${columns})
      SELECT ${values}, json_set(?, '$.day_key', ?, '$.awarded_tracks', json_object(${awards.join(', ')}), '$.daily_totals', json_object(${totals.join(', ')}))
      FROM allowance WHERE 1 ON CONFLICT (${keys}) DO NOTHING RETURNING id, payload_json`,
    bindings: [...scopeBindings, dayKey, ...Object.keys(TRACK_COLUMNS).map(() => dayKey), ...scopeBindings,
      claimId, ...(authority ? [authority.pet_id, telegramId, authority.season_key] : [telegramId]), eventKey, plan.action, JSON.stringify(plan), dayKey],
  };
}

function buildAtomicStateUpdate(plan, claimId, telegramId, dayKey, authority = null) {
  const assignments = ['daily_key = MAX(daily_key, ?)', 'updated_at = CURRENT_TIMESTAMP'];
  const bindings = [dayKey];
  const stateTable = authority ? 'telegram_pet_specialist_progression' : 'telegram_pet_progression_state';
  const eventTable = authority ? 'telegram_pet_specialist_events' : 'telegram_pet_runtime_events';
  const claimSql = `EXISTS (SELECT 1 FROM ${eventTable} WHERE id = ?)`;

  for (const [track, columns] of Object.entries(TRACK_COLUMNS)) {
    assignments.push(`${columns.total} = ${columns.total} + (SELECT json_extract(payload_json, '$.awarded_tracks.${track}') FROM ${eventTable} WHERE id = ?)`);
    bindings.push(claimId);
    assignments.push(`${columns.daily} = CASE WHEN daily_key <= ? THEN (SELECT json_extract(payload_json, '$.daily_totals.${track}') FROM ${eventTable} WHERE id = ?) ELSE ${columns.daily} END`);
    bindings.push(dayKey, claimId);
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

  if (authority) bindings.push(authority.pet_id, telegramId, authority.season_key, claimId);
  else bindings.push(telegramId, claimId);
  return {
    sql: authority
      ? `UPDATE ${stateTable} SET ${assignments.join(', ')} WHERE pet_id = ? AND telegram_id = ? AND season_key = ? AND EXISTS (SELECT 1 FROM ${eventTable} WHERE id = ?) RETURNING *`
      : `UPDATE ${stateTable} SET ${assignments.join(', ')} WHERE telegram_id = ? AND EXISTS (SELECT 1 FROM ${eventTable} WHERE id = ?) RETURNING *`,
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
  const trackMultiplier = Math.max(1, Number(options.track_multiplier) || 1);
  if (trackMultiplier !== 1) for (const track of Object.keys(plan.tracks)) plan.tracks[track] = Math.max(0, Math.round(plan.tracks[track] * trackMultiplier));
  const table = ACTION_DROP_TABLE[key];
  if (table && options.drop_roll !== undefined) {
    plan.material = resolvePetRareDrop(table, options.drop_roll);
    if (options.source_event_id) plan.material_source_id = String(options.source_event_id);
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

export async function getOrCreatePetRuntimeState(db, telegramId, dayKey, options = {}) {
  const id = String(telegramId || '').trim();
  const day = String(dayKey || '').trim();
  const authority = normalizePetSpecialistAuthority(id, options);
  if (authority) {
    await db.prepare(`INSERT OR IGNORE INTO telegram_pet_specialist_progression (pet_id, telegram_id, season_key, daily_key)
      SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_instances WHERE pet_id = ? AND telegram_id = ? AND season_key = ?)`)
      .bind(authority.pet_id, id, authority.season_key, day, authority.pet_id, id, authority.season_key).run();
    let state = await db.prepare(`SELECT * FROM telegram_pet_specialist_progression WHERE pet_id = ? AND telegram_id = ? AND season_key = ?`)
      .bind(authority.pet_id, id, authority.season_key).first();
    if (state && state.daily_key < day) {
      await db.prepare(`UPDATE telegram_pet_specialist_progression SET daily_key = ?, care_daily = 0, training_daily = 0, adventure_daily = 0, arena_daily = 0, job_daily = 0, bond_daily = 0, updated_at = CURRENT_TIMESTAMP WHERE pet_id = ? AND telegram_id = ? AND season_key = ? AND daily_key < ?`)
        .bind(day, authority.pet_id, id, authority.season_key, day).run();
      state = await db.prepare(`SELECT * FROM telegram_pet_specialist_progression WHERE pet_id = ? AND telegram_id = ? AND season_key = ?`)
        .bind(authority.pet_id, id, authority.season_key).first();
    }
    return state;
  }
  await db.prepare(`INSERT OR IGNORE INTO telegram_pet_progression_state (telegram_id, daily_key) VALUES (?, ?)`).bind(id, day).run();
  let state = await db.prepare(`SELECT * FROM telegram_pet_progression_state WHERE telegram_id = ?`).bind(id).first();
  if (state && state.daily_key < day) {
    await db.prepare(`UPDATE telegram_pet_progression_state SET daily_key = ?, care_daily = 0, training_daily = 0, adventure_daily = 0, arena_daily = 0, job_daily = 0, bond_daily = 0, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ? AND daily_key < ?`).bind(day, id, day).run();
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
  const authority = normalizePetSpecialistAuthority(id, options);
  const claimId = crypto.randomUUID();
  const equipmentAwards = [...new Map((Array.isArray(options.equipment_rows) ? options.equipment_rows : [])
    .map(row => [row.item_key, { item_key: row.item_key,
      mastery_xp: getPetEquipmentMasteryAward(row.item_key, plan.equipment_action, options.equipment_mastery_amount ?? 1) }])).values()]
    .filter(row => row.mastery_xp > 0);
  plan.equipment_awards = equipmentAwards;
  const stateUpdate = buildAtomicStateUpdate(plan, claimId, id, dayKey, authority);
  const claim = buildAtomicClaim(plan, claimId, id, stableEventKey, dayKey, authority);
  const statements = authority
    ? [
      db.prepare(`INSERT OR IGNORE INTO telegram_pet_specialist_progression (pet_id, telegram_id, season_key, daily_key)
        SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_instances WHERE pet_id = ? AND telegram_id = ? AND season_key = ?)`)
        .bind(authority.pet_id, id, authority.season_key, dayKey, authority.pet_id, id, authority.season_key),
      db.prepare(`SELECT * FROM telegram_pet_specialist_progression WHERE pet_id = ? AND telegram_id = ? AND season_key = ?`)
        .bind(authority.pet_id, id, authority.season_key),
      db.prepare(claim.sql).bind(...claim.bindings),
      db.prepare(stateUpdate.sql).bind(...stateUpdate.bindings),
    ]
    : [
      db.prepare(`INSERT OR IGNORE INTO telegram_pet_progression_state (telegram_id, daily_key) VALUES (?, ?)`).bind(id, dayKey),
      db.prepare(`SELECT * FROM telegram_pet_progression_state WHERE telegram_id = ?`).bind(id),
      db.prepare(claim.sql).bind(...claim.bindings),
      db.prepare(stateUpdate.sql).bind(...stateUpdate.bindings),
    ];

  let materialBeforeIndex = -1;
  let materialAfterIndex = -1;
  let requestedMaterialQuantity = 0;
  if (plan.material && normalizePetMaterial(plan.material)) {
    const eventTable = authority ? 'telegram_pet_specialist_events' : 'telegram_pet_runtime_events';
    requestedMaterialQuantity = Math.max(1, Math.min(25, Math.floor(Number(options.material_amount) || 1)));
    const maxStack = PET_CRAFTING_MATERIALS[plan.material].max_stack;
    materialBeforeIndex = statements.length;
    statements.push(db.prepare(`SELECT quantity FROM telegram_pet_material_balances WHERE telegram_id = ? AND material_key = ?`).bind(id, plan.material));
    materialAfterIndex = statements.length;
    statements.push(db.prepare(`INSERT INTO telegram_pet_material_balances (telegram_id, material_key, quantity)
      SELECT ?, ?, MIN(?, ?) WHERE EXISTS (SELECT 1 FROM ${eventTable} WHERE id = ?)
      ON CONFLICT (telegram_id, material_key) DO UPDATE SET quantity = MIN(?, telegram_pet_material_balances.quantity + excluded.quantity), updated_at = CURRENT_TIMESTAMP
      RETURNING quantity`).bind(id, plan.material, requestedMaterialQuantity, maxStack, claimId, maxStack));
  }

  const equipmentResults = [];
  const eventTable = authority ? 'telegram_pet_specialist_events' : 'telegram_pet_runtime_events';
  for (const gear of equipmentAwards) {
    const gearClaimId = crypto.randomUUID();
    const metadata = JSON.stringify({ day_key: dayKey, pet_id: authority?.pet_id || null, season_key: authority?.season_key || null });
    statements.push(db.prepare(`INSERT OR IGNORE INTO telegram_pet_equipment_events
      (id,telegram_id,item_key,action,event_key,item_xp_awarded,mastery_xp_awarded,metadata_json)
      SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM ${eventTable} WHERE id=?)
        AND EXISTS (SELECT 1 FROM telegram_pet_equipment_progression WHERE telegram_id=? AND item_key=?)`)
      .bind(gearClaimId,id,gear.item_key,plan.equipment_action,stableEventKey,gear.mastery_xp,gear.mastery_xp,metadata,claimId,id,gear.item_key));
    equipmentResults.push({ index: statements.length, award: gear });
    statements.push(db.prepare(`UPDATE telegram_pet_equipment_progression SET
      item_xp=item_xp+?, mastery_xp=mastery_xp+?,
      mastery_tier=CASE WHEN mastery_xp+?>=5000 THEN 5 WHEN mastery_xp+?>=2500 THEN 4
        WHEN mastery_xp+?>=1000 THEN 3 WHEN mastery_xp+?>=300 THEN 2 WHEN mastery_xp+?>=75 THEN 1 ELSE 0 END,
      last_used_action=CASE WHEN substr(COALESCE(last_used_at,''),1,10)<=? THEN ? ELSE last_used_action END,
      last_used_at=CASE WHEN substr(COALESCE(last_used_at,''),1,10)<=? THEN ? ELSE last_used_at END,
      updated_at=CURRENT_TIMESTAMP
      WHERE telegram_id=? AND item_key=? AND EXISTS (SELECT 1 FROM telegram_pet_equipment_events WHERE id=?)
      RETURNING item_key`)
      .bind(...Array(7).fill(gear.mastery_xp),dayKey,plan.equipment_action,dayKey,`${dayKey}T00:00:00.000Z`,id,gear.item_key,gearClaimId));
  }

  // D1 rolls back receipts, tracks, traits, materials and equipment together.
  const results = await db.batch(statements);
  const priorState = firstBatchRow(results[1]) || {};
  const receipt = firstBatchRow(results[2]);
  if (!receipt || receipt.id !== claimId) return { ok: true, duplicate: true, tracks: {}, traits: {}, material: null, equipment_awards: [] };

  const capState = priorState.daily_key === dayKey
    ? priorState
    : { ...priorState, care_daily: 0, training_daily: 0, adventure_daily: 0, arena_daily: 0, job_daily: 0, bond_daily: 0 };
  const persistedAwards = parseJsonObject(receipt.payload_json).awarded_tracks;
  const trackAwards = persistedAwards
    ? Object.fromEntries(Object.entries(persistedAwards).filter(([, value]) => value > 0))
    : calculatePetRuntimeTrackAwards(plan, capState);

  let material = null;
  if (materialAfterIndex >= 0) {
    const before = firstBatchRow(results[materialBeforeIndex])?.quantity || 0;
    const after = firstBatchRow(results[materialAfterIndex])?.quantity || before;
    const credited = calculateCreditedMaterialAmount(before, after);
    material = { key: plan.material, quantity_awarded: credited, balance: Math.max(0, Math.floor(Number(after) || 0)), requested: requestedMaterialQuantity };
  }

  return { ok: true, duplicate: false, tracks: trackAwards, traits: plan.traits, material,
    equipment_awards: equipmentResults.filter(entry => firstBatchRow(results[entry.index])).map(entry => entry.award) };
}
