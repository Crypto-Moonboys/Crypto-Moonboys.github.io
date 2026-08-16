const CARE_TYPES = Object.freeze({
  warm: { progress: 2, affinity: 'bold' },
  talk: { progress: 2, affinity: 'social' },
  music: { progress: 2, affinity: 'rhythm' },
  rest: { progress: 2, affinity: 'calm' },
});

export const MOONPET_SPECIES = Object.freeze({
  neon_raccoon: { name: 'Neon Raccoon', affinity: ['social', 'bold'] },
  bubble_ram: { name: 'Bubble Ram', affinity: ['calm', 'social'] },
  comet_gecko: { name: 'Comet Gecko', affinity: ['warm', 'bold'] },
  vinyl_crab: { name: 'Vinyl Crab', affinity: ['rhythm', 'calm'] },
  lantern_fox: { name: 'Lantern Fox', affinity: ['warm', 'social'] },
  sneaker_snail: { name: 'Sneaker Snail', affinity: ['calm', 'rhythm'] },
  alley_drake: { name: 'Alley Drake', affinity: ['bold', 'warm'] },
  moon_ferret: { name: 'Moon Ferret', affinity: ['rhythm', 'social'] },
});

const SPECIES_IDS = Object.keys(MOONPET_SPECIES);
const PALETTES = Object.freeze(['mint_punch', 'coral_pop', 'cobalt_lime', 'gold_violet', 'lavender_ice', 'turquoise_flame']);
const MARKINGS = Object.freeze(['moon_mask', 'spray_stripe', 'pixel_freckles', 'split_face', 'star_patch', 'ink_drops']);
const EYES = Object.freeze(['bright', 'sleepy', 'mischief', 'soft', 'focused']);
const TEMPERAMENTS = Object.freeze(['bold', 'social', 'rhythmic', 'calm', 'curious', 'loyal']);
const INNATE_TRAITS = Object.freeze(['night_owl', 'beat_seeker', 'snack_scout', 'alley_brave', 'soft_hearted', 'lucky_steps', 'collector', 'showboat']);
const HATCH_PROGRESS = 12;
const DAILY_INCUBATION_CAP = 8;

const RARE_ROUTES = Object.freeze([
  { id: 'celestial_serpent', name: 'Celestial Serpent', traits: ['explorer', 'curious'], counters: { exploration_actions: 30, total_runs: 10 } },
  { id: 'crown_beast', name: 'Crown Beast', traits: ['street_fighter', 'loyal'], counters: { combat_actions: 30, total_bosses_defeated: 5 } },
  { id: 'boombox_kaiju', name: 'Boombox Kaiju', traits: ['loyal', 'curious'], counters: { care_actions: 35, event_actions: 25 } },
  { id: 'graffiti_guardian', name: 'Graffiti Guardian', traits: ['explorer', 'street_fighter'], counters: { adventure_actions: 25, combat_actions: 25 } },
]);

function cleanId(value) {
  return String(value || '').trim();
}

function safeJson(value, fallback = {}) {
  try { return JSON.parse(String(value || '')); } catch { return fallback; }
}

