// Read-only MoonPet Saved Status adapters. Source-only previews are not claim badges.
import { reward, sourceStatus, nextUtcDay, nextIsoWeek } from './schema.js';
import { PET_SEASON_REWARD_TIERS } from '../pets/player-expansion.js';
import { SEASON_FINALE_REWARD } from '../pets/completion-policy.js';
import { getPetDailyBonusBounties, getPetWeeklyBounties } from '../pets/economy-expansion.js';
import { getMoonpetSeasonKey } from '../pets/season-authority.js';

export const SAVED_CLAIM_KEYS = Object.freeze({
  cache: 'moonpet.daily-cache', tiers: 'moonpet.season-tier-claims',
  finale: 'moonpet.finale-claim', bonus: 'moonpet.extra-bounty-claims',
  weekly: 'moonpet.weekly-bounty-claims',
});
const count = value => Math.max(0, Math.floor(Number(value) || 0));
const payout = items => reward(Object.entries(items || {}).map(([type, amount]) => ({ type, amount })), true);

export async function projectSavedMoonpetClaims({
  db, ownerId, now, day, week, pets, rosterUnavailable, sourceStatuses, failures,
  query, makeTask, opaqueRef,
}) {
  const tasks = [];
  const read = (key, sql, args) => sourceStatuses[SAVED_CLAIM_KEYS[key]]?.state === 'migration_pending'
    ? Promise.resolve(null) : query(db, sql, args, [], failures, [SAVED_CLAIM_KEYS[key]]);
  const status = (key, rows, adapter, preview = false) => {
    const id = SAVED_CLAIM_KEYS[key];
    if (sourceStatuses[id]?.state === 'migration_pending' || failures.has(id)) return;
    sourceStatuses[id] = sourceStatus(preview ? 'preview' : rows?.length ? 'live' : 'live_empty', { adapter });
  };
  function add(key, state, info) {
    const sourceKey = SAVED_CLAIM_KEYS[key];
    tasks.push(makeTask({
      source_key: sourceKey, task_id: sourceKey + ':' + (info.period || 'current') + ':' + (info.suffix || 'summary'),
      title: info.title, description: info.description || 'Open MoonPet Saved Status for the original action.',
      why: 'Only source-accepted MoonPet evidence can establish a claim.',
      status: state, source_health: info.health || sourceStatuses[sourceKey]?.state || 'unavailable',
      priority: info.priority || 650, blocking_reason_code: info.blocking || null,
      period: { kind: info.periodKind || 'saved_claim', key: info.period || null, origin_timezone: 'UTC' },
      progress: info.progress || { current: null, target: null, unit: 'claims' },
      expires_at: info.expiresAt || null, reward: info.reward || reward([], false),
      source_pet_ref: info.petRef || null,
      evidence: { kind: info.receipt ? 'server_receipt' : 'server_projection',
        verified_completion: Boolean(info.receipt), accepted_at: info.acceptedAt || null },
      destination: { kind: 'web', path: '/moonpet-game.html', screen: 'missions', focus: 'saved-status' },
    }));
  }
  const unknown = (key, title, period, blocking) => add(key, 'preview',
    { title, period, blocking, health: 'preview', priority: 880 });

  // An accepted daily_chest event proves a past opening, not current eligibility.
  const cache = await read('cache',
    "SELECT event_key,created_at FROM telegram_pet_events WHERE telegram_id=? AND day_key=? AND event_type='daily_chest' AND status='accepted' ORDER BY created_at DESC LIMIT 1",
    [ownerId, day]);
  status('cache', cache, 'accepted_daily_chest');
  if (cache?.length) add('cache', 'claimed', { title: 'Daily Cache opened', period: day,
    periodKind: 'utc_day', receipt: true, acceptedAt: cache[0].created_at,
    progress: { current: 1, target: 1, unit: 'accepted_chest_events' } });
  else unknown('cache', 'Check today’s Daily Cache in MoonPet', day, 'daily_cache_eligibility_unverified');

  // Season tiers require persisted season XP and independent payout receipts.
  const currentSeason = getMoonpetSeasonKey(now);
  const seasons = await read('tiers',
    'SELECT season_key,season_xp FROM telegram_pet_season_state WHERE telegram_id=? ORDER BY season_key DESC LIMIT 16', [ownerId]);
  const claims = seasons === null ? null : await read('tiers',
    'SELECT season_key,tier_id,claimed_at FROM telegram_pet_season_reward_claims WHERE telegram_id=? ORDER BY season_key DESC LIMIT 100', [ownerId]);
  const receipts = claims === null ? null : await read('tiers',
    "SELECT idempotency_key,status,awarded_at FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_season_reward' AND status IN ('pending','awarded') ORDER BY created_at DESC LIMIT 100",
    [ownerId]);
  status('tiers', seasons, 'season_xp_claims_and_receipts');
  if (seasons && claims && receipts) {
    // A bounded receipt read cannot prove an absent payout when truncated.
    const truncated = seasons.length >= 16 || claims.length >= 100 || receipts.length >= 100;
    // The canonical claim path needs the selected original pet and its saved
    // lifecycle. Any owned roster row is insufficient if the selected pet's
    // lifecycle record was missing from the outer-joined source projection.
    const selectedPet = !rosterUnavailable ? pets.find(pet => count(pet.is_active) === 1) : null;
    const selectedLifecycleVerified = Boolean(selectedPet?.lifecycle_phase);
    const saved = new Map(claims.map(x => [x.season_key + ':' + x.tier_id, x]));
    const paid = new Map(receipts.map(x => [x.idempotency_key, x]));
    const periods = new Map(seasons.map(x => [String(x.season_key), count(x.season_xp)]));
    // Canonical season state retains paid tiers even if an imported account
    // lost its historical season XP aggregate. The unique awarded receipt
    // proves that historical tier; it must remain visible as claimed.
    const prefix = 'season_reward:' + ownerId + ':';
    for (const row of receipts) {
      if (row.status !== 'awarded' || !String(row.idempotency_key).startsWith(prefix)) continue;
      const match = String(row.idempotency_key).slice(prefix.length)
        .match(/^(pet-s\d{4}-00[1-4]):(street|neon|cyber|guardian)$/u);
      if (match && !periods.has(match[1])) periods.set(match[1], 0);
    }
    if (receipts.length) status('tiers', [...seasons, ...receipts], 'season_xp_claims_and_receipts');
    if (!periods.has(currentSeason)) periods.set(currentSeason, 0);
    for (const [period, xp] of periods) {
      if (!/^pet-s\d{4}-00[1-4]$/u.test(period) || period > currentSeason) continue;
      for (const tier of PET_SEASON_REWARD_TIERS) {
        const key = period + ':' + tier.tier_id;
        const receipt = paid.get('season_reward:' + ownerId + ':' + key);
        const ack = saved.get(key);
        const earned = xp >= tier.required_xp;
        if (!earned && !receipt && !ack && period !== currentSeason) continue;
        const awarded = receipt?.status === 'awarded';
        const pending = receipt?.status === 'pending';
        const blocked = truncated || (ack && !awarded) || pending ||
          rosterUnavailable || !selectedLifecycleVerified;
        const ready = earned && !receipt && !ack && !blocked;
        add('tiers', awarded ? 'claimed' : ready ? 'claim_ready' : blocked ? 'blocked' : 'in_progress', {
          title: tier.title + ' — ' + period, period, suffix: tier.tier_id, priority: ready ? 42 : 760,
          description: 'Listed tier amounts are base rewards only. Actual Style Tokens may include the selected pet’s evolution-stage bonus; MoonPet confirms the final amount.',
          blocking: truncated ? 'season_receipt_history_partial' : pending ? 'season_reward_settlement_pending' : ack && !awarded
            ? 'season_reward_receipt_unverified' : rosterUnavailable ? 'owned_roster_unavailable'
              : !selectedPet ? 'selected_moonpet_required'
                : !selectedLifecycleVerified ? 'selected_pet_lifecycle_unverified' : null,
          progress: { current: xp, target: tier.required_xp, unit: 'season_xp' },
          // The canonical payout adds current evolution stage to Style Tokens.
          // Without reading that live source here, the base reward is not an
          // exact confirmed payout, even when the tier itself is claim-ready.
          reward: reward(Object.entries(tier.reward).map(([type, amount]) => ({ type, amount })), false),
          receipt: awarded, acceptedAt: awarded ? receipt.awarded_at : null,
        });
      }
    }
  } else unknown('tiers', 'Check season reward tiers in MoonPet', currentSeason, 'season_tier_source_unavailable');

  // Finale victory remains owned by its original pet and competition quarter.
  const finales = await read('finale',
    "SELECT f.pet_id,f.season_key,f.competition_season_key,f.status,f.defeated_at,f.claimed_at,f.reward_key," +
    " CASE WHEN i.pet_id IS NOT NULL AND s.pet_id IS NOT NULL THEN 1 ELSE 0 END AS owner_verified," +
    " (SELECT r.status FROM telegram_pet_reward_claims r WHERE r.telegram_id=f.telegram_id" +
    " AND r.source='pet_season_finale' AND r.idempotency_key=f.reward_key LIMIT 1) AS receipt_status" +
    " FROM telegram_pet_season_finales f" +
    " LEFT JOIN telegram_pet_instances i ON i.pet_id=f.pet_id AND i.telegram_id=f.telegram_id AND i.season_key=f.season_key" +
    " LEFT JOIN telegram_pet_season_slots s ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id" +
    " AND s.season_key=i.season_key AND s.slot_number=i.slot_number" +
    " WHERE f.telegram_id=? AND f.status='won' ORDER BY f.competition_season_key DESC LIMIT 61", [ownerId]);
  // Fetch one extra row to detect a truncated source history. Older saved
  // winnings must not silently disappear behind a fully-live claim source.
  const finalePartial = Boolean(finales && finales.length > 60);
  status('finale', finales, 'original_pet_finale_and_reward_receipt');
  if (finalePartial && !failures.has(SAVED_CLAIM_KEYS.finale)) {
    sourceStatuses[SAVED_CLAIM_KEYS.finale] = sourceStatus('live', {
      adapter: 'original_pet_finale_and_reward_receipt',
      partial: true,
      historical_pending_not_listed: 'unknown',
      historical_rows_in_preview: 60,
    });
    add('finale', 'preview', {
      title: 'Additional saved Finale victories need review',
      description: 'More than 60 saved victories exist. Older payouts are not individually checked in this bounded Action Plan read. Review MoonPet Saved Status.',
      period: 'historical_overflow', suffix: 'overflow', health: 'preview',
      blocking: 'saved_finale_history_partial', priority: 820,
    });
  }
  if (finales?.length) for (const f of finales.slice(0, 60)) {
    const valid = count(f.owner_verified) === 1 && Boolean(f.defeated_at && f.reward_key);
    const awarded = f.receipt_status === 'awarded';
    const pending = f.receipt_status === 'pending';
    const confirmed = valid && awarded;
    const ready = valid && !awarded && !pending && !f.claimed_at;
    const petRef = valid ? await opaqueRef(ownerId + ':' + f.pet_id) : null;
    add('finale', confirmed ? 'claimed' : ready ? 'claim_ready' : 'blocked', {
      title: 'Saved Signal Sovereign Finale reward', period: f.competition_season_key,
      suffix: valid ? await opaqueRef(ownerId + ':' + f.pet_id + ':' + f.competition_season_key) : 'unverified',
      petRef, priority: ready ? 36 : 740, receipt: confirmed, acceptedAt: confirmed ? f.claimed_at : null,
      blocking: !valid ? 'original_pet_season_unverified' : pending ? 'finale_settlement_pending'
        : f.claimed_at && !awarded ? 'finale_acknowledgement_unverified' : null,
      reward: payout(SEASON_FINALE_REWARD),
    });
  } else unknown('finale', 'Review saved Finale rewards in MoonPet', currentSeason, 'no_verified_finale_claim');

  // Event counts are advisory progress: bonus/weekly payout identity
  // and boss attempts still require the canonical Saved Status economy board.
  for (const [key, period, field, definitions, expiresAt] of [
    ['bonus', day, 'day_key', getPetDailyBonusBounties(day), nextUtcDay(now)],
    ['weekly', week, 'week_key', getPetWeeklyBounties(week), nextIsoWeek(now)],
  ]) {
    const rows = await read(key, 'SELECT event_type,COUNT(*) AS total FROM telegram_pet_events WHERE telegram_id=? AND ' +
      field + "=? AND status='accepted' GROUP BY event_type", [ownerId, period]);
    status(key, rows, 'accepted_event_progress_only', true);
    if (rows === null) { unknown(key, 'Check MoonPet bonus/weekly claims', period, 'source_events_unavailable'); continue; }
    const totals = new Map(rows.map(x => [String(x.event_type), count(x.total)]));
    for (const definition of definitions) {
      const progress = definition.key === 'week_boss' ? null : Math.min(definition.required,
        definition.event_types.reduce((sum, type) => sum + (totals.get(type) || 0), 0));
      add(key, 'preview', {
        title: definition.title + ' — check claim in MoonPet', period, suffix: definition.key,
        periodKind: key === 'bonus' ? 'utc_day' : 'source_defined',
        expiresAt, blocking: 'source_bounty_claim_receipt_not_verified', health: 'preview',
        progress: { current: progress, target: definition.required, unit: 'advisory_accepted_events' },
        reward: payout(definition.reward), priority: 810,
      });
    }
  }
  return tasks;
}
