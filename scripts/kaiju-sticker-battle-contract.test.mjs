import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function read(relPath) {
  return fs.readFile(path.join(ROOT, relPath), 'utf8');
}

const config = await read('js/arcade/games/kaiju-sticker-battle/config.js');
const bootstrap = await read('js/arcade/games/kaiju-sticker-battle/bootstrap.js');
const page = await read('games/kaiju-sticker-battle/index.html');
const manifest = await read('js/arcade/arcade-manifest.js');
const apiWorker = await read('workers/moonboys-api/worker.js');
const leaderboardWorker = await read('workers/leaderboard-worker.js');
const arcadeSync = await read('js/arcade-sync.js');

for (const name of ['Big Daddy Kong', 'God-Dzilla', 'Jet Jaguar', 'MC Rodan', 'MF Gidorah', 'Moth Def', 'Mecha-Zilla']) {
  assert(config.includes(name), `config includes ${name}`);
}

for (const key of ['pwr', 'size', 'atk', 'def', 'spd', 'lgcy']) {
  assert(config.includes(`key: '${key}'`), `config includes category ${key}`);
}

assert(bootstrap.includes("from '/js/leaderboard-client.js'"), 'bootstrap imports leaderboard client');
assert(bootstrap.includes('const BATTLES_PER_MATCH = 5'), 'battle has a fixed match boundary');
assert(bootstrap.includes('if (shouldSubmit)'), 'battle submits only at the match boundary');
assert(bootstrap.includes('submitScore(ArcadeSync.getPlayer(), state.score, GAME_ID)'), 'match submits cumulative accepted score');
assert(bootstrap.includes('battle-box'), 'bootstrap renders card images inside the battle box');
assert(bootstrap.includes('handleDuelMode'), 'bootstrap includes a waiting-for-players mode button handler');
assert(bootstrap.includes('drawCard(playerImg'), 'bootstrap draws card art into the battle arena');
assert(config.includes('/img/game/kong3008/grimey1.png'), 'config exposes cropped Kaiju UI PNG assets');
assert(config.includes('/img/game/kong3008/cards/big-daddy-kong.png'), 'config exposes playable full-card PNG assets');
assert(page.includes('VS CPU'), 'page includes CPU match mode button');
assert(page.includes('WAITING FOR PLAYERS'), 'page includes waiting-for-players mode button');
assert(page.includes('2 TELEGRAM USERS'), 'page includes 2 Telegram users mode button');
assert(page.includes('battle-box'), 'page includes the battle box layout for card images');
assert(page.includes('requireCompetitiveGate: true'), 'page uses competitive gate');
assert(page.includes("gameId: 'kaiju-sticker-battle'"), 'page passes route game id to identity gate');
assert(manifest.includes("id: 'kaiju'"), 'manifest exposes canonical kaiju game key');
assert(apiWorker.includes("'kaiju-sticker-battle': 'kaiju'"), 'moonboys API normalizes kaiju route key');
assert(apiWorker.includes("'btqm', 'kaiju', 'global'"), 'moonboys API allows kaiju XP progression');
assert(leaderboardWorker.includes('"kaiju"'), 'leaderboard worker includes kaiju board');
assert(leaderboardWorker.includes('VARIETY_BONUS_GAMES'), 'leaderboard worker keeps variety bonus roster versioned');
assert(arcadeSync.includes('"kaiju-sticker-battle": "kaiju"'), 'ArcadeSync normalizes kaiju route key');

console.log('kaiju-sticker-battle-contract.test: PASS');