async function digestBytes(value) {
  const bytes = new TextEncoder().encode(String(value));
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

async function deriveIdentity(seed, incubation = {}) {
  const bytes = await digestBytes(`moonpet-lifecycle:v1:${seed}`);
  const scores = SPECIES_IDS.map((speciesId, index) => {
    const definition = MOONPET_SPECIES[speciesId];
    const affinityScore = definition.affinity.reduce((total, key) => total + Number(incubation[key] || 0), 0);
    return { speciesId, score: affinityScore * 32 + bytes[index] };
  }).sort((a, b) => b.score - a.score);
  const firstInnate = bytes[12] % INNATE_TRAITS.length;
  const secondInnate = (firstInnate + 1 + bytes[13] % (INNATE_TRAITS.length - 1)) % INNATE_TRAITS.length;
  return {
    species_id: scores[0].speciesId,
    palette_id: PALETTES[bytes[8] % PALETTES.length],
    marking_id: MARKINGS[bytes[9] % MARKINGS.length],
    eye_style: EYES[bytes[10] % EYES.length],
    temperament: TEMPERAMENTS[bytes[11] % TEMPERAMENTS.length],
    innate_traits: [INNATE_TRAITS[firstInnate], INNATE_TRAITS[secondInnate]],
    rare_route_index: bytes[14] % RARE_ROUTES.length,
  };
}

async function readLifecycle(db, telegramId) {
  return db.prepare(`SELECT l.* FROM telegram_pet_active_slots a
    JOIN telegram_pet_lifecycle_by_pet l ON l.pet_id=a.pet_id AND l.telegram_id=a.telegram_id
    WHERE a.telegram_id=? LIMIT 1`).bind(telegramId).first().catch(() => null);
}

async function activePetId(db, telegramId) {
  let row = await db.prepare(`SELECT i.pet_id FROM telegram_pet_active_slots a
    JOIN telegram_pet_instances i ON i.pet_id=a.pet_id AND i.telegram_id=a.telegram_id
    WHERE a.telegram_id=? AND i.status='active' LIMIT 1`).bind(telegramId).first().catch(() => null);
  if (!row) row = await db.prepare(`SELECT i.pet_id FROM telegram_pet_season_slots s
    JOIN telegram_pet_instances i ON i.pet_id=s.pet_id AND i.telegram_id=s.telegram_id
    WHERE s.telegram_id=? AND s.slot_number=1 AND s.status='active' AND i.status='active'
    ORDER BY s.updated_at DESC LIMIT 1`).bind(telegramId).first().catch(() => null);
  return row?.pet_id || null;
}

export async function createMoonEggLifecycle(db, telegramId, eventKey = '') {
  const id = cleanId(telegramId);
  if (!id) throw new Error('invalid_moonpet_lifecycle_owner');
  const petId = await activePetId(db, id);
  if (!petId) throw new Error('invalid_moonpet_lifecycle_pet');
  await db.prepare(`INSERT OR IGNORE INTO telegram_pet_lifecycle_by_pet
    (pet_id, telegram_id, identity_seed, phase, incubation_json, innate_traits_json)
    SELECT ?, ?, ?, 'egg', '{}', '[]' WHERE EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id=?)`)
    .bind(petId, id, crypto.randomUUID(), id).run();
  if (eventKey) {
    await db.prepare(`INSERT OR IGNORE INTO telegram_pet_lifecycle_events_by_pet
      (event_id, pet_id, telegram_id, event_key, action, payload_json, progress_delta, applied_at)
      SELECT ?, ?, ?, ?, 'egg_created', '{}', 0, CURRENT_TIMESTAMP
      WHERE EXISTS (SELECT 1 FROM telegram_pet_lifecycle_by_pet WHERE pet_id=?)`)
      .bind(crypto.randomUUID(), petId, id, String(eventKey).slice(0, 180), petId).run();
  }
  const row = await readLifecycle(db, id);
  return publicLifecycle(row, { signal: 'dormant', ready: false, percent: 0 });
}

export async function ensureMoonpetLifecycle(db, telegramId) {
  const id = cleanId(telegramId);
  if (!id) return null;
  let row = await readLifecycle(db, id);
  if (!row) {
    const petId = await activePetId(db, id);
    if (!petId) return null;
    await db.prepare(`INSERT OR IGNORE INTO telegram_pet_lifecycle_by_pet
      (pet_id, telegram_id, identity_seed, phase, incubation_progress, incubation_json, innate_traits_json, hatched_at, adult_at)
      SELECT ?, ?, ?, 'adult', ?, '{}', '[]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      WHERE EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id=?)`)
      .bind(petId, id, crypto.randomUUID(), HATCH_PROGRESS, id).run();
    row = await readLifecycle(db, id);
  }
  if (row && row.phase !== 'egg' && !row.species_id) {
    const derived = await deriveIdentity(row.identity_seed, safeJson(row.incubation_json));
    await db.prepare(`UPDATE telegram_pet_lifecycle_by_pet SET species_id=?, palette_id=?, marking_id=?, eye_style=?, temperament=?,
      innate_traits_json=?, rare_route_index=?, updated_at=CURRENT_TIMESTAMP WHERE pet_id=? AND species_id IS NULL`)
      .bind(derived.species_id, derived.palette_id, derived.marking_id, derived.eye_style, derived.temperament,
        JSON.stringify(derived.innate_traits), derived.rare_route_index, row.pet_id).run();
    await db.prepare(`UPDATE telegram_pet_profiles SET species=?, updated_at=CURRENT_TIMESTAMP
      WHERE telegram_id=?
        AND (species IS NULL OR species NOT IN ('neon_raccoon', 'bubble_ram', 'comet_gecko', 'vinyl_crab',
          'lantern_fox', 'sneaker_snail', 'alley_drake', 'moon_ferret'))`)
      .bind(derived.species_id, id).run();
    row = await readLifecycle(db, id);
  }
  return row;
}

async function rareProgress(db, telegramId, row) {
  if (!row || !['adult', 'rare'].includes(row.phase)) return { signal: 'dormant', ready: false, percent: 0 };
  if (row.phase === 'rare') return { signal: 'morphed', ready: false, percent: 100 };
  const route = RARE_ROUTES[Math.max(0, Number(row.rare_route_index || 0)) % RARE_ROUTES.length];
  const [memory, evolution, traitRows] = await Promise.all([
    db.prepare('SELECT * FROM telegram_pet_memories WHERE telegram_id=?').bind(telegramId).first().catch(() => null),
    db.prepare('SELECT MAX(stage) AS stage FROM telegram_pet_evolutions WHERE telegram_id=?').bind(telegramId).first().catch(() => null),
    db.prepare('SELECT trait_id FROM telegram_pet_personality_traits WHERE telegram_id=? AND unlocked_at IS NOT NULL').bind(telegramId).all().catch(() => ({ results: [] })),
  ]);
  const unlocked = new Set((traitRows.results || []).map((entry) => entry.trait_id));
  const traitDone = route.traits.filter((trait) => unlocked.has(trait)).length;
  const counterRatios = Object.entries(route.counters).map(([key, target]) => Math.min(1, Number(memory?.[key] || 0) / target));
  const stageRatio = Math.min(1, Number(evolution?.stage || 0) / 4);
  const percent = Math.floor(((traitDone / route.traits.length) * 0.35 + (counterRatios.reduce((a, b) => a + b, 0) / counterRatios.length) * 0.45 + stageRatio * 0.2) * 100);
  const ready = traitDone === route.traits.length && counterRatios.every((ratio) => ratio >= 1) && stageRatio >= 1;
  return { signal: ready ? 'ready' : percent >= 70 ? 'resonating' : percent >= 35 ? 'stirring' : 'dormant', ready, percent };
}

function publicLifecycle(row, rare) {
  if (!row) return null;
  const incubation = safeJson(row.incubation_json);
  const revealed = row.phase !== 'egg';
  const species = revealed ? MOONPET_SPECIES[row.species_id] : null;
  const innateTraits = revealed ? safeJson(row.innate_traits_json, []) : [];
  const preferences = revealed ? [...new Set([
    row.temperament === 'rhythmic' ? 'play' : row.temperament === 'bold' ? 'train' : row.temperament === 'calm' ? 'sleep' : row.temperament === 'social' ? 'care' : 'explore',
    innateTraits.includes('snack_scout') ? 'feed' : innateTraits.includes('beat_seeker') ? 'play' : innateTraits.includes('alley_brave') ? 'battle' : innateTraits.includes('collector') ? 'expedition' : innateTraits.includes('night_owl') ? 'adventure' : 'bond',
  ])] : [];
  return {
    version: Number(row.lifecycle_version || 1),
    phase: row.phase,
    species_id: revealed ? row.species_id : null,
    species_name: species?.name || null,
    appearance: revealed ? { palette: row.palette_id, marking: row.marking_id, eyes: row.eye_style } : null,
    temperament: revealed ? row.temperament : null,
    innate_traits: innateTraits,
    preferences,
    incubation: {
      progress: Number(row.incubation_progress || 0),
      target: HATCH_PROGRESS,
      ready: Number(row.incubation_progress || 0) >= HATCH_PROGRESS && Object.keys(CARE_TYPES).filter((key) => Number(incubation[key] || 0) > 0).length >= 3,
      signals: Object.fromEntries(Object.keys(CARE_TYPES).map((key) => [key, Number(incubation[key] || 0)])),
      actions_today: Number(row.actions_today || 0),
      daily_cap: DAILY_INCUBATION_CAP,
    },
    rare: { signal: rare.signal, ready: rare.ready, progress: rare.percent, name: row.phase === 'rare' ? RARE_ROUTES[Number(row.rare_route_index || 0)].name : null },
    hatched_at: row.hatched_at || null,
    morphed_at: row.rare_morphed_at || null,
  };
}

export async function getExistingMoonpetLifecycle(db, telegramId) {
  const id = cleanId(telegramId);
  if (!id) return null;
  const row = await readLifecycle(db, id);
  if (!row) return null;
  const dayKey = new Date().toISOString().slice(0, 10);
  const daily = await db.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_lifecycle_events_by_pet
    WHERE pet_id=? AND action LIKE 'incubate_%' AND day_key=? AND applied_at IS NOT NULL`).bind(row.pet_id, dayKey).first().catch(() => null);
  row.actions_today = Number(daily?.count || 0);
  return publicLifecycle(row, await rareProgress(db, id, row));
}

export async function getMoonpetLifecycle(db, telegramId) {
  const id = cleanId(telegramId);
  const row = await ensureMoonpetLifecycle(db, id);
  if (!row) return null;
  const dayKey = new Date().toISOString().slice(0, 10);
  const daily = await db.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_lifecycle_events_by_pet
    WHERE pet_id=? AND action LIKE 'incubate_%' AND day_key=?`).bind(row.pet_id, dayKey).first().catch(() => null);
  row.actions_today = Number(daily?.count || 0);
  return publicLifecycle(row, await rareProgress(db, id, row));
}

