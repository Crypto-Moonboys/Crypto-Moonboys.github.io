#!/usr/bin/env node
/**
 * Guard the public onboarding copy for the current Arcade XP system.
 *
 * The product language must keep score, local roguelite previews, and
 * server-accepted Arcade XP separate.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

let passed = 0;
let failed = 0;

function check(condition, label) {
  if (condition) {
    passed += 1;
    console.log(`  [PASS] ${label}`);
  } else {
    failed += 1;
    console.error(`  [FAIL] ${label}`);
  }
}

const howToPlay = read('how-to-play.html');
const gamesIndex = read('games/index.html');
const leaderboard = read('games/leaderboard.html');
const blockTopia = read('games/block-topia/index.html');
const corpus = [howToPlay, gamesIndex, leaderboard, blockTopia].join('\n');

console.log('\n--- How To Play XP Copy Contract ---\n');

check(howToPlay.includes('Score ranks the run. Arcade XP is awarded only after accepted sync through the server progression flow.'), 'manual separates score ranking from awarded Arcade XP');
check(howToPlay.includes('All active arcade games submit through the shared <code>submitScore()</code> path.'), 'manual documents shared submitScore path');
check(howToPlay.includes('runs stay browser-local/pending until Telegram is linked'), 'manual documents local/pending unlinked runs');
check(howToPlay.includes('dedupe, caps, anti-farm checks, and final Arcade XP awards are decided'), 'manual documents server authority and anti-farm checks');
check(howToPlay.includes('not final XP authority'), 'manual distinguishes local roguelite previews from final XP authority');
check(howToPlay.includes('The default multiplayer gate is 50 Arcade XP.'), 'manual documents Block Topia default Arcade XP gate');

check(gamesIndex.includes('All active games feed the shared submit path.'), 'games hub documents shared submit path');
check(gamesIndex.includes('Unlinked runs can stay browser-local/pending'), 'games hub documents unlinked pending state');
check(gamesIndex.includes('server, where dedupe, caps, and anti-farm checks decide final awards'), 'games hub documents server-award authority');
check(gamesIndex.includes('Score ranks runs; server-accepted XP does not affect rank.'), 'games hub keeps score and XP rank separate');

check(leaderboard.includes('Score = leaderboard ranking only.'), 'leaderboard keeps score ranking language');
check(leaderboard.includes('only after Telegram sync and server acceptance'), 'leaderboard requires server acceptance for Arcade XP');
check(leaderboard.includes('unsynced runs stay local/pending'), 'leaderboard documents local/pending unlinked runs');

check(blockTopia.includes('server-accepted scores can convert into Arcade XP'), 'Block Topia gate requires server-accepted score conversion');
check(blockTopia.includes('accepted scores can become server-backed Arcade XP'), 'Block Topia gate copy says server-backed Arcade XP');

check(!/Score\s*=\s*Arcade XP/i.test(corpus), 'public onboarding copy never equates score with Arcade XP');
check(!/XP proves a player/i.test(corpus), 'manual avoids vague old XP claim');
check(!/accepted long-term progression/i.test(corpus), 'manual removes vague old accepted-progression wording');

console.log('\n--- Result ---');
console.log(`  Passed : ${passed}`);
console.log(`  Failed : ${failed}`);

if (failed > 0) {
  console.error(`How To Play XP copy contract FAILED with ${failed} failure(s).\n`);
  process.exit(1);
}

console.log('How To Play XP copy contract PASSED.\n');
