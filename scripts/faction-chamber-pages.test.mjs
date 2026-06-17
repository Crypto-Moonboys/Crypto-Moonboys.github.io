import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ROUTES = [
  '/battle-chamber/factions/index.html',
  '/battle-chamber/factions/hard-fork-rockers.html',
  '/battle-chamber/factions/rugpull-miners.html',
  '/battle-chamber/factions/graffpunks.html',
  '/battle-chamber/factions/blockchain-furies.html',
  '/battle-chamber/factions/crypto-moongirls.html',
  '/battle-chamber/factions/blockstars.html',
  '/battle-chamber/factions/all-city-bulls.html',
  '/battle-chamber/factions/nomad-bears.html',
  '/battle-chamber/factions/crypto-stoned-boys.html',
];

const FACTIONS = [
  { key: 'hard-fork-rockers', name: 'Hard Fork Rockers' },
  { key: 'rugpull-miners', name: 'Rugpull Miners' },
  { key: 'graffpunks', name: 'GraffPUNKS' },
  { key: 'blockchain-furies', name: 'Blockchain Furies' },
  { key: 'crypto-moongirls', name: 'Crypto Moongirls' },
  { key: 'blockstars', name: 'The Blockstars' },
  { key: 'all-city-bulls', name: 'All City Bulls' },
  { key: 'nomad-bears', name: 'Nomad Bears' },
  { key: 'crypto-stoned-boys', name: 'Crypto Stoned Boys' },
];

const FACTION_PAGE_ROUTES = FACTIONS.map((f) => `/battle-chamber/factions/${f.key}.html`);

const REQUIRED_SECTIONS = [
  'Faction Lore',
  'Current Perks',
  'Active Missions',
  'Weekly War Status',
  'Clout / Titles / Badge Track',
  'Roguelite Identity',
  'Live Proof Feed',
];

const FORBIDDEN_TERMS = [
  'passive income',
  'guaranteed rewards',
  'token rewards',
  'financial rewards',
  'investment',
  'earn money',
  'cash prizes',
];

const REQUIRED_SHARED_STACK_TAGS = [
  '/js/battle-chamber-faction-bridge.js',
  '/js/faction-profile-data.js',
  '/js/faction-chamber-page.js',
  '/css/faction-chamber.css',
];

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath.replace(/^\//, '')), 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasAttr(tag, attr, value) {
  const attrPattern = new RegExp(`\\s${attr}=(['\"])${escapeRegExp(value)}\\1`, 'i');
  return attrPattern.test(tag);
}

function linkTagsFor(html, href) {
  return html.match(/<link\b[^>]*>/gi)?.filter((tag) => hasAttr(tag, 'href', href)) || [];
}

function scriptTagsFor(html, src) {
  return html.match(/<script\b[^>]*>/gi)?.filter((tag) => hasAttr(tag, 'src', src)) || [];
}

function hasClassicScriptPreload(html, href) {
  return linkTagsFor(html, href).some((tag) => hasAttr(tag, 'rel', 'preload') && hasAttr(tag, 'as', 'script'));
}

function hasModulePreload(html, href) {
  return linkTagsFor(html, href).some((tag) => hasAttr(tag, 'rel', 'modulepreload'));
}

function hasModuleScript(html, src) {
  return scriptTagsFor(html, src).some((tag) => hasAttr(tag, 'type', 'module'));
}

function hasClassicScript(html, src) {
  return scriptTagsFor(html, src).some((tag) => !hasAttr(tag, 'type', 'module'));
}

let passed = 0;
let failed = 0;

