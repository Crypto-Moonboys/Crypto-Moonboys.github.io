/**
 * battle-chamber-faction-page.test.mjs
 *
 * CI guard for the Battle Chamber Faction Wars hub page (community.html) and
 * the supporting JS file (js/battle-chamber-factions.js).
 *
 * Fails if any of the following is violated:
 *   - community.html does not include "Battle Chamber: Faction Wars"
 *   - community.html does not include all 9 live faction names
 *   - community.html does not include weekly, monthly, and seasonal sections
 *   - community.html does not include the Telegram leaderboard container
 *   - community.html does not include the activity feed container
 *   - community.html does not load telegram-community.js
 *   - community.html does not load battle-chamber-factions.js
 *   - community.html contains old live faction names "Diamond Hands" or "HODL Warriors"
 *   - community.html uses forbidden reward wording
 *   - battle-chamber-factions.js references old faction names as current live factions
 *   - battle-chamber-factions.js does not import/reference existing faction systems
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const COMMUNITY_FILE = path.join(ROOT, 'community.html');
const BC_FACTIONS_FILE = path.join(ROOT, 'js', 'battle-chamber-factions.js');

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

const communityHtml = fs.existsSync(COMMUNITY_FILE) ? read(COMMUNITY_FILE) : '';
const bcFactionsJs = fs.existsSync(BC_FACTIONS_FILE) ? read(BC_FACTIONS_FILE) : '';

// ── community.html: required headline ─────────────────────────────────────────

console.log('\n[1] community.html — required headline');
check(communityHtml.includes('Battle Chamber: Faction Wars'), 'community.html includes "Battle Chamber: Faction Wars"');

// ── community.html: all 9 live faction names ──────────────────────────────────

console.log('\n[2] community.html — all 9 live faction names');
const LIVE_FACTION_LABELS = [
  'Hard Fork Rockers',
  'Rugpull Minors',
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

// ── community.html: required JS files loaded ──────────────────────────────────

console.log('\n[6] community.html — required JS files loaded');
check(communityHtml.includes('telegram-community.js'), 'community.html loads telegram-community.js');
check(communityHtml.includes('battle-chamber-factions.js'), 'community.html loads battle-chamber-factions.js');
check(communityHtml.includes('faction-alignment.js'), 'community.html loads faction-alignment.js');

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
  'rugpull-minors',
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
