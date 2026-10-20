import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL('../' + relative, import.meta.url), 'utf8');
const home = read('index.html');
const account = read('my-moonboy.html');
const games = read('games/index.html');
const chamber = read('community.html');
const manual = read('how-to-play.html');
const community = read('gkniftyheads-incubator.html');
const wiki = read('wiki/crypto-moonboys.html');

const ctas = home.match(/<nav class="simple-actions"[^>]*>([\s\S]*?)<\/nav>/)?.[1] || '';
assert.deepEqual([...ctas.matchAll(/href="([^"]+)"/g)].map(m => m[1]), [
  '/my-moonboy.html', '/swarmsy.html', '/gkniftyheads-incubator.html',
], 'Homepage offers exactly the three approved entry CTAs in order');
assert.match(home, /id="build-moonboy"/);
assert.match(home, /href="\/gpt-users\.html"/, 'Independent web AI route remains available');
assert.doesNotMatch(home, /<h2>Choose how <span>you start/, 'Homepage no longer duplicates route instructions');

const hub = account.indexOf('id="mm-start-here"');
const gate = account.indexOf('id="mm-gate"');
const privatePanel = account.indexOf('id="mm-private" hidden');
assert.ok(hub > 0 && hub < gate && gate < privatePanel, 'Route directory is public, private data remains behind sign-in gate');
for (const route of [
  '/#build-moonboy', '/games/', '/battle-chamber/factions/index.html',
  '/gkniftyheads-incubator.html', '/community.html#live-battle-chamber',
  '/gpt-users.html', '/swarmsy.html', '/how-to-play.html', '/wiki/crypto-moonboys.html',
]) {
  assert.ok(account.includes(`href="${route}"`), `My Moonboy must link ${route}`);
}
for (const guard of ['data-telegram-login', 'id="mm-results"', 'id="mm-checklist"', 'id="mm-economy-guide"']) {
  assert.ok(account.includes(guard), `My Moonboy authentication/mission control must retain ${guard}`);
}

assert.match(community, /href="https:\/\/t\.me\/gkniftyheads"/, 'Community leads to live Telegram group');
assert.match(community, /id="telegram-login-help"/, 'Existing sign-in recovery hash remains valid');
for (const hook of ['incubator-sync-state', 'incubator-sync-identity', 'incubator-sync-message', 'incubator-status-panel']) {
  assert.ok(community.includes(`id="${hook}"`), `Community retains existing sync hook: ${hook}`);
}
assert.doesNotMatch(community, /<h2>Why Link Telegram\?<\/h2>/);

for (const hook of [
  'gklink-status', 'battle-join-faction', 'battle-active-missions',
  'battle-crew-operations-today', 'battle-my-contribution-today',
  'battle-faction-standings', 'battle-monthly-clout', 'battle-seasonal-campaign',
  'battle-faction-reward-unlocks', 'battle-faction-proof-feed',
  'tg-activity-feed', 'tg-community-leaderboard',
]) {
  assert.ok(chamber.includes(`id="${hook}"`), `Battle Chamber must preserve live hook: ${hook}`);
}
assert.match(chamber, /FACTIONS\. MISSIONS\. CLOUT\./);
assert.doesNotMatch(chamber, /<h2>Choose the Correct Path<\/h2>/);

for (const hook of ['arcade-games', 'telegram-games', 'roguelite-loop-board', 'roguelite-daily-digest-summary', 'arcade-status-panel']) {
  assert.ok(games.includes(`id="${hook}"`), `Arcade must retain ${hook}`);
}
assert.doesNotMatch(games, /Bot menu setup\.|data-tg-sync-cta/, 'Arcade does not repeat outdated BotFather/login instructions');
assert.match(manual, /Score and XP are different/);
assert.doesNotMatch(manual, /Step 1: Link Telegram Before Competitive Play|data-tg-sync-cta/);

assert.match(wiki, /<!-- CANONICAL_CONTENT:BEGIN -->[\s\S]*<!-- CANONICAL_CONTENT:END -->/);
assert.match(wiki, /<!-- RELATED_WIKI_PATHS:BEGIN -->[\s\S]*<!-- RELATED_WIKI_PATHS:END -->/, 'Reference wiki retains full generated related paths');
const wikiCss = read('css/wiki.css');
assert.match(wikiCss, /body\.page-wiki\[data-entity-hash="a4b462cb5857"\] \.related-wiki-paths[\s\S]*?max-height:/, 'Reference wiki directory is height limited without editing protected markup');
console.log('website-onboarding-entry.test.mjs passed');
