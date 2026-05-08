import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

let passed = 0;
let failed = 0;
function check(condition, label) {
  if (condition) { passed += 1; console.log(`  [PASS] ${label}`); }
  else { failed += 1; console.error(`  [FAIL] ${label}`); }
}

const MIGRATION = 'workers/moonboys-api/migrations/019_daily_wtf_timed_events.sql';
const WORKER = 'workers/moonboys-api/worker.js';
const COMMUNITY = 'community.html';
const GAMES = 'games/index.html';
const BRIDGE = 'js/battle-chamber-faction-bridge.js';
const HUB = 'js/battle-chamber-factions.js';
const FACTION_PAGE = 'js/faction-chamber-page.js';
const WTF_SYSTEM = 'js/arcade/systems/daily-wtf-event-system.js';
const XP_BURST = 'js/components/xp-burst-animation.js';
const DIGEST_TEST = 'scripts/telegram-daily-digest-and-missed-perks.test.mjs';
const LEADERBOARD = 'js/leaderboard-client.js';

const migrationSql = exists(MIGRATION) ? read(MIGRATION) : '';
const workerJs = read(WORKER);
const communityHtml = read(COMMUNITY);
const gamesHtml = read(GAMES);
const bridgeJs = read(BRIDGE);
const hubJs = read(HUB);
const factionPageJs = read(FACTION_PAGE);
const wtfSystemJs = read(WTF_SYSTEM);
const xpBurstJs = read(XP_BURST);
const digestTestJs = read(DIGEST_TEST);
const leaderboardJs = read(LEADERBOARD);

console.log('\n--- Daily WTF Timed Events Tests ---\n');
check(exists(MIGRATION), 'migration 019 exists');
check(migrationSql.includes('CREATE TABLE IF NOT EXISTS daily_wtf_events'), 'migration creates daily_wtf_events');
check(migrationSql.includes('CREATE TABLE IF NOT EXISTS daily_wtf_player_events'), 'migration creates daily_wtf_player_events');
check(migrationSql.includes('CREATE TABLE IF NOT EXISTS daily_wtf_chain_options'), 'migration creates daily_wtf_chain_options');
check(migrationSql.includes('UNIQUE (event_id, utc_day)'), 'event unique constraint exists');
check(migrationSql.includes('UNIQUE (telegram_id, event_id, utc_day)'), 'player unique constraint exists');

check(workerJs.includes("path === '/wtf/events/today'"), 'route /wtf/events/today exists');
check(workerJs.includes("path === '/wtf/events/check-in'"), 'route /wtf/events/check-in exists');
check(workerJs.includes("path === '/wtf/events/complete'"), 'route /wtf/events/complete exists');
check(workerJs.includes("path === '/wtf/events/choose-option'"), 'route /wtf/events/choose-option exists');
check(workerJs.includes('verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth)'), 'check-in/complete routes require telegram auth');
check(workerJs.includes('WTF_ALLOWED_COMPLETION_SOURCES'), 'completion source allowlist exists');
check(workerJs.includes('WTF_MAX_BONUS_XP_PER_EVENT'), 'completion cap constant exists');
check(workerJs.includes('daily chain cap reached'), 'daily chain cap enforcement exists');
check(workerJs.includes('check-in required'), 'no completion without check-in');
check(workerJs.includes('daily_missed_perks'), 'missed history base table remains in worker');

check(workerJs.includes('ensureWtfEventsForDay'), 'UTC-day schedule generation helper exists');
check(workerJs.includes('getWtfEventStatus'), 'active/upcoming/expired status helper exists');
check(workerJs.includes('countdown_seconds'), 'countdown field exists');

check(workerJs.includes('daily_wtf_chain_options') && workerJs.includes("'available'"), 'chain options unlocked on completion');
check(workerJs.includes("status='chosen'"), 'choose option marks chosen');
check(workerJs.includes('option already claimed'), 'duplicate option claim blocked');

check(wtfSystemJs.includes('window.MOONBOYS_WTF_EVENTS'), 'global rightside panel contract exists');
check(wtfSystemJs.includes('moonboys:wtf-events-ready'), 'wtf ready event dispatch exists');
check(wtfSystemJs.includes('moonboys:wtf-event-checkin'), 'check-in event dispatch exists');
check(wtfSystemJs.includes('moonboys:wtf-event-complete'), 'complete event dispatch exists');
check(wtfSystemJs.includes('moonboys:xp-burst'), 'xp burst event dispatch exists');
check(wtfSystemJs.includes('moonboys:roguelite-options-unlocked'), 'roguelite unlock event dispatch exists');
check(xpBurstJs.includes('prefers-reduced-motion'), 'reduced motion fallback exists');

check(communityHtml.includes('/js/arcade/systems/daily-wtf-event-system.js'), 'community loads timed event system');
check(gamesHtml.includes('/js/arcade/systems/daily-wtf-event-system.js'), 'games hub loads timed event system');
check(communityHtml.includes('/js/components/xp-burst-animation.js'), 'community loads xp burst animation');
check(gamesHtml.includes('/js/components/xp-burst-animation.js'), 'games hub loads xp burst animation');
check(bridgeJs.length > 0 && hubJs.length > 0 && factionPageJs.length > 0, 'battle chamber files remain present for hooks');

check(workerJs.includes('WTF timed signal') && workerJs.includes('Check in when the signal opens.'), 'digest includes WTF timed signal preview');
check(digestTestJs.includes("path === '/telegram/daily-digest/run'"), 'daily digest test suite still covers once-per-day route');

check(workerJs.includes('const ARCADE_XP_PER_POINT = 0.02;'), 'arcade xp formula unchanged');
check(leaderboardJs.includes('export async function submitScore'), 'leaderboard accepted-score flow remains');
check(workerJs.includes('hard-fork-rockers') && workerJs.includes('crypto-stoned-boys'), 'faction canon keys preserved');

const forbidden = ['passive income', 'financial reward', 'token reward', 'cash prize', 'investment', 'earn money'];
const corpus = [workerJs, wtfSystemJs, xpBurstJs, communityHtml, gamesHtml].join('\n').toLowerCase();
for (const term of forbidden) check(!corpus.includes(term), `forbidden wording absent: ${term}`);

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) process.exit(1);
