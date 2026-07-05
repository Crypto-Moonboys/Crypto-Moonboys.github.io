/**
 * battle-chamber-faction-page.test.mjs
 *
 * CI guard for the Battle Chamber Faction Wars hub page (community.html),
 * the renderer (js/battle-chamber-factions.js), and the data bridge
 * (js/battle-chamber-faction-bridge.js).
 *
 * Fails if any of the following is violated:
 *   - community.html does not include "Battle Chamber: Faction Wars"
 *   - community.html does not include all 9 live faction names
 *   - community.html does not include weekly, monthly, and seasonal sections
 *   - community.html does not include the Telegram leaderboard container
 *   - community.html does not include the activity feed container
 *   - community.html does not load telegram-community.js
 *   - community.html does not load battle-chamber-factions.js
 *   - community.html does not load the bridge before the renderer
 *   - community.html contains old live faction names "Diamond Hands" or "HODL Warriors"
 *   - community.html uses forbidden reward wording
 *   - battle-chamber-factions.js references old faction names as current live factions
 *   - battle-chamber-factions.js does not import/reference existing faction systems
 *   - bridge does not import faction-war-system.js / faction-missions.js / faction-effect-system.js
 *   - bridge does not assign window.MOONBOYS_WAR_DATA / MOONBOYS_MISSION_DATA / FACTION_EFFECT_DEFS
 *   - renderer does not listen for battle-chamber:faction-data-ready
 *   - renderer does not call MOONBOYS_FACTION.loadStatus on init
 *   - join buttons do not check isTelegramLinked before calling joinFaction
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const COMMUNITY_FILE = path.join(ROOT, 'community.html');
const BC_FACTIONS_FILE = path.join(ROOT, 'js', 'battle-chamber-factions.js');
const BC_BRIDGE_FILE = path.join(ROOT, 'js', 'battle-chamber-faction-bridge.js');
const ACTION_CARDS_CSS_FILE = path.join(ROOT, 'css', 'action-page-cards.css');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`  [PASS] ${label}`);
  passed++;
}

function fail(label) {
  console.error(`  [FAIL] ${label}`);
  failed++;
}

function check(condition, label) {
  if (condition) {
    pass(label);
  } else {
    fail(label);
  }
}

console.log('\n─── Battle Chamber Faction Page Tests ─────────────────────────\n');

// ── File existence ────────────────────────────────────────────────────────────

check(fs.existsSync(COMMUNITY_FILE), 'community.html exists');
check(fs.existsSync(BC_FACTIONS_FILE), 'js/battle-chamber-factions.js exists');
check(fs.existsSync(BC_BRIDGE_FILE), 'js/battle-chamber-faction-bridge.js exists');
check(fs.existsSync(ACTION_CARDS_CSS_FILE), 'css/action-page-cards.css exists');

const communityHtml = fs.existsSync(COMMUNITY_FILE) ? read(COMMUNITY_FILE) : '';
const bcFactionsJs = fs.existsSync(BC_FACTIONS_FILE) ? read(BC_FACTIONS_FILE) : '';
const bcBridgeJs = fs.existsSync(BC_BRIDGE_FILE) ? read(BC_BRIDGE_FILE) : '';
const actionCardsCss = fs.existsSync(ACTION_CARDS_CSS_FILE) ? read(ACTION_CARDS_CSS_FILE) : '';

// ── community.html: required headline ─────────────────────────────────────────

console.log('\n[1] community.html — required headline');
check(communityHtml.includes('Battle Chamber: Faction Wars'), 'community.html includes "Battle Chamber: Faction Wars"');

// ── community.html: all 9 live faction names ──────────────────────────────────

console.log('\n[2] community.html — all 9 live faction names');
const LIVE_FACTION_LABELS = [
  'Hard Fork Rockers',
  'Rugpull Miners',
  'GraffPUNKS',
  'Blockchain Furies',
  'Crypto Moongirls',
  'The Blockstars',
  'All City Bulls',
  'Nomad Bears',
  'Crypto Stoned Boys',
];
for (const label of LIVE_FACTION_LABELS) {
  check(communityHtml.includes(label), `community.html includes faction: ${label}`);
}

// ── community.html: weekly / monthly / seasonal sections ──────────────────────

console.log('\n[3] community.html — weekly / monthly / seasonal clout sections');
check(
  communityHtml.includes('Weekly Faction War') || communityHtml.includes('weekly war') || communityHtml.includes('battle-weekly-war'),
  'community.html includes weekly war section'
);
check(
  communityHtml.includes('Monthly Clout') || communityHtml.includes('monthly clout') || communityHtml.includes('battle-monthly-clout'),
  'community.html includes monthly clout section'
);
check(
  communityHtml.includes('Seasonal Campaign') || communityHtml.includes('seasonal campaign') || communityHtml.includes('battle-seasonal-campaign'),
  'community.html includes seasonal campaign section'
);

// ── community.html: required hook containers ──────────────────────────────────

console.log('\n[4] community.html — required hook containers');
const REQUIRED_CONTAINERS = [
  'battle-faction-standings',
  'battle-weekly-war',
  'battle-monthly-clout',
  'battle-seasonal-campaign',
  'battle-join-faction',
  'battle-active-missions',
  'battle-faction-perks',
  'battle-clout-rewards',
  'battle-faction-proof-feed',
];
for (const id of REQUIRED_CONTAINERS) {
  check(communityHtml.includes(id), `community.html includes hook container: ${id}`);
}

// ── community.html: existing Telegram containers must remain ──────────────────

console.log('\n[5] community.html — Telegram containers preserved');
check(communityHtml.includes('tg-community-leaderboard'), 'community.html includes tg-community-leaderboard');
check(communityHtml.includes('tg-activity-feed'), 'community.html includes tg-activity-feed');
check(communityHtml.includes('gklink-status'), 'community.html includes gklink-status');
check(communityHtml.includes('data-tg-sync-cta'), 'community.html includes data-tg-sync-cta');

console.log('\n[5b] community.html - Battle Chamber card polish CSS');
check(/body\.page-community \.bc-why-list li\s*\{[\s\S]*?padding:\s*14px 16px 14px 48px;/.test(actionCardsCss), 'why-join list cards keep inner padding and icon gutter');
check(/body\.page-community \.tg-sync-cta\s*\{[\s\S]*?grid-template-columns:\s*auto minmax\(0,\s*1fr\) minmax\(220px,\s*0\.32fr\);[\s\S]*?padding:\s*18px 20px;/.test(actionCardsCss), 'Telegram sync CTA uses spaced card layout');
check(/body\.page-community #tg-activity-feed \.feed-item\s*\{[\s\S]*?grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto;[\s\S]*?padding:\s*12px 14px;/.test(actionCardsCss), 'proof feed items use readable card rows');
check(/body\.page-community \.bc-frc-row:last-of-type\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/.test(actionCardsCss), 'long roguelite reward options get full row width');

// ── community.html: required JS files loaded ──────────────────────────────────

console.log('\n[6] community.html — required JS files loaded');
check(communityHtml.includes('telegram-community.js'), 'community.html loads telegram-community.js');
check(communityHtml.includes('battle-chamber-factions.js'), 'community.html loads battle-chamber-factions.js');
check(communityHtml.includes('faction-alignment.js'), 'community.html loads faction-alignment.js');
check(communityHtml.includes('battle-chamber-faction-bridge.js'), 'community.html loads battle-chamber-faction-bridge.js');

// Bridge must load BEFORE the renderer so globals are set first
{
  const bridgeIdx = communityHtml.indexOf('battle-chamber-faction-bridge.js');
  const rendererIdx = communityHtml.indexOf('battle-chamber-factions.js');
  check(
    bridgeIdx !== -1 && rendererIdx !== -1 && bridgeIdx < rendererIdx,
    'community.html loads bridge before renderer'
  );
}

// ── community.html: no old live faction names ─────────────────────────────────

console.log('\n[7] community.html — no old live faction names');
// "Diamond Hands" must not appear as a current faction reference.
// We allow it in migration/alias comments inside JS, but not in HTML page content.
const htmlLower = communityHtml.toLowerCase();
check(!htmlLower.includes('diamond hands'), 'community.html does not contain "Diamond Hands"');
check(!htmlLower.includes('hodl warriors'), 'community.html does not contain "HODL Warriors"');

// ── community.html: forbidden reward wording ──────────────────────────────────

console.log('\n[8] community.html — no forbidden reward wording');
const FORBIDDEN_REWARD_TERMS = [
  'passive income',
  'guaranteed reward',
  'token reward',
  'financial reward',
  'earn money',
  'investment return',
  'guaranteed xp',
  'claim reward',
];
for (const term of FORBIDDEN_REWARD_TERMS) {
  check(!htmlLower.includes(term), `community.html does not contain forbidden term: "${term}"`);
}

// ── battle-chamber-factions.js: no old faction names as live references ───────

console.log('\n[9] battle-chamber-factions.js — no old faction keys as live faction entries');
const bcLower = bcFactionsJs.toLowerCase();
// Must not appear as a live faction definition label (old names must only be
// in alias/migration comments, not in the live faction roster)
check(!bcLower.includes("label: 'diamond hands'"), 'battle-chamber-factions.js has no Diamond Hands live label');
check(!bcLower.includes("label: 'hodl warriors'"), 'battle-chamber-factions.js has no HODL Warriors live label');

// ── battle-chamber-factions.js: all 9 faction keys present ───────────────────

console.log('\n[10] battle-chamber-factions.js — all 9 live faction keys');
const LIVE_FACTION_KEYS = [
  'hard-fork-rockers',
  'rugpull-miners',
  'graffpunks',
  'blockchain-furies',
  'crypto-moongirls',
  'blockstars',
  'all-city-bulls',
  'nomad-bears',
  'crypto-stoned-boys',
];
for (const key of LIVE_FACTION_KEYS) {
  check(bcFactionsJs.includes(key), `battle-chamber-factions.js includes faction key: ${key}`);
}

// ── battle-chamber-factions.js: references existing faction systems ────────────

console.log('\n[11] battle-chamber-factions.js — references existing faction systems');
check(
  bcFactionsJs.includes('MOONBOYS_FACTION') || bcFactionsJs.includes('faction-alignment'),
  'battle-chamber-factions.js references MOONBOYS_FACTION (faction-alignment.js)'
);
check(
  bcFactionsJs.includes('MOONBOYS_WAR_DATA') || bcFactionsJs.includes('faction-war-system'),
  'battle-chamber-factions.js references faction-war-system.js data'
);
check(
  bcFactionsJs.includes('MOONBOYS_MISSION_DATA') || bcFactionsJs.includes('faction-missions'),
  'battle-chamber-factions.js references faction-missions.js data'
);
check(
  bcFactionsJs.includes('FACTION_EFFECT_DEFS') || bcFactionsJs.includes('faction-effect-system'),
  'battle-chamber-factions.js references faction-effect-system.js data'
);

// ── battle-chamber-factions.js: event listeners for faction updates ────────────

console.log('\n[12] battle-chamber-factions.js — listens for faction events');
check(bcFactionsJs.includes('faction:update'), 'battle-chamber-factions.js listens for faction:update');
check(
  bcFactionsJs.includes('moonboys:faction-status'),
  'battle-chamber-factions.js listens for moonboys:faction-status'
);
check(
  bcFactionsJs.includes('moonboys:faction-boost'),
  'battle-chamber-factions.js listens for moonboys:faction-boost'
);

// ── battle-chamber-factions.js: no forbidden reward wording ───────────────────

console.log('\n[13] battle-chamber-factions.js — no forbidden reward wording');
for (const term of FORBIDDEN_REWARD_TERMS) {
  check(!bcLower.includes(term), `battle-chamber-factions.js does not contain forbidden term: "${term}"`);
}

// ── bridge: imports real faction systems ──────────────────────────────────────

console.log('\n[14] battle-chamber-faction-bridge.js — imports real faction systems');
check(bcBridgeJs.includes('faction-war-system.js'), 'bridge imports faction-war-system.js');
check(bcBridgeJs.includes('faction-missions.js'), 'bridge imports faction-missions.js');
check(bcBridgeJs.includes('faction-effect-system.js'), 'bridge imports faction-effect-system.js');
check(bcBridgeJs.includes('getFactionStandings'), 'bridge imports getFactionStandings from faction-war-system.js');
check(bcBridgeJs.includes('getDailyMissions'), 'bridge imports getDailyMissions from faction-missions.js');
check(bcBridgeJs.includes('FACTION_DEFS'), 'bridge imports FACTION_DEFS from faction-effect-system.js');

// ── bridge: assigns window globals ───────────────────────────────────────────

console.log('\n[15] battle-chamber-faction-bridge.js — assigns window globals');
check(bcBridgeJs.includes('window.MOONBOYS_WAR_DATA'), 'bridge assigns window.MOONBOYS_WAR_DATA');
check(bcBridgeJs.includes('window.MOONBOYS_MISSION_DATA'), 'bridge assigns window.MOONBOYS_MISSION_DATA');
check(bcBridgeJs.includes('window.FACTION_EFFECT_DEFS'), 'bridge assigns window.FACTION_EFFECT_DEFS');
check(bcBridgeJs.includes('battle-chamber:faction-data-ready'), 'bridge dispatches battle-chamber:faction-data-ready');

// ── renderer: listens for bridge event ───────────────────────────────────────

console.log('\n[16] battle-chamber-factions.js — listens for bridge event and calls loadStatus');
check(
  bcFactionsJs.includes('battle-chamber:faction-data-ready'),
  'renderer listens for battle-chamber:faction-data-ready'
);
check(
  bcFactionsJs.includes('loadStatus'),
  'renderer calls MOONBOYS_FACTION.loadStatus on init'
);
check(
  bcFactionsJs.includes('isTelegramLinked'),
  'join buttons check isTelegramLinked before calling joinFaction'
);
check(
  bcFactionsJs.includes('FACTION_EFFECT_DEFS') && bcFactionsJs.includes('FACTION_DEFS'),
  'renderer reads FACTION_EFFECT_DEFS with FACTION_DEFS fallback'
);

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n─── Result ─────────────────────────────────────────────────────');
console.log(`  Passed : ${passed}`);
console.log(`  Failed : ${failed}`);
console.log('────────────────────────────────────────────────────────────────\n');

if (failed > 0) {
  console.error(`Battle Chamber faction page tests FAILED (${failed} failure${failed !== 1 ? 's' : ''}).`);
  process.exit(1);
}

console.log('Battle Chamber faction page tests PASSED.');
