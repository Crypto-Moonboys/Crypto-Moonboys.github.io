// Authenticated, server-owned quests. Never accept a client's state, seed, roll or reward.
export const CONTRACT_BONUS_LIMIT = 3;
export const CONTRACT_BONUS_XP = 20;
export const CONTRACT_ROOMS = 6;
export const CONTRACT_GOALS = Object.freeze({
  scout: { title: 'MAP THE BACKSTREETS', detail: 'Finish six rooms with at least four successful routes.', target: 4 },
  salvage: { title: 'RECOVER THE LOST TECH', detail: 'Finish six rooms carrying at least 65 salvage.', target: 65 },
  escort: { title: 'BRING THE COURIER HOME', detail: 'Finish six rooms with at least 50 route health.', target: 50 },
});
export const CONTRACT_BUILDS = Object.freeze({
  scout: { title: 'SCOUT', detail: 'Safer cover/search routes. 90 health, 2 supplies.', health: 90, supplies: 2, guard: 8, power: 0 },
  bruiser: { title: 'BRUISER', detail: 'Stronger bold routes. 110 health, 1 supply.', health: 110, supplies: 1, guard: 0, power: 12 },
  scavenger: { title: 'SCAVENGER', detail: '+6 salvage on search. 90 health, 3 supplies.', health: 90, supplies: 3, guard: 2, power: 2 },
});
export const CONTRACT_SIDE_GOALS = Object.freeze({
  none: { title: 'MAIN GOAL ONLY', detail: 'Focus on the main contract goal.', target: 0 },
  versatile: { title: 'ALL ROUTES', detail: 'Succeed with cover, bold and search at least once each.', target: 3 },
  daredevil: { title: 'DAREDEVIL', detail: 'Clear three bold routes.', target: 3 },
  stocked: { title: 'WELL SUPPLIED', detail: 'Finish carrying at least five supplies.', target: 5 },
});
export const CONTRACT_SIDE_RANK = 60;
const PERKS = Object.freeze({
  shield: { title: 'SCRAP SHIELD', detail: 'Failure damage -8.' },
  radar: { title: 'ROUTE RADAR', detail: 'Cover/search odds +12 percentage points.' },
  boots: { title: 'STREET BOOTS', detail: 'Bold odds +15 percentage points.' },
  medkit: { title: 'FIELD MEDIC', detail: 'Heal 35 now; maximum health +15.' },
  pockets: { title: 'SUPPLY CACHE', detail: 'Gain 2 supplies; rest heals 12 more.' },
  magnet: { title: 'SALVAGE MAGNET', detail: '+10 salvage on successful routes.' },
});
const SCENES = Object.freeze([
  ['Neon Crossing', 'A patrol blocks the crossing. Cover saves risk; a direct push finds more salvage.'],
  ['Sealed Depot', 'Lost tech is trapped inside. Search the crates or take the service passage.'],
  ['Rooftop Gap', 'A damaged bridge exposes the route. Commit, scout the ledge or use a supply.'],
  ['Graffiti Junction', 'A rival crew guards the wall. Choose how much of your kit to risk.'],
  ['Tunnel Signal', 'A false signal splits the tunnel. Search costs more risk than taking cover.'],
  ['Shuttered Market', 'Shutters rattle above a stash. The quiet path leaves most salvage behind.'],
  ['Power Cut', 'The street goes dark. Save your health or push through before the lights return.'],
  ['Courier Checkpoint', 'The final barrier is ahead. Check your goal before committing.'],
]);
// Applied to v2 and v3 contracts. Preview and resolution share these modifiers.
const SCENE_RULES = Object.freeze([
  { detail: 'Patrol: cover +8pp clear chance; bold -6pp and +5 failure damage.', cover: { odds: 8 }, bold: { odds: -6, damage: 5 } },
  { detail: 'Tech cache: search +8 salvage; bold +4pp clear chance.', search: { salvage: 8 }, bold: { odds: 4 } },
  { detail: 'Exposed bridge: bold +8pp clear chance and +5 failure damage; search -6pp.', bold: { odds: 8, damage: 5 }, search: { odds: -6 } },
  { detail: 'Rival stash: bold +10 salvage; cover -5pp clear chance.', bold: { salvage: 10 }, cover: { odds: -5 } },
  { detail: 'False signal: cover +6pp clear chance; search -8pp but +9 salvage.', cover: { odds: 6 }, search: { odds: -8, salvage: 9 } },
  { detail: 'Hidden stock: search +6pp clear chance and +8 salvage.', search: { odds: 6, salvage: 8 } },
  { detail: 'Blackout: cover -6pp clear chance; search +5pp; bold +5 salvage.', cover: { odds: -6 }, search: { odds: 5 }, bold: { salvage: 5 } },
  { detail: 'Final barrier: cover +4pp clear chance; bold -4pp, +4 failure damage and +10 salvage.', cover: { odds: 4 }, bold: { odds: -4, damage: 4, salvage: 10 } },
]);
const has = (o, k) => Object.hasOwn(o, k);
const integer = (n) => Math.max(0, Math.floor(Number(n) || 0));
const day = (now) => now.toISOString().slice(0, 10);
function hash(value) { let n = 2166136261; for (const c of String(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0; }
export function contractRoom(s) {
  const index = s.depth >= CONTRACT_ROOMS - 1 ? 7 : hash(s.seed + s.depth) % 7;
  return { title: SCENES[index][0], detail: SCENES[index][1], rule: [2, 3, 4].includes(s.version) ? SCENE_RULES[index] : null };
}
export function createContractState(goal, build, tier, seed, sideGoal = 'none') {
  if (typeof goal !== 'string' || typeof build !== 'string' || typeof sideGoal !== 'string'
    || !has(CONTRACT_GOALS, goal) || !has(CONTRACT_BUILDS, build) || !has(CONTRACT_SIDE_GOALS, sideGoal) || ![1, 2, 3].includes(tier)) return null;
  const b = CONTRACT_BUILDS[build];
  return { version: 4, preparation: null, goal, build, tier, seed, side_goal: sideGoal, route_wins: { cover: 0, bold: 0, search: 0 }, depth: 0, wins: 0, health: b.health, max_health: b.health,
    supplies: b.supplies, salvage: 0, perks: [], draft: [], last: 'Choose a route. Your contract is saved after every decision.' };
}
export function contractChoices(s) {
  const b = CONTRACT_BUILDS[s.build], perks = s.perks;
  const threat = (s.tier - 1) * 7 + s.depth * 2;
  const rules = contractRoom(s).rule || {};
  const prepared = [3, 4].includes(s.version) && s.preparation === 'prepare_scout';
  const odds = (key, base) => Math.max(30, Math.min(98, base - threat + (rules[key]?.odds || 0) + (prepared ? 10 : 0)));
  const shield = perks.includes('shield') ? 8 : 0, bonus = perks.includes('magnet') ? 10 : 0;
  return [
    { key: 'cover', title: 'TAKE COVER', odds: odds('cover', 90 + b.guard + (perks.includes('radar') ? 12 : 0)), salvage: 8 + bonus, damage: 15 + s.depth - shield, detail: 'A safer route with a smaller haul.' },
    { key: 'bold', title: 'BREAK THROUGH', odds: odds('bold', 74 + b.power + (perks.includes('boots') ? 15 : 0)), salvage: 27 + bonus, damage: 29 + s.depth - shield, detail: 'More salvage; heavier damage on failure.' },
    { key: 'search', title: 'SEARCH SIDE ROUTE', odds: odds('search', 80 + b.guard + (perks.includes('radar') ? 12 : 0)), salvage: 19 + bonus + (s.build === 'scavenger' ? 6 : 0), damage: 21 + s.depth - shield, detail: 'Success also finds one supply.' },
    { key: 'rest', title: 'USE SUPPLY', odds: 100, salvage: 0, damage: 0, disabled: s.supplies < 1 || s.health >= s.max_health, detail: `Use 1 supply to heal ${perks.includes('pockets') ? 40 : 28}. Advances a room without a successful route.` },
  ].map((choice) => ({ ...choice, salvage: choice.salvage + (rules[choice.key]?.salvage || 0), damage: choice.damage + (rules[choice.key]?.damage || 0) }));
}
export function contractPreparations(s) {
  if (![3, 4].includes(s.version) || s.depth >= CONTRACT_ROOMS || s.health <= 0 || s.draft.length || s.preparation) return [];
  return [
    { key: 'prepare_scout', title: 'SCOUT AHEAD', disabled: s.supplies < 2, detail: 'Spend 2 supplies: +10 percentage points to route clear chances in this room, capped at 98%. No room advance.' },
    { key: 'prepare_patch', title: 'FIELD PATCH', disabled: s.salvage < 20 || s.health >= s.max_health, detail: 'Spend 20 salvage: heal up to 25 route HP now. No room advance. Spent salvage no longer counts toward the goal or rank.' },
  ];
}
export function contractGoalProgress(s) {
  return s.goal === 'scout' ? s.wins : s.goal === 'salvage' ? s.salvage : s.health;
}
export function contractSideProgress(s) {
  if (![2, 3, 4].includes(s.version) || s.side_goal === 'none') return null;
  const goal = CONTRACT_SIDE_GOALS[s.side_goal];
  const progress = s.side_goal === 'versatile' ? Object.values(s.route_wins).filter((n) => n > 0).length
    : s.side_goal === 'daredevil' ? s.route_wins.bold : s.supplies;
  return { key: s.side_goal, ...goal, progress, reached: progress >= goal.target, rank_points: CONTRACT_SIDE_RANK * s.tier };
}
export function advanceContract(value, action, roll) {
  const s = structuredClone(value);
  if (s.depth >= CONTRACT_ROOMS || s.health <= 0) return null;
  if (action === 'abandon') return { state: s, status: 'abandoned', rank_points: 0 };
  const preparation = contractPreparations(s).find((entry) => entry.key === action);
  if (preparation) {
    if (preparation.disabled) return null;
    s.preparation = action;
    if (action === 'prepare_scout') s.supplies -= 2;
    else { s.salvage -= 20; s.health = Math.min(s.max_health, s.health + 25); }
    s.last = action === 'prepare_scout' ? 'Scouted ahead. This room’s route odds now include +10 percentage points.' : 'Field patch applied. Spent 20 salvage to restore route health.';
    return { state: s, status: 'active', rank_points: 0 };
  }
  if (s.draft.length) {
    if (s.version === 4 && action === 'supply_cache') {
      s.supplies += 2; s.draft = [];
      s.last = 'Took 2 contract supplies instead of an upgrade. Use them to heal, scout or pursue the supply objective.';
      return { state: s, status: 'active', rank_points: 0 };
    }
    if (!s.draft.includes(action)) return null;
    s.perks.push(action); s.draft = [];
    if (action === 'medkit') { s.max_health += 15; s.health = Math.min(s.max_health, s.health + 35); }
    if (action === 'pockets') s.supplies += 2;
    s.last = `${PERKS[action].title} installed for this contract.`;
    return { state: s, status: 'active', rank_points: 0 };
  }
  const choice = contractChoices(s).find((c) => c.key === action);
  if (!choice || choice.disabled || !Number.isInteger(roll) || roll < 0 || roll >= 100) return null;
  if (action === 'rest') {
    s.supplies--; s.health = Math.min(s.max_health, s.health + (s.perks.includes('pockets') ? 40 : 28));
    s.last = 'Used one supply and moved on. No salvage or route-clear credit.';
  } else if (roll < choice.odds) {
    s.wins++; s.salvage += choice.salvage; if (action === 'search') s.supplies++;
    if ([2, 3, 4].includes(s.version)) s.route_wins[action]++;
    s.last = `Route cleared. +${choice.salvage} contract salvage.`;
  } else { s.health = Math.max(0, s.health - choice.damage); s.last = `Setback: -${choice.damage} route health. Keep going if you can.`; }
  s.depth++;
  if ([3, 4].includes(s.version)) s.preparation = null;
  let status = 'active';
  if (!s.health) { status = 'failed'; s.last = 'Route health exhausted. Another contract is available immediately.'; }
  else if (s.depth === CONTRACT_ROOMS) {
    status = contractGoalProgress(s) >= CONTRACT_GOALS[s.goal].target ? 'completed' : 'failed';
    s.last = status === 'completed' ? 'Contract complete. Rank recorded; choose another contract whenever you like.' : 'Route finished, but the contract goal was missed. Try a different build or route.';
  } else if (s.depth % 2 === 0) {
    s.draft = Object.keys(PERKS).filter((k) => !s.perks.includes(k)).sort((a, b) => hash(s.seed + s.depth + a) - hash(s.seed + s.depth + b)).slice(0, 3);
  }
  const side = contractSideProgress(s);
  return { state: s, status, rank_points: status === 'completed' ? (40 + s.salvage + s.wins * 5) * s.tier + (side?.reached ? side.rank_points : 0) : 0 };
}
function projection(row) {
  if (!row) return null;
  const s = JSON.parse(row.state_json), room = contractRoom(s), side = contractSideProgress(s);
  return { contract_id: row.contract_id, pet_id: row.pet_id, revision: row.revision, sequence: row.sequence, status: row.status,
    goal: s.goal, title: CONTRACT_GOALS[s.goal].title, objective: CONTRACT_GOALS[s.goal].detail,
    build: s.build, build_title: CONTRACT_BUILDS[s.build].title, tier: s.tier, depth: s.depth, max_depth: CONTRACT_ROOMS,
    health: s.health, max_health: s.max_health, supplies: s.supplies, salvage: s.salvage,
    progress: contractGoalProgress(s), target: CONTRACT_GOALS[s.goal].target, last: s.last,
    room: { title: room.title, detail: room.detail, effect: room.rule?.detail || '' }, perks: s.perks.map((key) => ({ key, ...PERKS[key] })),
    side_goal: side ? { ...side, earned: row.status === 'completed' && side.reached } : null,
    preparation: [3, 4].includes(s.version) ? s.preparation : null,
    preparations: row.status === 'active' ? contractPreparations(s) : [],
    choices: row.status !== 'active' ? [] : s.draft.length ? [...s.draft.map((key) => ({ key, ...PERKS[key], upgrade: true })), ...(s.version === 4 ? [{ key: 'supply_cache', title: 'TAKE SUPPLY CACHE', upgrade: true, detail: 'Take 2 contract supplies instead of an upgrade. Spend them on healing or scouting, or save them for Well Supplied. No room advance, pet item, XP or currency.' }] : [])] : contractChoices(s),
    rank_points: row.rank_points, reward_pending: row.reward_xp > 0 && !row.reward_settled, xp_awarded: row.xp_awarded };
}
async function authority(db, owner, petId, seasonKey) {
  return db.prepare(`SELECT p.pet_id FROM telegram_pet_instances p JOIN telegram_pet_active_slots a
    ON a.pet_id=p.pet_id AND a.telegram_id=p.telegram_id AND a.season_key=p.season_key
    JOIN telegram_pet_lifecycle_by_pet l ON l.pet_id=p.pet_id AND l.telegram_id=p.telegram_id
    WHERE p.telegram_id=? AND p.pet_id=? AND p.season_key=? AND p.status='active' AND l.phase<>'egg'`).bind(owner, petId, seasonKey).first();
}
const ACTIVE_GUARD = `EXISTS (SELECT 1 FROM telegram_pet_active_slots a JOIN telegram_pet_instances p
  ON p.pet_id=a.pet_id AND p.telegram_id=a.telegram_id AND p.season_key=a.season_key
  JOIN telegram_pet_lifecycle_by_pet l ON l.pet_id=p.pet_id AND l.telegram_id=p.telegram_id
  WHERE a.telegram_id=? AND a.pet_id=? AND a.season_key=? AND p.status='active' AND l.phase<>'egg')`;
export async function getContractBoard(db, owner, pet, now = new Date()) {
  const petId = pet?.pet_id, seasonKey = pet?.season_key;
  if (!petId || !seasonKey || !await authority(db, owner, petId, seasonKey)) return { available: false, reason: 'hatch_required' };
  const [stats, rows, bonuses, pending, mastery] = await Promise.all([
    db.prepare(`SELECT COALESCE(MAX(sequence),0)+1 AS next_sequence, COALESCE(SUM(rank_points),0) AS rank_points,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed FROM telegram_pet_contracts WHERE telegram_id=? AND pet_id=? AND season_key=?`).bind(owner, petId, seasonKey).first(),
    db.prepare('SELECT * FROM telegram_pet_contracts WHERE telegram_id=? AND pet_id=? AND season_key=? ORDER BY sequence DESC LIMIT 1').bind(owner, petId, seasonKey).first(),
    db.prepare('SELECT COUNT(*) AS used FROM telegram_pet_contracts WHERE telegram_id=? AND reward_day=? AND reward_xp>0').bind(owner, day(now)).first(),
    db.prepare(`SELECT contract_id FROM telegram_pet_contracts WHERE telegram_id=? AND pet_id=? AND season_key=? AND reward_xp>0 AND reward_settled=0 ORDER BY sequence LIMIT 10`).bind(owner, petId, seasonKey).all(),
    db.prepare(`SELECT json_extract(state_json,'$.goal') AS goal, json_extract(state_json,'$.build') AS build,
      json_extract(state_json,'$.tier') AS tier, COUNT(*) AS completed, MAX(rank_points) AS best_rank_points
      FROM telegram_pet_contracts WHERE telegram_id=? AND pet_id=? AND season_key=? AND status='completed'
      GROUP BY json_extract(state_json,'$.goal'), json_extract(state_json,'$.build'), json_extract(state_json,'$.tier')`).bind(owner, petId, seasonKey).all(),
  ]);
  const completed = integer(stats?.completed), points = integer(stats?.rank_points);
  const maxTier = completed >= 15 ? 3 : completed >= 5 ? 2 : 1;
  const records = [1, 2, 3].flatMap((tier) => Object.entries(CONTRACT_GOALS).flatMap(([goal, definition]) => Object.entries(CONTRACT_BUILDS).map(([build, setup]) => {
    const record = (mastery.results || []).find((entry) => entry.goal === goal && entry.build === build && Number(entry.tier) === tier);
    return { key: `${goal}:${build}:${tier}`, goal, build, tier, title: definition.title, build_title: setup.title,
      unlocked: tier <= maxTier, completed: integer(record?.completed), best_rank_points: integer(record?.best_rank_points) };
  })));
  return { available: true, pet_id: petId, next_sequence: stats.next_sequence, completed, rank_points: points,
    rank: 1 + Math.floor(points / 500), next_rank_at: (1 + Math.floor(points / 500)) * 500,
    max_tier: maxTier,
    collection: { cleared_routes: records.filter((record) => record.completed > 0).length, total_routes: records.length,
      unlocked_routes: records.filter((record) => record.unlocked).length,
      next_route: records.find((record) => record.unlocked && record.completed === 0) || null, records },
    bonus_remaining: Math.max(0, CONTRACT_BONUS_LIMIT - integer(bonuses?.used)), bonus_limit: CONTRACT_BONUS_LIMIT, bonus_xp: CONTRACT_BONUS_XP,
    pending_rewards: pending.results || [], offers: Object.entries(CONTRACT_GOALS).map(([key, goal]) => {
      const entries = (mastery.results || []).filter((entry) => entry.goal === key);
      return { key, ...goal, completed: entries.reduce((sum, record) => sum + integer(record.completed), 0),
        best_rank_points: entries.reduce((best, record) => Math.max(best, integer(record.best_rank_points)), 0) };
    }),
    side_goals: Object.entries(CONTRACT_SIDE_GOALS).map(([key, goal]) => ({ key, ...goal })), side_rank: CONTRACT_SIDE_RANK,
    builds: Object.entries(CONTRACT_BUILDS).map(([key, b]) => ({ key, title: b.title, detail: b.detail })), run: projection(rows) };
}
async function settleBonus(db, owner, row, award, now) {
  if (!row || !row.reward_xp || row.reward_settled) return { pet_xp_awarded: 0 };
  const result = await award(db, { telegram_id: owner, pet_id: row.pet_id, season_key: row.season_key,
    source: 'pet_contract', idempotency_key: row.contract_id, event_key: `contract:${row.contract_id}`,
    event_type: 'contract_complete', reason: 'contract_bonus', rewards: { pet_xp: CONTRACT_BONUS_XP }, now,
    context: { contract_id: row.contract_id, pet_id: row.pet_id, season_key: row.season_key } });
  const receipt = await db.prepare(`SELECT applied_rewards FROM telegram_pet_reward_claims
    WHERE telegram_id=? AND pet_id=? AND source='pet_contract' AND idempotency_key=? AND status='awarded'`)
    .bind(owner, row.pet_id, row.contract_id).first();
  if (receipt) {
    const credited = Math.min(CONTRACT_BONUS_XP, integer(JSON.parse(receipt.applied_rewards).pet_xp));
    await db.prepare(`UPDATE telegram_pet_contracts SET reward_settled=1, xp_awarded=? WHERE contract_id=? AND telegram_id=? AND pet_id=? AND season_key=? AND reward_settled=0`)
      .bind(credited, row.contract_id, owner, row.pet_id, row.season_key).run();
  }
  return { pet_xp_awarded: integer(result.pet_xp_awarded), reward_pending: !receipt };
}
export async function processContractAction(db, owner, pet, request, award, now = new Date()) {
  const petId = pet?.pet_id, seasonKey = pet?.season_key;
  const reject = (reason) => ({ accepted: false, reason, pet_xp_awarded: 0 });
  if (!petId || !seasonKey || request.pet_id !== petId || !await authority(db, owner, petId, seasonKey)) return reject('contract_pet_changed');
  let row;
  if (request.action === 'contract_start') {
    const board = await getContractBoard(db, owner, pet, now);
    if (board.run?.status === 'active') return reject('contract_active');
    if (!Number.isSafeInteger(request.sequence) || request.sequence !== board.next_sequence) return reject('contract_stale');
    const s = createContractState(request.goal, request.build, request.tier, crypto.randomUUID(), request.side_goal);
    if (!s || request.tier > board.max_tier) return reject('contract_invalid_choice');
    row = await db.prepare(`INSERT OR IGNORE INTO telegram_pet_contracts
      (contract_id,pet_id,telegram_id,season_key,sequence,status,state_json)
      SELECT ?,?,?,?,?,'active',? WHERE ${ACTIVE_GUARD}
      AND ?=(SELECT COALESCE(MAX(sequence),0)+1 FROM telegram_pet_contracts WHERE telegram_id=? AND pet_id=? AND season_key=?) RETURNING *`)
      .bind(crypto.randomUUID(), petId, owner, seasonKey, request.sequence, JSON.stringify(s), owner, petId, seasonKey, request.sequence, owner, petId, seasonKey).first();
    return row ? { accepted: true, reason: 'contract_started', result_copy: s.last } : reject('contract_stale');
  }
  row = await db.prepare('SELECT * FROM telegram_pet_contracts WHERE contract_id=? AND telegram_id=? AND pet_id=? AND season_key=?').bind(String(request.contract_id || ''), owner, petId, seasonKey).first();
  if (!row) return reject('contract_not_found');
  if (request.action === 'contract_claim') {
    try { return { accepted: true, reason: 'contract_bonus_checked', ...await settleBonus(db, owner, row, award, now) }; }
    catch { return { accepted: true, reason: 'contract_bonus_pending', reward_pending: true, pet_xp_awarded: 0 }; }
  }
  if (request.action !== 'contract_step' || row.status !== 'active' || request.revision !== row.revision) return reject('contract_stale');
  const roll = crypto.getRandomValues(new Uint32Array(1))[0] % 100;
  const next = advanceContract(JSON.parse(row.state_json), request.choice, roll);
  if (!next) return reject('contract_invalid_choice');
  const completed = next.status === 'completed';
  // One compare-and-swap both commits the move and reserves the account/day bonus.
  // Concurrent finishes on different pets cannot reserve a fourth bonus.
  const changed = await db.prepare(`UPDATE telegram_pet_contracts SET state_json=?, status=?, rank_points=?, revision=revision+1,
    reward_xp=CASE WHEN ?=1 AND (SELECT COUNT(*) FROM telegram_pet_contracts WHERE telegram_id=? AND reward_day=? AND reward_xp>0) < 3 THEN 20 ELSE 0 END,
    reward_day=CASE WHEN ?=1 THEN ? ELSE NULL END, updated_at=CURRENT_TIMESTAMP
    WHERE contract_id=? AND telegram_id=? AND pet_id=? AND season_key=? AND revision=? AND status='active' AND ${ACTIVE_GUARD} RETURNING *`)
    .bind(JSON.stringify(next.state), next.status, next.rank_points, completed ? 1 : 0, owner, day(now), completed ? 1 : 0, day(now), row.contract_id, owner, petId, seasonKey, request.revision, owner, petId, seasonKey).first();
  if (!changed) return reject('contract_stale');
  let bonus = {};
  try { bonus = await settleBonus(db, owner, changed, award, now); }
  catch { bonus = { reward_pending: changed.reward_xp > 0, pet_xp_awarded: 0 }; }
  return { accepted: true, reason: `contract_${next.status}`, result_copy: next.state.last, ...bonus };
}
