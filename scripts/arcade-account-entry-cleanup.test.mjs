import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const gamePages = [
  'games/chain-maze/index.html',
  'games/pac-chain/index.html',
  'games/meme-swarm-3008/index.html',
  'games/invaders-3008/index.html',
  'games/block-topia-quest-maze/index.html',
  'games/kaiju-sticker-battle/index.html',
];

for (const path of gamePages) {
  const html = read(path);
  assert.doesNotMatch(html, /data-tg-sync-cta|src="\/js\/components\/telegram-sync-cta\.js"/,
    path + ' does not render or load the duplicate sign-in banner');
  assert.match(html, /src="\/js\/identity-gate\.js"/,
    path + ' retains its shared Telegram identity enforcement');
  assert.match(html, /src="\/js\/game-fullscreen\.js(?:\?[^"]*)?"/,
    path + ' retains game fullscreen and protected score status');
  assert.match(html, /id="startBtn"/, path + ' retains its game Start control');
}

const leaderboard = read('games/leaderboard.html');
assert.doesNotMatch(leaderboard, /data-tg-sync-cta|src="\/js\/components\/telegram-sync-cta\.js"/,
  'Leaderboard has only its own verified status controls');
for (const marker of ['lb-linked-identity', 'lb-presence-toggle', 'lb-refresh-btn', 'lb-table-wrap', 'lb-breakdown-panel']) {
  assert.ok(leaderboard.includes('id="' + marker + '"'), 'Leaderboard preserves functional control ' + marker);
}
assert.match(leaderboard, /href="\/my-moonboy\.html"/, 'Leaderboard sends account management to My Moonboy');

const fullscreen = read('js/game-fullscreen.js');
const begin = fullscreen.indexOf('function updateSyncSurfaceState(');
const end = fullscreen.indexOf('function bindSubmissionStatus(', begin);
assert.ok(begin >= 0 && end > begin, 'Fullscreen game submission status controller remains present');
const status = fullscreen.slice(begin, end);
for (const marker of ["case 'linked_ready':", "case 'auto_submitting':", "case 'score_accepted':",
  "case 'xp_awarded':", "case 'auth_expired':", "case 'relink_required':", "case 'sync_error':",
  "case 'local_only':"]) {
  assert.ok(status.includes(marker), 'All score-state handling remains: ' + marker);
}
assert.match(status, /Unverified runs are not queued for later rewards/);
assert.match(status, /href="\/my-moonboy\.html"/);
assert.doesNotMatch(status, /href="\/gkniftyheads-incubator\.html"|Run \/gklink|Unsynced play stays local/,
  'Fullscreen game sign-in/status copy uses current website login without false pending-run promises');

const gate = read('js/identity-gate.js');
const submit = read('js/leaderboard-client.js');
assert.match(gate, /function enforceCompetitiveArcadePageGate\(/, 'Game hard gate is unchanged');
assert.match(gate, /function requireLinkedAccount\(/, 'Server-linked actions remain protected');
assert.match(gate, /\/telegram\/website\/start/, 'OIDC website sign-in remains available');
assert.match(submit, /NO_LOCAL_PENDING_COMPETITIVE_RUNS/, 'No pending competitive score queue is created');
assert.match(submit, /Log in with Telegram to save scores and earn XP\./,
  'Unauthenticated score submission is still rejected');

const account = read('my-moonboy.html');
assert.match(account, /data-telegram-login/, 'My Moonboy retains primary website login');
assert.match(account, /data-telegram-logout hidden/, 'My Moonboy retains logout and account switching');
assert.match(account, /id="mm-private" hidden/, 'Personal player data remains gated');
const community = read('gkniftyheads-incubator.html');
assert.match(community, /id="telegram-login-help"/,
  'Legacy signed bot-link callback and recovery remain available');

const comments = read('js/comments.js');
assert.match(comments, /For a verified Telegram account, open My Moonboy\./,
  'Article comment identity guidance uses central website entry');
assert.match(comments, /if \(!email && !telegramAuth\)/,
  'Email-only commenting remains supported independently of Telegram');
assert.match(read('js/faction-operations.js'), /const LOGIN_URL = '\/my-moonboy\.html';/,
  'Faction private account entry routes to My Moonboy');
const factionOps = read('js/faction-operations.js');
const guestHelp = factionOps.slice(factionOps.indexOf('function renderPrivate()'),
  factionOps.indexOf('const valid = verifiedOwnerState(snapshot)',factionOps.indexOf('function renderPrivate()')));
assert.match(guestHelp, /Open My Moonboy<\/a>/,
  'Faction guest account entry must clearly identify My Moonboy');
assert.doesNotMatch(guestHelp, /data-telegram-login/,
  'Faction guest link must navigate, not be caught by the delegated OIDC click handler');
assert.match(read('js/faction-chamber-page.js'), /href="\/my-moonboy\.html"/,
  'Faction chambers route optional account setup through My Moonboy');
console.log('arcade-account-entry-cleanup.test.mjs passed');
