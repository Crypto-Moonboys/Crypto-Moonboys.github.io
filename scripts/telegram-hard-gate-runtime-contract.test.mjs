import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const check = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
};

const identityGate = read('js/identity-gate.js');
const leaderboardClient = read('js/leaderboard-client.js');
const gamesIndex = read('games/index.html');
const leaderboardPage = read('games/leaderboard.html');

console.log('\n--- Telegram Hard-Gate Runtime Contract ---\n');

check(identityGate.includes('requireLinkedAccount'), 'shared identity gate exposes linked-account enforcement');
check(identityGate.includes('getFreshTelegramAuth'), 'shared identity gate exposes fresh Telegram auth restoration');
check(leaderboardClient.includes('if (!linked)'), 'score submission rejects unlinked identity');
check(leaderboardClient.includes('Fresh Telegram auth is required to save scores and earn XP.'), 'score submission rejects missing or expired signed auth');
check(!gamesIndex.includes('browser-local/pending'), 'Arcade hub rejects browser-local pending-run copy');
check(!gamesIndex.includes('Local runs stay pending'), 'Arcade hub rejects local pending-run copy');
check(gamesIndex.includes('Telegram identity is required before competitive Arcade access'), 'Arcade hub states the hard identity gate');
check(gamesIndex.includes('5000 server-accepted Arcade XP'), 'Arcade hub keeps the 5000 XP Block Topia gate');
check(!/Guest-|anonymous leaderboard|hidden leaderboard/i.test(leaderboardPage), 'leaderboard page does not advertise guest or hidden competition');

// These markers must be implemented by the runtime follow-up before merge.
check(identityGate.includes('enforceCompetitiveArcadePageGate'), 'direct competitive game routes are hard-gated before gameplay boot');
check(leaderboardClient.includes('NO_LOCAL_PENDING_COMPETITIVE_RUNS'), 'leaderboard client explicitly forbids local pending competitive runs');

if (process.exitCode) {
  console.error('\nTelegram hard-gate runtime contract is not yet complete.');
} else {
  console.log('\nTelegram hard-gate runtime contract passed.');
}
