import { requirePetFirstReadResult, requirePetReadResult, requirePetMutationResult } from './read-result.js';
import { projectCommittedPetResult } from './committed-result.js';
import evolutions from './content/evolutions.json' with { type: 'json' };
import { getMoonpetSeasonKey } from './season-authority.js';
import { PET_SEASON_COMPLETION_CONFIG } from './season-completion.js';
import { DAILY_COMPLETION_REWARD, SEASON_FINALE_REWARD, dailyCompletionKey, seasonFinaleKey } from './completion-policy.js';

const finalEvolution = [...evolutions].sort((a, b) => b.stage - a.stage)[0];
const ownedSlots = `JOIN telegram_pet_season_slots s ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id
  AND s.season_key=i.season_key AND s.slot_number=i.slot_number`;
const qualified = `(i.status='active' AND s.status='active' AND (EXISTS (SELECT 1 FROM telegram_pet_season_completions c WHERE c.pet_id=i.pet_id AND c.telegram_id=i.telegram_id AND c.season_key=i.season_key)
  OR (EXISTS (SELECT 1 FROM telegram_pet_evolutions_by_pet e WHERE e.pet_id=i.pet_id AND e.telegram_id=i.telegram_id AND e.evolution_id='${finalEvolution.evolution_id}' AND e.stage=${finalEvolution.stage})
    AND (SELECT COUNT(DISTINCT earned_day) FROM telegram_pet_growth_marks g WHERE g.pet_id=i.pet_id AND g.telegram_id=i.telegram_id AND g.season_key=i.season_key)>=${PET_SEASON_COMPLETION_CONFIG.required_growth_marks}
    AND (SELECT COUNT(DISTINCT qualification_week) FROM telegram_pet_weekly_crests w WHERE w.pet_id=i.pet_id AND w.telegram_id=i.telegram_id AND w.season_key=i.season_key)>=${PET_SEASON_COMPLETION_CONFIG.required_weekly_crests})))`;

function requireCompletionMutationResult(result) {
  requirePetMutationResult(result);
  if (!Number.isSafeInteger(result?.meta?.changes) || result.meta.changes < 0) throw new Error('pet_state_write_unavailable');
  return result;
}