function check(condition, label) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${label}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${label}`);
  }
}

console.log('\n─── Faction Chamber Pages Tests ──────────────────────────────\n');

console.log('[1] Required routes and shared CSS file exist');
for (const route of ROUTES) {
  const filePath = path.join(ROOT, route.replace(/^\//, ''));
  check(fs.existsSync(filePath), `${route} exists`);
}
check(fs.existsSync(path.join(ROOT, 'css/faction-chamber.css')), '/css/faction-chamber.css exists');

console.log('\n[2] Every chamber route loads shared stack and does not load wiki.js');
for (const route of ROUTES) {
  const html = read(route);
  for (const requiredTag of REQUIRED_SHARED_STACK_TAGS) {
    check(html.includes(requiredTag), `${route}: includes ${requiredTag}`);
  }
  check(hasModuleScript(html, '/js/battle-chamber-faction-bridge.js'), `${route}: runtime-loads Battle Chamber faction bridge as a module`);
  check(scriptTagsFor(html, '/js/battle-chamber-faction-bridge.js').some((tag) => hasAttr(tag, 'data-cfasync', 'false')), `${route}: bypasses Cloudflare Rocket Loader for bridge runtime module load`);
  check(hasClassicScript(html, '/js/faction-profile-data.js'), `${route}: runtime-loads shared faction profile data as a classic script`);
  check(hasClassicScript(html, '/js/faction-chamber-page.js'), `${route}: runtime-loads shared faction chamber renderer as a classic script`);
  check(!hasClassicScriptPreload(html, '/js/battle-chamber-faction-bridge.js'), `${route}: does not classic-preload Battle Chamber faction bridge module`);
  check(!hasModulePreload(html, '/js/battle-chamber-faction-bridge.js'), `${route}: does not modulepreload Battle Chamber faction bridge before runtime load`);
  check(!html.includes('/js/wiki.js'), `${route}: does not load /js/wiki.js`);
  check(!/<style[^>]*>[\s\S]*\.fcp-wrap\s+\.section[\s\S]*<\/style>/i.test(html), `${route}: no duplicated inline faction style block`);
}

console.log('\n[3] Faction pages include required content and CTAs');
for (const faction of FACTIONS) {
  const route = `/battle-chamber/factions/${faction.key}.html`;
  const html = read(route);

  check(html.includes(faction.name), `${faction.key}: faction name present`);
  check(/join this faction/i.test(html), `${faction.key}: join CTA present`);
  check(/<a[^>]+href="\/community\.html"[^>]*>Back to Battle Chamber<\/a>/i.test(html), `${faction.key}: explicit back to Battle Chamber link present`);
  check(html.includes('/games/'), `${faction.key}: arcade link present`);
  check(html.includes('/gkniftyheads-incubator.html'), `${faction.key}: Telegram link CTA present`);

  for (const heading of REQUIRED_SECTIONS) {
    check(html.includes(heading), `${faction.key}: section present - ${heading}`);
  }

  check(html.includes('Top Members / Clout Board'), `${faction.key}: top members/clout board section present`);
}

console.log('\n[4] Directory links and navigation');
const directoryHtml = read('/battle-chamber/factions/index.html');
for (const faction of FACTIONS) {
  check(directoryHtml.includes(`/battle-chamber/factions/${faction.key}.html`), `directory links to ${faction.key}.html`);
}
check(directoryHtml.includes('/community.html'), 'directory has Battle Chamber back link');
check(directoryHtml.includes('/games/'), 'directory has Arcade link');
check(directoryHtml.includes('/gkniftyheads-incubator.html'), 'directory has Telegram link');

console.log('\n[5] Community hub chamber links are live');
const communityHtml = read('/community.html');
check(!communityHtml.includes('#coming-next-faction-chambers'), 'community.html does not use #coming-next-faction-chambers placeholder links');

const hubRendererJs = read('/js/battle-chamber-factions.js');
for (const faction of FACTIONS) {
  check(hubRendererJs.includes(`'${faction.key}': '/battle-chamber/factions/${faction.key}.html'`) || hubRendererJs.includes(`${faction.key}: '/battle-chamber/factions/${faction.key}.html'`), `hub renderer maps ${faction.key} to real chamber route`);
}

console.log('\n[6] Old labels and forbidden wording are absent');
const chamberCorpus = [communityHtml, directoryHtml]
  .concat(FACTION_PAGE_ROUTES.map(read))
  .concat([read('/js/faction-profile-data.js'), read('/js/faction-chamber-page.js'), hubRendererJs])
  .join('\n')
  .toLowerCase();

check(!chamberCorpus.includes('diamond hands'), 'no Diamond Hands live chamber label');
check(!chamberCorpus.includes('hodl warriors'), 'no HODL Warriors live chamber label');
for (const term of FORBIDDEN_TERMS) {
  check(!chamberCorpus.includes(term), `forbidden wording absent: "${term}"`);
}

console.log('\n[7] Shared data and wiring integrity checks');
const profileDataJs = read('/js/faction-profile-data.js');
for (const faction of FACTIONS) {
  check(profileDataJs.includes(`'${faction.key}'`) || profileDataJs.includes(`"${faction.key}"`), `profile data contains key: ${faction.key}`);
}

// Guard against misleading faction wiki labels on mismatched pages
// These specific labels were previously flagged in review because they pointed
// to adjacent lore/character pages rather than canonical faction pages.
check(!profileDataJs.includes("label: 'Faction wiki: Hard Fork Games'"), 'profile data does not mislabel Hard Fork Games as faction wiki');
check(!profileDataJs.includes("label: 'Faction wiki: The Princess'"), 'profile data does not mislabel The Princess as faction wiki');
check(!profileDataJs.includes("label: 'Faction wiki: Blockchain GraffPUNKS'"), 'profile data does not mislabel Blockchain GraffPUNKS as faction wiki');
check(profileDataJs.includes("href: '/wiki/the-hard-fork-rockers.html'"), 'profile data links Hard Fork Rockers to canonical faction wiki page');
check(profileDataJs.includes("href: '/battle-chamber/factions/crypto-moongirls.html'"), 'profile data links Crypto Moongirls to canonical faction chamber page');
check(profileDataJs.includes("href: '/wiki/the-blockchain-furies.html'"), 'profile data links Blockchain Furies to canonical faction wiki page');

const chamberRendererJs = read('/js/faction-chamber-page.js');
check(chamberRendererJs.includes('MOONBOYS_FACTION'), 'renderer references MOONBOYS_FACTION');
check(chamberRendererJs.includes('MOONBOYS_WAR_DATA'), 'renderer references MOONBOYS_WAR_DATA');
check(chamberRendererJs.includes('MOONBOYS_MISSION_DATA'), 'renderer references MOONBOYS_MISSION_DATA');
check(chamberRendererJs.includes('FACTION_EFFECT_DEFS') || chamberRendererJs.includes('FACTION_DEFS'), 'renderer references faction effects defs');
check(chamberRendererJs.includes('MOONBOYS_FACTION_PROFILES'), 'renderer references MOONBOYS_FACTION_PROFILES');
check(chamberRendererJs.includes('battle-chamber:faction-data-ready'), 'renderer listens for battle-chamber:faction-data-ready');
check(chamberRendererJs.includes('faction:update'), 'renderer listens for faction:update');
check(chamberRendererJs.includes('moonboys:faction-status'), 'renderer listens for moonboys:faction-status');
check(chamberRendererJs.includes('moonboys:faction-boost'), 'renderer listens for moonboys:faction-boost');

// Guard that directory fallback is preserved when profile data/order are unavailable
check(chamberRendererJs.includes('if (!Array.isArray(order) || !order.length) return;'), 'renderer preserves directory fallback when profile order is unavailable');
check(chamberRendererJs.includes('if (!validKeys.length) return;'), 'renderer preserves directory fallback when profiles are unavailable');
check(chamberRendererJs.includes('grid.innerHTML = validKeys.map'), 'renderer only renders directory from validated profile keys');

const bridgeJs = read('/js/battle-chamber-faction-bridge.js');
check(bridgeJs.includes('getFactionStandings'), 'bridge uses faction-war-system standings');
check(bridgeJs.includes('getDailyMissions') && bridgeJs.includes('getSeasonalMissions'), 'bridge uses faction-missions daily and seasonal missions');
check(bridgeJs.includes('FACTION_DEFS'), 'bridge uses faction-effect-system effect defs');

console.log('\n[8] Faction pages use shared renderer/data stack (no disconnected per-page JS)');
for (const faction of FACTIONS) {
  const html = read(`/battle-chamber/factions/${faction.key}.html`);
  check(!html.includes(`/js/${faction.key}.js`), `${faction.key}: no per-page JS file`);
  check(!html.includes('/js/faction-page-'), `${faction.key}: no disconnected faction-page-* script`);
}

console.log('\n─── Result ───────────────────────────────────────────────────');
console.log(`  Passed : ${passed}`);
console.log(`  Failed : ${failed}`);
console.log('──────────────────────────────────────────────────────────────\n');

if (failed > 0) {
  process.exit(1);
}

console.log('Faction chamber pages tests PASSED.');
