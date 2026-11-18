// Settlement only writes the pilot ledger. Reward writers never consume it.
import { accountWalletRecoveryResolvedSql } from './wallet-reconciliation.js';
import { requirePetMutationResult } from './read-result.js';

const HALF_HOUR = 30 * 60_000;
const ALL_SLOTS = 2 ** 49 - 1;
const source = `FROM telegram_pet_profiles p
  LEFT JOIN telegram_pet_active_slots a USING (telegram_id)
  LEFT JOIN telegram_pet_season_slots s ON s.pet_id=a.pet_id AND s.telegram_id=p.telegram_id
    AND s.season_key=a.season_key AND s.status='active'
  LEFT JOIN telegram_pet_instances i ON i.pet_id=s.pet_id AND i.telegram_id=s.telegram_id
    AND i.season_key=s.season_key AND i.slot_number=s.slot_number AND i.status='active'
  LEFT JOIN telegram_pet_lifecycle_by_pet l ON l.pet_id=i.pet_id AND l.telegram_id=p.telegram_id`;

// Recheck continuity at the next midnight as well, including the final half-hour.
// Ambiguous or partial ownership windows are exempt for this pilot.
const unavailable = `CASE
  WHEN i.pet_id IS NULL THEN 'ownership_unavailable'
  WHEN l.phase IS NULL OR l.phase='egg' OR date(l.hatched_at) IS NULL OR date(l.hatched_at)>=clock.day THEN 'hatch_window'
  WHEN date(a.updated_at) IS NULL OR date(a.updated_at)>=clock.day THEN 'selection_changed'
  WHEN NOT (${accountWalletRecoveryResolvedSql('p.telegram_id')}) THEN 'care_unavailable'
  END`;

function observe(db, owner, day, slot, enabled) {
  return db.prepare(`WITH clock(day) AS (VALUES (?))
    INSERT INTO moonpet_care_shadow_days (telegram_id,day_key,pet_id,observed_slots,exempt_reason)
    SELECT p.telegram_id,clock.day,a.pet_id,1 << ?,CASE WHEN ?=0 THEN 'app_unavailable' ELSE ${unavailable} END
    ${source} CROSS JOIN clock WHERE p.telegram_id=? AND (?<48 OR EXISTS (
      SELECT 1 FROM moonpet_care_shadow_days d WHERE d.telegram_id=p.telegram_id AND d.day_key=clock.day))
    ON CONFLICT(telegram_id,policy_version,day_key) DO UPDATE SET
      observed_slots=observed_slots | excluded.observed_slots,
      exempt_reason=coalesce(exempt_reason,excluded.exempt_reason,
        CASE WHEN pet_id IS NOT excluded.pet_id THEN 'selection_changed' END)
    WHERE settled_at IS NULL`).bind(day, slot, Number(enabled), owner, slot);
}

