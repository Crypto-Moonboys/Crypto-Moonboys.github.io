import { readOwnedRelics, initializeRelicRoute, relicRouteChoices, relicRouteSuccess, relicSearchSalvage, relicNames } from './relic-passives.js';
import { requirePetFirstReadResult, requirePetReadResult } from './read-result.js';
// Authenticated, server-owned quests. Never accept a client's state, seed, roll or reward.
export const CONTRACT_BONUS_LIMIT = 3;
export const CONTRACT_BONUS_XP = 20;
export const CONTRACT_ROOMS = 6;
export const CONTRACT_FORMATS = Object.freeze({
  standard: { title: 'STANDARD ROUTE', rooms: CONTRACT_ROOMS, detail: '6 rooms, 2 upgrade drafts. Finish the whole route to earn rank.' },
  extended: { title: 'LONG ROUTE', rooms: 10, detail: '10 rooms, 4 upgrade drafts. Later rooms grow harder. Same daily XP bonus; more salvage opportunities.' },
});
export const CONTRACT_GOALS = Object.freeze({
  scout: { title: 'MAP THE BACKSTREETS', detail: 'Finish six rooms with at least four successful routes.', target: 4, extended_target: 7 },
  salvage: { title: 'RECOVER THE LOST TECH', detail: 'Finish six rooms carrying at least 65 salvage.', target: 65, extended_target: 120 },
  escort: { title: 'BRING THE COURIER HOME', detail: 'Finish six rooms with at least 50 route health.', target: 50, extended_target: 50 },
  breach: { title: 'BREAK THE BLOCKADE', detail: 'Finish six rooms with at least three successful bold routes.', target: 3, extended_target: 5 },
  recon: { title: 'TRACE THE LOST SIGNAL', detail: 'Finish six rooms with at least three successful search routes.', target: 3, extended_target: 5 },
  resupply: { title: 'RESTOCK THE CREW', detail: 'Finish six rooms carrying at least five supplies.', target: 5, extended_target: 8 },
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
export const CONTRACT_REDRAW_COST = 15;
const PATHS = Object.freeze({
  path_quiet: { title: 'QUIET STREETS', detail: '+8pp clear chance, -5 salvage per success, -4 failure damage.', odds: 8, salvage: -5, damage: -4 },
  path_hazard: { title: 'SALVAGE HOTSPOT', detail: '-8pp clear chance, +10 salvage per success, +4 failure damage.', odds: -8, salvage: 10, damage: 4 },
  path_steady: { title: 'STAY ON COURSE', detail: 'Keep normal odds, salvage and damage.', odds: 0, salvage: 0, damage: 0 },
});
function activePath(s) { return [7, 8, 9].includes(s.version) && s.path?.remaining > 0 && has(PATHS, s.path.key) ? { key: s.path.key, ...PATHS[s.path.key], remaining: s.path.remaining } : null; }
export function contractPathChoices(s) {
  if (![7, 8, 9].includes(s.version) || !s.path_offer || s.draft.length || s.health <= 0 || s.depth >= contractLength(s)) return [];
  return Object.entries(PATHS).map(([key, path]) => ({ key, title: path.title, detail: 'Next 2 rooms: ' + path.detail }));
}
// Final bosses change the last room only; older saves keep their original ending.
const BOSSES = Object.freeze({
  warden: { title: 'SHIELD WARDEN', detail: 'The Warden locks down the exit. Flanking has better cover odds; breaking its guard risks a heavy hit for extra salvage.',
    tactics: { cover: 'FLANK THE SHIELD', bold: 'BREAK THE GUARD', search: 'CUT THE POWER' },
    rule: { detail: 'Warden: cover +10pp and -4 failure damage; bold -8pp, +12 salvage and +6 failure damage; search +4pp and +6 salvage.', cover: { odds: 10, damage: -4 }, bold: { odds: -8, salvage: 12, damage: 6 }, search: { odds: 4, salvage: 6 } } },
  hound: { title: 'SIGNAL HOUND', detail: 'A tracking machine follows your signal. Searching for its relay is favoured; hiding from its sensors is less reliable.',
    tactics: { cover: 'HIDE THE SIGNAL', bold: 'RUSH THE TRACKER', search: 'JAM THE RELAY' },
    rule: { detail: 'Hound: search +12pp and +8 salvage; cover -4pp and +2 failure damage; bold +6pp and +4 failure damage.', search: { odds: 12, salvage: 8 }, cover: { odds: -4, damage: 2 }, bold: { odds: 6, damage: 4 } } },
  breaker: { title: 'VAULT BREAKER', detail: 'A salvage rig guards the haul. A direct strike exploits its exposed drive; searching its vault is riskier but profitable.',
    tactics: { cover: 'DODGE THE RIG', bold: 'STRIKE THE DRIVE', search: 'RAID THE VAULT' },
    rule: { detail: 'Breaker: bold +10pp and +10 salvage; cover +4pp and -2 salvage; search -8pp, +12 salvage and +4 failure damage.', bold: { odds: 10, salvage: 10 }, cover: { odds: 4, salvage: -2 }, search: { odds: -8, salvage: 12, damage: 4 } } },
});
export function contractBoss(s) {
  if (![8, 9].includes(s.version)) return null;
  const key = ['recon', 'resupply'].includes(s.goal) ? 'hound' : ['salvage', 'breach'].includes(s.goal) ? 'breaker' : 'warden';
  return { key, ...BOSSES[key] };
}
function finalBoss(s) { return s.depth === contractLength(s) - 1 ? contractBoss(s) : null; }
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
// Applied to v2 and later contracts. Preview and resolution share these modifiers.
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
const FIELD_ENCOUNTERS = Object.freeze([
  { key: 'trader', title: 'ROADSIDE QUARTERMASTER', detail: 'Trade salvage for supplies, or sell spare kit before the next stretch.', choices: [
    { key: 'field_buy_supplies', title: 'BUY 2 SUPPLIES', salvage: -18, supplies: 2 },
    { key: 'field_sell_supplies', title: 'SELL 2 SUPPLIES', salvage: 16, supplies: -2 },
  ] },
  { key: 'medic', title: 'COURIER AID STATION', detail: 'Use your kit to recover, or take a rough detour for salvage.', choices: [
    { key: 'field_aid', title: 'USE AID STATION', supplies: -1, health: 18 },
    { key: 'field_detour', title: 'TAKE ROUGH DETOUR', health: -10, salvage: 14 },
  ] },
  { key: 'rig', title: 'ABANDONED SALVAGE RIG', detail: 'Spend kit to recover a haul, or use the workshop to repair route damage.', choices: [
    { key: 'field_recover', title: 'RECOVER THE HAUL', supplies: -1, salvage: 18 },
    { key: 'field_repair', title: 'USE THE WORKSHOP', salvage: -14, health: 22 },
  ] },
]);
export function contractFieldEncounter(s) {
  if (s.version !== 9 || !s.field_pending || s.draft.length || s.health <= 0 || s.depth <= 0 || s.depth % 2 || s.depth >= contractLength(s)) return null;
  const encounter = FIELD_ENCOUNTERS[hash(s.seed + ':field:' + s.depth) % FIELD_ENCOUNTERS.length];
  const choices = encounter.choices.map((choice) => {
    const health = choice.health > 0 ? Math.min(choice.health, s.max_health - s.health) : choice.health || 0;
    const delta = { health, supplies: choice.supplies || 0, salvage: choice.salvage || 0 };
    const reasons = [];
    if (s.salvage + delta.salvage < 0) reasons.push(`Requires ${-delta.salvage} salvage.`);
    if (s.supplies + delta.supplies < 0) reasons.push(`Requires ${-delta.supplies} supplies.`);
    if (s.health + delta.health < 1) reasons.push(`Requires more than ${-delta.health} route HP.`);
    if (choice.health > 0 && health === 0) reasons.push('Route HP is already full.');
    const detail = Object.entries(delta).filter(([key, value]) => value !== 0 || key === 'health' && choice.health > 0).map(([key, value]) => `${value >= 0 ? '+' : ''}${value} ${key === 'health' ? 'route HP' : key}`).join(' // ');
    return { key: choice.key, title: choice.title, delta, disabled: reasons.length > 0, detail: [detail, ...reasons].join(' // ') };
  });
  choices.push({ key: 'field_leave', title: 'LEAVE EVERYTHING', delta: { health: 0, supplies: 0, salvage: 0 }, disabled: false, detail: 'Keep your resources and continue. No room advance.' });
  return { key: encounter.key, title: encounter.title, detail: encounter.detail, checkpoint: s.depth, choices };
}
const integer = (n) => Math.max(0, Math.floor(Number(n) || 0));
const day = (now) => now.toISOString().slice(0, 10);
function hash(value) { let n = 2166136261; for (const c of String(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0; }
function formatKey(s) { return [6, 7, 8, 9].includes(s.version) && s.format === 'extended' ? 'extended' : 'standard'; }
export function contractLength(s) { return CONTRACT_FORMATS[formatKey(s)].rooms; }
export function contractObjective(s) {
  const goal = CONTRACT_GOALS[s.goal];
  const ending = [8, 9].includes(s.version) ? ' Clear the final boss route to complete the contract.' : '';
  if (formatKey(s) === 'standard') return { title: goal.title, detail: goal.detail + ending, target: goal.target };
  const target = goal.extended_target;
  const requirement = {
    scout: `${target} successful routes`, salvage: `${target} salvage`, escort: `${target} route health`,
    breach: `${target} successful bold routes`, recon: `${target} successful search routes`, resupply: `${target} supplies`,
  }[s.goal];
  return { title: goal.title, detail: `Finish ten rooms with at least ${requirement}.` + ending, target };
}
export function contractRoom(s) {
  const boss = finalBoss(s);
  if (boss) return { title: boss.title, detail: boss.detail, rule: boss.rule };
  const index = s.depth >= contractLength(s) - 1 ? 7 : hash(s.seed + s.depth) % 7;
  return { title: SCENES[index][0], detail: SCENES[index][1], rule: [2, 3, 4, 5, 6, 7, 8, 9].includes(s.version) ? SCENE_RULES[index] : null };
}
export function createContractState(goal, build, tier, seed, sideGoal = 'none', format = 'standard') {
  if (typeof goal !== 'string' || typeof build !== 'string' || typeof sideGoal !== 'string'
    || typeof format !== 'string' || !has(CONTRACT_FORMATS, format)
    || !has(CONTRACT_GOALS, goal) || !has(CONTRACT_BUILDS, build) || !has(CONTRACT_SIDE_GOALS, sideGoal) || ![1, 2, 3].includes(tier)) return null;
  const b = CONTRACT_BUILDS[build];
  return { version: 9, field_pending: false, field_result: null, boss_result: null, format, path_offer: false, path: null, draft_redrawn: false, preparation: null, goal, build, tier, seed, side_goal: sideGoal, route_wins: { cover: 0, bold: 0, search: 0 }, depth: 0, wins: 0, health: b.health, max_health: b.health,
    supplies: b.supplies, salvage: 0, perks: [], draft: [], last: 'Choose a route. Your contract is saved after every decision.' };
}
export function contractChoices(s) {
  const b = CONTRACT_BUILDS[s.build], perks = s.perks, boss = finalBoss(s);
  const threat = (s.tier - 1) * 7 + s.depth * 2;
  const rules = contractRoom(s).rule || {}, path = activePath(s) || {};
  const prepared = [3, 4, 5, 6, 7, 8, 9].includes(s.version) && s.preparation === 'prepare_scout';
  const odds = (key, base) => Math.max(30, Math.min(98, base - threat + (rules[key]?.odds || 0) + (path.odds || 0) + (prepared ? 10 : 0)));
  const shield = perks.includes('shield') ? 8 : 0, bonus = perks.includes('magnet') ? 10 : 0;
  const choices = [
    { key: 'cover', title: 'TAKE COVER', odds: odds('cover', 90 + b.guard + (perks.includes('radar') ? 12 : 0)), salvage: 8 + bonus, damage: 15 + s.depth - shield, detail: 'A safer route with a smaller haul.' },
    { key: 'bold', title: 'BREAK THROUGH', odds: odds('bold', 74 + b.power + (perks.includes('boots') ? 15 : 0)), salvage: 27 + bonus, damage: 29 + s.depth - shield, detail: 'More salvage; heavier damage on failure.' },
    { key: 'search', title: 'SEARCH SIDE ROUTE', odds: odds('search', 80 + b.guard + (perks.includes('radar') ? 12 : 0)), salvage: 19 + bonus + (s.build === 'scavenger' ? 6 : 0), damage: 21 + s.depth - shield, detail: 'Success also finds one supply.' },
    { key: 'rest', title: 'USE SUPPLY', odds: 100, salvage: 0, damage: 0, disabled: s.supplies < 1 || s.health >= s.max_health, detail: `Use 1 supply to heal ${perks.includes('pockets') ? 40 : 28}. Advances a room without a successful route.` },
  ].map((choice) => ({ ...choice, title: boss?.tactics[choice.key] || choice.title,
    ...(boss ? choice.key === 'rest' ? { disabled: true, detail: 'Supply rest cannot clear the final boss. Use Field Patch before a tactic if you need healing.' } : { detail: choice.detail + ' Final tactic: failure ends this contract with zero rank or XP.' } : {}), salvage: choice.salvage + (rules[choice.key]?.salvage || 0) + (choice.key !== 'rest' ? path.salvage || 0 : 0), damage: choice.damage + (rules[choice.key]?.damage || 0) + (choice.key !== 'rest' ? path.damage || 0 : 0) }));
  return relicRouteChoices(s, choices, { boss: !!boss, graffiti: contractRoom(s).title === 'Graffiti Junction' });
}

export function contractPreparations(s) {
  if (![3, 4, 5, 6, 7, 8, 9].includes(s.version) || s.depth >= contractLength(s) || s.health <= 0 || s.draft.length || s.preparation) return [];
  return [
    { key: 'prepare_scout', title: 'SCOUT AHEAD', disabled: s.supplies < 2, detail: 'Spend 2 supplies: +10 percentage points to route clear chances in this room, capped at 98%. No room advance.' },
    { key: 'prepare_patch', title: 'FIELD PATCH', disabled: s.salvage < 20 || s.health >= s.max_health, detail: 'Spend 20 salvage: heal up to 25 route HP now. No room advance. Spent salvage no longer counts toward the goal or rank.' },
  ];
}
export function contractGoalProgress(s) {
  return s.goal === 'scout' ? s.wins : s.goal === 'salvage' ? s.salvage
    : s.goal === 'breach' ? s.route_wins.bold : s.goal === 'recon' ? s.route_wins.search
      : s.goal === 'resupply' ? s.supplies : s.health;
}
function redrawPool(s) {
  return Object.keys(PERKS).filter((key) => !s.perks.includes(key) && !s.draft.includes(key));
}
export function contractDraftActions(s) {
  if (![5, 6, 7, 8, 9].includes(s.version) || !s.draft.length || s.draft_redrawn || s.health <= 0 || s.depth >= contractLength(s)) return [];
  const count = Math.min(3, redrawPool(s).length);
  if (!count) return [];
  return [{ key: 'redraw_draft', title: 'REDRAW UPGRADES', disabled: s.salvage < CONTRACT_REDRAW_COST,
    detail: `Spend ${CONTRACT_REDRAW_COST} salvage to replace these perks with ${count} different unowned upgrades. Once per draft; no room advance. Supplies remain an option. Spent salvage reduces final rank and salvage-goal progress.` }];
}
export function contractSideProgress(s) {
  if (![2, 3, 4, 5, 6, 7, 8, 9].includes(s.version) || s.side_goal === 'none') return null;
  const goal = CONTRACT_SIDE_GOALS[s.side_goal];
  const progress = s.side_goal === 'versatile' ? ['cover', 'bold', 'search'].filter(key => s.route_wins[key] > 0).length
    : s.side_goal === 'daredevil' ? s.route_wins.bold : s.supplies;
  return { key: s.side_goal, ...goal, progress, reached: progress >= goal.target, rank_points: CONTRACT_SIDE_RANK * s.tier };
}
export function advanceContract(value, action, roll, rareRoll = 10000) {
  const s = structuredClone(value);
  if (s.depth >= contractLength(s) || s.health <= 0) return null;
  if (action === 'abandon') return { state: s, status: 'abandoned', rank_points: 0 };
  const encounter = contractFieldEncounter(s);
  const fieldChoice = encounter?.choices.find((choice) => choice.key === action);
  if (fieldChoice) {
    if (fieldChoice.disabled) return null;
    for (const [key, delta] of Object.entries(fieldChoice.delta)) s[key] += delta;
    s.field_pending = false;
    s.field_result = { key: encounter.key, title: encounter.title, checkpoint: s.depth, choice: action, delta: fieldChoice.delta, detail: fieldChoice.title + ' // ' + fieldChoice.detail };
    s.last = `${encounter.title}: ${fieldChoice.title}. ${fieldChoice.detail} No pet resources spent; no room advance.`;
    return { state: s, status: 'active', rank_points: 0 };
  }
  const path = contractPathChoices(s).find((entry) => entry.key === action);
  if (path) {
    s.path = { key: action, remaining: 2 }; s.path_offer = false;
    s.last = `${path.title} selected. ${path.detail} These effects are included in route previews. No room advance.`;
    return { state: s, status: 'active', rank_points: 0 };
  }
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
    if (action === 'redraw_draft') {
      const redraw = contractDraftActions(s)[0];
      if (!redraw || redraw.disabled) return null;
      s.draft = redrawPool(s).sort((a, b) => hash(s.seed + s.depth + 'redraw' + a) - hash(s.seed + s.depth + 'redraw' + b)).slice(0, 3);
      s.salvage -= CONTRACT_REDRAW_COST; s.draft_redrawn = true;
      s.last = `Spent ${CONTRACT_REDRAW_COST} salvage to redraw upgrades. Choose one of the new perks or take supplies.`;
      return { state: s, status: 'active', rank_points: 0 };
    }
    if ([4, 5, 6, 7, 8, 9].includes(s.version) && action === 'supply_cache') {
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
  const boss = finalBoss(s);
  const success = relicRouteSuccess(s, roll < choice.odds, !!boss);
  if (boss) s.boss_result = { key: boss.key, choice: action, cleared: success };
  if (action === 'rest') {
    s.supplies--; s.health = Math.min(s.max_health, s.health + (s.perks.includes('pockets') ? 40 : 28) + (s.relics?.includes('neon_boots') ? 1 : 0));
    s.last = 'Used one supply and moved on. No salvage or route-clear credit.';
  } else if (success) {
    const salvage = choice.salvage + relicSearchSalvage(s, action, rareRoll);
    s.wins++; s.salvage += salvage; if (action === 'search') s.supplies++;
    if ([2, 3, 4, 5, 6, 7, 8, 9].includes(s.version)) s.route_wins[action] = (s.route_wins[action] || 0) + 1;
    s.last = `Route cleared. +${salvage} contract salvage.`;
  } else { s.health = Math.max(0, s.health - choice.damage); s.last = `Setback: -${choice.damage} route health. Keep going if you can.`; }
  s.depth++;
  if (s.version === 9) s.field_pending = false;
  if ([7, 8, 9].includes(s.version)) {
    s.path_offer = false;
    if (s.path && --s.path.remaining <= 0) s.path = null;
  }
  if ([3, 4, 5, 6, 7, 8, 9].includes(s.version)) s.preparation = null;
  let status = 'active';
  if (!s.health) { status = 'failed'; s.last = 'Route health exhausted. Another contract is available immediately.'; }
  else if (s.depth === contractLength(s)) {
    status = contractGoalProgress(s) >= contractObjective(s).target && (!boss || s.boss_result.cleared) ? 'completed' : 'failed';
    s.last = boss && !s.boss_result.cleared ? 'The boss held the exit. No rank or XP; another contract is ready immediately.' : status === 'completed' ? 'Contract complete. Rank recorded; choose another contract whenever you like.' : 'Route finished, but the contract goal was missed. Try a different build or route.';
  } else if (s.depth % 2 === 0) {
    if (s.version === 9) s.field_pending = true;
    if ([7, 8, 9].includes(s.version)) s.path_offer = true;
    if ([5, 6, 7, 8, 9].includes(s.version)) s.draft_redrawn = false;
    s.draft = Object.keys(PERKS).filter((k) => !s.perks.includes(k)).sort((a, b) => hash(s.seed + s.depth + a) - hash(s.seed + s.depth + b)).slice(0, 3);
  }
  const side = contractSideProgress(s);
  return { state: s, status, rank_points: status === 'completed' ? (40 + s.salvage + s.wins * 5) * s.tier + (side?.reached ? side.rank_points : 0) : 0 };
}
function projection(row) {
  if (!row) return null;
  const s = JSON.parse(row.state_json), room = contractRoom(s), side = contractSideProgress(s), objective = contractObjective(s), boss = contractBoss(s);
  return { contract_id: row.contract_id, pet_id: row.pet_id, revision: row.revision, sequence: row.sequence, status: row.status,
    goal: s.goal, title: objective.title, objective: objective.detail,
    boss: boss ? { key: boss.key, title: boss.title, detail: boss.detail, active: row.status === 'active' && Boolean(finalBoss(s)), result: s.boss_result || null } : null,
    build: s.build, build_title: CONTRACT_BUILDS[s.build].title, tier: s.tier, depth: s.depth, max_depth: contractLength(s),
    relics: relicNames(s.relics),
    format: formatKey(s), format_title: CONTRACT_FORMATS[formatKey(s)].title,
    health: s.health, max_health: s.max_health, supplies: s.supplies, salvage: s.salvage,
    progress: contractGoalProgress(s), target: objective.target, last: s.last,
    room: { title: room.title, detail: room.detail, effect: room.rule?.detail || '' }, perks: s.perks.map((key) => ({ key, ...PERKS[key] })),
    side_goal: side ? { ...side, earned: row.status === 'completed' && side.reached } : null,
    preparation: [3, 4, 5, 6, 7, 8, 9].includes(s.version) ? s.preparation : null,
    path: activePath(s),
    field_encounter: row.status === 'active' ? contractFieldEncounter(s) : null,
    field_result: s.version === 9 ? s.field_result : null,
    path_choices: row.status === 'active' ? contractPathChoices(s) : [],
    preparations: row.status === 'active' ? contractPreparations(s) : [],
    draft_actions: row.status === 'active' ? contractDraftActions(s) : [],
    choices: row.status !== 'active' ? [] : s.draft.length ? [...s.draft.map((key) => ({ key, ...PERKS[key], upgrade: true })), ...([4, 5, 6, 7, 8, 9].includes(s.version) ? [{ key: 'supply_cache', title: 'TAKE SUPPLY CACHE', upgrade: true, detail: 'Take 2 contract supplies instead of an upgrade. Spend them on healing or scouting, or save them for a supply objective. No room advance, pet item, XP or currency.' }] : [])] : contractChoices(s),
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
// Completed reservations retain their original pet/season authority after a
// switch or rollover. Source ownership is checked before limiting the inbox.
const SAVED_BONUS_FROM = `FROM telegram_pet_contracts c
  JOIN telegram_pet_instances p ON p.pet_id=c.pet_id AND p.telegram_id=c.telegram_id AND p.season_key=c.season_key
  JOIN telegram_pet_season_slots s ON s.pet_id=p.pet_id AND s.telegram_id=p.telegram_id AND s.season_key=p.season_key AND s.slot_number=p.slot_number
  WHERE c.telegram_id=? AND c.status='completed' AND c.reward_xp=20`;
export async function getContractBoard(db, owner, pet, now = new Date()) {
  const petId = pet?.pet_id, seasonKey = pet?.season_key;
  const pending = requirePetReadResult(await db.prepare(`SELECT c.contract_id,c.pet_id,c.season_key,c.reward_day,s.slot_number
    ${SAVED_BONUS_FROM} AND c.reward_settled=0
    ORDER BY c.reward_day,c.created_at,c.contract_id LIMIT 10`).bind(owner).all());
  const pendingRewards = pending.results || [];
  if (!petId || !seasonKey || !requirePetFirstReadResult(await authority(db, owner, petId, seasonKey))) return { available: false, reason: 'hatch_required', pending_rewards: pendingRewards };
  const [stats, rows, bonuses, mastery] = await Promise.all([
    db.prepare(`SELECT COALESCE(MAX(sequence),0)+1 AS next_sequence, COALESCE(SUM(rank_points),0) AS rank_points,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed FROM telegram_pet_contracts WHERE telegram_id=? AND pet_id=? AND season_key=?`).bind(owner, petId, seasonKey).first().then(requirePetFirstReadResult),
    db.prepare('SELECT * FROM telegram_pet_contracts WHERE telegram_id=? AND pet_id=? AND season_key=? ORDER BY sequence DESC LIMIT 1').bind(owner, petId, seasonKey).first().then(requirePetFirstReadResult),
    db.prepare('SELECT COUNT(*) AS used FROM telegram_pet_contracts WHERE telegram_id=? AND reward_day=? AND reward_xp>0').bind(owner, day(now)).first().then(requirePetFirstReadResult),
    db.prepare(`SELECT json_extract(state_json,'$.goal') AS goal, json_extract(state_json,'$.build') AS build,
      CASE WHEN json_extract(state_json,'$.version') IN (6,7,8,9) AND json_extract(state_json,'$.format')='extended' THEN 'extended' ELSE 'standard' END AS format,
      json_extract(state_json,'$.tier') AS tier, COUNT(*) AS completed, MAX(rank_points) AS best_rank_points
      FROM telegram_pet_contracts WHERE telegram_id=? AND pet_id=? AND season_key=? AND status='completed'
      GROUP BY goal, build, tier, format`).bind(owner, petId, seasonKey).all().then(requirePetReadResult),
  ]);
  const completed = integer(stats?.completed), points = integer(stats?.rank_points);
  const maxTier = completed >= 15 ? 3 : completed >= 5 ? 2 : 1;
  const records = Object.entries(CONTRACT_FORMATS).flatMap(([format, route]) => [1, 2, 3].flatMap((tier) => Object.entries(CONTRACT_GOALS).flatMap(([goal, definition]) => Object.entries(CONTRACT_BUILDS).map(([build, setup]) => {
    const record = (mastery.results || []).find((entry) => entry.goal === goal && entry.build === build && Number(entry.tier) === tier && entry.format === format);
    return { key: `${goal}:${build}:${tier}${format === 'extended' ? ':extended' : ''}`, goal, build, tier, format, format_title: route.title, rooms: route.rooms, title: definition.title, build_title: setup.title,
      unlocked: tier <= maxTier, completed: integer(record?.completed), best_rank_points: integer(record?.best_rank_points) };
  }))));
  return { available: true, pet_id: petId, next_sequence: stats.next_sequence, completed, rank_points: points,
    rank: 1 + Math.floor(points / 500), next_rank_at: (1 + Math.floor(points / 500)) * 500,
    max_tier: maxTier,
    collection: { cleared_routes: records.filter((record) => record.completed > 0).length, total_routes: records.length,
      unlocked_routes: records.filter((record) => record.unlocked).length,
      next_route: records.find((record) => record.unlocked && record.completed === 0) || null, records },
    bonus_remaining: Math.max(0, CONTRACT_BONUS_LIMIT - integer(bonuses?.used)), bonus_limit: CONTRACT_BONUS_LIMIT, bonus_xp: CONTRACT_BONUS_XP,
    pending_rewards: pendingRewards, offers: Object.entries(CONTRACT_GOALS).map(([key, goal]) => {
      const entries = (mastery.results || []).filter((entry) => entry.goal === key);
      return { key, ...goal, boss: contractBoss({ version: 9, goal: key }).title, objectives: Object.entries(CONTRACT_FORMATS).map(([format, route]) => ({ format, format_title: route.title, ...contractObjective({ version: 9, format, goal: key }) })),
        completed: entries.reduce((sum, record) => sum + integer(record.completed), 0),
        best_rank_points: entries.reduce((best, record) => Math.max(best, integer(record.best_rank_points)), 0) };
    }),
    side_goals: Object.entries(CONTRACT_SIDE_GOALS).map(([key, goal]) => ({ key, ...goal })), side_rank: CONTRACT_SIDE_RANK,
    formats: Object.entries(CONTRACT_FORMATS).map(([key, format]) => ({ key, ...format })),
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
  if (request.action === 'contract_claim') {
    const saved = await db.prepare(`SELECT c.* ${SAVED_BONUS_FROM} AND c.contract_id=? AND c.pet_id=?`)
      .bind(owner, String(request.contract_id || ''), String(request.pet_id || '')).first();
    if (!saved) return reject('contract_not_found');
    try { return { accepted: true, reason: 'contract_bonus_checked', ...await settleBonus(db, owner, saved, award, now) }; }
    catch { return { accepted: true, reason: 'contract_bonus_pending', reward_pending: true, pet_xp_awarded: 0 }; }
  }
  if (!petId || !seasonKey || request.pet_id !== petId || !await authority(db, owner, petId, seasonKey)) return reject('contract_pet_changed');
  let row;
  if (request.action === 'contract_start') {
    const board = await getContractBoard(db, owner, pet, now);
    if (board.run?.status === 'active') return reject('contract_active');
    if (!Number.isSafeInteger(request.sequence) || request.sequence !== board.next_sequence) return reject('contract_stale');
    const s = createContractState(request.goal, request.build, request.tier, crypto.randomUUID(), request.side_goal, request.format);
    if (!s || request.tier > board.max_tier) return reject('contract_invalid_choice');
    initializeRelicRoute(s, await readOwnedRelics(db, owner));
    row = await db.prepare(`INSERT OR IGNORE INTO telegram_pet_contracts
      (contract_id,pet_id,telegram_id,season_key,sequence,status,state_json)
      SELECT ?,?,?,?,?,'active',? WHERE ${ACTIVE_GUARD}
      AND ?=(SELECT COALESCE(MAX(sequence),0)+1 FROM telegram_pet_contracts WHERE telegram_id=? AND pet_id=? AND season_key=?) RETURNING *`)
      .bind(crypto.randomUUID(), petId, owner, seasonKey, request.sequence, JSON.stringify(s), owner, petId, seasonKey, request.sequence, owner, petId, seasonKey).first();
    return row ? { accepted: true, reason: 'contract_started', result_copy: s.last } : reject('contract_stale');
  }
  row = await db.prepare('SELECT * FROM telegram_pet_contracts WHERE contract_id=? AND telegram_id=? AND pet_id=? AND season_key=?').bind(String(request.contract_id || ''), owner, petId, seasonKey).first();
  if (!row) return reject('contract_not_found');
  if (request.action !== 'contract_step' || row.status !== 'active' || request.revision !== row.revision) return reject('contract_stale');
  const roll = crypto.getRandomValues(new Uint32Array(1))[0] % 100;
  const next = advanceContract(JSON.parse(row.state_json), request.choice, roll, crypto.getRandomValues(new Uint32Array(1))[0] % 10000);
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
