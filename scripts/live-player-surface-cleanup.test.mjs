import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const games = read('games/index.html');
const incubator = read('gkniftyheads-incubator.html');
const chamber = read('community.html');
const petGuide = read('how-to-play-crypto-moonboy-pets.html');
const account = read('my-moonboy.html');
const leaderboard = read('games/leaderboard.html');
const petLeaderboard = read('crypto-moonboy-pets-leaderboard.html');
const siteShell = read('js/site-shell.js');
const csp = read('js/components/connection-status-panel.js');
const comments = read('js/comments.js');

// The main Games hub offers actual games, not browser-local preview telemetry.
for (const id of ['arcade-games', 'telegram-games']) {
  assert.ok(games.includes('id="' + id + '"'), 'Games must preserve playable route ' + id);
}
assert.doesNotMatch(games, /roguelite-loop-board|roguelite-daily-digest-summary|arcade-status-panel|ArcadeMeta\.getState\(\)|Server-accepted Arcade XP:/,
  'Games hub must not duplicate or falsely certify browser-local progression');
assert.match(games, /href="\/my-moonboy\.html"/, 'Game hub links to the verified personal account');

// Account callback and status remain, but a second full player feed does not.
for (const id of ['incubator-sync-state', 'incubator-sync-identity', 'incubator-sync-message', 'telegram-login-help']) {
  assert.ok(incubator.includes('id="' + id + '"'), 'Incubator retains account/recovery control ' + id);
}
assert.doesNotMatch(incubator, /data-csp-panel|incubator-status-panel/, 'Community Incubator omits duplicate player feed');
assert.doesNotMatch(chamber, /data-crypto-pets-summary/, 'Battle Chamber leaves personal MoonPet data to pet/account routes');
for (const id of ['battle-active-missions', 'battle-faction-standings', 'battle-join-faction', 'battle-faction-proof-feed']) {
  assert.ok(chamber.includes('id="' + id + '"'), 'Faction gameplay keeps ' + id);
}

// Reference guides offer links, not private API calls or mission dashboards.
assert.doesNotMatch(petGuide, /data-crypto-pets-missions|src="\/js\/crypto-moonboy-pets\.js/,
  'MoonPet reference guide must not load personal status widgets');
assert.match(petGuide, /href="\/my-moonboy\.html"/);
assert.match(petGuide, /href="\/moonpet-game\.html"/);
assert.match(account, /id="mm-private" hidden/, 'Personal account keeps its private data gate');
assert.match(account, /data-telegram-logout hidden/, 'My Moonboy retains logout/account switching');

// Public links are public; restricted data and authenticating requests are not.
assert.match(siteShell, /label: 'MY MOONBOY', href: '\/my-moonboy\.html'/);
assert.doesNotMatch(siteShell, /label: 'MY MOONBOY'[^\n]*linkedOnly:\s*true/);
const badge = csp.slice(csp.indexOf('async function buildBadgeHTML()'), csp.indexOf('// ── CSS injection'));
assert.ok(badge.length > 100, 'Global badge implementation must be present');
assert.match(badge, /getSignedTelegramAuth/);
assert.match(badge, /href="\/my-moonboy\.html"/);
assert.doesNotMatch(badge, /checkApiOnline\(\)|fetchRequiredXp\(\)|data-csp-badge-xp|data-csp-badge-bt/,
  'Global badge confirms identity only without fetching player XP or Block Topia eligibility');

// Real ranking and gameplay surfaces stay intact.
for (const id of ['lb-linked-identity', 'lb-presence-toggle', 'lb-refresh-btn', 'lb-table-wrap', 'lb-breakdown-panel']) {
  assert.ok(leaderboard.includes('id="' + id + '"'), 'Leaderboard retains its live data control ' + id);
}
assert.doesNotMatch(leaderboard, /id="lb-status-panel"|unsynced runs stay local\/pending|Run \/gklink to store ranking/,
  'Leaderboard does not mount an orphan status card or publish obsolete auth copy');
assert.match(petLeaderboard, /data-crypto-pets-leaderboard/, 'Dedicated MoonPet leaderboard retains server-backed ranking');
const commentForm = comments.slice(comments.indexOf('function buildForm(pageId)'), comments.indexOf('function wireForm('));
assert.match(commentForm, /buildTelegramIdentityCard\(pageId\)/);
assert.match(commentForm, /name="text"/);
assert.doesNotMatch(commentForm, /buildTelegramBenefitsCard\(\)|buildTopContributorsHTML\(\)|buildInfoCards\(\)/,
  'Wiki article comment form must not reintroduce global onboarding and contributor panels');
assert.match(comments, /function wireForm\(/);
assert.match(comments, /function loadComments\(/);
console.log('live-player-surface-cleanup.test.mjs passed');
