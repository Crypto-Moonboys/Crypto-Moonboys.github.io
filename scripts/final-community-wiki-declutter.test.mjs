import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const chamber = read('community.html');
const comments = read('js/comments.js');
const wikiStyles = read('css/wiki.css');
const account = read('my-moonboy.html');
const contributor = read('js/wiki-live-contributors.js');

// Battle Chamber keeps all public and private functional hooks while reducing
// the number of simultaneously expanded sections.
for (const hook of [
  'battle-join-faction', 'battle-active-missions', 'battle-todays-active-options',
  'battle-faction-standings', 'battle-weekly-war', 'battle-monthly-clout',
  'battle-seasonal-campaign', 'battle-clout-rewards',
  'battle-faction-reward-unlocks', 'battle-faction-proof-feed',
  'battle-missed-perks-history', 'tg-activity-feed', 'tg-community-leaderboard',
  'data-fop-crew', 'data-fop-private'
]) {
  assert.ok(chamber.includes(hook), 'Live Battle Chamber hook remains: ' + hook);
}
for (const key of ['battle-crew-operations-today', 'battle-my-contribution-today']) {
  const tag = chamber.match(new RegExp('<details\\b[^>]*\\bid="' + key + '"[^>]*>'))?.[0] || '';
  assert.ok(tag, 'Crew/member section remains in a real toggle: ' + key);
  assert.doesNotMatch(tag, /\sopen(?:\s|=|>)/, 'Extended crew/member details start collapsed: ' + key);
}
assert.match(chamber, /id="tasks-quests-and-xp"/, 'Legacy mission deep link remains');
assert.match(chamber, /id="live-battle-chamber"/, 'Legacy standings deep link remains');
assert.doesNotMatch(chamber, /<section class="section" id="tasks-quests-and-xp"><h2>/,
  'Duplicated empty missions header no longer fills the page');
assert.doesNotMatch(chamber, /<section class="section" id="live-battle-chamber"><h2>/,
  'Duplicated standings header no longer fills the page');
assert.match(chamber, /<details class="section bc-disclosure" open>[\s\S]*?Join a Faction/, 'Faction entry remains initially available');
assert.match(chamber, /<details class="section bc-disclosure" open>[\s\S]*?Active Faction Missions/, 'Active missions remain initially visible');
assert.match(chamber, /<details class="section bc-disclosure" open>[\s\S]*?Faction War Standings/, 'Live standings remain initially visible');
assert.match(chamber, /href="\/my-moonboy\.html\?tab=faction"/, 'Personal faction claims link to central account');
assert.match(chamber, /Top Contributors &amp; XP Chart/, 'Actual Battle Chamber contributor chart remains');
const factionLinks = [...chamber.matchAll(/href="(\/battle-chamber\/factions\/[^"]+\.html)"/g)]
  .map(match => match[1])
  .filter(href => !href.endsWith('/index.html'));
assert.equal(new Set(factionLinks).size, 9, 'All nine published faction chambers remain alongside the directory link');

// Article comment widgets keep direct, optional interaction and one tiny
// contextual account state. No legacy mock top-five scores or signup cards.
for (const x of [
  'function buildForm(pageId)', 'function wireForm(', 'function wireVotes(',
  "CustomEvent('moonboys:comment-posted'", "if (!email && !telegramAuth)",
  'function injectTelegramWidget(container)', 'function updateCommentIdentityCopy(form)'
]) {
  assert.ok(comments.includes(x), 'Wiki comment action intact: ' + x);
}
assert.match(comments, /class="cm-comment-account"/);
assert.match(comments, /class="cm-tg-status"/);
assert.match(comments, /href="\/my-moonboy\.html"/);
assert.match(comments, /Email comments work without Telegram/);
assert.doesNotMatch(comments, /FALLBACK_TOP_CONTRIBUTORS|function getContributorData\(|function robotAvatar\(|function buildTopContributorsHTML\(|function buildTelegramBenefitsCard\(|function buildInfoCards\(|function wireTopContributors\(/,
  'Wiki article comments contain no orphaned mock contributor or duplicate onboarding builders');
const form = comments.slice(comments.indexOf('function buildForm(pageId)'),
  comments.indexOf('function wireForm('));
assert.ok(form.includes('buildTelegramIdentityCard(pageId)'), 'Contextual status mounts inside article form');
assert.doesNotMatch(form, /comments-link-grid|comments-top-contributors|buildInfoCards/,
  'The form has no duplicate identity/leaderboard sidebar');
assert.match(wikiStyles, /body\.page-wiki \.cm-comment-account \{/,
  'Inline identity information is visibly laid out in Wiki pages');
assert.match(wikiStyles, /cm-comment-account-link:focus-visible/,
  'The link remains keyboard-accessible');
assert.match(contributor, /function aggregate\(comments, period\)/,
  'Specialized opt-in contributor page still uses actual comment data, not mocks');
assert.match(account, /id="mm-private" hidden/,
  'My Moonboy personal data remains behind its existing login gate');

console.log('final-community-wiki-declutter.test.mjs passed');
