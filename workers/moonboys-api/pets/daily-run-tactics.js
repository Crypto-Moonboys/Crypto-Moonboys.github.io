import { PET_RUN_MODIFIERS, PET_ROGUELITE_BOSSES, PET_ROGUELITE_ENEMIES } from './content/index.js';
import { getPetVisibleLevel } from './progression-phase-2.js';

// Only conditions with implemented daily-room mechanics can enter new runs.
export const DAILY_RUN_CONDITIONS = Object.freeze({
  fast_enemies: 'Room clear chance -4 percentage points.',
  low_energy: 'Room clear chance -1.5 percentage points; no extra pet energy is spent.',
  lucky_run: 'Room clear chance +15 percentage points, subject to the 99.5% ceiling.',
});
export const DAILY_RUN_RULES_ID = 'daily_rules_v2';
export const DAILY_RUN_CHECKPOINTS = Object.freeze([3, 6]);
export const DAILY_RUN_TACTICS = Object.freeze({
  guardian: Object.freeze({ title: 'GUARDIAN', detail: '+5 percentage points to clear chance; -10% room score.', chance_bps: 500, score_pct: -10 }),
  striker: Object.freeze({ title: 'STRIKER', detail: '+8 percentage points in combat; -3 in other rooms; +10% room score.', combat_bps: 800, other_bps: -300, score_pct: 10 }),
  scavenger: Object.freeze({ title: 'SCAVENGER', detail: '-5 percentage points to clear chance; +25% room score.', chance_bps: -500, score_pct: 25 }),
});
const parse = (value) => { try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } };
const tacticSlot = (checkpoint) => `daily_tactic_${checkpoint}`;
// Authored approaches give every multi-choice daily room a distinct trade-off.
const ROOM_APPROACHES = Object.freeze({
  alley_entrance: { search: 'safe', explore: 'balanced', fight: 'bold' },
  graffiti_wall: { ignore: 'safe', help_artist: 'balanced', tag_wall: 'bold' },
  rival_encounter: { sneak_past: 'safe', trade: 'balanced', challenge: 'bold' },
  hidden_cache: { leave: 'safe', scan_cache: 'balanced', open_cache: 'bold' },
  street_market: { buy_supplies: 'safe', trade: 'balanced', gamble: 'bold' },
  underground_tunnel: { retreat: 'safe', explore: 'balanced', shortcut: 'bold' },
  police_heat: { hide: 'safe', escape: 'balanced', confront: 'bold' },
  neon_shortcut: { safe_route: 'safe', speed_route: 'balanced', risk_route: 'bold' },
  elite_encounter: { escape: 'safe', fight: 'balanced', steal_loot: 'bold' },
});
export const usesDailyTactics = (rows) => rows.some((row) => row.modifier_id === DAILY_RUN_RULES_ID);
function selectedTactics(rows) {
  return DAILY_RUN_CHECKPOINTS.flatMap((checkpoint) => {
    const row = rows.find((entry) => entry.modifier_id === tacticSlot(checkpoint));
    const key = parse(row?.effects_json).tactic_id;
    return Object.hasOwn(DAILY_RUN_TACTICS, key) ? [{ key, checkpoint, ...DAILY_RUN_TACTICS[key] }] : [];
  });
}
export async function readDailyModifiers(db, run) {
  return (await db.prepare(`SELECT modifier_id, effects_json FROM telegram_pet_run_modifiers
    WHERE run_id=? AND telegram_id=? ORDER BY modifier_id`).bind(run.run_id, run.telegram_id).all()).results || [];
}
export function dailyTacticalBoard(run, rows) {
  const enabled = usesDailyTactics(rows);
  const selected = enabled ? selectedTactics(rows) : [];
  const checkpoint = Number(run.current_room || 0);
  const available = enabled && ['active', 'extractable'].includes(run.status) && DAILY_RUN_CHECKPOINTS.includes(checkpoint)
    && !rows.some((row) => row.modifier_id === tacticSlot(checkpoint));
  return {
    rules_version: enabled ? 2 : 1,
    conditions: rows.filter((row) => Object.hasOwn(PET_RUN_MODIFIERS, row.modifier_id)).map((row) => ({
      key: row.modifier_id, title: PET_RUN_MODIFIERS[row.modifier_id].name,
      detail: DAILY_RUN_CONDITIONS[row.modifier_id] || 'Legacy condition: no effective daily-room bonus. This condition is excluded from new runs.',
    })),
    selected: selected.map(({ key, checkpoint, title, detail }) => ({ key, checkpoint, title, detail })),
    checkpoint: available ? checkpoint : null,
    offers: available ? Object.entries(DAILY_RUN_TACTICS).map(([key, value]) => ({ key, title: value.title, detail: value.detail })) : [],
  };
}

export function dailyChoiceStyle(choiceId, roomId = null) {
  const choice = String(choiceId || '').toLowerCase();
  const authored = ROOM_APPROACHES[roomId]?.[choice];
  if (authored) return { key: authored, chance_bps: { safe: 700, balanced: 0, bold: -300 }[authored], score_pct: { safe: -20, balanced: 0, bold: 30 }[authored] };
  if (/(?:safe|escape|hide|leave|retreat|sneak|scan|ignore)/.test(choice)) return { key: 'safe', chance_bps: 700, score_pct: -20 };
  if (/(?:risk|gamble|steal|challenge|fight|confront)/.test(choice)) return { key: 'bold', chance_bps: -300, score_pct: 30 };
  return { key: 'balanced', chance_bps: 0, score_pct: 0 };
}

