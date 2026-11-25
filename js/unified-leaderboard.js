import { ARCADE_MAP_GAMES } from './arcade-graph.js';

const gameNames = Object.fromEntries(ARCADE_MAP_GAMES.map(game => [game.id, game.label]));
Object.assign(gameNames, {
  blocktopia: 'Block Topia Quest Maze',
  'nbg-london': 'NBG London',
  'dead-run': 'Dead Run',
  moonpet: 'MoonPet',
  waterfront: 'Battle Chamber',
});
delete gameNames['nbg-london-native'];
delete gameNames['dead-run-native'];
delete gameNames['moonpet-native'];
delete gameNames['waterfront-native'];

const factionNames = {
  'hard-fork-rockers': 'Hard Fork Rockers',
  'rugpull-miners': 'Rugpull Miners',
  graffpunks: 'GraffPUNKS',
  'blockchain-furies': 'Blockchain Furies',
  'crypto-moongirls': 'Crypto Moongirls',
  blockstars: 'The Blockstars',
  'all-city-bulls': 'All City Bulls',
  'nomad-bears': 'Nomad Bears',
  'crypto-stoned-boys': 'Crypto Stoned Boys',
};
const sourceNames = {
  ...gameNames,
  'wtf-signal': 'Daily WTF Signals',
  'community-mission': 'Wiki missions',
  'tag-run': 'Tag Run',
  'npc-rounds': 'NPC rounds',
  'weekly-clan-boost': 'Weekly clan boosts',
};
const format = new Intl.NumberFormat();
const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
});

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function drawBoard(target, board) {
  if (!board.rows.length) return;
  const table = element('table');
  const header = table.createTHead().insertRow();
  const factionBoard = board.scope === 'factions';
  const globalRank = ['games', 'clan-players', 'no-clan'].includes(board.scope);
  const finalized = Boolean(board.period?.closed_at);
  const labels = [
    'Rank', factionBoard ? 'Faction' : 'Player',
    ...(globalRank ? ['Global rank'] : []),
    'Grinder Points', ...(finalized ? ['Next-period bonus'] : []), 'Breakdown',
  ];
  for (const label of labels) {
    const cell = element('th', label);
    cell.scope = 'col';
    header.append(cell);
  }
  const body = table.createTBody();
  for (const entry of board.rows) {
    const row = body.insertRow();
    row.insertCell().textContent = entry.points > 0 ? format.format(entry.rank) : '—';
    row.insertCell().textContent = factionBoard ? factionNames[entry.name] ?? entry.name : entry.name;
    if (globalRank) row.insertCell().textContent = entry.global_rank == null ? '—' : format.format(entry.global_rank);
    row.insertCell().textContent = format.format(entry.points);
    if (finalized) row.insertCell().textContent = entry.award_points ? '+' + format.format(entry.award_points) : '—';
    const details = element('details');
    details.append(element('summary', 'Point sources'));
    const list = element('ul');
    for (const [source, value] of Object.entries(entry.breakdown)) {
      const score = value.best_score == null ? '' : ' · best score ' + format.format(value.best_score);
      const xpLabel = source === 'moonpet' ? 'Pet XP' : source === 'blocktopia-rpg' ? 'Block Topia XP'
        : source === 'community-mission' ? 'Community XP' : 'Arcade XP';
      const xp = value.source_xp == null ? '' : ' · ' + format.format(value.source_xp) + ' ' + xpLabel;
      list.append(element('li', (sourceNames[source] ?? source) + ' · ' + format.format(value.points)
        + ' points · ' + format.format(value.events) + ' records' + score + xp));
    }
    if (entry.bonus_points) list.append(element('li', 'Previous period bonus · ' + format.format(entry.bonus_points) + ' points'));
    if (list.childElementCount) {
      details.append(list);
      row.insertCell().append(details);
    } else {
      row.insertCell().textContent = '—';
    }
  }
  target.append(table);
}

export function initUnifiedLeaderboard(root) {
  if (!root) return;
  const scope = root.querySelector('[name=scope]');
  const period = root.querySelector('[name=period]');
  const windowSelect = root.querySelector('[name=window]');
  const category = root.querySelector('[name=category]');
  const categoryLabel = root.querySelector('[data-category-control]');
  const status = root.querySelector('[data-unified-status]');
  const results = root.querySelector('[data-unified-results]');
  const prev = root.querySelector('[data-unified-prev]');
  const next = root.querySelector('[data-unified-next]');
  const pageLabel = root.querySelector('[data-unified-page]');
  let page = 1;
  let request;

  function setCategories() {
    const options = scope.value === 'games' ? gameNames : scope.value === 'clan-players' ? factionNames : {};
    categoryLabel.hidden = !Object.keys(options).length;
    category.replaceChildren(...Object.entries(options).map(([key, name]) => new Option(name, key)));
  }

  async function load() {
    request?.abort();
    const pending = new AbortController();
    request = pending;
    const query = new URLSearchParams({
      period: period.value, scope: scope.value, category: category.value, window: windowSelect.value, page,
    });
    prev.disabled = true;
    next.disabled = true;
    pageLabel.textContent = 'Page ' + page;
    status.textContent = 'Loading verified standings…';
    results.replaceChildren();

    try {
      const base = window.MOONBOYS_API?.getApiBase?.();
      if (!base) throw new Error('api_unavailable');
      const response = await fetch(base + '/leaderboard/unified?' + query, { signal: pending.signal });
      if (!response.ok) throw new Error('standings_unavailable');
      const board = await response.json();
      if (pending.signal.aborted) return;
      drawBoard(results, board);
      if (!board.period) {
        status.textContent = windowSelect.value === 'closed' ? 'No finalized period yet.' : 'No active season is configured.';
      } else {
        const start = dateFormat.format(new Date(board.period.starts_at));
        const end = board.period.ends_at ? ' to ' + dateFormat.format(new Date(board.period.ends_at)) : '';
        status.textContent = start + end + ' UTC' + (board.rows.length ? '' : ' · No eligible activity.');
      }
      next.disabled = !board.has_more;
      prev.disabled = page === 1;
    } catch {
      if (pending.signal.aborted) return;
      status.textContent = 'Unified standings are temporarily unavailable. Original scoreboards are below.';
      prev.disabled = page === 1;
    }
  }

  scope.addEventListener('change', setCategories);
  for (const select of [scope, period, category, windowSelect]) {
    select.addEventListener('change', () => { page = 1; load(); });
  }
  prev.addEventListener('click', () => { page -= 1; load(); });
  next.addEventListener('click', () => { page += 1; load(); });
  setCategories();
  load();
}
