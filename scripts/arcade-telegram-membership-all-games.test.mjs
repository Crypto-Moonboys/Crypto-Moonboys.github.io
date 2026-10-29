import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');

const STANDARD_ARCADE_PAGES = [
  'games/meme-swarm-3008/index.html',
  'games/chain-maze/index.html',
  'games/forkfield/index.html',
  'games/bullrun-brick-smash/index.html',
  'games/block-topia-dropzone/index.html',
  'games/block-topia-quest-maze/index.html',
  'games/snake-run/index.html',
  'games/kaiju-sticker-battle/index.html',
];

for (const page of STANDARD_ARCADE_PAGES) {
  const html = read(page);
  assert.match(html, /requireCompetitiveGate\s*:\s*true/,
    page + ' must use the shared competitive page gate');
}

const identity = read('js/identity-gate.js');
assert.match(identity, /\/telegram\/group-membership/,
  'shared competitive gate must verify Telegram group membership server-side');
assert.match(identity, /data\.member\s*!==\s*true|data\.member !== true/,
  'shared competitive gate must reject non-members');
assert.match(identity, /TELEGRAM MEMBERS ONLY/,
  'shared Arcade gate must render the members-only UI');
assert.match(identity, /https:\/\/t\.me\/gkniftyheads/,
  'shared Arcade gate must link to the GKniftyHEADS group');

const nbg = read('games/nbg-london/index.html');
assert.match(nbg, /data-nbg-access-gate="telegram-group"/,
  'NBG London must retain its production Telegram group gate');
assert.match(read('game/nbg-london-leaderboards.js'), /\/telegram\/group-membership/,
  'NBG London must verify membership through the shared server endpoint');

const blockTopia = read('games/block-topia/index.html');
const groupGate = blockTopia.indexOf('enforceCompetitiveArcadePageGate({ gameId: "blocktopia" })');
const identityGate = blockTopia.indexOf('checkBlockTopiaGateIdentity(identity)');
const xpGate = blockTopia.indexOf('fetchProgressionForGate(telegramAuth)');
assert.ok(groupGate >= 0 && identityGate > groupGate && xpGate > identityGate,
  'Block Topia must verify group membership before identity/XP/multiplayer entry');

const deadRunRoute = read('workers/moonboys-api/routes/dead-run.js');
assert.match(deadRunRoute, /checkTelegramGroupMember/,
  'Dead Run server must use Telegram group membership authority');
for (const fn of ['handleProfile', 'handleStart', 'handleResume']) {
  const start = deadRunRoute.indexOf('async function ' + fn + '(');
  const end = deadRunRoute.indexOf('\nasync function ', start + 1);
  const body = deadRunRoute.slice(start, end > start ? end : undefined);
  assert.match(body, /verifyDeadRunEntryMembership/,
    'Dead Run ' + fn + ' must fail closed on membership before entry');
}

const deadRunApp = read('games/dead-run/app.js');
const deadRunHtml = read('games/dead-run/index.html');
assert.match(deadRunApp, /arcadeAccessGranted/,
  'Dead Run client must track verified membership access');
assert.match(deadRunApp, /if \(!arcadeAccessGranted\)[\s\S]*startDemo/,
  'Dead Run Demo Mode must not provide a guest-play bypass');
assert.match(deadRunApp, /telegram_group_membership_required/,
  'Dead Run client must show the group-required recovery path');
assert.match(deadRunHtml, /id="demoBtn"[^>]*disabled/,
  'Dead Run demo button must start fail-closed before verification');

console.log('All live web Arcade games require Telegram login + GKniftyHEADS membership.');
