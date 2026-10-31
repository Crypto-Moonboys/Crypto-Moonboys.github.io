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
const identityGate = blockTopia.indexOf('const verified = await checkBlockTopiaGateIdentity(identity)', groupGate);
const xpGate = blockTopia.indexOf('progression = await fetchProgressionForGate(telegramAuth)', identityGate);
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


const membershipApi = read('workers/moonboys-api/telegram-group-membership.js');
assert.match(membershipApi, /verifyTelegramMiniAppInitData/,
  'shared membership endpoint must accept signed Mini App identity for native games');
assert.match(membershipApi, /verifyMembershipActor/,
  'shared membership endpoint must resolve website and Mini App identities through one actor gate');

const launcher = read('games/telegram/index.html');
assert.match(launcher, /\/telegram\/group-membership/,
  'Telegram games launcher must verify group membership before enabling links');
assert.ok(
  launcher.indexOf("setStatus('Checking GKniftyHEADS membership...')") <
    launcher.indexOf('accountReady = true'),
  'Telegram launcher must check group membership before it marks the account ready'
);
assert.match(launcher, /TELEGRAM MEMBERS ONLY/,
  'Telegram launcher must show members-only recovery copy for non-members');

const moonpet = read('js/moonpet-mini-app.js');
assert.match(moonpet, /verifyMoonpetGroupMembership/,
  'MoonPet must verify group membership before reading game state');
assert.ok(
  moonpet.indexOf('var membership = await verifyMoonpetGroupMembership()') <
    moonpet.indexOf("var initialStateRequest = post('/telegram-pets/app/state'"),
  'MoonPet membership must be verified before any player state is loaded'
);
assert.match(moonpet, /panel\('TELEGRAM MEMBERS ONLY'/,
  'MoonPet must render an explicit members-only lock screen');

const moonpetHtml = read('moonpet-game.html');
assert.match(moonpetHtml, /moonpet-mini-app\.js\?v=20261031-countdown-pr2-v1/,
  'MoonPet must publish the cache-busted membership-gated client');
assert.match(launcher, /moonpet-game\.html\?v=20261029-members-only-v1/,
  'Telegram launcher must open the membership-gated MoonPet release');
assert.match(launcher, /dead-run\/\?v=20261029-members-only-v1/,
  'Telegram launcher must open the membership-gated Dead Run release');

console.log('All live games require Telegram login + GKniftyHEADS membership.');
