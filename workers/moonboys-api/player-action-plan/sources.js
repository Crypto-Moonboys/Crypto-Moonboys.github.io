import {
  actionPlanTask, cost, isoWeek, nextIsoWeek, nextUtcDay, reward,
  sourceStatus, utcDay,
} from './schema.js';
import { getPetJourneyWeek, getPetJourneyWeekBounds, getPetOwnershipPeriod } from '../pets/ownership-period.js';
import { PET_ENTRY_ARCADE_XP } from '../pets/entry-requirement.js';
import { getCombatEligibility } from '../pets/combat-eligibility.js';
import { DAILY_JOURNEY_CARE_SOURCE_PROOF_SQL } from '../pets/daily-moon-run.js';
import { getPetVisibleLevel } from '../pets/progression-phase-2.js';
import { DAILY_COMPLETION_REWARD } from '../pets/completion-policy.js';
import { WEEKLY_JOURNEY_SOURCE_OBJECTIVES } from '../pets/weekly-journey.js';
import { weeklyBossLegacySourceProofSql } from '../pets/weekly-boss-evidence.js';
import { applyPetCareDecay } from '../pets/care-decay.js';
import { getPetWeeklyBoss } from '../pets/player-expansion.js';
import { getPetDailyBounties } from '../pets/economy-expansion.js';

export const ACTION_PLAN_SOURCE_REGISTRY = Object.freeze([
  ['onboarding.telegram', 'onboarding', 'account', 'once', 'server_projection', '/gkniftyheads-incubator.html'],
  ['onboarding.faction', 'onboarding', 'account', 'season_lock', 'server_projection', '/community.html#battle-join-faction'],
  ['onboarding.pet-entry', 'onboarding', 'account', 'once', 'server_projection', '/games/'],
  ['telegram.daily-claim', 'community', 'account', 'utc_day', 'server_receipt', '/gkniftyheads-incubator.html'],
  ['faction.daily-missions', 'faction', 'faction_member', 'utc_day', 'client_mirror', '/community.html#tasks-quests-and-xp'],
  ['faction.seasonal-mission', 'faction', 'faction_member', 'faction_season', 'client_mirror', '/community.html#tasks-quests-and-xp'],
  ['faction.weekly-war', 'faction', 'faction_member', 'faction_week', 'server_projection', '/community.html#live-battle-chamber'],
  ['battle.wtf-windows', 'battle', 'account', 'event_window', 'schedule_preview', '/community.html#tasks-quests-and-xp'],
  ['battle.missed-opportunities', 'battle', 'account', 'history', 'server_projection', '/community.html#tasks-quests-and-xp'],
  ['arcade.daily-opportunity', 'arcade', 'account', 'utc_day', 'server_projection', '/games/'],
  ['arcade.roguelite-objectives', 'arcade', 'account', 'source_defined', 'client_mirror', '/games/'],
  ['moonpet.adoption-incubation', 'moonpet', 'pet', 'pet_age', 'server_projection', '/moonpet-game.html'],
  ['moonpet.daily-seven-missions', 'moonpet', 'pet', 'utc_day', 'server_projection', '/moonpet-game.html'],
  ['moonpet.seven-of-seven-claim', 'moonpet', 'account', 'utc_day', 'server_receipt', '/moonpet-game.html'],
  ['moonpet.daily-journey', 'moonpet', 'pet', 'utc_day', 'server_receipt', '/moonpet-game.html'],
  ['moonpet.weekly-journey', 'moonpet', 'pet', 'pet_journey_week', 'server_receipt', '/moonpet-game.html'],
  ['moonpet.care', 'moonpet', 'pet', 'cooldown', 'server_projection', '/moonpet-game.html'],
  ['moonpet.claimable-rewards', 'moonpet', 'account', 'saved_claim', 'server_projection', '/moonpet-game.html'],
  ['moonpet.saved-run', 'moonpet', 'original_pet', 'run_session', 'server_projection', '/moonpet-game.html'],
  ['moonpet.contracts', 'moonpet', 'original_pet', 'saved_session', 'server_projection', '/moonpet-game.html'],
  ['moonpet.jobs', 'moonpet', 'pet', 'saved_timer', 'server_projection', '/moonpet-game.html'],
  ['moonpet.bosses-combat', 'moonpet', 'original_pet', 'source_defined', 'server_projection', '/moonpet-game.html'],
  ['moonpet.garden-kitchen-gym', 'moonpet', 'pet', 'saved_timer', 'server_projection', '/moonpet-game.html'],
  ['moonpet.evolution', 'moonpet', 'pet', 'permanent', 'server_receipt', '/moonpet-game.html'],
  ['wiki.accepted-missions', 'wiki', 'account', 'utc_day', 'server_receipt', '/community.html'],
  ['championship.verified-clout', 'championship', 'account', 'utc_competition', 'server_receipt', '/community.html'],
  ['games.dead-run', 'external_game', 'account', 'source_defined', 'server_projection', '/games/'],
  ['games.nbg-london', 'external_game', 'account', 'source_defined', 'schedule_preview', '/games/'],
].map(([key, group, ownerScope, period, evidence, path]) => Object.freeze({ key, group, ownerScope, period, evidence, path })));

const SOURCE_BY_KEY = new Map(ACTION_PLAN_SOURCE_REGISTRY.map((source) => [source.key, source]));
function number(value) { return Math.max(0, Math.floor(Number(value) || 0)); }
// Mirrors canonical visible 0–100 pet-care bars: ROUND, not FLOOR. Elapsed
// decay is projected on a copy before these thresholds are evaluated.
function visiblePetCare(value) {
  return Math.round(Math.max(0, Math.min(100, Number(value) || 0)));
}
const PET_ACTIVITY_GRACE_MS = 24 * 60 * 60 * 1000; // canonical worker.js PET_ACTIVITY_GRACE_SECONDS
function sqliteUtcMillis(value) {
  if (!value) return NaN;
  const normalized = String(value).trim().replace(' ', 'T');
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/iu.test(normalized) ? normalized : normalized + 'Z');
}
function parseJson(value) {
  try { return JSON.parse(String(value || '{}')); }
  catch { return {}; }
}

