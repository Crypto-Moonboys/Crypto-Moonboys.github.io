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
const blockTopiaStyles = read('games/block-topia/styles.css');
const corpus = [howToPlay, gamesIndex, leaderboard, blockTopia].join('\n');

console.log('\n--- How To Play XP Copy Contract ---\n');

check(howToPlay.includes('Score alone is not an XP award.'), 'manual separates score ranking from awarded Arcade XP');
check(howToPlay.includes('All active arcade games submit through the shared <code>submitScore()</code> path.'), 'manual documents shared submitScore path');
check(howToPlay.includes('Unlinked users cannot enter the competitive Arcade'), 'manual documents hard Telegram identity gate for Arcade');
check(howToPlay.includes('dedupe, caps, anti-farm checks, and final Arcade XP awards are decided'), 'manual documents server authority and anti-farm checks');
check(howToPlay.includes('No unlinked Arcade XP is earned or retained.'), 'manual states no unlinked XP is earned or retained');
check(howToPlay.includes('5000 Arcade XP'), 'manual documents Block Topia 5000 Arcade XP gate');
check(!howToPlay.includes('runs stay browser-local/pending'), 'how-to-play rejects local/pending unlinked run copy');
check(!howToPlay.includes('not final XP authority'), 'how-to-play rejects old local roguelite XP authority copy');
check(!howToPlay.includes('play freely'), 'how-to-play rejects play-before-link copy');
check(!/50 Arcade XP/i.test(howToPlay), 'how-to-play never references 50 XP gate');

check(gamesIndex.includes('All active games feed the shared submit path.'), 'games hub documents shared submit path');
check(!gamesIndex.includes('browser-local/pending'), 'games hub rejects browser-local/pending copy');
check(!gamesIndex.includes('Local runs stay pending'), 'games hub rejects local-runs-stay-pending copy');
check(!gamesIndex.includes('Unlinked runs'), 'games hub rejects unlinked runs copy');
check(!gamesIndex.includes('play freely before'), 'games hub rejects play-before-link copy');
check(!gamesIndex.includes('anonymous leaderboard'), 'games hub rejects anonymous leaderboard copy');
check(gamesIndex.includes('server, where dedupe, caps, and anti-farm checks decide final awards'), 'games hub documents server-award authority');
check(gamesIndex.includes('Score ranks runs; server-accepted XP does not affect rank.'), 'games hub keeps score and XP rank separate');
check(gamesIndex.includes('after Telegram link and server acceptance'), 'games hub top notice requires server acceptance');
check(gamesIndex.includes('only after Telegram sync and server acceptance'), 'games hub system notice requires Telegram sync and server acceptance');
check(gamesIndex.includes('after server acceptance'), 'games hub game cards mention server acceptance for XP sync');
check(gamesIndex.includes('after Telegram sync and server acceptance'), 'BTQM card mentions server acceptance for XP conversion');
check(gamesIndex.includes('Telegram identity is required before competitive Arcade access'), 'games hub states Telegram identity required before Arcade');
check(gamesIndex.includes('no unlinked scores are submitted'), 'games hub states no unlinked scores are submitted or saved');
check(gamesIndex.includes('no unlinked Arcade XP is earned or retained'), 'games hub states no unlinked Arcade XP earned or retained');
check(gamesIndex.includes('5000 server-accepted Arcade XP'), 'games hub documents 5000 Arcade XP Block Topia gate');

check(leaderboard.includes('Score = leaderboard ranking only.'), 'leaderboard keeps score ranking language');
check(leaderboard.includes('only after Telegram sync and server acceptance'), 'leaderboard requires server acceptance for Arcade XP');
check(leaderboard.includes('unsynced runs stay local/pending'), 'leaderboard documents local/pending unlinked runs');

check(blockTopia.includes('ARCADE XP REQUIRED'), 'Block Topia gate renders dynamic XP required text');
check(blockTopia.includes('BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP'), 'Block Topia gate uses live required-XP constant');
check(blockTopia.includes('aria-label="XP progress"'), 'Block Topia gate includes XP progress bar');
check(!blockTopia.includes('server-accepted scores can convert into Arcade XP'), 'Block Topia gate has no hidden copy comments gaming the test');
check(!blockTopia.includes('accepted scores can become server-backed Arcade XP'), 'Block Topia gate has no hidden copy comments gaming the test (2)');
check(blockTopia.includes('ENTER BLOCK TOPIA'), 'Block Topia gate has unlocked ENTER CTA');
check(blockTopia.includes('LINK TELEGRAM'), 'Block Topia gate has unlinked LINK TELEGRAM CTA');
check(blockTopiaStyles.includes('overflow-y: auto'), 'Block Topia gate CSS permits vertical overflow on short viewports');
check(blockTopiaStyles.includes('max-height: 600px'), 'Block Topia gate CSS has compact-height media query for phone landscape');
check(blockTopiaStyles.includes('prefers-reduced-motion'), 'Block Topia gate CSS respects prefers-reduced-motion');
check(blockTopiaStyles.includes('block-topia-metaverse-portal'), 'Block Topia gate CSS references new portal artwork');

// Particle script must check prefers-reduced-motion at the JS runtime level
check(blockTopia.includes("matchMedia('(prefers-reduced-motion: reduce)')"), 'Block Topia particle script checks prefers-reduced-motion via matchMedia');
check(blockTopia.includes('prefersReducedMotion()'), 'Block Topia particle script guards init/draw behind prefersReducedMotion helper');
check(blockTopia.includes("reduceMotionMQ.addEventListener('change'"), 'Block Topia particle script reacts to preference changes via change listener');

// Portal hero asset must be a real full-size image, not a placeholder
const portalImagePath = path.join(ROOT, 'img/game/backgrounds/block-topia-metaverse-portal.jpg');
const MIN_PORTAL_BYTES = 10000; // a real cinematic background image should be at least 10 KB
let portalStat;
try { portalStat = fs.statSync(portalImagePath); } catch (_) { portalStat = null; }
check(portalStat !== null, 'Block Topia portal image exists at img/game/backgrounds/block-topia-metaverse-portal.jpg');
check(portalStat !== null && portalStat.size >= MIN_PORTAL_BYTES, `Block Topia portal image is a real asset (>= ${MIN_PORTAL_BYTES} bytes; got ${portalStat ? portalStat.size : 0})`);

check(!/Score\s*=\s*Arcade XP/i.test(corpus), 'public onboarding copy never equates score with Arcade XP');
check(!/XP proves a player/i.test(corpus), 'manual avoids vague old XP claim');
check(!/accepted long-term progression/i.test(corpus), 'manual removes vague old accepted-progression wording');
check(!/can convert (?:to|into) Arcade XP after Telegram sync(?! and server acceptance)/i.test(gamesIndex), 'games hub has no stale Telegram-only XP conversion copy');
check(!/sync (?:into shared progression|Arcade XP) after Telegram link(?! and server acceptance)/i.test(gamesIndex), 'games hub has no stale Telegram-link-only XP sync copy');

console.log('\n--- Result ---');
console.log(`  Passed : ${passed}`);
console.log(`  Failed : ${failed}`);

if (failed > 0) {
  console.error(`How To Play XP copy contract FAILED with ${failed} failure(s).\n`);
  process.exit(1);
}

console.log('How To Play XP copy contract PASSED.\n');
