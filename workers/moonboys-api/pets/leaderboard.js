import { requirePetReadResult } from './read-result.js';
import { getMoonpetSeasonInfo } from './season-authority.js';
import { PET_ACCOUNT_WALLET_RECONCILIATION_EVENT_KEY } from './wallet-reconciliation.js';

const PERIODS = new Set(['daily', 'weekly', 'seasonal', 'all_time', 'run_depth']);
const boundedLimit = (value, maximum) => Number.isFinite(Number(value)) ? Math.min(maximum, Math.max(1, Math.floor(Number(value) || 25))) : 25;

// Public reads never initialize a lifecycle, repair a profile or move a slot.
// Legacy identity is usable only before the account has per-pet authority.
const DISPLAY_CTES = `owned_pets AS (
  SELECT i.* FROM telegram_pet_instances i JOIN telegram_pet_season_slots s
    ON s.pet_id=i.pet_id AND s.telegram_id=i.telegram_id AND s.season_key=i.season_key AND s.slot_number=i.slot_number
), identities AS (
  SELECT i.telegram_id,i.pet_id,i.season_key,i.level,i.streak_days,
    l.phase AS lifecycle_phase,l.species_id AS lifecycle_species_id,l.rare_morph_id,
    COALESCE((SELECT MAX(e.stage) FROM telegram_pet_evolutions_by_pet e WHERE e.pet_id=i.pet_id AND e.telegram_id=i.telegram_id),0) AS evolution_stage,
    COALESCE((SELECT e.evolution_id FROM telegram_pet_evolutions_by_pet e WHERE e.pet_id=i.pet_id AND e.telegram_id=i.telegram_id ORDER BY e.stage DESC LIMIT 1),'moon_egg') AS stage
  FROM owned_pets i LEFT JOIN telegram_pet_lifecycle_by_pet l ON l.pet_id=i.pet_id AND l.telegram_id=i.telegram_id
  UNION ALL
  SELECT p.telegram_id,NULL,NULL,p.level,p.streak_days,l.phase,l.species_id,l.rare_morph_id,
    COALESCE((SELECT MAX(e.stage) FROM telegram_pet_evolutions e WHERE e.telegram_id=p.telegram_id),0),
    COALESCE((SELECT e.evolution_id FROM telegram_pet_evolutions e WHERE e.telegram_id=p.telegram_id ORDER BY e.stage DESC LIMIT 1),'moon_egg')
  FROM telegram_pet_profiles p LEFT JOIN telegram_pet_lifecycle l ON l.telegram_id=p.telegram_id
  WHERE NOT EXISTS (SELECT 1 FROM telegram_pet_instances i WHERE i.telegram_id=p.telegram_id)
)`;

function weekKey(now) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}

