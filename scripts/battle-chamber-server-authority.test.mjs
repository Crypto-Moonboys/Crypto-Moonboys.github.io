import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`  [PASS] ${label}`);
  passed++;
}

function fail(label, detail) {
  console.error(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
  failed++;
}

function check(condition, label, detail) {
  if (condition) pass(label);
  else fail(label, detail);
}

function read(relPath) {
  const abs = path.join(ROOT, relPath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
}

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

console.log('\n─── Battle Chamber Server Authority Tests (PR5) ───────────────\n');

const MIGRATION_FILE = 'workers/moonboys-api/migrations/016_battle_chamber_faction_clout.sql';
const WORKER_FILE = 'workers/moonboys-api/worker.js';
const BRIDGE_FILE = 'js/battle-chamber-faction-bridge.js';
const HUB_FILE = 'js/battle-chamber-factions.js';
const FACTION_PAGE_FILE = 'js/faction-chamber-page.js';
const WAR_FILE = 'js/arcade/systems/faction-war-system.js';
const MISSIONS_FILE = 'js/arcade/systems/faction-missions.js';
const COMMUNITY_FILE = 'community.html';
const LEADERBOARD_FILE = 'js/leaderboard-client.js';
const REWARD_FILE = 'js/arcade/systems/faction-reward-system.js';

const migrationSql = read(MIGRATION_FILE);
const workerJs = read(WORKER_FILE);
const bridgeJs = read(BRIDGE_FILE);
const hubJs = read(HUB_FILE);
const factionPageJs = read(FACTION_PAGE_FILE);
const warJs = read(WAR_FILE);
const missionsJs = read(MISSIONS_FILE);
const communityHtml = read(COMMUNITY_FILE);
const leaderboardJs = read(LEADERBOARD_FILE);
const rewardJs = read(REWARD_FILE);

function getRouteBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) return '';
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end === -1 ? source.slice(start) : source.slice(start, end);
}

console.log('[1] Migration exists and defines required authority tables/indexes');
check(exists(MIGRATION_FILE), `${MIGRATION_FILE} exists`);
check(migrationSql.includes('CREATE TABLE IF NOT EXISTS battle_chamber_faction_clout'), 'migration creates battle_chamber_faction_clout');
check(migrationSql.includes('CREATE TABLE IF NOT EXISTS battle_chamber_member_clout'), 'migration creates battle_chamber_member_clout');
check(migrationSql.includes('CREATE TABLE IF NOT EXISTS battle_chamber_activity_log'), 'migration creates battle_chamber_activity_log');
check(/UNIQUE\s*\(faction_id,\s*period_type,\s*period_key\)/.test(migrationSql), 'migration has unique key for faction period totals');
check(/UNIQUE\s*\(telegram_id,\s*faction_id,\s*period_type,\s*period_key\)/.test(migrationSql), 'migration has unique key for member period totals');
check(migrationSql.includes('idx_bc_activity_created_desc'), 'migration has created_at DESC index for activity');
check(migrationSql.includes('idx_bc_activity_faction_created_desc'), 'migration has faction+created_at DESC index for activity');

console.log('\n[2] Worker routes exist');
check(workerJs.includes('/battle-chamber/factions/standings'), 'worker includes /battle-chamber/factions/standings route');
check(workerJs.includes('/battle-chamber/activity'), 'worker includes /battle-chamber/activity route');
check(workerJs.includes('/battle-chamber/event'), 'worker includes /battle-chamber/event route');
check(workerJs.includes("path === '/faction/join'"), 'worker includes /faction/join route');
check(
  workerJs.includes("path === '/battle-chamber/faction'") || workerJs.includes("path.startsWith('/battle-chamber/factions/')"),
  'worker includes faction detail route (query or path form)'
);