export const FINALE_BUILDS = Object.freeze({
  striker: { title: 'STRIKER', health: 125, power: 32, guard: 8, surge_cost: 2, detail: '125 battle HP. 32 strike damage. Surge costs 2 charge.' },
  guardian: { title: 'GUARDIAN', health: 170, power: 23, guard: 13, surge_cost: 2, detail: '170 battle HP. 23 strike damage. Guard deals 13. Surge costs 2 charge.' },
  tactician: { title: 'TACTICIAN', health: 140, power: 25, guard: 8, surge_cost: 1, detail: '140 battle HP. 25 strike damage. Surge costs only 1 charge.' },
});
export function newFinale(build) {
  if (!Object.hasOwn(FINALE_BUILDS, build)) return null;
  const kit = FINALE_BUILDS[build];
  return { version: 1, build, health: kit.health, max_health: kit.health, boss_health: 220, boss_max_health: 220,
    round: 1, charge: 0, supplies: 2, last: 'Read the next attack. Your battle is saved after every move.' };
}
export function finaleIntent(state) {
  const enraged = state.boss_health <= 90;
  const turn = (state.round - 1) % 3;
  return { key: ['sweep', 'heavy', 'exposed'][turn], title: ['SIGNAL SWEEP', 'HEAVY OVERLOAD', 'EXPOSED CORE'][turn],
    damage: [22, 44, 8][turn] + (enraged ? 6 : 0), multiplier: turn === 2 ? 2 : 1, enraged };
}
export function finaleChoices(state) {
  const kit = FINALE_BUILDS[state.build], intent = finaleIntent(state);
  return [
    { key: 'strike', title: 'STRIKE', damage: kit.power * intent.multiplier, taken: intent.damage, charge: 0 },
    { key: 'guard', title: 'GUARD / CHARGE', damage: kit.guard, taken: Math.ceil(intent.damage / 4), charge: 1 },
    { key: 'surge', title: 'RELEASE SURGE', damage: (kit.power * 2 + 12) * intent.multiplier, taken: Math.ceil(intent.damage / 2), charge: -kit.surge_cost, disabled: state.charge < kit.surge_cost },
    { key: 'patch', title: 'USE REPAIR KIT', damage: 0, taken: intent.damage, charge: 0, heal: Math.min(55, state.max_health - state.health), disabled: state.supplies < 1 || state.health >= state.max_health },
  ].map(choice => ({ ...choice, detail: `${choice.damage} damage // ${choice.taken} incoming${choice.charge ? ` // ${choice.charge > 0 ? '+' : ''}${choice.charge} charge` : ''}${choice.heal != null ? ` // heal ${choice.heal}, use 1 kit` : ''}. A finishing hit stops the attack.` }));
}
export function advanceFinale(saved, move) {
  if (saved.health <= 0 || saved.boss_health <= 0) return null;
  const choice = finaleChoices(saved).find(candidate => candidate.key === move);
  if (!choice || choice.disabled) return null;
  const state = structuredClone(saved);
  state.boss_health = Math.max(0, state.boss_health - choice.damage);
  state.health = Math.max(0, Math.min(state.max_health, state.health + (choice.heal || 0)) - (state.boss_health ? choice.taken : 0));
  state.charge = Math.min(3, state.charge + choice.charge);
  if (move === 'patch') state.supplies--;
  state.round++;
  const status = state.boss_health === 0 ? 'won' : state.health === 0 ? 'failed' : 'active';
  state.last = status === 'won' ? 'SIGNAL SOVEREIGN DEFEATED. Your finale victory is saved.'
    : status === 'failed' ? 'Your battle rig fell. Your pet is unharmed. Pick a build and retry.'
      : `${choice.title}: ${choice.damage} damage dealt, ${choice.taken} taken${choice.heal ? `, ${choice.heal} repaired` : ''}.`;
  return { state, status };
}

function dailyPublic(row) {
  return { utc_day: row.utc_day, progress_bits: row.progress_bits, ready: row.progress_bits === 255, pet_id: row.pet_id,
    claimed: Boolean(row.claimed_at), claimed_at: row.claimed_at, rewards: DAILY_COMPLETION_REWARD };
}
export async function readDailyCompletion(db, owner, date, counts, upgrades, gold, equipmentCollectionComplete = false) {
  let bits = gold >= 50 ? 128 : 0;
  for (const [type, flag] of Object.entries({ feed: 1, play: 2, clean: 4, train: 8, trade: 16, buy: 32, adventure: 64, run_extract: 64, run_complete: 64, daily_moon_run: 64, district_mission: 64, event_chain: 64, seasonal_boss: 64 })) if (counts[type] > 0) bits |= flag;
  if (upgrades > 0 || equipmentCollectionComplete) bits |= 32;
  // Covers existing today's receipts at rollout and holding gold across midnight.
  // Database triggers capture new receipts/balance crossings even without a refresh.
  try {
    if (bits) await db.prepare(`INSERT INTO telegram_pet_daily_completion (telegram_id,utc_day,progress_bits) VALUES (?,?,?)
      ON CONFLICT (telegram_id,utc_day) DO UPDATE SET progress_bits=progress_bits|excluded.progress_bits
      WHERE (progress_bits|excluded.progress_bits)<>progress_bits`).bind(owner, date, bits).run().then(requireCompletionMutationResult);
    const rows = await db.prepare(`SELECT * FROM telegram_pet_daily_completion WHERE telegram_id=?
      AND (utc_day=? OR (progress_bits=255 AND claimed_at IS NULL)) ORDER BY utc_day`).bind(owner, date).all().then(requirePetReadResult);
    const today = rows.results.find(row => row.utc_day === date) || { utc_day: date, progress_bits: 0 };
    return { ...dailyPublic(today), available: true, pending: rows.results.filter(row => row.progress_bits === 255 && !row.claimed_at).map(dailyPublic) };
  } catch (error) {
    // Keep the existing checklist usable if Worker and migration rollout differ.
    // Other database failures must still follow the normal error/retry path.
    if (!/no such table: telegram_pet_daily_completion\b/.test(error?.cause?.message || error?.message || '')) throw error;
    return { available: false, progress_bits: bits, pending: [] };
  }
}

export async function claimDailyCompletion(db, owner, pet, body, award) {
  const date = String(body.utc_day || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { accepted: false, reason: 'daily_completion_not_ready' };
  let row = await db.prepare('SELECT * FROM telegram_pet_daily_completion WHERE telegram_id=? AND utc_day=?').bind(owner, date).first().then(requirePetFirstReadResult);
  if (!row || row.progress_bits !== 255) return { accepted: false, reason: 'daily_completion_not_ready' };
  if (!row.pet_id) {
    if (!pet?.pet_id || body.pet_id !== pet.pet_id) return { accepted: false, reason: 'source_pet_changed' };
    await db.prepare(`UPDATE telegram_pet_daily_completion SET pet_id=?,season_key=?
      WHERE telegram_id=? AND utc_day=? AND progress_bits=255 AND pet_id IS NULL
        AND EXISTS (SELECT 1 FROM telegram_pet_instances i ${ownedSlots}
          JOIN telegram_pet_active_slots a ON a.pet_id=i.pet_id AND a.telegram_id=i.telegram_id AND a.season_key=i.season_key
          JOIN telegram_pet_lifecycle_by_pet l ON l.pet_id=i.pet_id AND l.telegram_id=i.telegram_id
          WHERE i.pet_id=? AND i.telegram_id=? AND i.season_key=? AND l.phase<>'egg')`)
      .bind(pet.pet_id, pet.season_key, owner, date, pet.pet_id, owner, pet.season_key).run().then(requireCompletionMutationResult);
    row = await db.prepare('SELECT * FROM telegram_pet_daily_completion WHERE telegram_id=? AND utc_day=?').bind(owner, date).first().then(requirePetFirstReadResult);
    if (!row.pet_id) return { accepted: false, reason: 'active_pet_required' };
  }
  const key = dailyCompletionKey(owner, date);
  const result = await award(db, { telegram_id: owner, pet_id: row.pet_id, season_key: row.season_key,
    source: 'pet_daily_completion', idempotency_key: key, event_key: key, event_type: 'daily_completion',
    rewards: DAILY_COMPLETION_REWARD, context: { utc_day: date, pet_id: row.pet_id, season_key: row.season_key } });
  const committed = { ...result, reason: result.accepted ? 'daily_completion_claimed' : 'daily_completion_pending', utc_day: date, reward_pending: true };
  if (!result.accepted) return committed;
  return projectCommittedPetResult(committed, async () => {
    const acknowledgement = await db.prepare(`UPDATE telegram_pet_daily_completion SET claimed_at=COALESCE(claimed_at,CURRENT_TIMESTAMP)
      WHERE telegram_id=? AND utc_day=? AND EXISTS (SELECT 1 FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_daily_completion' AND idempotency_key=? AND status='awarded')`)
      .bind(owner, date, owner, key).run().then(requireCompletionMutationResult);
    if (acknowledgement.meta.changes !== 1) throw new Error('completion_acknowledgement_pending');
    return { ...committed, reward_pending: false };
  });
}

function publicFinale(row) {
  const state = row.state_json ? JSON.parse(row.state_json) : null;
  return { pet_id: row.pet_id, season_key: row.season_key, competition_season_key: row.competition_season_key, slot_number: row.slot_number,
    playable: Boolean(row.playable), eligible: Boolean(row.qualified), status: row.status || 'not_started', attempt: row.attempt || 0, revision: row.revision || 0,
    claimed: Boolean(row.claimed_at), defeated_at: row.defeated_at, state,
    intent: state && row.playable && row.status === 'active' ? finaleIntent(state) : null,
    choices: state && row.playable && row.status === 'active' ? finaleChoices(state) : [] };
}
export async function getSeasonFinales(db, owner, activePetId, now = new Date()) {
  const competitionSeason = getMoonpetSeasonKey(now);
  let rows;
  // Project this quarter even when the pet already has an older saved battle.
  // History remains visible and playable/claimable under its original quarter.
  const projection = `SELECT i.pet_id,i.season_key,i.slot_number,f.status,f.attempt,f.revision,f.state_json,f.defeated_at,f.claimed_at,
    COALESCE(f.competition_season_key,?) AS competition_season_key,(i.status='active' AND s.status='active') AS playable,${qualified} AS qualified
    FROM telegram_pet_instances i ${ownedSlots}`;
  try { rows = await db.prepare(`${projection}
    LEFT JOIN telegram_pet_season_finales f ON f.pet_id=i.pet_id AND f.telegram_id=i.telegram_id AND f.season_key=i.season_key AND f.competition_season_key=?
    WHERE i.telegram_id=? AND (i.pet_id=? OR f.pet_id IS NOT NULL OR ${qualified})
    UNION ALL
    ${projection}
    JOIN telegram_pet_season_finales f ON f.pet_id=i.pet_id AND f.telegram_id=i.telegram_id AND f.season_key=i.season_key AND f.competition_season_key<>?
    WHERE i.telegram_id=? ORDER BY competition_season_key DESC,i.slot_number`)
    .bind(competitionSeason, competitionSeason, owner, activePetId || '', competitionSeason, competitionSeason, owner).all().then(requirePetReadResult);
  } catch (error) {
    if (!/no such table: telegram_pet_(season_finales|season_completions|growth_marks|weekly_crests)\b|no such column: (?:f\.)?(earned_day|qualification_week|competition_season_key|reward_key)\b/.test(error?.cause?.message || error?.message || '')) throw error;
    return { available: false, pets: [] };
  }
  return { available: true, competition_season_key: competitionSeason, title: 'SIGNAL SOVEREIGN', reward: SEASON_FINALE_REWARD, builds: Object.entries(FINALE_BUILDS).map(([key, value]) => ({ key, ...value })),
    requirements: PET_SEASON_COMPLETION_CONFIG, pets: rows.results.map(publicFinale) };
}
async function readFinale(db, owner, pet, season, competitionSeason) {
  return db.prepare(`SELECT f.* FROM telegram_pet_season_finales f
    JOIN telegram_pet_instances i ON i.pet_id=f.pet_id AND i.telegram_id=f.telegram_id AND i.season_key=f.season_key ${ownedSlots}
    WHERE f.telegram_id=? AND f.pet_id=? AND f.season_key=? AND f.competition_season_key=?`).bind(owner, pet, season, competitionSeason).first().then(requirePetFirstReadResult);
}
async function claimFinale(db, owner, row, award) {
  if (row?.status !== 'won') return { accepted: false, reason: 'finale_victory_required' };
  const key = row.reward_key;
  const result = await award(db, { telegram_id: owner, pet_id: row.pet_id, season_key: row.season_key,
    source: 'pet_season_finale', idempotency_key: key, event_key: key, event_type: 'season_finale', rewards: SEASON_FINALE_REWARD,
    context: { pet_id: row.pet_id, season_key: row.season_key, competition_season_key: row.competition_season_key, reward_key: key } });
  const committed = { ...result, reason: result.accepted ? 'finale_reward_claimed' : 'finale_reward_pending', reward_pending: true };
  if (!result.accepted) return committed;
  return projectCommittedPetResult(committed, async () => {
    const acknowledgement = await db.prepare(`UPDATE telegram_pet_season_finales SET claimed_at=COALESCE(claimed_at,CURRENT_TIMESTAMP)
      WHERE telegram_id=? AND pet_id=? AND season_key=? AND competition_season_key=? AND EXISTS (SELECT 1 FROM telegram_pet_reward_claims WHERE telegram_id=? AND source='pet_season_finale' AND idempotency_key=? AND status='awarded')`)
      .bind(owner, row.pet_id, row.season_key, row.competition_season_key, owner, key).run().then(requireCompletionMutationResult);
    if (acknowledgement.meta.changes !== 1) throw new Error('completion_acknowledgement_pending');
    return { ...committed, reward_pending: false };
  });
}
export async function processSeasonFinale(db, owner, body, award, now = new Date()) {
  const petId = String(body.pet_id || ''), season = String(body.season_key || '');
  const competitionSeason = String(body.competition_season_key || '');
  if (!petId || !season || !competitionSeason) return { accepted: false, reason: 'finale_stale_turn', refresh_state: true };
  let row = await readFinale(db, owner, petId, season, competitionSeason);
  if (body.action === 'finale_claim') return claimFinale(db, owner, row, award);
  if (body.action === 'finale_start' || body.action === 'finale_retry') {
    const state = newFinale(body.build);
    if (!state) return { accepted: false, reason: 'finale_invalid_build' };
    if (body.action === 'finale_start') {
      if (competitionSeason !== getMoonpetSeasonKey(now)) return { accepted: false, reason: 'finale_quarter_changed', refresh_state: true };
      if (row) return { accepted: false, reason: 'finale_already_started' };
      const result = await db.prepare(`INSERT OR IGNORE INTO telegram_pet_season_finales (pet_id,telegram_id,season_key,competition_season_key,reward_key,status,state_json,updated_at)
        SELECT i.pet_id,i.telegram_id,i.season_key,?,?,'active',?,? FROM telegram_pet_instances i ${ownedSlots}
        WHERE i.pet_id=? AND i.telegram_id=? AND i.season_key=? AND ${qualified}`)
        .bind(competitionSeason, seasonFinaleKey(petId, competitionSeason), JSON.stringify(state), now.toISOString(), petId, owner, season).run().then(requireCompletionMutationResult);
      return { accepted: Number(result.meta?.changes) === 1, reason: Number(result.meta?.changes) === 1 ? 'finale_started' : 'finale_requirements_not_met' };
    }
    if (row?.status !== 'failed' || !Number.isInteger(body.revision) || body.revision !== row.revision) return { accepted: false, reason: 'finale_stale_turn' };
    const result = await db.prepare(`UPDATE telegram_pet_season_finales SET state_json=?,status='active',attempt=attempt+1,revision=revision+1,updated_at=?
      WHERE pet_id=? AND telegram_id=? AND season_key=? AND competition_season_key=? AND status='failed' AND revision=? AND EXISTS (SELECT 1 FROM telegram_pet_instances i ${ownedSlots} WHERE i.pet_id=telegram_pet_season_finales.pet_id AND i.telegram_id=telegram_pet_season_finales.telegram_id AND i.season_key=telegram_pet_season_finales.season_key AND i.status='active' AND s.status='active')`)
      .bind(JSON.stringify(state), now.toISOString(), petId, owner, season, competitionSeason, body.revision).run().then(requireCompletionMutationResult);
    return { accepted: Number(result.meta?.changes) === 1, reason: Number(result.meta?.changes) === 1 ? 'finale_started' : 'finale_stale_turn' };
  }
  if (body.action !== 'finale_step' || row?.status !== 'active' || !Number.isInteger(body.revision) || body.revision !== row.revision) return { accepted: false, reason: 'finale_stale_turn' };
  const next = advanceFinale(JSON.parse(row.state_json), body.move);
  if (!next) return { accepted: false, reason: 'finale_invalid_move' };
  const result = await db.prepare(`UPDATE telegram_pet_season_finales SET state_json=?,status=?,revision=revision+1,
    defeated_at=CASE WHEN ?='won' THEN ? ELSE NULL END,updated_at=?
    WHERE pet_id=? AND telegram_id=? AND season_key=? AND competition_season_key=? AND revision=? AND status='active' AND EXISTS (SELECT 1 FROM telegram_pet_instances i ${ownedSlots} WHERE i.pet_id=telegram_pet_season_finales.pet_id AND i.telegram_id=telegram_pet_season_finales.telegram_id AND i.season_key=telegram_pet_season_finales.season_key AND i.status='active' AND s.status='active')`)
    .bind(JSON.stringify(next.state), next.status, next.status, now.toISOString(), now.toISOString(), petId, owner, season, competitionSeason, body.revision).run().then(requireCompletionMutationResult);
  if (Number(result.meta?.changes) !== 1) return { accepted: false, reason: 'finale_stale_turn' };
  // Victory is durable before payout. A failed payout remains explicitly claimable.
  if (next.status === 'won') {
    const victory = { accepted: true, reason: 'finale_won', result_copy: 'Victory saved. Use Claim Finale Reward to retry the payout.',
      reward_pending: true, reward: { accepted: false, reason: 'finale_reward_pending' } };
    return projectCommittedPetResult(victory, async () => {
      row = await readFinale(db, owner, petId, season, competitionSeason);
      const reward = await claimFinale(db, owner, row, award);
      return { ...victory, result_copy: reward.accepted ? 'Signal Sovereign defeated. Victory reward claimed.' : victory.result_copy,
        reward, rewards: reward.rewards, pet_xp_awarded: reward.pet_xp_awarded,
        reward_pending: Boolean(reward.reward_pending ?? !reward.accepted), ...(reward.refresh_state ? { refresh_state: true } : {}) };
    });
  }
  return { accepted: true, reason: next.status === 'failed' ? 'finale_failed' : 'finale_turn_saved', result_copy: next.state.last };
}
