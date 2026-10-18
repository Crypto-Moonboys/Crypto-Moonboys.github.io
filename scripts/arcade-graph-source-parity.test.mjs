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

// Match canonical worker keys rather than obsolete graphic aliases.
const workerGames = JSON.parse(worker.match(/const GAMES = (\[[^\]]+\]);/u)?.[1] || '[]');
const tabs = leaderboard.match(/const RAW_TABS = \[([\s\S]*?)\];/u)?.[1] || '';
const tabGames = [...tabs.matchAll(/key:\s*'([^']+)'/gu)].map(m => m[1]).filter(x => x !== 'global');
assert.equal(workerGames.length, 8, 'worker must advertise eight ranked Arcade titles');
assert.deepEqual(tabGames, workerGames, 'visible tabs must match Worker ranking games');
assert.match(html, /Kaiju<\/span>/u, 'graph legend must include Kaiju');

// Exercise the actual graph node and edge builders, not just text matching.
const script = graphSource.replace(/^export\s+/gmu, '') + 