async function opaqueRef(value) {
  const bytes = new TextEncoder().encode(`player-action-plan:v1:${String(value)}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `pap_${[...new Uint8Array(digest)].slice(0, 12).map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function query(db, sql, params, fallback, failures, sourceKeys) {
  try { return await db.all(sql, params); }
  catch (error) {
    for (const sourceKey of sourceKeys) failures.set(sourceKey, error?.message || 'query_failed');
    return fallback;
  }
}

function task(now, input) {
  const meta = SOURCE_BY_KEY.get(input.source_key);
  return actionPlanTask({
    source: meta.group,
    owner_scope: meta.ownerScope,
    category: meta.group,
    period: { kind: meta.period, key: input.period_key || null, origin_timezone: 'UTC' },
    destination: { kind: 'web', path: meta.path },
    evidence: { kind: meta.evidence, ...(input.evidence || {}) },
    cost: cost([]), reward: reward([], false), read_at: now.toISOString(),
    ...input,
    evidence: { kind: meta.evidence, ...(input.evidence || {}) },
  });
}

function genericTask(now, source, status, health, detail = {}) {
  const label = source.key.split('.').map((part) => part.replaceAll('-', ' ')).join(' · ');
  return task(now, {
    task_id: `${source.key}:${detail.periodKey || 'lifetime'}:${detail.suffix || 'current'}`,
    source_key: source.key,
    title: detail.title || label.replace(/\b\w/gu, (value) => value.toUpperCase()),
    description: detail.description || 'Review this source in its canonical experience.',
    why: detail.why || 'This source is included in the unified player plan without inventing completion evidence.',
    status, source_health: health, priority: detail.priority ?? 700,
    progress: detail.progress || { current: null, target: null, unit: 'actions' },
    blocking_reason_code: detail.blocking || null,
    period_key: detail.periodKey || null,
    expires_at: detail.expiresAt || null,
    reward: detail.reward || reward([], false),
    evidence: { kind: source.evidence, ...(detail.evidence || {}) },
    owner_scope: source.key === 'moonpet.daily-seven-missions' ? 'account' : source.ownerScope,
    source_pet_ref: detail.sourcePetRef || null,
  });
}

const SOURCE_TABLES = Object.freeze({
  'faction.daily-missions': 'player_daily_mission_state',
  'battle.wtf-windows': 'daily_wtf_events',
  'battle.missed-opportunities': 'daily_missed_perks',
  'arcade.daily-opportunity': 'daily_opportunity_state',
  'arcade.roguelite-objectives': 'arcade_progression_events',
  'moonpet.adoption-incubation': 'telegram_pet_instances',
  'moonpet.daily-seven-missions': 'telegram_pet_daily_completion',
  'moonpet.seven-of-seven-claim': 'telegram_pet_daily_completion',
  'moonpet.daily-journey': 'telegram_pet_daily_journey_objectives',
  'moonpet.weekly-journey': 'telegram_pet_weekly_journey_objectives',
  'moonpet.care': 'telegram_pet_instances',
  'moonpet.claimable-rewards': 'telegram_pet_reward_claims',
  'moonpet.saved-run': 'telegram_pet_runs',
  'moonpet.contracts': 'telegram_pet_contracts',
  'moonpet.jobs': 'telegram_pet_activity_sessions',
  'moonpet.bosses-combat': 'telegram_pet_weekly_boss_victories_by_pet',
  'moonpet.garden-kitchen-gym': 'telegram_pet_garden_plots',
  'moonpet.evolution': 'telegram_pet_evolutions_by_pet',
  'wiki.accepted-missions': 'wiki_mission_completions',
  'championship.verified-clout': 'championship_clout_daily',
  'games.dead-run': 'dead_run_sessions',
  'games.nbg-london': 'nbg_london_records',
});

async function tableHealth(db, failures) {
  const output = {};
  const uniqueTables = [...new Set(Object.values(SOURCE_TABLES))];
  const present = new Map();
  // Dispatch all health probes in one bounded wall-clock window. A stalled D1
  // lookup must not consume a full statement timeout for each table in series.
  // Read-only facade enforces each timeout and the shared statement budget.
  await Promise.all(uniqueTables.map(async (tableName) => {
    try { present.set(tableName, await db.tableExists(tableName)); }
    catch (error) {
      // Probe failure is NOT evidence of a missing migration. Every dependent
      // source must fail closed as query_failed during final reconciliation.
      present.set(tableName, false);
      const message = error?.message || 'table_check_failed';
      for (const [sourceKey, mappedTable] of Object.entries(SOURCE_TABLES)) {
        if (mappedTable === tableName) failures.set(sourceKey, message);
      }
    }
  }));
  for (const source of ACTION_PLAN_SOURCE_REGISTRY) {
    const table = SOURCE_TABLES[source.key];
    output[source.key] = !table || present.get(table)
      ? sourceStatus('live', { adapter: 'read_only_projection' })
      : sourceStatus('migration_pending', { missing_tables: [table] });
  }
  return output;
}

export async function buildPlayerActionPlanSources(db, ownerId, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const day = utcDay(now);
  const week = isoWeek(now);
  const failures = new Map();
  const sourceStatuses = await tableHealth(db, failures);
  const tasks = [];

  const [identity] = await query(db,
    'SELECT telegram_id FROM telegram_users WHERE telegram_id=? LIMIT 1', [ownerId], [], failures, ['onboarding.telegram']);
  sourceStatuses['onboarding.telegram'] = sourceStatus(identity ? 'live' : 'live_empty', { adapter: 'verified_identity' });
  tasks.push(genericTask(now, SOURCE_BY_KEY.get('onboarding.telegram'), identity ? 'complete' : 'blocked', 'live', {
    title: identity ? 'Telegram identity verified' : 'Restore Telegram identity', priority: identity ? 900 : 10,
    blocking: identity ? null : 'verified_identity_record_missing', progress: { current: identity ? 1 : 0, target: 1, unit: 'identity' },
  }));

  const factionRows = await query(db,
    'SELECT m.faction_id, f.name FROM telegram_faction_members m LEFT JOIN telegram_factions f ON f.id=m.faction_id WHERE m.telegram_id=? LIMIT 1',
    [ownerId], [], failures, ['onboarding.faction', 'faction.daily-missions', 'faction.seasonal-mission', 'faction.weekly-war']);
  const faction = factionRows[0] || null;
  for (const key of ['onboarding.faction', 'faction.daily-missions', 'faction.seasonal-mission', 'faction.weekly-war']) {
    // An assigned member does not make a missing mission-state table live.
    if (sourceStatuses[key]?.state === 'migration_pending') continue;
    sourceStatuses[key] = sourceStatus(faction ? 'live' : 'live_empty', { adapter: key.startsWith('faction.') ? 'advisory_faction_projection' : 'membership_projection' });
  }
  tasks.push(genericTask(now, SOURCE_BY_KEY.get('onboarding.faction'), faction ? 'complete' : 'ready', 'live', {
    title: faction ? 'Faction membership confirmed' : 'Choose your faction', priority: faction ? 900 : 20,
    progress: { current: faction ? 1 : 0, target: 1, unit: 'membership' },
  }));
  const factionMissionRows = faction && sourceStatuses['faction.daily-missions'].state !== 'migration_pending'
    ? await query(db, `SELECT mission_id,progress,completed FROM player_daily_mission_state
        WHERE telegram_id=? AND mission_date=? ORDER BY mission_id ASC LIMIT 30`,
      [ownerId, day], [], failures, ['faction.daily-missions']) : [];
  if (faction && factionMissionRows.length) {
    for (const row of factionMissionRows) {
      const objective = String(row.mission_id || '').slice(0, 100);
      if (!objective) continue;
      tasks.push(genericTask(now, SOURCE_BY_KEY.get('faction.daily-missions'),
        number(row.completed) === 1 ? 'complete' : 'in_progress', 'live', {
          title: objective.replace(/[_-]+/gu, ' '), priority: 430, periodKey: day,
          suffix: await opaqueRef(`${ownerId}:${day}:${objective}`),
          expiresAt: nextUtcDay(now),
          description: 'Saved advisory faction progress. This is not verified competitive Clout.',
          progress: { current: number(row.progress), target: null, unit: 'source_progress' },
          evidence: { verified_completion: false },
        }));
    }
  } else {
    tasks.push(genericTask(now, SOURCE_BY_KEY.get('faction.daily-missions'),
      !faction ? 'blocked' : 'preview', faction ? 'preview' : 'live_empty', {
        title: 'Review rotating daily faction missions', priority: 740, periodKey: day,
        expiresAt: nextUtcDay(now),
        blocking: faction ? 'mission_catalogue_not_server_authoritative' : 'faction_membership_required',
      }));
    if (faction && sourceStatuses['faction.daily-missions'].state !== 'migration_pending')
      sourceStatuses['faction.daily-missions'] = sourceStatus('preview', { adapter: 'client_mirror_without_persisted_rows' });
  }
  for (const key of ['faction.seasonal-mission', 'faction.weekly-war']) {
    if (faction) sourceStatuses[key] = sourceStatus('preview', { adapter: 'client_or_public_only' });
    tasks.push(genericTask(now, SOURCE_BY_KEY.get(key), faction ? 'preview' : 'blocked',
      faction ? 'preview' : 'live_empty', {
        title: key === 'faction.weekly-war' ? 'Review faction weekly standings' : 'Review faction seasonal mission',
        periodKey: key === 'faction.weekly-war' ? week : null, priority: 740,
        blocking: faction ? 'no_verified_personal_objective' : 'faction_membership_required',
      }));
  }

  const arcadeRows = await query(db,
    'SELECT arcade_xp_total FROM arcade_progression_state WHERE telegram_id=? LIMIT 1', [ownerId], [], failures,
    ['onboarding.pet-entry']);
  const lifetimeXp = number(arcadeRows[0]?.arcade_xp_total);
  sourceStatuses['onboarding.pet-entry'] = sourceStatus(arcadeRows.length ? 'live' : 'live_empty', { adapter: 'lifetime_arcade_xp' });

  const petRows = sourceStatuses['moonpet.adoption-incubation'].state === 'migration_pending' ? [] : await query(db,
    `SELECT i.pet_id,i.season_key,i.slot_number,i.stage,i.level,i.pet_xp,i.hunger,i.happiness,i.cleanliness,i.energy,i.health,i.status,i.created_at,i.updated_at,i.last_decay_at,s.created_at AS ownership_created_at,s.journey_clock,
            l.phase AS lifecycle_phase,
            CASE WHEN a.pet_id=i.pet_id THEN 1 ELSE 0 END AS is_active
       FROM telegram_pet_instances i
       JOIN telegram_pet_season_slots s ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id
        AND s.season_key=i.season_key AND s.slot_number=i.slot_number
       LEFT JOIN telegram_pet_active_slots a ON a.telegram_id=s.telegram_id
        AND a.pet_id=s.pet_id AND a.season_key=s.season_key
       LEFT JOIN telegram_pet_lifecycle_by_pet l ON l.pet_id=s.pet_id AND l.telegram_id=s.telegram_id
      WHERE s.telegram_id=? AND s.status='active' AND i.status='active'
      ORDER BY s.created_at ASC,s.pet_id ASC`, [ownerId], [], failures,
    ['moonpet.adoption-incubation', 'moonpet.daily-journey',
      'moonpet.weekly-journey', 'moonpet.care', 'moonpet.jobs',
      'moonpet.garden-kitchen-gym', 'moonpet.evolution']);
  // The owned roster is a shared authority for all Moonpet projections.
  // A failed roster read cannot be mistaken for a newly empty account. Also
  // distinguish a genuinely absent roster table from a failed table probe.
  const rosterFailure = failures.get('moonpet.adoption-incubation');
  const rosterMigrationMissing = !rosterFailure
    && sourceStatuses['moonpet.adoption-incubation'].state === 'migration_pending';
  const rosterUnavailable = Boolean(rosterFailure || rosterMigrationMissing);
  if (rosterUnavailable) {
    // Only projections requiring the live roster fail closed. Account-level
    // receipts, original-pet saved runs/contracts and historical payouts have
    // independent D1 authorities and remain readable during roster outages.
    for (const key of ['moonpet.adoption-incubation', 'moonpet.daily-journey',
      'moonpet.weekly-journey', 'moonpet.care', 'moonpet.jobs',
      'moonpet.garden-kitchen-gym', 'moonpet.evolution']) {
      if (rosterFailure) failures.set(key, rosterFailure);
      else sourceStatuses[key] = sourceStatus('migration_pending', {
        adapter: 'owned_roster_dependency', missing_tables: ['telegram_pet_instances'],
      });
    }
  }
  const pets = await Promise.all(petRows.map(async (row) => {
    let journeyWeek = null; let journeyBounds = null;
    try {
      const period = getPetOwnershipPeriod(row.season_key, row.ownership_created_at, row.journey_clock);
      journeyWeek = getPetJourneyWeek(period, now);
      journeyBounds = getPetJourneyWeekBounds(period, journeyWeek);
    } catch {}
    return { ...row, ref: await opaqueRef(`${ownerId}:${row.pet_id}`), journeyWeek, journeyBounds };
  }));
  // Existing telegram_pet_profiles ownership bypasses the first-adoption
  // threshold even when a legacy account has no currently active instance.
  const ownerProfileRows = await query(db,
    'SELECT telegram_id FROM telegram_pet_profiles WHERE telegram_id=? LIMIT 1',
    [ownerId], [], failures, ['onboarding.pet-entry']);
  const existingOwner = ownerProfileRows.length > 0;
  const petEntryComplete = existingOwner || pets.length > 0;
  if (sourceStatuses['moonpet.adoption-incubation'].state !== 'migration_pending') {
    sourceStatuses['moonpet.adoption-incubation'] = sourceStatus(pets.length ? 'live' : 'live_empty', { adapter: 'active_owned_roster' });
  }
  if (rosterUnavailable && !petEntryComplete) {
    if (rosterFailure) failures.set('onboarding.pet-entry', rosterFailure);
    else sourceStatuses['onboarding.pet-entry'] = sourceStatus('migration_pending', {
      adapter: 'owned_roster_dependency', missing_tables: ['telegram_pet_instances'],
    });
  }
  tasks.push(genericTask(now, SOURCE_BY_KEY.get('onboarding.pet-entry'),
    petEntryComplete ? 'complete' : rosterUnavailable ? 'sync_unavailable'
      : lifetimeXp >= PET_ENTRY_ARCADE_XP ? 'ready' : 'in_progress', 'live', {
    title: existingOwner && !pets.length ? 'Moonpet owner recognised — restore existing pet'
      : petEntryComplete ? 'Moonpet entry complete'
        : rosterUnavailable ? 'Moonpet ownership unavailable'
          : lifetimeXp >= PET_ENTRY_ARCADE_XP ? 'Adopt your first Moonpet' : 'Earn lifetime Arcade XP for Moonpet entry',
    description: existingOwner && !pets.length
      ? 'Existing ownership bypasses the first-pet Arcade XP gate; open Moonpet to restore your pet.'
      : 'First-time adoption requires lifetime Arcade XP rather than spendable XP.',
    priority: petEntryComplete ? 900 : 30,
    blocking: rosterUnavailable && !petEntryComplete ? 'owned_roster_unavailable' : null,
    progress: { current: Math.min(PET_ENTRY_ARCADE_XP, lifetimeXp), target: PET_ENTRY_ARCADE_XP, unit: 'lifetime_arcade_xp' },
  }));

  // Both authorities are consulted by awardCommunityXp. Legacy daily logs
  // block a new award; a malformed receipt must never verify a completion.
  const dailyClaimRows = await query(db,
    "SELECT telegram_id,action,claim_key,reference_id,xp_change,season_id,earned_at,settlement_token FROM telegram_community_xp_awards WHERE telegram_id=? AND action='daily_claim' AND claim_key=? LIMIT 1",
    [ownerId, day], [], failures, ['telegram.daily-claim']);
  const legacyDailyRows = await query(db,
    "SELECT id,telegram_id,action,reference_id,xp_change,created_at FROM telegram_xp_log WHERE telegram_id=? AND action='daily_claim' AND DATE(created_at)=? ORDER BY id LIMIT 1",
    [ownerId, day], [], failures, ['telegram.daily-claim']);
  const receipt = dailyClaimRows[0];
  const legacyReceipt = legacyDailyRows[0];
  const receiptValid = !receipt || (receipt.telegram_id === ownerId
    && receipt.action === 'daily_claim' && receipt.claim_key === day
    && receipt.reference_id === day && Number.isSafeInteger(receipt.xp_change)
    && receipt.xp_change > 0 && String(receipt.settlement_token || '').trim()
    && Number.isFinite(Date.parse(receipt.earned_at))
    && (receipt.season_id == null || Number.isSafeInteger(receipt.season_id) && receipt.season_id > 0));
  const legacyValid = !legacyReceipt || (legacyReceipt.telegram_id === ownerId
    && legacyReceipt.action === 'daily_claim' && Number.isSafeInteger(legacyReceipt.id)
    && legacyReceipt.id > 0 && Number.isSafeInteger(legacyReceipt.xp_change)
    && legacyReceipt.xp_change > 0 && Number.isFinite(sqliteUtcMillis(legacyReceipt.created_at)));
  if (!receiptValid || !legacyValid) failures.set('telegram.daily-claim', 'daily_claim_receipt_invalid');
  const claimedDaily = Boolean((receipt && receiptValid) || (legacyReceipt && legacyValid));
  const dailyClaimUnavailable = failures.has('telegram.daily-claim');
  sourceStatuses['telegram.daily-claim'] = sourceStatus(
    dailyClaimUnavailable ? 'query_failed' : claimedDaily ? 'live' : 'live_empty',
    { adapter: 'immutable_or_legacy_award_receipt' });
  tasks.push(genericTask(now, SOURCE_BY_KEY.get('telegram.daily-claim'),
    dailyClaimUnavailable ? 'sync_unavailable' : claimedDaily ? 'claimed' : 'ready',
    dailyClaimUnavailable ? 'query_failed' : 'live', {
    title: dailyClaimUnavailable ? 'Telegram daily check-in unavailable'
      : claimedDaily ? 'Daily Telegram check-in claimed' : 'Claim today’s Telegram check-in',
    priority: claimedDaily ? 800 : 100, blocking: dailyClaimUnavailable ? 'daily_claim_source_unavailable' : null,
    periodKey: day, expiresAt: nextUtcDay(now),
    progress: { current: claimedDaily && !dailyClaimUnavailable ? 1 : 0, target: 1, unit: 'claim' },
    reward: reward([{ type: 'community_xp', amount: 20 }], true),
    evidence: { verified_completion: claimedDaily && !dailyClaimUnavailable,
      accepted_at: receipt?.earned_at || legacyReceipt?.created_at || null },
  }));

  const dailyOpportunity = sourceStatuses['arcade.daily-opportunity'].state === 'migration_pending' ? [] : await query(db,
    'SELECT chain_depth,updated_at FROM daily_opportunity_state WHERE telegram_id=? AND utc_day=? LIMIT 1', [ownerId, day], [], failures, ['arcade.daily-opportunity']);
  if (sourceStatuses['arcade.daily-opportunity'].state !== 'migration_pending') {
    sourceStatuses['arcade.daily-opportunity'] = sourceStatus(dailyOpportunity[0] ? 'live' : 'live_empty', { adapter: 'persisted_row_only' });
  }
  tasks.push(genericTask(now, SOURCE_BY_KEY.get('arcade.daily-opportunity'), dailyOpportunity[0] ? 'in_progress' : 'ready', 'live', {
    title: 'Advance today’s Arcade opportunity', priority: 320, periodKey: day, expiresAt: nextUtcDay(now),
    progress: { current: number(dailyOpportunity[0]?.chain_depth), target: null, unit: 'chain_depth' },
  }));
  sourceStatuses['arcade.roguelite-objectives'] = sourceStatus('preview', { adapter: 'client_mirror_advisory' });
  tasks.push(genericTask(now, SOURCE_BY_KEY.get('arcade.roguelite-objectives'), 'preview', 'preview', {
    title: 'Review Arcade roguelite objectives', priority: 760, blocking: 'client_mirror_not_completion_evidence',
  }));

  const wtfRows = sourceStatuses['battle.wtf-windows'].state === 'migration_pending' ? [] : await query(db,
    `SELECT e.event_id,e.starts_at,e.ends_at,p.status AS player_status,
       p.checked_in_at,p.completed_at,p.missed_at,p.reward_status
       FROM daily_wtf_events e
       LEFT JOIN daily_wtf_player_events p ON p.event_id=e.event_id
         AND p.telegram_id=? AND p.utc_day=e.utc_day
       WHERE e.utc_day=? ORDER BY e.starts_at ASC LIMIT 12`,
    [ownerId, day], [], failures, ['battle.wtf-windows']);
  if (sourceStatuses['battle.wtf-windows'].state !== 'migration_pending') {
    sourceStatuses['battle.wtf-windows'] = sourceStatus(wtfRows.length ? 'live' : 'preview', { adapter: wtfRows.length ? 'persisted_windows' : 'schedule_preview_only' });
  }
  if (!wtfRows.length) {
    tasks.push(genericTask(now, SOURCE_BY_KEY.get('battle.wtf-windows'), 'preview', 'preview', {
      title: 'Preview the WTF schedule', priority: 780, periodKey: day,
      blocking: 'persisted_window_unavailable',
    }));
  } else for (const row of wtfRows) {
    const starts = Date.parse(row.starts_at), ends = Date.parse(row.ends_at);
    const clockValid = Number.isFinite(starts) && Number.isFinite(ends) && ends > starts;
    const playerState = String(row.player_status || 'not_checked_in');
    const completed = Boolean(row.completed_at) || playerState === 'completed';
    const missed = Boolean(row.missed_at) || playerState === 'missed';
    const checkedIn = Boolean(row.checked_in_at) || ['checked_in','in_progress','participating'].includes(playerState);
    // A persisted 'upcoming' player row is a valid not-checked-in state.
    const knownState = ['upcoming','not_checked_in','completed','missed',
      'checked_in','in_progress','participating'].includes(playerState);
    const status = !clockValid ? 'sync_unavailable' : completed ? 'complete'
      : missed || now.getTime() >= ends ? 'expired'
        : checkedIn ? 'in_progress'
          : !knownState ? 'sync_unavailable'
            : now.getTime() >= starts ? 'active' : 'waiting';
    tasks.push(task(now, {
      source_key: 'battle.wtf-windows',
      task_id: `battle.wtf-windows:${day}:${await opaqueRef(`${row.event_id}:${row.starts_at}`)}`,
      title: completed ? 'WTF window completed' : checkedIn ? 'WTF window check-in saved' : 'WTF timed event window',
      description: completed ? 'The Worker confirms a completed player event.'
        : checkedIn ? 'A saved check-in is in progress; completion has not yet been confirmed.'
          : 'A scheduled event is not proof of participation.',
      why: 'Complete a qualifying action within this persisted UTC window.',
      status, source_health: clockValid ? 'live' : 'unavailable', priority: status === 'active' ? 190 : 540,
      period: { kind: 'event_window', key: day, origin_timezone: 'UTC' },
      available_at: clockValid ? row.starts_at : null, expires_at: clockValid ? row.ends_at : null,
      blocking_reason_code: !clockValid ? 'invalid_event_window'
        : !knownState ? 'wtf_player_status_unknown' : null,
      evidence: { kind: 'server_projection', verified_completion: false,
        accepted_at: completed ? row.completed_at : null },
    }));
  }
  const missedRows = sourceStatuses['battle.missed-opportunities'].state === 'migration_pending' ? [] : await query(db,
    'SELECT COUNT(*) AS total FROM daily_missed_perks WHERE telegram_id=?', [ownerId], [], failures, ['battle.missed-opportunities']);
  if (sourceStatuses['battle.missed-opportunities'].state !== 'migration_pending') {
    sourceStatuses['battle.missed-opportunities'] = sourceStatus(number(missedRows[0]?.total) ? 'live' : 'live_empty', { adapter: 'persisted_owner_history' });
  }
  tasks.push(genericTask(now, SOURCE_BY_KEY.get('battle.missed-opportunities'), number(missedRows[0]?.total) ? 'active' : 'waiting', 'live', {
    title: number(missedRows[0]?.total) ? 'Review missed battle opportunities' : 'No recorded missed battle opportunities', priority: 650,
    progress: { current: number(missedRows[0]?.total), target: null, unit: 'records' },
  }));

  // The game's historical "7/7" award uses eight distinct flags (0xFF).
  // Read saved, unclaimed awards from earlier days, not today's record alone.
  const completionKeys = ['moonpet.daily-seven-missions', 'moonpet.seven-of-seven-claim'];
  // A saved pet ID alone cannot authorize a claim. Verify the exact retained
  // pet/season tuple against the signed owner's instance and ownership slot.
  const completionAuthority = `CASE WHEN EXISTS (
    SELECT 1 FROM telegram_pet_instances i JOIN telegram_pet_season_slots s
      ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id
        AND s.season_key=i.season_key AND s.slot_number=i.slot_number
    WHERE i.pet_id=telegram_pet_daily_completion.pet_id
      AND i.season_key=telegram_pet_daily_completion.season_key
      AND i.telegram_id=telegram_pet_daily_completion.telegram_id
  ) THEN 1 ELSE 0 END AS original_pet_verified`;
  const completionSelect = `utc_day,progress_bits,claimed_at,pet_id,season_key,${completionAuthority}`;
  const completionUnavailable = sourceStatuses['moonpet.daily-seven-missions'].state === 'migration_pending';
  // Current day is independent of the bounded historical inbox. Otherwise
  // over 100 prior pending claims could displace the current day's progress.
  const todayCompletionRows = completionUnavailable ? [] : await query(db,
    `SELECT ${completionSelect} FROM telegram_pet_daily_completion WHERE telegram_id=? AND utc_day=? LIMIT 1`,
    [ownerId, day], [], failures, completionKeys);
  const historyRows = completionUnavailable ? [] : await query(db,
    `SELECT ${completionSelect} FROM telegram_pet_daily_completion
      WHERE telegram_id=? AND utc_day<>? AND progress_bits=255 AND claimed_at IS NULL
      ORDER BY utc_day DESC LIMIT 100`, [ownerId, day], [], failures, completionKeys);
  const historyCountRows = completionUnavailable ? [] : await query(db,
    `SELECT COUNT(*) AS total FROM telegram_pet_daily_completion
      WHERE telegram_id=? AND utc_day<>? AND progress_bits=255 AND claimed_at IS NULL`,
    [ownerId, day], [], failures, completionKeys);
  const historicalPendingTotal = number(historyCountRows[0]?.total);
  const hiddenPendingClaims = Math.max(0, historicalPendingTotal - historyRows.length);
  const completionRows = [...todayCompletionRows, ...historyRows];
  const completion = completionRows.find((row) => row.utc_day === day) || {};
  const bits = number(completion.progress_bits);
  const dailyFlags = [[1,'Feed'],[2,'Play'],[4,'Clean'],[8,'Train'],[16,'Trade'],
    [32,'Buy or upgrade'],[64,'Adventure or qualifying run'],[128,'Meet Moon Gold requirement']];
  const bitsCurrent = dailyFlags.filter(([flag]) => bits & flag).length;
  const sevenDone = bits === 255;
  tasks.push(genericTask(now, SOURCE_BY_KEY.get('moonpet.daily-seven-missions'),
    sevenDone ? 'complete' : rosterUnavailable ? 'sync_unavailable'
      : pets.length ? 'in_progress' : 'blocked', 'live', {
      title: 'Daily Moonpet completion conditions', periodKey: day, priority: 205,
      description: 'Eight source flags currently govern the legacy 7/7 bonus.',
      expiresAt: nextUtcDay(now), blocking: sevenDone || pets.length ? null
        : rosterUnavailable ? 'owned_roster_unavailable' : 'moonpet_required',
      progress: { current: bitsCurrent, target: dailyFlags.length, unit: 'source_flags' },
    }));
  for (const [flag, label] of dailyFlags) {
    tasks.push(genericTask(now, SOURCE_BY_KEY.get('moonpet.daily-seven-missions'),
      bits & flag ? 'complete' : rosterUnavailable ? 'sync_unavailable'
        : pets.length ? 'in_progress' : 'blocked', 'live', {
        title: label, periodKey: day, suffix: `flag-${flag}`, priority: 265,
        expiresAt: nextUtcDay(now), blocking: bits & flag || pets.length ? null
          : rosterUnavailable ? 'owned_roster_unavailable' : 'moonpet_required',
        progress: { current: bits & flag ? 1 : 0, target: 1, unit: 'accepted_source_flag' },
      }));
  }
  for (const row of completionRows) {
    if (row.utc_day !== day && (number(row.progress_bits) !== 255 || row.claimed_at)) continue;
    const claimed = Boolean(row.claimed_at);
    const completed = number(row.progress_bits) === 255;
    const needsSourcePet = completed && !claimed && !row.pet_id;
    const verifiedActivePet = pets.some((pet) => number(pet.is_active) === 1
      && pet.lifecycle_phase && pet.lifecycle_phase !== 'egg');
    const badSavedAuthority = completed && !claimed && row.pet_id
      && (!row.season_key || number(row.original_pet_verified) !== 1);
    const cannotClaim = Boolean(badSavedAuthority || needsSourcePet && !verifiedActivePet);
    tasks.push(genericTask(now, SOURCE_BY_KEY.get('moonpet.seven-of-seven-claim'),
      claimed ? 'claimed' : cannotClaim
        ? rosterUnavailable ? 'sync_unavailable' : 'blocked'
        : completed ? 'claim_ready' : 'waiting', 'live', {
        title: claimed ? 'Moonpet daily bonus claimed' : completed
          ? 'Collect saved Moonpet bonus' : 'Finish Moonpet completion conditions',
        periodKey: row.utc_day, priority: completed && !claimed && !cannotClaim ? 35 : 520,
        blocking: cannotClaim ? badSavedAuthority ? 'saved_source_pet_season_unverified'
          : rosterUnavailable ? 'owned_roster_unavailable' : 'active_source_pet_required' : null,
        expiresAt: null,
        progress: { current: dailyFlags.filter(([flag]) => number(row.progress_bits) & flag).length,
          target: dailyFlags.length, unit: 'source_flags' },
        reward: reward(Object.entries(DAILY_COMPLETION_REWARD).map(([type, amount]) => ({ type, amount })), true),
        evidence: { verified_completion: claimed, accepted_at: row.claimed_at },
        sourcePetRef: row.pet_id ? await opaqueRef(`${ownerId}:${row.pet_id}`) : null,
      }));
  }
  if (hiddenPendingClaims > 0) {
    // A bounded list must signal partial results instead of silently
    // treating older permanent rewards as lost/absent.
    sourceStatuses['moonpet.seven-of-seven-claim'] = sourceStatus('live', {
      adapter: 'saved_completion_claims',
      partial: true,
      historical_pending_total: historicalPendingTotal,
      historical_pending_in_preview: historyRows.length,
      historical_pending_not_listed: hiddenPendingClaims,
    });
    // Hidden receipts are not individually validated for pet/season ownership.
    // Do not rank an unverified backlog banner above actual claim-ready rows.
    tasks.push(genericTask(now, SOURCE_BY_KEY.get('moonpet.seven-of-seven-claim'),
      'preview', 'preview', {
        title: `${hiddenPendingClaims} more saved Moonpet daily rewards to review`,
        description: 'Older saved bonuses exceed this bounded preview. Their individual pet/season claim authority has not been checked.',
        why: 'Saved rewards remain in history, but eligibility requires individual verification.',
        periodKey: 'historical_pending', suffix: 'overflow', priority: 540,
        blocking: 'hidden_claim_authority_not_verified',
        progress: { current: historyRows.length, target: historicalPendingTotal, unit: 'historical_saved_claims' },
        evidence: { verified_completion: false },
      }));
  }
  if (!completionRows.some((row) => row.utc_day === day)) {
    tasks.push(genericTask(now, SOURCE_BY_KEY.get('moonpet.seven-of-seven-claim'),
      rosterUnavailable ? 'sync_unavailable' : pets.length ? 'waiting' : 'blocked', 'live', {
        title: 'Complete Moonpet conditions to earn the bonus',
        periodKey: day, priority: 520, blocking: pets.length ? null
          : rosterUnavailable ? 'owned_roster_unavailable' : 'moonpet_required',
        progress: { current: 0, target: dailyFlags.length, unit: 'source_flags' },
      }));
  }

  const perPetSources = ['moonpet.adoption-incubation', 'moonpet.daily-journey', 'moonpet.weekly-journey', 'moonpet.care', 'moonpet.jobs', 'moonpet.bosses-combat', 'moonpet.garden-kitchen-gym', 'moonpet.evolution'];
  const byPet = (rows, value = 'total') => new Map(rows.map((row) => [String(row.pet_id), number(row[value])]));
  const dailyJourney = !pets.length || sourceStatuses['moonpet.daily-journey'].state === 'migration_pending' ? [] : await query(db,
    `SELECT pet_id,SUM(CASE
       WHEN challenge_id='daily_combat' AND additive_progress>=3 THEN 1
       WHEN challenge_id='daily_explorer' AND max_progress>=7 THEN 1
       WHEN challenge_id IN ('daily_extraction','daily_boss') AND additive_progress>=1 THEN 1
       WHEN challenge_id='daily_care' AND additive_progress>=3 THEN 1 ELSE 0 END) AS total
       FROM (SELECT o.pet_id,o.challenge_id,SUM(o.progress_value) AS additive_progress,MAX(o.progress_value) AS max_progress
         FROM telegram_pet_daily_journey_objectives o
        WHERE o.telegram_id=? AND o.utc_day=? AND o.status='accepted'
          AND ${DAILY_JOURNEY_CARE_SOURCE_PROOF_SQL}
        GROUP BY o.pet_id,o.challenge_id)
      GROUP BY pet_id`,
    [ownerId, day], [], failures, ['moonpet.daily-journey']);
  const dailyJourneyReceipts = !pets.length || sourceStatuses['moonpet.daily-journey'].state === 'migration_pending' ? [] : await query(db,
    "SELECT pet_id,COUNT(*) AS total FROM telegram_pet_daily_journey_receipts WHERE telegram_id=? AND utc_day=? AND status='accepted' GROUP BY pet_id",
    [ownerId, day], [], failures, ['moonpet.daily-journey']);
  const weeklyClauses = pets.filter((pet) => pet.journeyWeek).map(() => '(pet_id=? AND season_key=? AND qualification_week=?)');
  const weeklyObjectiveClauses = pets.filter((pet) => pet.journeyWeek).map(() => '(o.pet_id=? AND o.season_key=? AND o.qualification_week=?)');
  const weeklyParams = pets.filter((pet) => pet.journeyWeek).flatMap((pet) => [pet.pet_id, pet.season_key, pet.journeyWeek]);
  const weeklyEventMap = Object.entries(WEEKLY_JOURNEY_SOURCE_OBJECTIVES)
    .map(([event, objective]) => `WHEN '${event}' THEN '${objective}'`).join(' ');
  const weeklyJourney = !weeklyClauses.length || sourceStatuses['moonpet.weekly-journey'].state === 'migration_pending' ? [] : await query(db,
    `SELECT pet_id,SUM(CASE
       WHEN objective_id='weekly_care' AND additive_progress>=5 THEN 1
       WHEN objective_id IN ('weekly_training','weekly_run') AND additive_progress>=3 THEN 1
       WHEN objective_id='weekly_boss_attempt' AND max_progress>=1 THEN 1
       WHEN objective_id='weekly_check_in' AND additive_progress>=2 THEN 1 ELSE 0 END) AS total
       FROM (SELECT o.pet_id,o.objective_id,
          CASE WHEN o.objective_id='weekly_check_in' THEN COUNT(DISTINCT e.day_key) ELSE SUM(o.progress_value) END AS additive_progress,
          MAX(o.progress_value) AS max_progress
         FROM telegram_pet_weekly_journey_objectives o
         JOIN telegram_pet_events e ON e.telegram_id=o.telegram_id AND e.pet_id=o.pet_id
          AND e.season_key=o.season_key AND e.event_key=o.source_event_key AND e.status='accepted'
        WHERE o.telegram_id=? AND o.status='accepted' AND (${weeklyObjectiveClauses.join(' OR ')})
          AND o.objective_id=CASE e.event_type ${weeklyEventMap} END
          AND ${weeklyBossLegacySourceProofSql()}
        GROUP BY o.pet_id,o.objective_id)
      GROUP BY pet_id`,
    [ownerId, ...weeklyParams], [], failures, ['moonpet.weekly-journey']);
  const weeklyJourneyReceipts = !weeklyClauses.length || sourceStatuses['moonpet.weekly-journey'].state === 'migration_pending' ? [] : await query(db,
    `SELECT pet_id,COUNT(*) AS total FROM telegram_pet_weekly_journey_receipts WHERE telegram_id=? AND status='accepted' AND (${weeklyClauses.join(' OR ')}) GROUP BY pet_id`,
    [ownerId, ...weeklyParams], [], failures, ['moonpet.weekly-journey']);
  // Care cooldowns are account-wide and action-specific. Feeding also shares
  // the 45-second meal-use window; play/clean/sleep remain independent.
  // Read only the most recent accepted time per action, never per pet.
  const careEvents = !pets.length ? [] : await query(db,
    `SELECT event_type,created_at AS last_action_at FROM (
       SELECT event_type,created_at,
         ROW_NUMBER() OVER (PARTITION BY event_type
           ORDER BY julianday(created_at) DESC,created_at DESC) AS action_rank
       FROM telegram_pet_events
       WHERE telegram_id=? AND status='accepted'
         AND (event_type IN ('feed','play','clean','sleep')
           OR (event_type='use_item' AND json_extract(
             CASE WHEN json_valid(metadata) THEN metadata ELSE '{}' END,
             '$.consumed_item_key') IN ('street_pizza','moon_burger','garden_veggies')))
       ) WHERE action_rank=1`, [ownerId], [], failures, ['moonpet.care']);
  const bossVictories = !pets.length || sourceStatuses['moonpet.bosses-combat'].state === 'migration_pending' ? [] : await query(db,
    `SELECT DISTINCT v.pet_id,v.season_key,v.boss_id,v.defeated_at,
       COALESCE(e.day_key,a.day_key) AS victory_day
       FROM telegram_pet_weekly_boss_victories_by_pet v
       LEFT JOIN telegram_pet_weekly_boss_events a ON a.telegram_id=v.telegram_id
         AND a.week_key=v.week_key AND a.boss_id=v.boss_id AND a.event_key=v.victory_event_key
       LEFT JOIN telegram_pet_events e ON e.telegram_id=v.telegram_id
         AND e.pet_id=v.pet_id AND e.season_key=v.season_key
         AND e.week_key=v.week_key AND e.event_key=v.victory_event_key
         AND e.event_type='weekly_boss' AND e.status='accepted'
         AND e.reason='weekly_boss_attempt'
       WHERE v.telegram_id=? AND v.week_key=? AND v.defeated_at IS NOT NULL
         AND v.victory_event_key<>'' AND v.victory_event_key=trim(v.victory_event_key)
         AND length(v.victory_event_key)<=180
         AND ((e.id IS NOT NULL AND length(e.day_key)=10
           AND date(e.day_key,'+0 days')=e.day_key
           AND json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.source')
             IN ('pet_weekly_boss','pet_weekly_boss_backfill')
           AND json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.boss_id')=v.boss_id
           AND ${weeklyBossLegacySourceProofSql('e')})
           OR (e.id IS NULL AND a.event_key<>'' AND a.event_key=trim(a.event_key)
             AND length(a.event_key)<=180 AND length(a.day_key)=10
             AND date(a.day_key,'+0 days')=a.day_key
             AND julianday(a.created_at) IS NOT NULL))`,
    [ownerId, week], [], failures, ['moonpet.bosses-combat']);
  const bossAttempts = !pets.length || sourceStatuses['moonpet.bosses-combat'].state === 'migration_pending' ? [] : await query(db,
    `SELECT 1 AS present FROM telegram_pet_weekly_boss_events
      WHERE telegram_id=? AND week_key=? AND day_key=? LIMIT 1`,
    [ownerId, week, day], [], failures, ['moonpet.bosses-combat']);
  // Original earning pet and week remain authoritative after the calendar
  // changes; never infer an unclaimed boss reward solely from current week.
  const pendingBossRewards = sourceStatuses['moonpet.bosses-combat'].state === 'migration_pending' ? [] : await query(db,
    `SELECT DISTINCT v.pet_id,v.season_key,v.week_key,v.boss_id
       FROM telegram_pet_weekly_boss_victories_by_pet v
       JOIN telegram_pet_weekly_boss_progress p ON p.telegram_id=v.telegram_id
         AND p.week_key=v.week_key AND p.boss_id=v.boss_id
       JOIN telegram_pet_instances i ON i.pet_id=v.pet_id AND i.telegram_id=v.telegram_id
         AND i.season_key=v.season_key
       JOIN telegram_pet_season_slots s ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id
         AND s.season_key=i.season_key AND s.slot_number=i.slot_number
       LEFT JOIN telegram_pet_events e ON e.telegram_id=v.telegram_id
         AND e.pet_id=v.pet_id AND e.season_key=v.season_key
         AND e.event_key=v.victory_event_key AND e.week_key=v.week_key
         AND e.event_type='weekly_boss' AND e.status='accepted'
         AND e.reason='weekly_boss_attempt'
      WHERE v.telegram_id=? AND p.defeated_at IS NOT NULL AND p.reward_claimed_at IS NULL
        AND v.victory_event_key<>'' AND v.victory_event_key=trim(v.victory_event_key)
        AND length(v.victory_event_key)<=180
        AND ((e.id IS NOT NULL AND length(e.day_key)=10
          AND date(e.day_key,'+0 days')=e.day_key
          AND json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.source')
              IN ('pet_weekly_boss','pet_weekly_boss_backfill')
          AND json_extract(CASE WHEN json_valid(e.metadata) THEN e.metadata ELSE '{}' END,'$.boss_id')=v.boss_id
          AND ${weeklyBossLegacySourceProofSql('e')})
         OR (e.id IS NULL AND EXISTS (
          SELECT 1 FROM telegram_pet_weekly_boss_events b
          WHERE b.telegram_id=v.telegram_id AND b.week_key=v.week_key AND b.boss_id=v.boss_id
            AND b.event_key=v.victory_event_key AND b.event_key<>'' AND b.event_key=trim(b.event_key)
            AND length(b.event_key)<=180
            AND length(b.day_key)=10 AND date(b.day_key,'+0 days')=b.day_key
            AND julianday(b.created_at) IS NOT NULL)))
      ORDER BY v.defeated_at ASC LIMIT 50`,
    [ownerId], [], failures, ['moonpet.bosses-combat']);
  const validPendingBossRewards = pendingBossRewards.filter((row) =>
    /^\d{4}-W\d{2}$/u.test(String(row.week_key || ''))
      && getPetWeeklyBoss(row.week_key).boss_id === row.boss_id);
  // The live boss fight needs roster authority; already-earned payouts do not.
  // Mark the source as partially projected rather than erasing verified
  // historical claims when the unrelated active-roster read is unavailable.
  if (rosterUnavailable && !failures.has('moonpet.bosses-combat')) {
    if (validPendingBossRewards.length) {
      sourceStatuses['moonpet.bosses-combat'] = sourceStatus('live', {
        adapter: 'saved_original_pet_rewards', partial: true, roster_unavailable: true,
      });
    } else if (rosterFailure) {
      failures.set('moonpet.bosses-combat', rosterFailure);
    } else {
      sourceStatuses['moonpet.bosses-combat'] = sourceStatus('migration_pending', {
        adapter: 'owned_roster_dependency', missing_tables: ['telegram_pet_instances'],
      });
    }
  }
  // A current ISO-week victory does not prove each pet took part in the
  // current *ownership* week. Use each pet's own saved week bounds.
  const participatingPets = pets.filter((pet) => pet.journeyBounds?.start_at && pet.journeyBounds?.end_at);
  const participationClauses = participatingPets.map(() =>
    '(pet_id=? AND season_key=? AND day_key>=? AND day_key<?)');
  const participationParams = participatingPets.flatMap((pet) => [
    pet.pet_id,pet.season_key,pet.journeyBounds.start_at.slice(0,10),pet.journeyBounds.end_at.slice(0,10),
  ]);
  const bossParticipationRows = !participationClauses.length ? [] : await query(db,
    `SELECT pet_id,season_key FROM telegram_pet_events
      WHERE telegram_id=? AND status='accepted' AND event_type IN ('weekly_boss','boss_fought')
        AND length(day_key)=10 AND date(day_key,'+0 days')=day_key
        AND (${participationClauses.join(' OR ')}) GROUP BY pet_id,season_key`,
    [ownerId,...participationParams], [], failures, ['moonpet.bosses-combat']);
  const bossParticipated = new Set(bossParticipationRows.map((row) => `${row.pet_id}:${row.season_key}`));
  const jobRows = !pets.length || sourceStatuses['moonpet.jobs'].state === 'migration_pending' ? [] : await query(db,
    `SELECT id AS session_id,status,started_at,ends_at,claimed_at,metadata FROM telegram_pet_activity_sessions
      WHERE telegram_id=? AND (status='active' OR (status='completed'
        AND json_extract(CASE WHEN json_valid(metadata) THEN metadata ELSE '{}' END,'$.claim_state')='claiming'))
      ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,started_at DESC LIMIT 1`,
    [ownerId], [], failures, ['moonpet.jobs']);
  const gardenRows = !pets.length || sourceStatuses['moonpet.garden-kitchen-gym'].state === 'migration_pending' ? [] : await query(db,
    'SELECT pet_id,crop_key,status,ready_at,planted_at FROM telegram_pet_garden_plots WHERE telegram_id=?', [ownerId], [], failures, ['moonpet.garden-kitchen-gym']);
  const evolutionRows = !pets.length || sourceStatuses['moonpet.evolution'].state === 'migration_pending' ? [] : await query(db,
    'SELECT pet_id,MAX(stage) AS stage FROM telegram_pet_evolutions_by_pet WHERE telegram_id=? GROUP BY pet_id', [ownerId], [], failures, ['moonpet.evolution']);
  const dailyProgress = byPet(dailyJourney);
  const dailyReceipts = byPet(dailyJourneyReceipts);
  const weeklyProgress = byPet(weeklyJourney);
  const weeklyReceipts = byPet(weeklyJourneyReceipts);
  const lastCare = new Map(careEvents.map((row) => [String(row.event_type), sqliteUtcMillis(row.last_action_at)]));
  const mealCooldownUntil = Math.max(lastCare.get('feed') || 0, lastCare.get('use_item') || 0) + 45_000;
  const careNextReady = (action) => action === 'feed'
    ? mealCooldownUntil : (lastCare.get(action) || 0) + 45_000;
  const job = jobRows[0] || null;
  const jobPetId = job ? String(parseJson(job.metadata).pet_id || '') : '';
  if (job && (!jobPetId || !pets.some((pet) => String(pet.pet_id) === jobPetId))) {
    failures.set('moonpet.jobs', 'saved_activity_source_pet_unavailable');
  }
  const bossAttemptUsed = bossAttempts.length > 0;
  const gardens = new Map(gardenRows.map((row) => [String(row.pet_id), row]));
  const evolutions = byPet(evolutionRows, 'stage');
  for (const pet of pets) {
    // Pure in-memory projection; do not mutate stored pet care state.
    const decayedCare = applyPetCareDecay({ ...pet }, now);
    const careNeeds = [
      visiblePetCare(decayedCare.health) <= 45,
      visiblePetCare(decayedCare.hunger) >= 75,
      visiblePetCare(decayedCare.cleanliness) <= 35,
      visiblePetCare(decayedCare.energy) <= 25,
      visiblePetCare(decayedCare.happiness) <= 35,
    ].filter(Boolean).length;
    for (const key of perPetSources) {
      let title = 'Review Moonpet progress'; let status = 'ready'; let priority = 560; let progress = { current: null, target: null, unit: 'actions' }; let blocking = null; let nextReadyAt = null;
      if (key === 'moonpet.adoption-incubation') { title = pet.stage === 'egg' ? 'Continue MoonEgg incubation' : 'Moonpet hatched'; status = pet.stage === 'egg' ? 'in_progress' : 'complete'; priority = 180; }
      if (key === 'moonpet.daily-journey') { const current = dailyProgress.get(String(pet.pet_id)) || 0; const settled = (dailyReceipts.get(String(pet.pet_id)) || 0) > 0; title = settled ? 'Daily Journey reward recorded' : 'Advance the Moonpet Daily Journey'; status = settled ? 'complete' : 'in_progress'; priority = settled ? 700 : 230; progress = { current, target: 3, unit: 'objectives' }; }
      if (key === 'moonpet.weekly-journey') { const current = weeklyProgress.get(String(pet.pet_id)) || 0; const settled = (weeklyReceipts.get(String(pet.pet_id)) || 0) > 0; title = settled ? 'Ownership-week Journey recorded' : 'Advance this Moonpet’s ownership week'; status = settled ? 'complete' : 'in_progress'; priority = settled ? 710 : 390; progress = { current, target: 5, unit: 'objectives' }; }
      if (key === 'moonpet.care') {
        const urgentActions = [
          ...(visiblePetCare(decayedCare.hunger) >= 75 ? ['feed'] : []),
          ...(visiblePetCare(decayedCare.cleanliness) <= 35 ? ['clean'] : []),
          ...(visiblePetCare(decayedCare.happiness) <= 35 ? ['play'] : []),
          ...(visiblePetCare(decayedCare.energy) <= 25 ? ['sleep'] : []),
        ];
        // Low health independently warrants general care. Keep feed, clean
        // and play available even when low energy also adds a blocked sleep.
        if (visiblePetCare(decayedCare.health) <= 45) {
          for (const action of ['feed', 'clean', 'play', 'sleep']) {
            if (!urgentActions.includes(action)) urgentActions.push(action);
          }
        }
        const activityBlocksSleep = job?.status === 'active';
        const eligibleActions = urgentActions.filter(action => action !== 'sleep' || !activityBlocksSleep);
        const readyActions = eligibleActions.filter(action => careNextReady(action) <= now.getTime());
        const readyAction = readyActions[0] || null;
        const nextAt = eligibleActions.length && !readyAction
          ? Math.min(...eligibleActions.map(careNextReady)) : null;
        title = !careNeeds ? 'Moonpet care is stable'
          : readyAction ? `Care for this Moonpet: ${readyAction} now`
            : !eligibleActions.length && activityBlocksSleep
              ? 'Finish active Moonpet activity before sleeping'
              : 'Moonpet needed care is cooling down';
        status = !careNeeds ? 'complete' : readyAction ? 'ready' : 'waiting';
        blocking = !eligibleActions.length && activityBlocksSleep ? 'pet_activity_active' : null;
        priority = readyAction ? 50 : careNeeds ? 520 : 670;
        progress = { current: careNeeds, target: 0, unit: 'care_needs' };
        nextReadyAt = Number.isFinite(nextAt) ? new Date(nextAt).toISOString() : null;
      }
      if (key === 'moonpet.jobs') {
        const ownsJob = job && jobPetId === String(pet.pet_id);
        // An unidentifiable saved session must not be promoted as claimable;
        // session identity is required for stable task ID across replacements.
        const sessionIdentified = !ownsJob || Boolean(String(job.session_id || '').trim());
        const recovery = ownsJob && job.status === 'completed';
        const endsAt = ownsJob ? sqliteUtcMillis(job.ends_at) : NaN;
        const startAt = ownsJob ? sqliteUtcMillis(job.started_at) : NaN;
        // The canonical game permits claims after five elapsed minutes even
        // though ends_at stores the much later maximum duration.
        const minClaimAt = Number.isFinite(startAt) ? startAt + 5 * 60_000 : NaN;
        const nowSecond = Math.floor(now.getTime() / 1000) * 1000;
        const expired = ownsJob && !recovery && Number.isFinite(endsAt)
          && endsAt < nowSecond - PET_ACTIVITY_GRACE_MS;
        const unknown = ownsJob && (!sessionIdentified
          || !recovery && (!Number.isFinite(endsAt) || !Number.isFinite(minClaimAt)));
        const ready = !unknown && (recovery || ownsJob && !expired && minClaimAt <= nowSecond);
        title = expired ? 'Moonpet activity claim window expired'
          : unknown ? 'Moonpet activity end time unavailable'
          : recovery ? 'Recover this Moonpet’s saved job reward'
          : ready ? 'Claim this Moonpet’s completed job'
          : ownsJob ? 'Moonpet job is in progress' : 'No saved job for this Moonpet';
        status = unknown ? 'sync_unavailable' : expired ? 'expired'
          : ready ? 'claim_ready' : 'waiting';
        blocking = unknown ? 'pet_activity_session_identity_or_time_unavailable'
          : expired ? 'pet_activity_claim_window_expired' : null;
        priority = ready ? 90 : ownsJob ? 530 : 730;
        nextReadyAt = ownsJob && !ready && !expired && Number.isFinite(minClaimAt)
          ? new Date(minClaimAt).toISOString() : null;
      }
      if (key === 'moonpet.bosses-combat') {
        // Victory counts for the CURRENT ownership week only when its saved
        // source event day is inside this pet's Journey bounds. A shared
        // ISO-week victory may predate an ownership-week rollover.
        const won = bossVictories.some((v) => v.pet_id === pet.pet_id
          && v.season_key === pet.season_key
          && v.boss_id === getPetWeeklyBoss(week).boss_id && pet.journeyBounds
          && v.victory_day >= pet.journeyBounds.start_at.slice(0,10)
          && v.victory_day < pet.journeyBounds.end_at.slice(0,10));
        const participated = won || bossParticipated.has(`${pet.pet_id}:${pet.season_key}`);
        const active = number(pet.is_active) === 1;
        const eligibility = getCombatEligibility({
          activePetExists: active,
          lifecycleKnown: Boolean(pet.lifecycle_phase),
          hatched: Boolean(pet.lifecycle_phase && pet.lifecycle_phase !== 'egg'),
          level: getPetVisibleLevel(pet.pet_xp),
        });
        title = won ? 'Weekly boss victory recorded for this Moonpet'
          : participated ? 'Moonpet boss participation already recorded this ownership week'
            : bossVictories.length ? 'Review this Moonpet’s post-victory participation' : 'Review eligible Moonpet combat';
        priority = won ? 700 : 440;
        blocking = participated ? null
          : !active ? 'active_moonpet_required'
            : !eligibility.weekly_boss_unlocked ? 'moonpet_weekly_boss_not_eligible'
              : Math.round(Number(decayedCare.energy) || 0) < 12 ? 'moonpet_weekly_boss_energy_required'
                : !bossVictories.length && bossAttemptUsed ? 'moonpet_weekly_boss_daily_attempt_used' : null;
        status = participated ? 'complete' : blocking ? 'blocked' : 'ready';
      }
      if (key === 'moonpet.garden-kitchen-gym') {
        const garden = gardens.get(String(pet.pet_id));
        const planted = garden ? sqliteUtcMillis(garden.planted_at) : NaN;
        const readyAt = garden ? sqliteUtcMillis(garden.ready_at) : NaN;
        const validCrop = !garden || (garden.crop_key === 'garden_veggies'
          && ['growing', 'harvesting'].includes(garden.status)
          && Number.isFinite(planted) && Number.isFinite(readyAt) && readyAt > planted);
        const harvesting = garden?.status === 'harvesting';
        const ready = validCrop && garden && !harvesting && readyAt <= now.getTime();
        title = !validCrop ? 'Saved garden crop state unavailable' : harvesting
          ? 'Garden harvest is settling' : ready ? 'Harvest garden vegetables'
            : garden ? 'Garden crop is growing' : 'Plant the Moonpet garden';
        status = !validCrop ? 'sync_unavailable' : ready ? 'ready' : garden ? 'waiting' : 'ready';
        blocking = validCrop ? null : 'pet_garden_state_invalid';
        priority = ready ? 140 : 590;
      }
      if (key === 'moonpet.evolution') { const stage = evolutions.get(String(pet.pet_id)) || 0; title = 'Review permanent evolution progress'; status = stage >= 5 ? 'complete' : 'in_progress'; priority = 620; progress = { current: stage, target: 5, unit: 'evolution_stage' }; }
      // Recurring tasks must not reuse a previous instance's identity.
      // Jobs use an opaque immutable session ID, while boss participation
      // rotates at each pet's source-defined ownership-week boundary.
      const crop = gardens.get(String(pet.pet_id));
      const occurrence = key === 'moonpet.jobs'
        ? job && jobPetId === String(pet.pet_id) && job.session_id
          ? await opaqueRef(`${ownerId}:${pet.pet_id}:${job.session_id}`) : 'no_saved_session'
        : key === 'moonpet.garden-kitchen-gym'
          ? crop?.planted_at
            ? await opaqueRef(`${ownerId}:${pet.pet_id}:${pet.season_key}:${crop.planted_at}`)
            : 'unplanted'
        : key === 'moonpet.bosses-combat' || key === 'moonpet.weekly-journey'
          ? `journey-week-${pet.journeyWeek ?? 'unavailable'}`
          : key.includes('daily') ? day : 'persistent';
      tasks.push(task(now, {
        task_id: `${key}:${pet.ref}:${occurrence}`, source_key: key, source_pet_ref: pet.ref, scope_ref: pet.ref,
        title, description: 'Read-only projection for an owned Moonpet. Open the Moonpet game to act.', why: 'Pet state is scoped to the verified owner and this original pet.',
        status, source_health: sourceStatuses[key].state === 'migration_pending' ? 'unavailable' : 'live', priority, progress, blocking_reason_code: blocking,
        period: { kind: SOURCE_BY_KEY.get(key).period, key: key === 'moonpet.weekly-journey' ? (pet.journeyWeek == null ? null : String(pet.journeyWeek)) : key.includes('daily') ? day : null, origin_timezone: 'UTC' },
        expires_at: key.includes('daily') ? nextUtcDay(now) : key === 'moonpet.weekly-journey' ? pet.journeyBounds?.end_at || null : null,
        next_ready_at: nextReadyAt,
        evidence: { kind: SOURCE_BY_KEY.get(key).evidence, verified_completion: status === 'complete' && SOURCE_BY_KEY.get(key).evidence === 'server_receipt' },
      }));
    }
  }
  for (const row of validPendingBossRewards) {
    const petRef = await opaqueRef(`${ownerId}:${row.pet_id}`);
    const receiptRef = await opaqueRef(`${ownerId}:${row.pet_id}:${row.week_key}:${row.boss_id}`);
    tasks.push(task(now, {
      source_key: 'moonpet.bosses-combat', task_id: `moonpet.bosses-combat:pending:${receiptRef}`,
      source_pet_ref: petRef, scope_ref: petRef,
      title: 'Claim saved Moonpet weekly boss victory reward',
      description: 'Earned in an earlier or current ISO week; the original pet remains the owner.',
      why: 'The saved boss payout is still unclaimed.',
      status: 'claim_ready', source_health: 'live', priority: 38,
      period: { kind: 'source_defined', key: String(row.week_key), origin_timezone: 'UTC' },
      evidence: { kind: 'server_projection', verified_completion: false },
    }));
  }
  if (!pets.length) {
    for (const key of perPetSources) tasks.push(genericTask(now, SOURCE_BY_KEY.get(key),
      rosterUnavailable ? 'sync_unavailable' : 'blocked',
      sourceStatuses[key].state === 'migration_pending' ? 'unavailable' : 'live', {
        title: rosterUnavailable ? 'Live Moonpet roster cannot be confirmed' : 'Adopt a Moonpet to unlock this action',
        priority: 850, blocking: rosterUnavailable ? 'owned_roster_unavailable' : 'moonpet_required',
        periodKey: key.includes('daily') ? day : key.includes('weekly') ? week : null,
      }));
  }

  // Pending reward-claim rows are internal settlement reservations, not player
  // claim opportunities (wallet reconciliation can create them too). Derive
  // today's ordinary bounty availability from accepted activity and the
  // canonical pet_bounty settlement receipts instead.
  const bountyRows = sourceStatuses['moonpet.claimable-rewards'].state === 'migration_pending' ? [] : await query(db,
    `SELECT 'event' AS record_type,event_type AS record_key,COUNT(*) AS total
       FROM telegram_pet_events
       WHERE telegram_id=? AND day_key=? AND status='accepted'
       GROUP BY event_type
       UNION ALL
       SELECT 'receipt' AS record_type,status AS record_key,COUNT(*) AS total
       FROM telegram_pet_reward_claims
       WHERE telegram_id=? AND day_key=? AND source='pet_bounty'
         AND status IN ('pending','awarded')
       GROUP BY status`,
    [ownerId, day, ownerId, day], [], failures, ['moonpet.claimable-rewards']);
  const bountyEventTotals = new Map(bountyRows.filter(row => row.record_type === 'event')
    .map(row => [String(row.record_key), number(row.total)]));
  const completedBounties = getPetDailyBounties(day).filter(bounty =>
    bounty.event_types.reduce((total, eventType) => total + (bountyEventTotals.get(eventType) || 0), 0) >= bounty.required);
  const receiptCount = (status) => bountyRows.filter(row =>
    row.record_type === 'receipt' && row.record_key === status)
    .reduce((total, row) => total + number(row.total), 0);
  // A receipt does not identify the claimable bounty to the UI; count only
  // the guaranteed unclaimed remainder. In-flight reservations block rather
  // than advertise a second claim, and unrelated sources never count.
  const availableBounties = Math.max(0, completedBounties.length - receiptCount('awarded') - receiptCount('pending'));
  const hasActiveBountyPet = pets.some(pet => number(pet.is_active) === 1 && pet.lifecycle_phase);
  const bountyReady = availableBounties > 0 && hasActiveBountyPet && !rosterUnavailable;
  if (sourceStatuses['moonpet.claimable-rewards'].state !== 'migration_pending') {
    sourceStatuses['moonpet.claimable-rewards'] = sourceStatus(bountyRows.length ? 'live' : 'live_empty', { adapter: 'accepted_bounty_events_and_settlements' });
  }
  tasks.push(genericTask(now, SOURCE_BY_KEY.get('moonpet.claimable-rewards'),
    bountyReady ? 'claim_ready' : availableBounties > 0 ? 'blocked'
      : completedBounties.length && receiptCount('awarded') >= completedBounties.length ? 'claimed' : 'waiting',
    sourceStatuses['moonpet.claimable-rewards'].state === 'migration_pending' ? 'unavailable' : 'live', {
      title: bountyReady ? 'Claim completed Moonpet daily bounty'
        : completedBounties.length ? 'Review Moonpet daily bounty settlements' : 'Complete Moonpet daily bounties',
      priority: bountyReady ? 60 : 720, periodKey: day, expiresAt: nextUtcDay(now),
      description: 'Only current UTC-day accepted bounty actions and pet_bounty settlement receipts establish claim readiness. Internal pending recovery rows are not claimable rewards.',
      progress: { current: availableBounties, target: null, unit: 'claimable_daily_bounties' },
      blocking: sourceStatuses['moonpet.claimable-rewards'].state === 'migration_pending'
        ? 'source_table_unavailable' : availableBounties && !bountyReady ? 'active_source_pet_required' : null,
    }));

  for (const [key, sql, activeTitle, emptyTitle] of [
    ['moonpet.saved-run', `SELECT r.run_id AS source_id,r.pet_id,r.season_key,r.status,r.updated_at,
         CASE WHEN i.pet_id IS NOT NULL AND s.pet_id IS NOT NULL THEN 1 ELSE 0 END AS owner_verified
       FROM telegram_pet_runs r
       LEFT JOIN telegram_pet_instances i ON i.pet_id=r.pet_id AND i.telegram_id=r.telegram_id
         AND i.season_key=r.season_key
       LEFT JOIN telegram_pet_season_slots s ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id
         AND s.season_key=i.season_key AND s.slot_number=i.slot_number
       WHERE r.telegram_id=? AND r.status IN ('active','extractable')
       ORDER BY r.updated_at DESC LIMIT 10`, 'Resume this Moonpet’s saved run', 'No saved Moonpet run is pending'],
    ['moonpet.contracts', `SELECT c.contract_id AS source_id,c.pet_id,c.season_key,c.status,
          c.updated_at,c.reward_xp,c.reward_settled,
          CASE WHEN i.pet_id IS NOT NULL AND s.pet_id IS NOT NULL THEN 1 ELSE 0 END AS owner_verified
        FROM telegram_pet_contracts c
        LEFT JOIN telegram_pet_instances i ON i.pet_id=c.pet_id AND i.telegram_id=c.telegram_id
          AND i.season_key=c.season_key
        LEFT JOIN telegram_pet_season_slots s ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id
          AND s.season_key=i.season_key AND s.slot_number=i.slot_number
        WHERE c.telegram_id=? AND (c.status='active'
          OR (c.status='completed' AND c.reward_xp=20 AND c.reward_settled=0))
        ORDER BY CASE WHEN c.status='completed' THEN 0 ELSE 1 END,c.updated_at DESC LIMIT 10`,
        'Continue this Moonpet’s active contract', 'No Moonpet contract or saved bonus is pending'],
  ]) {
    const rows = sourceStatuses[key].state === 'migration_pending' ? [] : await query(db, sql, [ownerId], [], failures, [key]);
    if (sourceStatuses[key].state === 'live') {
      sourceStatuses[key] = sourceStatus(rows.length ? 'live' : 'live_empty', { adapter: 'saved_original_pet_records' });
    }
    if (!rows.length) {
      tasks.push(genericTask(now, SOURCE_BY_KEY.get(key), 'waiting', sourceStatuses[key].state === 'migration_pending' ? 'unavailable' : 'live', {
        title: emptyTitle, priority: 720, progress: { current: 0, target: null, unit: 'saved_records' },
        blocking: sourceStatuses[key].state === 'migration_pending' ? 'source_table_unavailable' : null,
      }));
      continue;
    }
    for (const row of rows) {
      // Legacy open runs may have NULL pet_id or broken pet/season references.
      // Do not derive an "original pet" fingerprint until both ownership joins
      // prove the original instance and retained slot belong to this owner.
      if (['moonpet.saved-run', 'moonpet.contracts'].includes(key)
        && (!row.pet_id || number(row.owner_verified) !== 1)) {
        failures.set(key, 'original_pet_attribution_unavailable');
        continue;
      }
      const sourceId = String(row.source_id || '').trim();
      if (!sourceId) { failures.set(key, 'saved_source_identifier_missing'); continue; }
      const petRef = await opaqueRef(`${ownerId}:${row.pet_id}`);
      const claimReady = key === 'moonpet.saved-run' && row.status === 'extractable'
        || key === 'moonpet.contracts' && row.status === 'completed' && number(row.reward_xp) === 20 && number(row.reward_settled) === 0;
      tasks.push(task(now, {
        task_id: `${key}:${petRef}:${await opaqueRef(`${ownerId}:${key}:${sourceId}`)}`, source_key: key, source_pet_ref: petRef, scope_ref: petRef,
        title: claimReady ? key === 'moonpet.contracts'
          ? 'Collect saved Moonpet contract bonus (20 Pet XP)' : 'Extract this Moonpet’s saved run' : activeTitle,
        description: 'This saved state remains attributed to the Moonpet that created it.',
        why: 'The original pet remains authoritative even if the active slot has changed.',
        status: claimReady ? 'claim_ready' : 'active', source_health: 'live', priority: claimReady ? 75 : 170,
        progress: { current: 1, target: null, unit: 'saved_records' },
        evidence: { kind: 'server_projection', verified_completion: false },
      }));
    }
  }

  const wikiRows = sourceStatuses['wiki.accepted-missions'].state === 'migration_pending' ? [] : await query(db,
    'SELECT COUNT(*) AS total FROM wiki_mission_completions WHERE telegram_id=? AND mission_window=?', [ownerId, day], [], failures, ['wiki.accepted-missions']);
  if (sourceStatuses['wiki.accepted-missions'].state !== 'migration_pending') {
    sourceStatuses['wiki.accepted-missions'] = sourceStatus(number(wikiRows[0]?.total) ? 'live' : 'live_empty', { adapter: 'accepted_wiki_receipts' });
  }
  tasks.push(genericTask(now, SOURCE_BY_KEY.get('wiki.accepted-missions'), number(wikiRows[0]?.total) ? 'complete' : 'preview', number(wikiRows[0]?.total) ? 'live' : 'preview', {
    title: number(wikiRows[0]?.total) ? 'Accepted wiki mission recorded today' : 'Review eligible Wiki missions', priority: 350, periodKey: day, expiresAt: nextUtcDay(now),
    blocking: number(wikiRows[0]?.total) ? null : 'unconfirmed_wiki_mission_eligibility',
    progress: { current: number(wikiRows[0]?.total), target: 1, unit: 'accepted_receipts' }, evidence: { verified_completion: number(wikiRows[0]?.total) > 0 },
  }));
  const cloutRows = sourceStatuses['championship.verified-clout'].state === 'migration_pending' ? [] : await query(db,
    "SELECT total_points,recalculated_at_ms FROM championship_clout_daily WHERE telegram_id=? AND day_key=? AND policy_version='championship-v1' LIMIT 1", [ownerId, day], [], failures, ['championship.verified-clout']);
  if (sourceStatuses['championship.verified-clout'].state !== 'migration_pending') {
    sourceStatuses['championship.verified-clout'] = sourceStatus(cloutRows[0] ? 'live' : 'live_empty', { adapter: 'materialized_receipt_snapshot' });
  }
  tasks.push(genericTask(now, SOURCE_BY_KEY.get('championship.verified-clout'), cloutRows[0] ? 'active' : 'waiting', sourceStatuses['championship.verified-clout'].state === 'migration_pending' ? 'unavailable' : 'live', {
    title: 'Review today’s verified Championship Clout', priority: 460, periodKey: day, expiresAt: nextUtcDay(now),
    progress: { current: number(cloutRows[0]?.total_points), target: 100, unit: 'championship_clout' },
  }));
  const deadActiveRows = sourceStatuses['games.dead-run'].state === 'migration_pending' ? [] : await query(db,
    "SELECT session_id FROM dead_run_sessions WHERE telegram_id=? AND status='active' ORDER BY started_at DESC LIMIT 1", [ownerId], [], failures, ['games.dead-run']);
  const deadVerifiedRows = sourceStatuses['games.dead-run'].state === 'migration_pending' ? [] : await query(db,
    `SELECT score,ended_at FROM dead_run_sessions WHERE telegram_id=?
      AND status='finished' AND ranked=1 AND ended_at IS NOT NULL AND ended_at>=started_at
      AND suspicious_points<6 AND verified_distance_m>=40 AND survival_seconds>=20
      AND score>0 AND xp_awarded>0 AND player_stats_applied=1 AND arcade_xp_applied=1 AND horde_applied=1
      AND start_lat IS NULL AND start_lng IS NULL AND last_lat IS NULL AND last_lng IS NULL
      ORDER BY ended_at DESC LIMIT 1`, [ownerId], [], failures, ['games.dead-run']);
  const deadActive = deadActiveRows.length > 0;
  const deadSessionId = String(deadActiveRows[0]?.session_id || '').trim();
  if (deadActive && !deadSessionId) failures.set('games.dead-run', 'dead_run_session_identity_unavailable');
  if (sourceStatuses['games.dead-run'].state !== 'migration_pending') {
    sourceStatuses['games.dead-run'] = sourceStatus(deadActive || deadVerifiedRows.length ? 'live' : 'live_empty', { adapter: 'ranked_session_evidence' });
  }
  tasks.push(genericTask(now, SOURCE_BY_KEY.get('games.dead-run'), deadActive ? 'active' : 'ready', sourceStatuses['games.dead-run'].state === 'migration_pending' ? 'unavailable' : 'live', {
    title: deadActive ? 'Continue your active Dead Run' : 'Start a verified Dead Run', priority: deadActive ? 160 : 480,
    suffix: deadActive ? deadSessionId
      ? await opaqueRef(`${ownerId}:dead-run:${deadSessionId}`) : 'unknown_session'
      : 'new_run',
    progress: { current: number(deadVerifiedRows[0]?.score), target: null, unit: 'verified_score' },
  }));
  const nbgRows = sourceStatuses['games.nbg-london'].state === 'migration_pending' ? [] : await query(db,
    'SELECT fastest_ms,best_xp FROM nbg_london_records WHERE telegram_id=? LIMIT 1', [ownerId], [], failures, ['games.nbg-london']);
  sourceStatuses['games.nbg-london'] = sourceStatuses['games.nbg-london'].state === 'migration_pending'
    ? sourceStatuses['games.nbg-london'] : sourceStatus(nbgRows[0] ? 'live' : 'preview', { adapter: nbgRows[0] ? 'verified_record_projection' : 'competition_preview' });
  tasks.push(genericTask(now, SOURCE_BY_KEY.get('games.nbg-london'), nbgRows[0] ? 'ready' : 'preview', sourceStatuses['games.nbg-london'].state === 'live' ? 'live' : 'preview', {
    title: nbgRows[0] ? 'Improve your NBG London record' : 'Preview NBG London', priority: 610,
    progress: { current: number(nbgRows[0]?.best_xp), target: null, unit: 'verified_arcade_xp' }, blocking: nbgRows[0] ? null : 'no_verified_record',
  }));

  // Classify actual saved rows, not table existence, as live activity.
  // Pet care and eligibility can still be read live from an owned pet instance.
  for (const [key, count] of [
    ['moonpet.daily-seven-missions', completionRows.length],
    ['moonpet.seven-of-seven-claim', completionRows.length],
    ['moonpet.daily-journey', dailyJourney.length + dailyJourneyReceipts.length],
    ['moonpet.weekly-journey', weeklyJourney.length + weeklyJourneyReceipts.length],
    ['moonpet.jobs', jobRows.length],
    ['moonpet.garden-kitchen-gym', gardenRows.length],
    ['moonpet.evolution', evolutionRows.length],
  ]) {
    if (sourceStatuses[key]?.state === 'live' && !sourceStatuses[key]?.partial) {
      sourceStatuses[key] = sourceStatus(count ? 'live' : 'live_empty', { adapter: 'read_only_saved_rows' });
    }
  }
  if (!pets.length && sourceStatuses['moonpet.care'].state === 'live') {
    sourceStatuses['moonpet.care'] = sourceStatus('live_empty', { adapter: 'no_owned_pet' });
  }
  if (!pets.length && !validPendingBossRewards.length && !rosterUnavailable
    && sourceStatuses['moonpet.bosses-combat'].state === 'live') {
    sourceStatuses['moonpet.bosses-combat'] = sourceStatus('live_empty', { adapter: 'no_owned_pet' });
  }
  for (const [key, message] of failures.entries()) {
    if (sourceStatuses[key]) sourceStatuses[key] = sourceStatus('query_failed', { adapter: 'read_only_projection', error_code: String(message).slice(0, 80) });
  }
  for (const source of ACTION_PLAN_SOURCE_REGISTRY) {
    if (!tasks.some((candidate) => candidate.source_key === source.key)) {
      tasks.push(genericTask(now, source, 'sync_unavailable', sourceStatuses[source.key]?.state || 'unavailable', {
        blocking: 'source_projection_unavailable', priority: 950,
      }));
    }
  }
  // Do not turn a successfully empty source into non-empty "live" solely
  // because a user-facing opportunity has been generated.
  const normalizedTasks = tasks.map((entry) => {
    const state = sourceStatuses[entry.source_key]?.state;
    if (!['query_failed', 'migration_pending', 'unavailable'].includes(state)) {
      return Object.freeze({ ...entry, source_health: state });
    }
    return Object.freeze({ ...entry, status: 'sync_unavailable', availability: 'sync_unavailable',
      source_health: state, blocking_reason_code: 'source_projection_unavailable' });
  });
  return { tasks: normalizedTasks, source_status: sourceStatuses, read_context: {
    utc_day: day, iso_week: week,
    // null means the authoritative roster could not be read, not zero pets.
    pet_count: rosterUnavailable ? null : pets.length,
  } };
}
