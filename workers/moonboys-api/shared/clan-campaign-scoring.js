import { CANONICAL_FACTION_KEYS } from './faction-canon.js';

const BASIS_POINTS = 10_000;
const DAY_MS = 86_400_000;
const TEAM_METRICS = new Set(['participation', 'memberRelay', 'routeRelay', 'handoff', 'pairedDays', 'showdown']);
const capped = (value, target) => Math.min(value, target);

function makeMember() {
  return { days: new Map(), routes: new Map(), finds: new Set() };
}

function memberScore(member, window) {
  const dates = [...member.days.keys()].sort();
  const full = [...member.days.values()].filter(day => day.tiers.size === 3);
  const firstTwoDaysEnd = +new Date(window.startsOn) + 2 * DAY_MS;
  const byTier = tier => [...member.days.values()].filter(day => day.tiers.has(tier)).length;
  switch (window.metric) {
    case 'banks': return [...member.days.values()].reduce((total, day) => total + day.tiers.size, 0);
    case 'days': return dates.length;
    case 'fullDays': return full.length;
    case 'fullRoutes': return new Set(full.map(day => day.route)).size;
    case 'finalDays': return byTier(3);
    case 'middleDays': return byTier(2);
    case 'routes': return member.routes.size;
    case 'repeatRoute': return Math.max(0, ...member.routes.values());
    case 'finds': return member.finds.size;
    case 'openingDays': return dates.filter(date => +new Date(date) < firstTwoDaysEnd).length;
    case 'recoveries': {
      return dates.filter((date, index) => index === 0
        ? date > window.startsOn
        : Date.parse(date) - Date.parse(dates[index - 1]) > DAY_MS).length;
    }
    case 'streak': {
      let streak = 0;
      let longest = 0;
      let previous = -Infinity;
      for (const date of dates) {
        const day = +new Date(date);
        streak = day - previous === DAY_MS ? streak + 1 : 1;
        longest = Math.max(streak, longest);
        previous = day;
      }
      return longest;
    }
    default: throw new Error('unknown_clan_campaign_metric');
  }
}

function teamScore(crew, window) {
  const active = crew.members.size;
  const days = crew.days.size;
  switch (window.metric) {
    case 'participation':
      return [active * 100, crew.roster * window.target];
    case 'memberRelay':
      return [capped(active, window.target) * capped(days, window.target), window.target ** 2];
    case 'routeRelay':
      return [capped(crew.routes.size, window.target) * capped(days, window.target), window.target ** 2];
    case 'handoff':
      return [new Set([...crew.members.values()].map(member => [...member.days.keys()].sort()[0])).size, window.target];
    case 'pairedDays':
      return [[...crew.days.values()].filter(members => members.size >= 2).length, window.target];
    case 'showdown': {
      const possiblePerMember = 3 * ((+new Date(window.endsBefore) - +new Date(window.startsOn)) / DAY_MS);
      return [active * possiblePerMember + crew.banks, 2 * crew.roster * possiblePerMember];
    }
    default:
      return [[...crew.members.values()].reduce((sum, member) =>
        sum + capped(memberScore(member, window), window.target), 0), crew.roster * window.target];
  }
}

function evaluateRebuild(window, rosters, banks) {
  const middle = new Date(+new Date(window.startsOn) + 2 * DAY_MS).toISOString().slice(0, 10);
  const initial = evaluateCampaignWindow({ ...window, metric: 'fullRoutes', endsBefore: middle },
    rosters, banks.filter(bank => bank.utc_day < middle));
  const unlocked = initial.cityPoints >= window.cityTarget * 100;
  const final = unlocked ? evaluateCampaignWindow({ ...window, metric: 'fullDays', target: 1, startsOn: middle },
    rosters, banks.filter(bank => bank.utc_day >= middle)) : null;
  return {
    ...(final ?? initial), eligibleFactions: final?.eligibleFactions ?? [],
    stages: [
      { title: 'Restore the districts', points: initial.cityPoints },
      { title: 'Finish the rebuild', points: final?.cityPoints ?? null, startsOn: middle },
    ],
  };
}

export function evaluateCampaignWindow(window, rosters, banks) {
  if (window.metric === 'rebuild') return evaluateRebuild(window, rosters, banks);
  const crews = new Map(CANONICAL_FACTION_KEYS.map(key => [
    key, { roster: 0, banks: 0, members: new Map(), days: new Map(), routes: new Set() },
  ]));
  for (const row of rosters) if (crews.has(row.faction_id)) crews.get(row.faction_id).roster = row.size;
  // Query results are unique roster-matched bank receipts. Group bank days by
  // member so credit for any one member is capped at the part's objective.
  for (const bank of banks) {
    const crew = crews.get(bank.faction_id);
    if (!crew?.roster) continue;
    if (!crew.members.has(bank.telegram_id)) crew.members.set(bank.telegram_id, makeMember());
    const member = crew.members.get(bank.telegram_id);
    if (!member.days.has(bank.utc_day)) {
      member.days.set(bank.utc_day, { route: bank.route_index, tiers: new Set() });
      member.routes.set(bank.route_index, (member.routes.get(bank.route_index) ?? 0) + 1);
    }
    member.days.get(bank.utc_day).tiers.add(bank.tier);
    member.finds.add(bank.specimen_key);
    if (!crew.days.has(bank.utc_day)) crew.days.set(bank.utc_day, new Set());
    crew.days.get(bank.utc_day).add(bank.telegram_id);
    crew.routes.add(bank.route_index);
    crew.banks++;
  }
  const threshold = TEAM_METRICS.has(window.metric) ? 100 : 70;
  const fractions = new Map();
  const rows = [...crews].map(([faction_id, crew]) => {
    const [value, maximum] = crew.roster ? teamScore(crew, window) : [0, 0];
    fractions.set(faction_id, [value, maximum]);
    return { faction_id, roster: crew.roster, participants: crew.members.size,
      points: maximum ? Math.floor(BASIS_POINTS * capped(value, maximum) / maximum) : 0 };
  });
  let eligibleFactions;
  let cityPoints = null;
  if (window.mode === 'ranked') {
    const compare = (a, b) => {
      const [aValue, aMax] = fractions.get(a.faction_id);
      const [bValue, bMax] = fractions.get(b.faction_id);
      const difference = BigInt(bValue) * BigInt(aMax) - BigInt(aValue) * BigInt(bMax);
      return difference < 0n ? -1 : difference > 0n ? 1 : 0;
    };
    const eligible = rows.filter(row => row.roster >= 3).sort(compare);
    eligibleFactions = eligible.length >= 2 && fractions.get(eligible[0].faction_id)[0] > 0
      ? eligible.filter(row => compare(row, eligible[0]) === 0).map(row => row.faction_id) : [];
  } else if (window.mode === 'city') {
    cityPoints = Math.floor(rows.reduce((sum, row) => sum + row.points, 0) / rows.length);
    eligibleFactions = cityPoints >= window.cityTarget * 100
      ? rows.filter(row => row.participants).map(row => row.faction_id) : [];
  } else {
    eligibleFactions = rows.filter(row => row.points >= threshold * 100).map(row => row.faction_id);
  }
  return { rows, threshold, cityPoints, eligibleFactions };
}