function settleOldest(db, owner, cutoff, now) {
  return db.prepare(`WITH
    target AS MATERIALIZED (
      SELECT * FROM moonpet_care_shadow_days WHERE telegram_id=? AND policy_version=1
        AND settled_at IS NULL AND day_key<? ORDER BY day_key LIMIT 1
    ), previous AS (
      SELECT d.* FROM moonpet_care_shadow_days d JOIN target t ON d.telegram_id=t.telegram_id
        AND d.policy_version=t.policy_version AND d.day_key<t.day_key
      WHERE d.settled_at IS NOT NULL ORDER BY d.day_key DESC LIMIT 1
    ),
    evidence AS (
      SELECT coalesce(sum(e.pet_xp_awarded),0) AS gross,
        coalesce(max(e.pet_id=t.pet_id AND e.event_type='feed'),0)
        +2*coalesce(max(e.pet_id=t.pet_id AND e.event_type='play'),0)
        +4*coalesce(max(e.pet_id=t.pet_id AND e.event_type='clean'),0) AS mask
      FROM target t LEFT JOIN telegram_pet_events e ON e.telegram_id=t.telegram_id
        AND e.day_key=t.day_key AND e.status='accepted'
    ), inputs AS (
      SELECT t.*,e.gross,e.mask, ((mask & 1)>0)+((mask & 2)>0)+((mask & 4)>0) AS actions,
        coalesce((SELECT debt_thirds FROM previous),0) AS prior_debt,
        coalesce((SELECT missed_streak FROM previous),0) AS prior_streak,
        coalesce((SELECT reason FROM moonpet_care_shadow_exclusions x
          WHERE x.day_key=t.day_key AND x.owner_scope IN ('*',t.telegram_id) ORDER BY x.owner_scope LIMIT 1),
          t.exempt_reason, CASE WHEN observed_slots<>? THEN 'incomplete_observation' END,
          CASE WHEN EXISTS (SELECT 1 FROM telegram_pet_events f WHERE f.telegram_id=t.telegram_id
            AND f.pet_id=t.pet_id AND f.day_key=t.day_key AND f.event_type IN ('feed','play','clean')
            AND f.status='pending') THEN 'care_write_unresolved' END) AS reason
      FROM target t CROSS JOIN evidence e
    ), assessment AS (
      SELECT *, CASE WHEN reason IS NOT NULL THEN prior_streak WHEN actions=3 THEN 0 ELSE prior_streak+1 END AS streak,
        min(4620,prior_debt+CASE WHEN reason IS NULL THEN
          22*(3-actions)*min(8,prior_streak+2) ELSE 0 END) AS assessed
      FROM inputs
    )
    UPDATE moonpet_care_shadow_days AS d SET
      (exempt_reason,care_mask,gross_pet_xp,missed_streak,debt_thirds,estimated_withheld_xp,settled_at)=
      (SELECT reason,mask,gross,streak,
        max(0,assessed-CASE WHEN reason IS NULL AND actions=3 THEN 132 ELSE 0 END),
        CASE WHEN reason IS NULL AND assessed>0 THEN gross*(0.10+0.15*min(1.0,assessed/2310.0)) ELSE 0 END,?
       FROM assessment)
    WHERE d.telegram_id=? AND d.policy_version=1 AND d.day_key=(SELECT day_key FROM target)
      AND d.settled_at IS NULL`).bind(owner, cutoff, ALL_SLOTS, now, owner);
}

export async function runCareShadowTick(event, env, nowMs = Date.now()) {
  if (event?.cron !== '*/30 * * * *' || env.MOONPET_CARE_SHADOW_ENABLED !== 'true') return;
  const owners = [...new Set(String(env.MOONPET_CARE_SHADOW_OWNERS || '').split(',').map(s => s.trim()).filter(Boolean))];
  if (owners.length > 20 || owners.some(id => !/^[1-9][0-9]{0,19}$/.test(id))) throw Error('invalid_shadow_cohort');
  if (!owners.length) return;
  const time = event.scheduledTime;
  // A delayed delivery cannot attest to historical availability.
  if (!Number.isSafeInteger(time) || time % HALF_HOUR || nowMs < time || nowMs-time >= HALF_HOUR) return;
  const now = new Date(nowMs).toISOString();
  const day = new Date(time).toISOString().slice(0,10);
  const slot = Math.floor(time / HALF_HOUR) % 48;
  // Leave the following full UTC day for delayed receipts and incident exclusions.
  const cutoff = new Date(time-86_400_000).toISOString().slice(0,10);
  const enabled = env.PET_MINI_APP_ENABLED === 'true';
  const batches = await Promise.allSettled(owners.map(async owner => {
    const results = await env.DB.batch([
      ...(slot === 0 ? [observe(env.DB, owner, cutoff, 48, enabled)] : []),
      observe(env.DB, owner, day, slot, enabled),
      settleOldest(env.DB, owner, cutoff, now),
    ]);
    for (const result of results) requirePetMutationResult(result);
  }));
  const failure = batches.find(batch => batch.status === 'rejected');
  if (failure) throw failure.reason;
}