export async function incubateMoonEgg(db, telegramId, careType, eventKey) {
  const id = cleanId(telegramId);
  const care = String(careType || '').trim().toLowerCase();
  const definition = CARE_TYPES[care];
  if (!definition) return { accepted: false, reason: 'invalid_incubation_action' };
  const row = await ensureMoonpetLifecycle(db, id);
  if (!row) return { accepted: false, reason: 'pet_not_adopted' };
  if (row.phase !== 'egg') return { accepted: false, reason: 'already_hatched' };
  const key = String(eventKey || crypto.randomUUID()).slice(0, 180);
  const dayKey = new Date().toISOString().slice(0, 10);
  const existing = await db.prepare('SELECT event_id, applied_at FROM telegram_pet_lifecycle_events_by_pet WHERE pet_id=? AND event_key=?')
    .bind(row.pet_id, key).first().catch(() => null);
  if (existing?.applied_at) return { accepted: true, duplicate: true, reason: 'duplicate', lifecycle: await getMoonpetLifecycle(db, id) };
  if (existing) return { accepted: false, reason: 'incubation_conflict', lifecycle: await getMoonpetLifecycle(db, id) };
  const eventId = crypto.randomUUID();
  const carePath = `$.${care}`;
  const affinityPath = `$.${definition.affinity}`;
  const results = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_lifecycle_events_by_pet
      (event_id, pet_id, telegram_id, event_key, action, payload_json, progress_delta, day_key)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM telegram_pet_lifecycle_by_pet WHERE pet_id=? AND phase='egg')
        AND (SELECT COUNT(*) FROM telegram_pet_lifecycle_events_by_pet
          WHERE pet_id=? AND action LIKE 'incubate_%' AND day_key=? AND applied_at IS NOT NULL) < ?`)
      .bind(eventId, row.pet_id, id, key, `incubate_${care}`, JSON.stringify({ care_type: care }), definition.progress, dayKey,
        row.pet_id, row.pet_id, dayKey, DAILY_INCUBATION_CAP),
    db.prepare(`UPDATE telegram_pet_lifecycle_by_pet SET incubation_progress=MIN(?, incubation_progress+?),
      incubation_json=json_set(incubation_json, ?, COALESCE(json_extract(incubation_json, ?), 0)+1,
        ?, COALESCE(json_extract(incubation_json, ?), 0)+1), updated_at=CURRENT_TIMESTAMP
      WHERE pet_id=? AND phase='egg' AND EXISTS (
        SELECT 1 FROM telegram_pet_lifecycle_events_by_pet WHERE event_id=? AND applied_at IS NULL)`)
      .bind(HATCH_PROGRESS, definition.progress, carePath, carePath, affinityPath, affinityPath, row.pet_id, eventId),
    db.prepare(`UPDATE telegram_pet_lifecycle_events_by_pet SET applied_at=CURRENT_TIMESTAMP
      WHERE event_id=? AND applied_at IS NULL
        AND EXISTS (SELECT 1 FROM telegram_pet_lifecycle_by_pet WHERE pet_id=? AND phase='egg')`).bind(eventId, row.pet_id),
  ]);
  const inserted = Number(results?.[0]?.meta?.changes || 0) === 1;
  const progressed = Number(results?.[1]?.meta?.changes || 0) === 1;
  const applied = Number(results?.[2]?.meta?.changes || 0) === 1;
  if (!inserted) return { accepted: false, reason: 'incubation_daily_cap', lifecycle: await getMoonpetLifecycle(db, id) };
  if (!progressed || !applied) return { accepted: false, reason: 'incubation_conflict', lifecycle: await getMoonpetLifecycle(db, id) };
  return { accepted: true, reason: 'egg_signal_strengthened', care_type: care, lifecycle: await getMoonpetLifecycle(db, id) };
}

export async function hatchMoonpet(db, telegramId, eventKey) {
  const id = cleanId(telegramId);
  const key = String(eventKey || crypto.randomUUID()).slice(0, 180);
  const row = await ensureMoonpetLifecycle(db, id);
  if (!row) return { accepted: false, reason: 'pet_not_adopted' };
  const existing = await db.prepare(`SELECT event_id, applied_at FROM telegram_pet_lifecycle_events_by_pet
    WHERE pet_id=? AND event_key=? AND action='hatch'`).bind(row.pet_id, key).first().catch(() => null);
  if (existing?.applied_at) return { accepted: true, duplicate: true, reason: 'duplicate', lifecycle: await getMoonpetLifecycle(db, id) };
  if (existing) return { accepted: false, reason: 'hatch_conflict', lifecycle: await getMoonpetLifecycle(db, id) };
  if (row.phase !== 'egg') return { accepted: false, reason: 'already_hatched', lifecycle: await getMoonpetLifecycle(db, id) };
  const incubation = safeJson(row.incubation_json);
  if (Number(row.incubation_progress || 0) < HATCH_PROGRESS || Object.keys(CARE_TYPES).filter((key) => Number(incubation[key] || 0) > 0).length < 3) {
    return { accepted: false, reason: 'egg_not_ready', lifecycle: await getMoonpetLifecycle(db, id) };
  }
  const identity = await deriveIdentity(row.identity_seed, incubation);
  const eventId = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_lifecycle_events_by_pet
      (event_id, pet_id, telegram_id, event_key, action, payload_json, progress_delta)
      SELECT ?, ?, ?, ?, 'hatch', ?, 0
      WHERE EXISTS (SELECT 1 FROM telegram_pet_lifecycle_by_pet WHERE pet_id=? AND phase='egg')`)
      .bind(eventId, row.pet_id, id, key, JSON.stringify({ species_id: identity.species_id }), row.pet_id),
    db.prepare(`UPDATE telegram_pet_lifecycle_by_pet SET phase='young', species_id=?, palette_id=?, marking_id=?, eye_style=?, temperament=?,
      innate_traits_json=?, rare_route_index=?, hatched_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
      WHERE pet_id=? AND phase='egg' AND EXISTS (
        SELECT 1 FROM telegram_pet_lifecycle_events_by_pet WHERE event_id=? AND applied_at IS NULL)`)
      .bind(identity.species_id, identity.palette_id, identity.marking_id, identity.eye_style, identity.temperament,
        JSON.stringify(identity.innate_traits), identity.rare_route_index, row.pet_id, eventId),
    db.prepare(`UPDATE telegram_pet_profiles SET species=?, stage='young', updated_at=CURRENT_TIMESTAMP
      WHERE telegram_id=? AND EXISTS (
        SELECT 1 FROM telegram_pet_lifecycle_by_pet l
        JOIN telegram_pet_lifecycle_events_by_pet e ON e.pet_id=l.pet_id
        WHERE l.pet_id=? AND l.phase='young' AND l.species_id=? AND e.event_id=? AND e.applied_at IS NULL)`)
      .bind(identity.species_id, id, row.pet_id, identity.species_id, eventId),
    db.prepare(`UPDATE telegram_pet_lifecycle_events_by_pet SET applied_at=CURRENT_TIMESTAMP
      WHERE event_id=? AND applied_at IS NULL AND EXISTS (
        SELECT 1 FROM telegram_pet_lifecycle_by_pet WHERE pet_id=? AND phase='young' AND species_id=?)`)
      .bind(eventId, row.pet_id, identity.species_id),
  ]);
  const won = Number(results?.[0]?.meta?.changes || 0) === 1
    && Number(results?.[1]?.meta?.changes || 0) === 1
    && Number(results?.[3]?.meta?.changes || 0) === 1;
  if (!won) return { accepted: false, reason: 'hatch_conflict', lifecycle: await getMoonpetLifecycle(db, id) };
  return { accepted: true, reason: 'moonpet_hatched', species: MOONPET_SPECIES[identity.species_id].name, lifecycle: await getMoonpetLifecycle(db, id) };
}

