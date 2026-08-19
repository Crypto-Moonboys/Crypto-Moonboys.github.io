import { getMoonpetSeasonKey } from './season-authority.js';

export const PET_BREEDING_AUTHORITY_VERSION = 1;
export const PET_BREEDING_COOLDOWN_MS = 7 * 86400000;

// Cooldown authority is per parent pet for this foundation layer.
// If Parent A breeds with B, Parent A cannot immediately breed with C.
const PET_LIFECYCLE_SCHEMA_VERSION = 1;
const TEXT_LIMIT = 180;
const BASE_PET_STATS = Object.freeze({
  hunger: 25,
  happiness: 70,
  cleanliness: 70,
  energy: 70,
  health: 75,
});

function cleanText(value, max = TEXT_LIMIT) {
  return String(value || '').trim().slice(0, max);
}

function safeJson(value, fallback = {}) {
  try {
    if (typeof value === 'string') return JSON.parse(value || JSON.stringify(fallback));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function encodeJson(value) {
  try { return JSON.stringify(value ?? {}); }
  catch { return '{}'; }
}

function normalizeTimestamp(value, fallback = new Date()) {
  const parsed = value == null ? NaN : Date.parse(value);
  const fallbackTime = new Date(fallback).getTime();
  return new Date(Number.isFinite(parsed) ? parsed : (Number.isFinite(fallbackTime) ? fallbackTime : Date.now())).toISOString();
}

function canonicalPair(parentAId, parentBId) {
  return [cleanText(parentAId), cleanText(parentBId)].sort();
}

function canonicalParents(parentA, parentB, parentPair) {
  const byId = new Map([[parentA?.pet_id, parentA], [parentB?.pet_id, parentB]]);
  return parentPair.map((petId) => byId.get(petId));
}

function requestAuthorityContext(request, seedInfo) {
  const ownerId = cleanText(request.owner_id);
  const telegramId = cleanText(request.telegram_id);
  return {
    owner_id: ownerId || telegramId,
    telegram_id: telegramId,
    season_key: cleanText(request.season_key, 80),
    parent_pair: seedInfo.parent_pair,
    request_key: seedInfo.request_key,
    valid_identity: !ownerId || !telegramId || ownerId === telegramId,
  };
}

function receiptMatchesRequestContext(receipt, context) {
  const receiptPair = canonicalPair(receipt?.parent_pet_a_id, receipt?.parent_pet_b_id);
  return cleanText(receipt?.telegram_id) === context.owner_id
    && cleanText(receipt?.season_key, 80) === context.season_key
    && cleanText(receipt?.request_key) === context.request_key
    && receiptPair[0] === context.parent_pair[0]
    && receiptPair[1] === context.parent_pair[1];
}

async function digestHex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexByte(hex, index) {
  return Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16) || 0;
}

async function readAuthoritativeParent(db, petId, ownerId, seasonKey) {
  return db.prepare(`SELECT
      i.pet_id, i.telegram_id, i.season_key, i.slot_number, i.pet_name, i.species, i.stage,
      i.pet_xp, i.level, i.status AS instance_status,
      s.status AS slot_status,
      l.identity_seed, l.phase, l.species_id, l.palette_id, l.marking_id, l.eye_style,
      l.temperament, l.innate_traits_json, l.rare_morph_id,
      c.completed_at
    FROM telegram_pet_instances i
    JOIN telegram_pet_season_slots s
      ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id AND s.season_key=i.season_key
    LEFT JOIN telegram_pet_lifecycle_by_pet l ON l.pet_id=i.pet_id AND l.telegram_id=i.telegram_id
    LEFT JOIN telegram_pet_season_completions c
      ON c.pet_id=i.pet_id AND c.telegram_id=i.telegram_id AND c.season_key=i.season_key
    WHERE i.pet_id=? AND i.telegram_id=? AND i.season_key=? LIMIT 1`)
    .bind(petId, ownerId, seasonKey).first().catch(() => null);
}

async function parentExistsForDifferentSeason(db, petId, ownerId, seasonKey) {
  const row = await db.prepare(`SELECT season_key FROM telegram_pet_season_slots
    WHERE pet_id=? AND telegram_id=? AND season_key<>? LIMIT 1`)
    .bind(petId, ownerId, seasonKey).first().catch(() => null);
  return Boolean(row?.season_key);
}

async function validateParentAuthority(db, request) {
  const requestOwnerId = cleanText(request.owner_id);
  const requestTelegramId = cleanText(request.telegram_id);
  const ownerId = requestOwnerId || requestTelegramId;
  const parentAId = cleanText(request.parent_pet_a_id);
  const parentBId = cleanText(request.parent_pet_b_id);
  const seasonKey = cleanText(request.season_key, 80);
  const now = normalizeTimestamp(request.now);
  if (requestOwnerId && requestTelegramId && requestOwnerId !== requestTelegramId) return { accepted: false, reason: 'invalid_breeding_authority' };
  if (!ownerId || !parentAId || !parentBId || !seasonKey) return { accepted: false, reason: 'invalid_breeding_authority' };
  if (parentAId === parentBId) return { accepted: false, reason: 'duplicate_parent_pet' };
  if (getMoonpetSeasonKey(now) !== seasonKey) return { accepted: false, reason: 'breeding_season_authority_mismatch' };

  const [parentA, parentB] = await Promise.all([
    readAuthoritativeParent(db, parentAId, ownerId, seasonKey),
    readAuthoritativeParent(db, parentBId, ownerId, seasonKey),
  ]);
  if (!parentA || !parentB) {
    const wrongSeason = await Promise.all([
      parentA ? false : parentExistsForDifferentSeason(db, parentAId, ownerId, seasonKey),
      parentB ? false : parentExistsForDifferentSeason(db, parentBId, ownerId, seasonKey),
    ]);
    return { accepted: false, reason: wrongSeason.some(Boolean) ? 'breeding_season_authority_mismatch' : 'breeding_parent_authority_mismatch' };
  }
  if (parentA.instance_status !== 'active' || parentA.slot_status !== 'active'
    || parentB.instance_status !== 'active' || parentB.slot_status !== 'active') {
    return { accepted: false, reason: 'breeding_parent_inactive' };
  }
  if (!parentA.completed_at || !parentB.completed_at) return { accepted: false, reason: 'breeding_parent_incomplete' };
  return { accepted: true, owner_id: ownerId, season_key: seasonKey, now, parent_a: parentA, parent_b: parentB };
}

async function readReceipt(db, eventKey) {
  return db.prepare(`SELECT * FROM telegram_pet_breeding_receipts WHERE event_key=? LIMIT 1`)
    .bind(eventKey).first().catch(() => null);
}

async function readReceiptAuthorityConflict(db, context) {
  if (!context.owner_id || !context.season_key || context.parent_pair.length !== 2 || !context.request_key) return null;
  return db.prepare(`SELECT receipt_id FROM telegram_pet_breeding_receipts
    WHERE season_key=? AND request_key=? AND parent_pet_a_id=? AND parent_pet_b_id=?
      AND telegram_id<>?
    LIMIT 1`)
    .bind(context.season_key, context.request_key, context.parent_pair[0], context.parent_pair[1], context.owner_id)
    .first().catch(() => null);
}

async function offspringExists(db, offspringPetId, ownerId) {
  const row = await db.prepare(`SELECT pet_id FROM telegram_pet_instances WHERE pet_id=? AND telegram_id=? LIMIT 1`)
    .bind(offspringPetId, ownerId).first().catch(() => null);
  return Boolean(row?.pet_id);
}

async function offspringStateExists(db, offspringPetId, ownerId) {
  const row = await db.prepare(`SELECT i.pet_id AS instance_pet_id, l.pet_id AS lifecycle_pet_id
    FROM telegram_pet_instances i
    LEFT JOIN telegram_pet_lifecycle_by_pet l ON l.pet_id=i.pet_id AND l.telegram_id=i.telegram_id
    WHERE i.pet_id=? AND i.telegram_id=? LIMIT 1`)
    .bind(offspringPetId, ownerId).first().catch(() => null);
  return Boolean(row?.instance_pet_id && row?.lifecycle_pet_id);
}

async function nextAvailableSlot(db, ownerId, seasonKey) {
  const rows = await db.prepare(`SELECT slot_number FROM telegram_pet_season_slots
    WHERE telegram_id=? AND season_key=? ORDER BY slot_number`)
    .bind(ownerId, seasonKey).all().catch(() => ({ results: [] }));
  const used = new Set((rows.results || []).map((row) => Number(row.slot_number)));
  for (const slot of [1, 2, 3]) if (!used.has(slot)) return slot;
  return 0;
}

async function recoverySlotNumber(db, ownerId, seasonKey, offspringPetId, storedSlotNumber) {
  const stored = Number(storedSlotNumber || 0);
  if (stored) {
    const row = await db.prepare(`SELECT pet_id FROM telegram_pet_season_slots
      WHERE telegram_id=? AND season_key=? AND slot_number=? LIMIT 1`)
      .bind(ownerId, seasonKey, stored).first().catch(() => null);
    if (!row?.pet_id || row.pet_id === offspringPetId) return stored;
  }
  return nextAvailableSlot(db, ownerId, seasonKey);
}

async function readCooldown(db, ownerId, seasonKey, parentIds, now) {
  const row = await db.prepare(`SELECT parent_pet_id, available_at, last_receipt_id AS receipt_id FROM telegram_pet_breeding_cooldowns
    WHERE telegram_id=? AND season_key=? AND parent_pet_id IN (?, ?)
      AND available_at > ?
    ORDER BY available_at DESC LIMIT 1`)
    .bind(ownerId, seasonKey, parentIds[0], parentIds[1], now).first().catch(() => null);
  return row || null;
}

function parentTraits(parent) {
  return {
    pet_id: parent.pet_id,
    species_id: parent.species_id || parent.species || '',
    palette_id: parent.palette_id || null,
    marking_id: parent.marking_id || null,
    eye_style: parent.eye_style || null,
    temperament: parent.temperament || null,
    innate_traits: safeJson(parent.innate_traits_json, []),
    phase: parent.phase || parent.stage || null,
    rare_morph_id: parent.rare_morph_id || null,
  };
}

export async function generateBreedingSeed(request = {}) {
  const ownerId = cleanText(request.owner_id || request.telegram_id);
  const seasonKey = cleanText(request.season_key, 80);
  const [parentOne, parentTwo] = canonicalPair(request.parent_pet_a_id, request.parent_pet_b_id);
  const requestKey = cleanText(request.request_key || 'canonical');
  const hex = await digestHex(`moonpet-breeding:v${PET_BREEDING_AUTHORITY_VERSION}:${ownerId}:${seasonKey}:${parentOne}:${parentTwo}:${requestKey}`);
  return {
    seed: hex,
    short_seed: hex.slice(0, 16),
    request_key: requestKey,
    parent_pair: [parentOne, parentTwo],
  };
}

export function generateOffspringTraits(seed, parentA, parentB) {
  const traitsA = parentTraits(parentA);
  const traitsB = parentTraits(parentB);
  const inherited = {
    species_id: hexByte(seed, 0) % 2 === 0 ? traitsA.species_id : traitsB.species_id,
    palette_id: hexByte(seed, 1) % 2 === 0 ? traitsA.palette_id : traitsB.palette_id,
    marking_id: hexByte(seed, 2) % 2 === 0 ? traitsA.marking_id : traitsB.marking_id,
    eye_style: hexByte(seed, 3) % 2 === 0 ? traitsA.eye_style : traitsB.eye_style,
    temperament: hexByte(seed, 4) % 2 === 0 ? traitsA.temperament : traitsB.temperament,
  };
  const innatePool = [...new Set([...traitsA.innate_traits, ...traitsB.innate_traits].filter(Boolean))].sort();
  const first = innatePool.length ? innatePool[hexByte(seed, 5) % innatePool.length] : null;
  const remaining = innatePool.filter((trait) => trait !== first);
  const second = remaining.length ? remaining[hexByte(seed, 6) % remaining.length] : null;
  const strainParents = [traitsA.species_id, traitsB.species_id].filter(Boolean).sort();
  const mutationRollBps = ((hexByte(seed, 7) << 8) + hexByte(seed, 8)) % 10000;
  return {
    authority_version: PET_BREEDING_AUTHORITY_VERSION,
    inherited,
    innate_traits: [first, second].filter(Boolean),
    parent_traits: { a: traitsA, b: traitsB },
    strain: {
      framework: 'placeholder',
      strain_id: strainParents.length ? `strain:${strainParents.join(':')}` : 'strain:unknown',
      parent_species: strainParents,
    },
    mutation: {
      hook: 'moonpet_breeding_mutation_v1',
      enabled: false,
      roll_bps: mutationRollBps,
      candidate: null,
    },
  };
}

function buildOffspringStatements(db, authority, receipt, offspringTraits, slotNumber, options = {}) {
  const slotInsertVerb = options.strictSlot === false ? 'INSERT OR IGNORE' : 'INSERT';
  return [
    db.prepare(`${slotInsertVerb} INTO telegram_pet_season_slots
    (pet_id, telegram_id, season_key, slot_number, acquisition_type, source_event_key, arcade_xp_spent, status)
    VALUES (?, ?, ?, ?, 'free', ?, 0, 'active')`)
      .bind(receipt.offspring_pet_id, authority.owner_id, authority.season_key, slotNumber, receipt.event_key),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_instances
    (pet_id, telegram_id, season_key, slot_number, pet_name, species, stage, pet_xp, level,
     hunger, happiness, cleanliness, energy, health, status, source_profile_updated_at, created_at, updated_at)
    SELECT ?, ?, ?, ?, 'Moonpet', ?, 'egg', 0, 1, ?, ?, ?, ?, ?, 'active', ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM telegram_pet_season_slots WHERE pet_id=? AND telegram_id=? AND season_key=? AND slot_number=?)`)
      .bind(receipt.offspring_pet_id, authority.owner_id, authority.season_key, slotNumber,
        offspringTraits.inherited.species_id || '', BASE_PET_STATS.hunger, BASE_PET_STATS.happiness,
        BASE_PET_STATS.cleanliness, BASE_PET_STATS.energy, BASE_PET_STATS.health,
        authority.now, authority.now, authority.now, receipt.offspring_pet_id, authority.owner_id, authority.season_key, slotNumber),
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_lifecycle_by_pet
    (pet_id, telegram_id, lifecycle_version, identity_seed, phase, species_id, palette_id, marking_id,
     eye_style, temperament, innate_traits_json, incubation_progress, incubation_json, created_at, updated_at)
    SELECT ?, ?, ?, ?, 'egg', ?, ?, ?, ?, ?, ?, 0, '{}', ?, ?
    WHERE EXISTS (SELECT 1 FROM telegram_pet_instances WHERE pet_id=? AND telegram_id=?)`)
      .bind(receipt.offspring_pet_id, authority.owner_id, PET_LIFECYCLE_SCHEMA_VERSION, receipt.seed,
        offspringTraits.inherited.species_id || null, offspringTraits.inherited.palette_id,
        offspringTraits.inherited.marking_id, offspringTraits.inherited.eye_style,
        offspringTraits.inherited.temperament, encodeJson(offspringTraits.innate_traits),
        authority.now, authority.now, receipt.offspring_pet_id, authority.owner_id),
  ];
}