console.log('\n[3] Auth safety checks on POST /battle-chamber/event');
check(/path === '\/battle-chamber\/event'[\s\S]*verifyTelegramIdentityFromBody/.test(workerJs), 'event route requires Telegram auth verification');
check(workerJs.includes('normalizeBattleChamberFaction'), 'worker normalizes battle chamber faction keys');
check(workerJs.includes('clampBattleClout'), 'worker clamps battle chamber clout values');
check(workerJs.includes('BATTLE_CHAMBER_CLAMP_MAX'), 'worker defines max clout clamp constant');
const eventRouteBlock = getRouteBlock(workerJs, "if (path === '/battle-chamber/event' && request.method === 'POST')", '// ── POST /player/mastery/update');
check(eventRouteBlock.length > 0, 'event route block is discoverable for static assertions');
check(!eventRouteBlock.includes('applyBattleChamberCloutUpdate('), 'event route does not call applyBattleChamberCloutUpdate()');
check(eventRouteBlock.includes('const cloutDelta = 0;'), 'event route forces proof-only clout_delta to zero');
check(!eventRouteBlock.includes('body?.display_name'), 'event route ignores client-provided display_name');
check(!eventRouteBlock.includes('body?.event_text'), 'event route ignores client-provided event_text');
check(eventRouteBlock.includes('buildBattleEventText('), 'event route generates event text server-side');

console.log('\n[4] Period helper checks (daily/weekly/monthly/seasonal)');
check(workerJs.includes('getBattleChamberPeriodKey'), 'worker defines period helper for daily/weekly/monthly');
check(workerJs.includes('getBattleSeasonKey'), 'worker defines seasonal helper');
check(workerJs.includes('BATTLE_CHAMBER_DAYS_PER_SEASON = 90'), 'worker includes deterministic 90-day season fallback');
check(workerJs.includes('getBattlePeriodKey(periodType, db'), 'worker has async period key helper including seasonal');
const cloutUpdateBlock = getRouteBlock(workerJs, 'async function applyBattleChamberCloutUpdate', 'async function _updateMissionStreak');
check(cloutUpdateBlock.includes('if (safeDelta <= 0) return periodKeys;'), 'zero-delta updates short-circuit before member/faction writes');

console.log('\n[5] Client bridge server-data + fallback checks');
check(bridgeJs.includes('/battle-chamber/factions/standings?period=weekly'), 'bridge fetches weekly server standings route');
check(bridgeJs.includes('/battle-chamber/activity?limit=20'), 'bridge fetches server activity route');
check(bridgeJs.includes('MOONBOYS_BATTLE_CHAMBER_ACTIVITY'), 'bridge populates MOONBOYS_BATTLE_CHAMBER_ACTIVITY');
check(bridgeJs.includes('battle-chamber:activity-ready'), 'bridge dispatches battle-chamber:activity-ready');
check(bridgeJs.includes('Live server standings unavailable. Showing local display state.'), 'bridge includes fallback copy');
check(bridgeJs.includes('if (!res.ok) return null;'), 'bridge treats non-2xx standings/activity responses (including 404) as fallback-safe null');
check(bridgeJs.includes('if (!hasServerData) return false;'), 'bridge falls back cleanly when server routes are unavailable');

console.log('\n[6] UI wiring uses server-backed data where available');
check(hubJs.includes('MOONBOYS_BATTLE_CHAMBER_STANDINGS'), 'hub reads server-backed standings cache');
check(hubJs.includes('MOONBOYS_BATTLE_CHAMBER_ACTIVITY'), 'hub reads server-backed activity cache');
check(hubJs.includes('Live server standings unavailable. Showing local display state.'), 'hub includes fallback copy');
check(factionPageJs.includes('MOONBOYS_BATTLE_CHAMBER_FACTION_DETAIL'), 'faction page reads server-backed faction detail cache');
check(factionPageJs.includes('getServerActivityForFaction'), 'faction page reads server-backed activity');
check(factionPageJs.includes('Live server standings unavailable. Showing local display state.'), 'faction page includes fallback copy');
check(communityHtml.includes('battle-faction-proof-feed'), 'community hub includes battle proof feed container');
check(!communityHtml.includes('Live server standings unavailable. Showing local display state.'), 'community.html does not include static unavailable fallback copy');
check(factionPageJs.includes('formatRankDisplay'), 'faction page has rank formatter helper');
check(!factionPageJs.includes("('#' + monthlyRank)"), 'faction page does not force # prefix for non-numeric monthly rank');
check(!factionPageJs.includes("('#' + seasonalRank)"), 'faction page does not force # prefix for non-numeric seasonal rank');
check(!factionPageJs.includes('#—'), 'faction page source does not include #— rank rendering pattern');