export async function syncMoonpetLifecycleStage(db, telegramId, stage) {
  const id = cleanId(telegramId);
  if (Number(stage) < 2) return getMoonpetLifecycle(db, id);
  const row = await ensureMoonpetLifecycle(db, id);
  if (!row) return null;
  await db.prepare(`UPDATE telegram_pet_lifecycle_by_pet SET phase='adult', adult_at=COALESCE(adult_at, CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP
    WHERE pet_id=? AND phase='young'`).bind(row.pet_id).run();
  await db.prepare(`UPDATE telegram_pet_profiles SET stage='adult', updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND stage='young'`).bind(id).run();
  return getMoonpetLifecycle(db, id);
}

export async function morphMoonpetRare(db, telegramId, eventKey) {
  const id = cleanId(telegramId);
  const key = String(eventKey || crypto.randomUUID()).slice(0, 180);
  const row = await ensureMoonpetLifecycle(db, id);
  if (!row) return { accepted: false, reason: 'pet_not_adopted' };
  const existing = await db.prepare(`SELECT event_id, applied_at FROM telegram_pet_lifecycle_events_by_pet
    WHERE pet_id=? AND event_key=? AND action='rare_morph'`).bind(row.pet_id, key).first().catch(() => null);
  if (existing?.applied_at) return { accepted: true, duplicate: true, reason: 'duplicate', lifecycle: await getMoonpetLifecycle(db, id) };
  if (existing) return { accepted: false, reason: 'rare_morph_conflict', lifecycle: await getMoonpetLifecycle(db, id) };
  if (row.phase === 'rare') return { accepted: false, reason: 'rare_morph_complete', lifecycle: await getMoonpetLifecycle(db, id) };
  const progress = await rareProgress(db, id, row);
  if (!progress.ready) return { accepted: false, reason: 'rare_signal_not_ready', lifecycle: publicLifecycle(row, progress) };
  const route = RARE_ROUTES[Number(row.rare_route_index || 0)];
  const eventId = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_lifecycle_events_by_pet
      (event_id, pet_id, telegram_id, event_key, action, payload_json, progress_delta)
      SELECT ?, ?, ?, ?, 'rare_morph', ?, 0
      WHERE EXISTS (SELECT 1 FROM telegram_pet_lifecycle_by_pet WHERE pet_id=? AND phase='adult')`)
      .bind(eventId, row.pet_id, id, key, JSON.stringify({ rare_morph_id: route.id }), row.pet_id),
    db.prepare(`UPDATE telegram_pet_lifecycle_by_pet SET phase='rare', rare_morph_id=?, rare_morphed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
      WHERE pet_id=? AND phase='adult' AND EXISTS (
        SELECT 1 FROM telegram_pet_lifecycle_events_by_pet WHERE event_id=? AND applied_at IS NULL)`)
      .bind(route.id, row.pet_id, eventId),
    db.prepare(`UPDATE telegram_pet_profiles SET stage='rare', updated_at=CURRENT_TIMESTAMP
      WHERE telegram_id=? AND EXISTS (
        SELECT 1 FROM telegram_pet_lifecycle_by_pet l
        JOIN telegram_pet_lifecycle_events_by_pet e ON e.pet_id=l.pet_id
        WHERE l.pet_id=? AND l.phase='rare' AND l.rare_morph_id=? AND e.event_id=? AND e.applied_at IS NULL)`)
      .bind(id, row.pet_id, route.id, eventId),
    db.prepare(`UPDATE telegram_pet_lifecycle_events_by_pet SET applied_at=CURRENT_TIMESTAMP
      WHERE event_id=? AND applied_at IS NULL AND EXISTS (
        SELECT 1 FROM telegram_pet_lifecycle_by_pet WHERE pet_id=? AND phase='rare' AND rare_morph_id=?)`)
      .bind(eventId, row.pet_id, route.id),
  ]);
  const won = Number(results?.[0]?.meta?.changes || 0) === 1
    && Number(results?.[1]?.meta?.changes || 0) === 1
    && Number(results?.[3]?.meta?.changes || 0) === 1;
  if (!won) return { accepted: false, reason: 'rare_morph_conflict', lifecycle: await getMoonpetLifecycle(db, id) };
  return { accepted: true, reason: 'rare_morph_revealed', rare_morph: route.name, lifecycle: await getMoonpetLifecycle(db, id) };
}