async function readCooldowns(db, ownerId, seasonKey, parentIds) {
  const rows = await db.prepare(`SELECT parent_pet_id, available_at, last_receipt_id AS receipt_id
    FROM telegram_pet_breeding_cooldowns
    WHERE telegram_id=? AND season_key=? AND parent_pet_id IN (?, ?)
    ORDER BY parent_pet_id`)
    .bind(ownerId, seasonKey, parentIds[0], parentIds[1]).all().catch(() => ({ results: [] }));
  return rows.results || [];
}

function buildCooldownStatements(db, authority, parentIds, availableAt, receiptId) {
  return parentIds.map((petId) => db.prepare(`INSERT INTO telegram_pet_breeding_cooldowns
      (parent_pet_id, telegram_id, season_key, available_at, last_receipt_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(parent_pet_id, season_key) DO UPDATE SET
        telegram_id=excluded.telegram_id,
        available_at=excluded.available_at,
        last_receipt_id=excluded.last_receipt_id,
        updated_at=excluded.updated_at`)
    .bind(petId, authority.owner_id, authority.season_key, availableAt, receiptId, authority.now));
}

async function runBreedingSettlement(db, statements) {
  if (typeof db?.batch !== 'function') throw new Error('breeding_authority_requires_d1_batch');
  // Cloudflare D1 batch() is transactional: receipt, offspring and cooldowns
  // settle together, or no accepted breeding receipt is persisted.
  return db.batch(statements);
}

