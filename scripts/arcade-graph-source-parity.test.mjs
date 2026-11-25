import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const worker = read('workers/leaderboard-worker.js');
const leaderboard = read('js/arcade-leaderboard.js');
const graphSource = read('js/arcade-graph.js');
const html = read('games/leaderboard.html');

const workerGames = JSON.parse(worker.match(/const GAMES = (\[[^\]]+\]);/u)?.[1] || '[]');
const tabs = leaderboard.match(/const RAW_TABS = \[([\s\S]*?)\];/u)?.[1] || '';
const tabGames = [...tabs.matchAll(/key:\s*'([^']+)'/gu)].map(m => m[1]).filter(x => x !== 'global');
assert.equal(workerGames.length, 8);
assert.deepEqual(tabGames, workerGames, 'visible tabs must match canonical Worker games');
assert.match(html, /Kaiju<\/span>/u, 'graph legend must include Kaiju');

// Exercise graph builders rather than merely matching their source text.
const script = graphSource.replace(/^export\s+/gmu, '') +
  '\nglobalThis.__graphTest = {' +
  'overview: () => ({ nodes: makeOverviewNodes(300,200,100), edges: OVERVIEW_EDGES, games: ARCADE_MAP_GAMES }),' +
  'player: entry => { canvas = { width:600, height:400 }; setPlayerState(entry);' +
  'return { nodes, edges, activeEdges: [...activeEdges] }; } };';
const context = {};
vm.runInNewContext(script, context, { filename: 'arcade-graph.js' });
const make = context.__graphTest;
const overview = make.overview();
const overviewIds = overview.nodes.map(n => n.id);
const nativeDestinations = {
  'dead-run-native': '/games/dead-run/',
  'nbg-london-native': '/games/nbg-london/#nbg-record-board',
  'blocktopia-rpg': '/games/block-topia/',
  'moonpet-native': '/crypto-moonboy-pets-leaderboard.html',
  'waterfront-native': '/games/block-topia/waterfront/',
};
assert.deepEqual(Array.from(overview.games.filter(game => !game.href), game => game.id), workerGames);
assert.deepEqual(Object.fromEntries(overview.games.filter(game => game.href).map(game => [game.id, game.href])),
  nativeDestinations, 'native games must retain their separate score or game destinations');
const expectedOverviewIds = [...workerGames, ...Object.keys(nativeDestinations)];
assert.deepEqual(Array.from(overviewIds), ['global', ...expectedOverviewIds]);
assert.equal(new Set(overviewIds).size, overviewIds.length);
assert.equal(overview.edges.length, expectedOverviewIds.length);
assert.deepEqual(Array.from(overview.edges, edge => edge.target), expectedOverviewIds);
assert.ok(overview.edges.every(e => e.source === 'global'));
assert.ok(overview.nodes.some(n => n.id === 'kaiju' && n.label.includes('Kaiju')));

const breakdown = Object.fromEntries(workerGames.map((game, i) => [game, (i + 1) * 100]));
breakdown.kaiju = 2750;
breakdown.variety_bonus = 500;
const player = make.player({ player:'Test Player', score:7350, breakdown });
const playerIds = player.nodes.map(n => n.id);
assert.equal(new Set(playerIds).size, playerIds.length);
assert.equal(playerIds.filter(x => !['player','global','bonus'].includes(x)).join('|'),
  workerGames.join('|'));
for (const game of workerGames) {
  const node = player.nodes.find(n => n.id === game);
  assert.equal(node.score, breakdown[game], 'wrong score source: ' + game);
  assert.ok(player.edges.some(e => e.source === 'player' && e.target === game));
  assert.ok(player.edges.some(e => e.source === game && e.target === 'global'));
  assert.ok(player.activeEdges.includes(game + '->global'));
}
assert.match(player.nodes.find(n => n.id === 'kaiju').label, /2,750/u);
assert.ok(player.nodes.some(n => n.id === 'bonus' && n.score === 500));
assert.equal(player.edges.length, 2 * (workerGames.length + 1));
assert.ok(player.edges.every(e => playerIds.includes(e.source) && playerIds.includes(e.target)));

const noKaiju = make.player({ player:'No Kaiju Score', score:100, breakdown:{snake:100} });
assert.equal(noKaiju.nodes.find(n => n.id === 'kaiju').score, null);
assert.ok(!noKaiju.nodes.find(n => n.id === 'kaiju').label.includes('0'));
console.log('Arcade graph source parity: eight Worker games, five native destinations, and verified breakdowns PASS.');
