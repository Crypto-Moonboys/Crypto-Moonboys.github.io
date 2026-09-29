import { PET_ROGUELITE_RELICS } from './content/index.js';
import { requirePetReadResult } from './read-result.js';

// These adaptations apply to separate run health/salvage, never pet vital stats.
export const RELIC_ROUTE_DETAILS = Object.freeze({
  bitcoin_heart: '+10 starting route HP.',
  infinite_spray_can: '+15 percentage points to clear graffiti rooms.',
  hacker_lens: 'Reveals a hidden route: 95% clear, 12 salvage, 8 failure damage.',
  neon_boots: 'Supply rest heals 1 extra route HP.',
  golden_sticker: 'Successful searches have a 3% chance of +30 route salvage.',
  ghost_tag: 'Prevents the first failed non-boss encounter per run.',
  moon_battery: '+8 starting route HP.',
  cyber_collar: '+10 percentage points to bold/combat route clear chance.',
  chain_shield: 'Reduces route failure damage by 10%, rounded up.',
  lucky_coin: '+10 percentage points to non-boss event/search clear chance.',
});
export async function readOwnedRelics(db, owner) {
  const rows = requirePetReadResult(await db.prepare('SELECT relic_id FROM telegram_pet_relics WHERE telegram_id=?').bind(owner).all());
  return [...new Set(rows.results.map(row => row.relic_id).filter(key => Object.hasOwn(PET_ROGUELITE_RELICS,key)))].sort();
}
export function relicNames(ids = []) { return ids.filter(key=>Object.hasOwn(RELIC_ROUTE_DETAILS,key)).map(key=>({key,title:PET_ROGUELITE_RELICS[key].name,detail:RELIC_ROUTE_DETAILS[key]})); }
export function initializeRelicRoute(state, ids) {
  state.relics = ids.slice(); state.relic_ghost_used = false;
  const hp = (ids.includes('bitcoin_heart') ? 10 : 0) + (ids.includes('moon_battery') ? 8 : 0);
  state.health += hp; state.max_health += hp;
  return state;
}
export function relicRouteChoices(state, choices, { graffiti = false, boss = false } = {}) {
  if (!Array.isArray(state.relics)) return choices;
  const owns = key=>state.relics.includes(key);
  const result = choices.map(choice=> {
    if (choice.key==='rest') return {...choice, detail:choice.detail+(owns('neon_boots')?' Neon Boots: +1 route HP.':'')};
    const bonus = (graffiti && owns('infinite_spray_can') ? 15 : 0)
      + ((choice.key==='bold' || boss) && owns('cyber_collar') ? 10 : 0)
      + (!boss && choice.key==='search' && owns('lucky_coin') ? 10 : 0);
    return {...choice, detail: choice.detail + (!boss && owns('ghost_tag') && !state.relic_ghost_used ? ' Ghost Tag prevents the first failed encounter, then is spent for this run.' : ''), odds:Math.min(98,choice.odds+bonus), damage:owns('chain_shield')?Math.max(1,Math.ceil(choice.damage*0.9)):choice.damage};
  });
  if (owns('hacker_lens') && !boss) result.push({key:'hidden',title:'HACKER LENS: HIDDEN ROUTE',odds:95,salvage:12,damage:8,detail:'Revealed by your relic. No supply on clear.' + (owns('ghost_tag') && !state.relic_ghost_used ? ' Ghost Tag prevents the first failure.' : '')});
  return result;
}
export function relicRouteSuccess(state, success, boss) {
  if (!success && !boss && state.relics?.includes('ghost_tag') && !state.relic_ghost_used) {
    state.relic_ghost_used = true; return true;
  }
  return success;
}
export function relicSearchSalvage(state, action, rareRoll) { return action==='search' && state.relics?.includes('golden_sticker') && rareRoll<300 ? 30 : 0; }
