import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

async function read(relPath) {
  return fs.readFile(path.join(ROOT, relPath), 'utf8');
}

const leaderboardJs = await read('js/arcade-leaderboard.js');

assert.ok(
  leaderboardJs.includes("lb-faction lb-faction--empty"),
  'empty/missing/unaligned faction should render subtle empty badge class',
);

assert.ok(
  leaderboardJs.includes("aria-label=\"No faction\">—</span>"),
  'empty/missing/unaligned faction should render a dash placeholder',
);

assert.ok(
  leaderboardJs.includes("if (!key || key === 'unaligned')"),
  'faction badge logic should suppress prominent Unaligned fallback rows',
);

assert.ok(
  leaderboardJs.includes('api.getVisualMeta(key)'),
  'real faction keys must still render using canonical visual metadata',
);

assert.ok(
  leaderboardJs.includes('<th scope="col" class="lb-col-player">Player</th>') &&
    leaderboardJs.includes('<th scope="col" class="lb-col-faction">Faction</th>') &&
    leaderboardJs.includes('class="lb-col-score" title="Ranking uses score only. Accepted scores can convert into Arcade XP after sync">Score (Ranking)</th>'),
  'leaderboard table must keep distinct Player/Faction/Score columns',
);

assert.ok(
  leaderboardJs.includes('class="lb-score-value"') &&
    leaderboardJs.includes('class="lb-score-sub"'),
  'leaderboard row rendering must keep lb-score-value and lb-score-sub wrappers for score layout',
);

console.log('arcade-leaderboard-layout.test: PASS');