function isSlotAllocationConflict(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('telegram_pet_season_slots') && message.includes('constraint');
}

async function verifyBreedingSettlement(db, receipt, parentIds) {
  const [offspringReady, cooldowns] = await Promise.all([
    offspringStateExists(db, receipt.offspring_pet_id, receipt.telegram_id),
    readCooldowns(db, receipt.telegram_id, receipt.season_key, parentIds),
  ]);
  const receiptCooldowns = new Set(cooldowns
    .filter((row) => row.receipt_id === receipt.receipt_id)
    .map((row) => row.parent_pet_id));
  return offspringReady && parentIds.every((petId) => receiptCooldowns.has(petId));
}

export async function requestMoonpetBreeding(db, request = {}) {
  const seedInfo = await generateBreedingSeed(request);
  const requestContext = requestAuthorityContext(request, seedInfo);
  const eventKey = `breeding:${seedInfo.seed}`;
  if (!requestContext.valid_identity) {
    return { accepted: false, duplicate: false, recovered: false, reason: 'invalid_breeding_authority', event_key: eventKey };
  }
  const existing = await readReceipt(db, eventKey);
  if (existing?.status === 'accepted') {
    if (!receiptMatchesRequestContext(existing, requestContext)) {
      return { accepted: false, duplicate: false, recovered: false, reason: 'breeding_authority_mismatch', event_key: eventKey };
    }
    const authority = {
      accepted: true,
      owner_id: existing.telegram_id,
      season_key: existing.season_key,
      now: normalizeTimestamp(existing.created_at),
    };
    const parentIds = [existing.parent_pet_a_id, existing.parent_pet_b_id];
    const recoveryStatements = [];
    const exists = await offspringExists(db, existing.offspring_pet_id, existing.telegram_id);
    if (!exists) {
      const slotNumber = await recoverySlotNumber(db, authority.owner_id, authority.season_key, existing.offspring_pet_id, existing.offspring_slot_number);
      if (slotNumber) {
        recoveryStatements.push(...buildOffspringStatements(db, authority, existing, safeJson(existing.offspring_traits_json), slotNumber, { strictSlot: false }));
      }
    }
    if (existing.cooldown_available_at) {
      const cooldowns = await readCooldowns(db, authority.owner_id, authority.season_key, parentIds);
      if (cooldowns.length < parentIds.length) {
        recoveryStatements.push(...buildCooldownStatements(db, authority, parentIds, existing.cooldown_available_at, existing.receipt_id));
      }
    }
    if (recoveryStatements.length) await runBreedingSettlement(db, recoveryStatements);
    const verified = await verifyBreedingSettlement(db, existing, parentIds);
    if (!verified) {
      return { accepted: false, duplicate: false, recovered: false, reason: 'breeding_recovery_failed', event_key: eventKey };
    }
    return {
      accepted: true,
      duplicate: recoveryStatements.length === 0,
      recovered: recoveryStatements.length > 0,
      reason: existing.reason,
      receipt_id: existing.receipt_id,
      offspring_pet_id: existing.offspring_pet_id,
      seed: existing.seed,
      offspring: safeJson(existing.offspring_traits_json),
      cooldown_available_at: existing.cooldown_available_at,
      event_key: eventKey,
    };
  }

  const receiptAuthorityConflict = await readReceiptAuthorityConflict(db, requestContext);
  if (receiptAuthorityConflict) {
    return { accepted: false, duplicate: false, recovered: false, reason: 'breeding_authority_mismatch', event_key: eventKey };
  }

  const authority = await validateParentAuthority(db, request);
  if (!authority.accepted) return { accepted: false, duplicate: false, reason: authority.reason, event_key: eventKey };
  const cooldown = await readCooldown(db, authority.owner_id, authority.season_key, seedInfo.parent_pair, authority.now);
  if (cooldown) return {
    accepted: false,
    duplicate: false,
    reason: 'breeding_parent_cooldown',
    cooldown_parent_pet_id: cooldown.parent_pet_id,
    cooldown_available_at: cooldown.available_at,
    event_key: eventKey,
  };

  const slotNumber = await nextAvailableSlot(db, authority.owner_id, authority.season_key);
  if (!slotNumber) return { accepted: false, duplicate: false, reason: 'breeding_offspring_slot_unavailable', event_key: eventKey };

  const [canonicalParentA, canonicalParentB] = canonicalParents(authority.parent_a, authority.parent_b, seedInfo.parent_pair);
  const offspringTraits = generateOffspringTraits(seedInfo.seed, canonicalParentA, canonicalParentB);
  const receiptId = `breeding-receipt:${seedInfo.seed}`;
  const offspringPetId = `pet:breed:${seedInfo.seed}`;
  const cooldownAvailableAt = new Date(Date.parse(authority.now) + PET_BREEDING_COOLDOWN_MS).toISOString();
  const receipt = {
    receipt_id: receiptId,
    event_key: eventKey,
    offspring_pet_id: offspringPetId,
    seed: seedInfo.seed,
  };
  const settlementStatements = [
    db.prepare(`INSERT OR IGNORE INTO telegram_pet_breeding_receipts
    (receipt_id, event_key, request_key, telegram_id, parent_pet_a_id, parent_pet_b_id, season_key,
     seed, offspring_pet_id, offspring_slot_number, offspring_traits_json, status, reason, cooldown_available_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted', 'breeding_authorized', ?, ?, ?)`)
      .bind(receiptId, eventKey, seedInfo.request_key, authority.owner_id, seedInfo.parent_pair[0], seedInfo.parent_pair[1],
      authority.season_key, seedInfo.seed, offspringPetId, slotNumber, encodeJson(offspringTraits), cooldownAvailableAt,
      authority.now, authority.now),
    ...buildOffspringStatements(db, authority, receipt, offspringTraits, slotNumber),
    ...buildCooldownStatements(db, authority, seedInfo.parent_pair, cooldownAvailableAt, receiptId),
  ];
  try {
    await runBreedingSettlement(db, settlementStatements);
  } catch (error) {
    if (isSlotAllocationConflict(error)) {
      const racedReceipt = await readReceipt(db, eventKey);
      if (racedReceipt?.status === 'accepted' && receiptMatchesRequestContext(racedReceipt, requestContext)) {
        return requestMoonpetBreeding(db, request);
      }
      return { accepted: false, duplicate: false, recovered: false, reason: 'breeding_offspring_slot_unavailable', event_key: eventKey };
    }
    throw error;
  }

  const inserted = await readReceipt(db, eventKey);
  if (inserted?.receipt_id !== receiptId) {
    return requestMoonpetBreeding(db, request);
  }
  return {
    accepted: true,
    duplicate: false,
    recovered: false,
    reason: 'breeding_authorized',
    receipt_id: receiptId,
    offspring_pet_id: offspringPetId,
    seed: seedInfo.seed,
    offspring: offspringTraits,
    cooldown_available_at: cooldownAvailableAt,
    event_key: eventKey,
  };
}

export const __breedingAuthorityTestHooks = Object.freeze({
  canonicalPair,
  generateBreedingSeed,
  generateOffspringTraits,
  requestMoonpetBreeding,
  validateParentAuthority,
});
