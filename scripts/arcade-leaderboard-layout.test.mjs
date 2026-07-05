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
const leaderboardHtml = await read('games/leaderboard.html');

assert.ok(
  leaderboardHtml.includes('leaderboard-hero wiki-living-hero swarmsy-hero') &&
    leaderboardHtml.includes('swarmsy-title wiki-living-title'),
  'leaderboard page must use the SWARMSY/living full-width hero contract',
);

assert.ok(
  leaderboardHtml.includes('class="lb-page"') &&
    leaderboardHtml.includes('class="lb-overview-grid"') &&
    leaderboardHtml.includes('class="lb-toolbar-card"'),
  'leaderboard page must keep the rearranged card/surface layout',
);

assert.ok(
  leaderboardHtml.includes('Score = leaderboard ranking only') &&
    leaderboardHtml.includes('Arcade XP needs Telegram sync and server acceptance') &&
    leaderboardHtml.includes('unsynced runs stay local/pending'),
  'leaderboard hero must explain score, server-accepted Arcade XP, and local/pending runs',
);

// ── Empty/missing/unaligned faction badge ────────────────────────────────────

assert.ok(
  leaderboardJs.includes('lb-faction lb-faction--empty'),
  'empty/missing/unaligned faction should render subtle empty badge class',
);

assert.ok(
  leaderboardJs.includes('aria-label="No faction"'),
  'empty/missing/unaligned faction should include a no-faction accessible label',
);

assert.ok(
  leaderboardJs.includes('>—</span>'),
  'empty/missing/unaligned faction should render a dash placeholder',
);

// No prominent "Unaligned" label should be generated for the empty faction path.
assert.ok(
  !leaderboardJs.includes("label: 'Unaligned'") &&
    !leaderboardJs.includes('label: "Unaligned"'),
  'faction badge should not emit a prominent Unaligned label for the empty path',
);

// ── Real faction rendering ────────────────────────────────────────────────────

assert.ok(
  leaderboardJs.includes('api.getVisualMeta(key)'),
  'real faction keys must still render using canonical visual metadata',
);

// ── Column headers ────────────────────────────────────────────────────────────

assert.ok(
  leaderboardJs.includes('lb-col-player') && leaderboardJs.includes('>Player<'),
  'leaderboard table must have a visible Player column',
);

assert.ok(
  leaderboardJs.includes('lb-col-faction') && leaderboardJs.includes('>Faction<'),
  'leaderboard table must have a visible Faction column',
);

assert.ok(
  leaderboardJs.includes('lb-col-score'),
  'leaderboard table must have a Score column',
);

assert.ok(
  leaderboardJs.includes('Score (Ranking)') || leaderboardJs.includes('Ranking uses score only'),
  'leaderboard score column should carry ranking guidance copy',
);

// ── Score cell layout ─────────────────────────────────────────────────────────

assert.ok(
  leaderboardJs.includes('class="lb-score-value"') &&
    leaderboardJs.includes('class="lb-score-sub"'),
  'leaderboard row rendering must keep lb-score-value and lb-score-sub wrappers for score layout',
);

console.log('arcade-leaderboard-layout.test: PASS');