// Shared by the visible preview and actual resolution. Never projects the roll.
export function previewDailyChoice(pet, room, choiceId, rows) {
  const roomType = String(room.room_type || 'choice_event');
  const combat = ['battle', 'elite', 'boss'].includes(roomType);
  const effects = rows.filter((row) => Object.hasOwn(PET_RUN_MODIFIERS, row.modifier_id))
    .reduce((combined, row) => ({ ...combined, ...parse(row.effects_json) }), {});
  const baseChance = ({ choice_event: 9000, loot: 9500, battle: 8200, elite: 7600, boss: 7000 })[roomType] || 8500;
  const stateAverage = ['health', 'energy', 'happiness', 'cleanliness'].reduce((sum, key) => sum + Math.max(0, Math.min(100, Number(pet[key]) || 0)), 0) / 4;
  const playerAdjustment = Math.round((stateAverage - 50) * 25) + Math.min(1000, getPetVisibleLevel(pet.pet_xp) * 20);
  const modifierAdjustment = (Number(effects.event_outcome_pct) || 0) * 100
    + (Number(effects.damage_dealt_pct) || 0) * 15 - (Number(effects.damage_taken_pct) || 0) * 15
    - (Number(effects.enemy_speed_pct) || 0) * 20 - (Number(effects.energy_cost_modifier) || 0) * 30;
  const difficulty = Math.max(0, Number(room.boss_id ? PET_ROGUELITE_BOSSES[room.boss_id]?.difficulty
    : room.enemy_id ? PET_ROGUELITE_ENEMIES[room.enemy_id]?.difficulty : roomType === 'elite' ? 3 : 0) || 0);
  const version2 = usesDailyTactics(rows);
  const tactics = version2 ? selectedTactics(rows) : [];
  const style = dailyChoiceStyle(choiceId, version2 ? room.content_id : null);
  const tacticAdjustment = tactics.reduce((sum, tactic) => sum + (tactic.chance_bps || 0) + (combat ? tactic.combat_bps || 0 : tactic.other_bps || 0), 0);
  const successChanceBps = Math.max(500, Math.min(9950, Math.round(baseChance + playerAdjustment + modifierAdjustment + style.chance_bps + tacticAdjustment - difficulty * 350)));
  const baseScore = ({ choice_event: 50, loot: 75, battle: 100, elite: 175, boss: 250 })[roomType] || 50;
  const scorePct = version2 ? style.score_pct + tactics.reduce((sum, tactic) => sum + tactic.score_pct, 0) : 0;
  const score = Math.max(1, Math.round(baseScore * (100 + scorePct) / 100));
  return { success_chance_bps: successChanceBps, score, difficulty, approach: style.key,
    detail: `${style.key.toUpperCase()} // ${successChanceBps / 100}% CLEAR // +${score} RUN SCORE ON SUCCESS // FAILURE ENDS RUN` };
}

export async function chooseDailyRunTactic(db, owner, request = {}) {
  const checkpoint = request.checkpoint;
  const key = request.tactic_id;
  const rejected = (reason) => ({ accepted: false, reason, pet_xp_awarded: 0 });
  if (typeof request.run_id !== 'string' || !request.run_id || request.run_id.length > 120
    || !DAILY_RUN_CHECKPOINTS.includes(checkpoint) || typeof key !== 'string' || !Object.hasOwn(DAILY_RUN_TACTICS, key)) return rejected('daily_tactic_invalid');
  // The unique (run_id, modifier_id) slot makes a checkpoint choice immutable.
  // The write itself checks the persisted room, source pet and daily reservation.
  const row = await db.prepare(`INSERT OR IGNORE INTO telegram_pet_run_modifiers
    (run_id, pet_id, telegram_id, modifier_id, effects_json)
    SELECT r.run_id, r.pet_id, r.telegram_id, ?, ? FROM telegram_pet_runs r
    JOIN telegram_pet_daily_runs d ON d.run_id=r.run_id AND d.telegram_id=r.telegram_id AND d.pet_id=r.pet_id
    JOIN telegram_pet_instances p ON p.pet_id=r.pet_id AND p.telegram_id=r.telegram_id AND p.season_key=r.season_key
    WHERE r.run_id=? AND r.telegram_id=? AND r.current_room=? AND r.status IN ('active','extractable')
      AND EXISTS (SELECT 1 FROM telegram_pet_run_modifiers m WHERE m.run_id=r.run_id AND m.telegram_id=r.telegram_id AND m.modifier_id=?)
      AND NOT EXISTS (SELECT 1 FROM telegram_pet_run_rooms rr WHERE rr.run_id=r.run_id AND rr.room_number=r.current_room+1 AND rr.status<>'pending')
    RETURNING modifier_id`).bind(tacticSlot(checkpoint), JSON.stringify({ tactic_id: key, checkpoint }),
      request.run_id, owner, checkpoint, DAILY_RUN_RULES_ID).first();
  if (!row) return rejected('daily_tactic_stale');
  return { accepted: true, reason: 'daily_tactic_chosen', pet_xp_awarded: 0,
    result_copy: `${DAILY_RUN_TACTICS[key].title} selected. It affects the remaining rooms only.` };
}
