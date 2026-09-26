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
const has = (o, k) => Object.hasOwn(o, k);
const integer = (n) => Math.max(0, Math.floor(Number(n) || 0));
const day = (now) => now.toISOString().slice(0, 10);
function hash(value) { let n = 2166136261; for (const c of String(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0; }
export function createContractState(goal, build, tier, seed) {
  if (!has(CONTRACT_GOALS, goal) || !has(CONTRACT_BUILDS, build) || ![1, 2, 3].includes(tier)) return null;
  const b = CONTRACT_BUILDS[build];
  return { version: 1, goal, build, tier, seed, depth: 0, wins: 0, health: b.health, max_health: b.health,
    supplies: b.supplies, salvage: 0, perks: [], draft: [], last: 'Choose a route. Your contract is saved after every decision.' };
}
export function contractChoices(s) {
  const b = CONTRACT_BUILDS[s.build], perks = s.perks;
  const threat = (s.tier - 1) * 7 + s.depth * 2;
  const odds = (base) => Math.max(30, Math.min(98, base - threat));
  const shield = perks.includes('shield') ? 8 : 0, bonus = perks.includes('magnet') ? 10 : 0;
  return [
    { key: 'cover', title: 'TAKE COVER', odds: odds(90 + b.guard + (perks.includes('radar') ? 12 : 0)), salvage: 8 + bonus, damage: 15 + s.depth - shield, detail: 'A safer route with a smaller haul.' },
    { key: 'bold', title: 'BREAK THROUGH', odds: odds(74 + b.power + (perks.includes('boots') ? 15 : 0)), salvage: 27 + bonus, damage: 29 + s.depth - shield, detail: 'More salvage; heavier damage on failure.' },
    { key: 'search', title: 'SEARCH SIDE ROUTE', odds: odds(80 + b.guard + (perks.includes('radar') ? 12 : 0)), salvage: 19 + bonus + (s.build === 'scavenger' ? 6 : 0), damage: 21 + s.depth - shield, detail: 'Success also finds one supply.' },
    { key: 'rest', title: 'USE SUPPLY', odds: 100, salvage: 0, damage: 0, disabled: s.supplies < 1 || s.health >= s.max_health, detail: `Use 1 supply to heal ${perks.includes('pockets') ? 40 : 28}. Advances a room without a successful route.` },
  ];
}
export function contractGoalProgress(s) {
  return s.goal === 'scout' ? s.wins : s.goal === 'salvage' ? s.salvage : s.health;
}
export function advanceContract(value, action, roll) {
  const s = structuredClone(value);
  if (action === 'abandon') return { state: s, status: 'abandoned', rank_points: 0 };
  if (s.draft.length) {
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
    s.last = `Route cleared. +${choice.salvage} contract salvage.`;
  } else { s.health = Math.max(0, s.health - choice.damage); s.last = `Setback: -${choice.damage} route health. Keep going if you can.`; }
  s.depth++;
  let status = 'active';
  if (!s.health) { status = 'failed'; s.last = 'Route health exhausted. Another contract is available immediately.'; }
  else if (s.depth === CONTRACT_ROOMS) {
    status = contractGoalProgress(s) >= CONTRACT_GOALS[s.goal].target ? 'completed' : 'failed';
    s.last = status === 'completed' ? 'Contract complete. Rank recorded; choose another contract whenever you like.' : 'Route finished, but the contract goal was missed. Try a different build or route.';
  } else if (s.depth % 2 === 0) {
    s.draft = Object.keys(PERKS).filter((k) => !s.perks.includes(k)).sort((a, b) => hash(s.seed + s.depth + a) - hash(s.seed + s.depth + b)).slice(0, 3);
  }
  return { state: s, status, rank_points: status === 'completed' ? (40 + s.salvage + s.wins * 5) * s.tier : 0 };
}
function projection(row) {
  if (!row) return null;
  const s = JSON.parse(row.state_json), scene = SCENES[s.depth === 5 ? 7 : hash(s.seed + s.depth) % 7];
  return { contract_id: row.contract_id, pet_id: row.pet_id, revision: row.revision, sequence: row.sequence, status: row.status,
    goal: s.goal, title: CONTRACT_GOALS[s.goal].title, objective: CONTRACT_GOALS[s.goal].detail,
    build: s.build, build_title: CONTRACT_BUILDS[s.build].title, tier: s.tier, depth: s.depth, max_depth: CONTRACT_ROOMS,
    health: s.health, max_health: s.max_health, supplies: s.supplies, salvage: s.salvage,
    progress: contractGoalProgress(s), target: CONTRACT_GOALS[s.goal].target, last: s.last,
    room: { title: scene[0], detail: scene[1] }, perks: s.perks.map((key) => ({ key, ...PERKS[key] })),
    choices: row.status !== 'active' ? [] : s.draft.length ? s.draft.map((key) => ({ key, ...PERKS[key], upgrade: true })) : contractChoices(s),
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
  const [stats, rows, bonuses, pending] = await Promise.all([
    db.prepare(`SELECT COALESCE(MAX(sequence),0)+1 AS next_sequence, COALESCE(SUM(rank_points),0) AS rank_points,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed FROM telegram_pet_contracts WHERE telegram_id=? AND pet_id=? AND season_key=?`).bind(owner, petId, seasonKey).first(),
    db.prepare('SELECT * FROM telegram_pet_contracts WHERE telegram_id=? AND pet_id=? AND season_key=? ORDER BY sequence DESC LIMIT 1').bind(owner, petId, seasonKey).first(),
    db.prepare('SELECT COUNT(*) AS used FROM telegram_pet_contracts WHERE telegram_id=? AND reward_day=? AND reward_xp>0').bind(owner, day(now)).first(),
    db.prepare(`SELECT contract_id FROM telegram_pet_contracts WHERE telegram_id=? AND pet_id=? AND season_key=? AND reward_xp>0 AND reward_settled=0 ORDER BY sequence LIMIT 10`).bind(owner, petId, seasonKey).all(),
  ]);
  const completed = integer(stats?.completed), points = integer(stats?.rank_points);
  return { available: true, pet_id: petId, next_sequence: stats.next_sequence, completed, rank_points: points,
    rank: 1 + Math.floor(points / 500), next_rank_at: (1 + Math.floor(points / 500)) * 500,
    max_tier: completed >= 15 ? 3 : completed >= 5 ? 2 : 1,
    bonus_remaining: Math.max(0, CONTRACT_BONUS_LIMIT - integer(bonuses?.used)), bonus_limit: CONTRACT_BONUS_LIMIT, bonus_xp: CONTRACT_BONUS_XP,
    pending_rewards: pending.results || [], offers: Object.entries(CONTRACT_GOALS).map(([key, goal]) => ({ key, ...goal })),
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
    const s = createContractState(request.goal, request.build, request.tier, crypto.randomUUID());
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