console.log('\n[6b] Activity filter/order safety checks');
const activityRouteBlock = getRouteBlock(workerJs, "if (path === '/battle-chamber/activity' && request.method === 'GET')", "// ── POST /battle-chamber/event");
check(/rawFactionFilter\s*!=\s*null\s*&&\s*!requestedFaction[\s\S]*return err\('Valid faction_id required', 400\)/.test(activityRouteBlock), 'invalid activity faction filter returns 400');
check(!workerJs.includes('datetime(created_at)'), 'worker activity ordering does not use datetime(created_at)');
check(workerJs.includes('ORDER BY created_at DESC, id DESC'), 'worker activity ordering uses created_at DESC with id tie-breaker');

console.log('\n[6c] Ownership model checks');
check(workerJs.includes('/faction/signal/contribute owns clout increments'), 'worker documents clout ownership on /faction/signal/contribute');
check(workerJs.includes("ownership: 'faction_signal_route'"), 'worker writes ownership marker for contribution-owned updates');
check(warJs.includes("ownership: 'faction_signal_route'"), 'faction war proof events document ownership marker');
check(missionsJs.includes("ownership: 'faction_signal_route'"), 'mission proof events document ownership marker');

console.log('\n[7] Safety wording checks in touched runtime files');
const FORBIDDEN = [
  'passive income',
  'guaranteed rewards',
  'guaranteed reward',
  'token rewards',
  'token reward',
  'financial rewards',
  'financial reward',
  'investment',
  'earn money',
  'cash prizes',
  'cash prize',
];
const touchedRuntime = {
  [WORKER_FILE]: workerJs,
  [BRIDGE_FILE]: bridgeJs,
  [HUB_FILE]: hubJs,
  [FACTION_PAGE_FILE]: factionPageJs,
  [WAR_FILE]: warJs,
  [MISSIONS_FILE]: missionsJs,
  [COMMUNITY_FILE]: communityHtml,
};
for (const [file, content] of Object.entries(touchedRuntime)) {
  const lower = content.toLowerCase();
  for (const term of FORBIDDEN) {
    check(!lower.includes(term), `${file} does not contain forbidden wording: "${term}"`);
  }
}

console.log('\n[8] Preservation checks for accepted-score and XP integrity');
check(leaderboardJs.includes('export async function submitScore'), 'leaderboard submitScore path remains present');
check(/callFactionEarn\(["']score_accept["']\s*,\s*score\)/.test(leaderboardJs), 'accepted linked score flow still calls faction earn');
check(workerJs.includes('const ARCADE_XP_PER_POINT = 0.02;'), 'worker Arcade XP formula constant remains unchanged');
const factionContribRouteBlock = getRouteBlock(workerJs, "if (path === '/faction/signal/contribute' && request.method === 'POST')", '// ── GET /battle-chamber/factions/standings');
check(factionContribRouteBlock.includes('FACTION_SIGNAL_CONTRIBUTION_MAX'), 'server-owned contribution path keeps per-request clamp max');
check(/contribution\s*>\s*FACTION_SIGNAL_CONTRIBUTION_MAX/.test(factionContribRouteBlock), 'server-owned contribution path enforces clamp max check');
check(!/submitScore\s*\(/.test(rewardJs), 'faction reward system does not call submitScore()');
check(!/ArcadeSync\.queuePendingProgress\s*\(/.test(rewardJs), 'faction reward system does not call ArcadeSync.queuePendingProgress()');

console.log('\n─── Result ─────────────────────────────────────────────────────');
console.log(`  Passed : ${passed}`);
console.log(`  Failed : ${failed}`);
console.log('────────────────────────────────────────────────────────────────\n');

if (failed > 0) {
  console.error(`Battle Chamber server authority tests FAILED (${failed} failure${failed !== 1 ? 's' : ''}).`);
  process.exit(1);
}

console.log('Battle Chamber server authority tests PASSED.');