export async function readPetLeaderboard(db, { period = 'seasonal', limit = 25, owner = null, now = new Date() } = {}) {
  period = PERIODS.has(String(period).toLowerCase()) ? String(period).toLowerCase() : 'seasonal';
  const season = getMoonpetSeasonInfo(now);
  let scores, bindings = [];
  if (period === 'daily' || period === 'weekly') {
    scores = `SELECT telegram_id,SUM(pet_xp_awarded) AS pet_xp FROM telegram_pet_events
      WHERE ${period === 'daily' ? 'day_key' : 'week_key'}=? AND status='accepted' AND event_key<>?
        AND NOT EXISTS (SELECT 1 FROM moonpet_beta_xp_quarantine q WHERE q.event_id=telegram_pet_events.id)
      GROUP BY telegram_id`;
    bindings = [period === 'daily' ? now.toISOString().slice(0, 10) : weekKey(now), PET_ACCOUNT_WALLET_RECONCILIATION_EVENT_KEY];
  } else if (period === 'all_time') {
    scores = `SELECT p.telegram_id,COALESCE(t.pet_xp,CASE WHEN NOT EXISTS
      (SELECT 1 FROM telegram_pet_instances i WHERE i.telegram_id=p.telegram_id) THEN p.pet_xp ELSE 0 END) AS pet_xp
      FROM telegram_pet_profiles p LEFT JOIN (SELECT telegram_id,SUM(pet_xp) AS pet_xp FROM owned_pets GROUP BY telegram_id) t ON t.telegram_id=p.telegram_id`;
  } else if (period === 'run_depth') {
    scores = `SELECT telegram_id,MAX(depth) AS pet_xp FROM telegram_pet_runs WHERE status IN ('completed','extracted','failed') GROUP BY telegram_id`;
  } else {
    scores = 'SELECT telegram_id,season_xp AS pet_xp FROM telegram_pet_season_state WHERE season_key=?';
    bindings = [season.key];
  }
  const rows = await db.prepare(`WITH ${DISPLAY_CTES}, scores AS (${scores}), ranked AS (
    SELECT scores.telegram_id,scores.pet_xp,ROW_NUMBER() OVER (ORDER BY scores.pet_xp DESC,scores.telegram_id ASC) AS rank
    FROM scores JOIN telegram_pet_profiles p ON p.telegram_id=scores.telegram_id
  ) SELECT r.*,p.pet_name,p.moon_gold,p.moon_crystals,p.style_tokens,p.updated_at,
    d.level,d.streak_days,d.lifecycle_phase,d.lifecycle_species_id,d.rare_morph_id,d.evolution_stage,d.stage,
    u.username,u.first_name,u.last_name
  FROM ranked r JOIN telegram_pet_profiles p ON p.telegram_id=r.telegram_id
  LEFT JOIN telegram_pet_active_slots a ON a.telegram_id=r.telegram_id
  LEFT JOIN identities d ON d.telegram_id=r.telegram_id AND (d.pet_id IS NULL OR (d.pet_id=a.pet_id AND d.season_key=a.season_key))
  LEFT JOIN telegram_users u ON u.telegram_id=r.telegram_id
  WHERE r.rank<=? OR r.telegram_id=? ORDER BY r.rank`)
    .bind(...bindings, boundedLimit(limit, 100), owner == null ? '' : String(owner)).all().then(requirePetReadResult);
  return { period, season, rows: rows.results || [] };
}

export async function readPetActivity(db, limit = 20) {
  const rows = await db.prepare(`WITH ${DISPLAY_CTES}, activity_events AS (
    SELECT id,telegram_id,pet_id,season_key,event_type,xp_awarded,pet_xp_awarded,reason,created_at
    FROM telegram_pet_events e WHERE e.status='accepted' AND e.event_key<>?
      AND NOT EXISTS (SELECT 1 FROM moonpet_beta_xp_quarantine q WHERE q.event_id=e.id)
    UNION ALL
    SELECT id,telegram_id,NULL,NULL,
      CASE system_key WHEN 'cosmetic' THEN 'cosmetic_unlock' ELSE system_key END,0,0,action_key,updated_at
    FROM telegram_pet_system_events WHERE system_key IN ('equipment_upgrade','crafting','cosmetic') AND status='completed'
  )
    SELECT e.telegram_id,e.event_type,e.xp_awarded,e.pet_xp_awarded,e.reason,e.created_at,
      d.lifecycle_phase,d.lifecycle_species_id,d.rare_morph_id,d.evolution_stage,d.stage,
      u.username,u.first_name,u.last_name
    FROM activity_events e
    LEFT JOIN identities d ON d.telegram_id=e.telegram_id AND
      ((e.pet_id IS NOT NULL AND d.pet_id=e.pet_id AND d.season_key=e.season_key) OR (e.pet_id IS NULL AND d.pet_id IS NULL))
    LEFT JOIN telegram_users u ON u.telegram_id=e.telegram_id
    ORDER BY e.created_at DESC,e.id DESC LIMIT ?`)
    .bind(PET_ACCOUNT_WALLET_RECONCILIATION_EVENT_KEY, boundedLimit(limit, 50)).all().then(requirePetReadResult);
  return rows.results || [];
}
