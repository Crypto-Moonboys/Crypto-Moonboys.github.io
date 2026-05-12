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
  if (condition) {
    passed += 1;
    console.log(`  [PASS] ${label}`);
  } else {
    failed += 1;
    console.error(`  [FAIL] ${label}`);
  }
}

console.log('\n─── Telegram Daily Digest + Missed Perks Tests ───────────────\n');

const MIGRATION = 'workers/moonboys-api/migrations/018_daily_digest_missed_perks.sql';
const MIGRATION_XP = 'workers/moonboys-api/migrations/021_missed_xp_value.sql';
const WORKER = 'workers/moonboys-api/worker.js';
const DAILY_DIGEST_MODULE = 'workers/moonboys-api/routes/daily-digest.js';
const WRANGLER = 'workers/moonboys-api/wrangler.toml';
const BRIDGE = 'js/battle-chamber-faction-bridge.js';
const HUB = 'js/battle-chamber-factions.js';
const FACTION_PAGE = 'js/faction-chamber-page.js';
const COMMUNITY = 'community.html';
const GAMES = 'games/index.html';
const LEADERBOARD = 'js/leaderboard-client.js';
const DASHBOARD = 'dashboard.html';

const migrationSql = exists(MIGRATION) ? read(MIGRATION) : '';
const migrationXpSql = exists(MIGRATION_XP) ? read(MIGRATION_XP) : '';
const workerJs = read(WORKER);
const dailyDigestModuleJs = exists(DAILY_DIGEST_MODULE) ? read(DAILY_DIGEST_MODULE) : '';
const wranglerToml = exists(WRANGLER) ? read(WRANGLER) : '';
const bridgeJs = read(BRIDGE);
const hubJs = read(HUB);
const factionPageJs = read(FACTION_PAGE);
const communityHtml = read(COMMUNITY);
const gamesHtml = read(GAMES);
const leaderboardJs = read(LEADERBOARD);
const dashboardHtml = read(DASHBOARD);

console.log('[1] Schema checks');
check(exists(MIGRATION), `${MIGRATION} exists`);
check(migrationSql.includes('CREATE TABLE IF NOT EXISTS daily_missed_perks'), 'migration creates daily_missed_perks');
check(migrationSql.includes('CREATE TABLE IF NOT EXISTS telegram_daily_digest_log'), 'migration creates telegram_daily_digest_log');
check(migrationSql.includes('CREATE TABLE IF NOT EXISTS daily_opportunity_state'), 'migration creates daily_opportunity_state');
check(migrationSql.includes('idx_daily_missed_perks_user_day'), 'migration defines missed history (telegram_id, utc_day) index');
check(migrationSql.includes('idx_daily_missed_perks_user_missed_desc'), 'migration defines missed history (telegram_id, missed_at DESC) index');
check(/UNIQUE\s*\(telegram_id,\s*utc_day\)/.test(migrationSql), 'migration defines unique (telegram_id, utc_day)');
// Migration 021: missed_xp_value column
check(exists(MIGRATION_XP), `${MIGRATION_XP} exists`);
check(migrationXpSql.includes('missed_xp_value'), 'migration 021 adds missed_xp_value column');
check(migrationXpSql.includes('ALTER TABLE daily_missed_perks ADD COLUMN missed_xp_value'), 'migration 021 is an ALTER TABLE (non-destructive add)');

console.log('\n[2] Route checks');
check(exists(DAILY_DIGEST_MODULE), `${DAILY_DIGEST_MODULE} exists`);
check(workerJs.includes("handleRogueliteDailyRoutes(request, env, url"), 'worker delegates roguelite/daily/digest routes to extracted module');
check(workerJs.includes("from './routes/daily-digest.js'"), 'worker imports extracted daily digest route module');
check(dailyDigestModuleJs.includes("path === '/roguelite/daily-state'"), 'module includes /roguelite/daily-state');
check(dailyDigestModuleJs.includes("path === '/roguelite/missed-history'"), 'module includes /roguelite/missed-history');
check(dailyDigestModuleJs.includes("path === '/roguelite/mark-missed'"), 'module includes /roguelite/mark-missed');
check(dailyDigestModuleJs.includes("path === '/telegram/daily-digest/run'"), 'module includes /telegram/daily-digest/run');
check(workerJs.includes('async scheduled('), 'worker includes scheduled handler');
const cronMatches = wranglerToml.match(/^\s*crons\s*=\s*\[(.*?)\]\s*$/m);
const cronEntries = cronMatches?.[1]
  ? cronMatches[1].split(',').map((entry) => entry.trim()).filter(Boolean)
  : [];
check(wranglerToml.includes('[triggers]') && cronEntries.some((entry) => entry.includes('0 9 * * *')), 'wrangler preserves 09:00 digest cron trigger');
check(workerJs.includes('scheduled_cron') ? cronEntries.length > 0 : true, 'scheduled digest requires cron trigger in wrangler');

console.log('\n[3] Daily active reset checks');
check(workerJs.includes('ensureDailyOpportunityStateForToday'), 'worker has daily opportunity state helper');
check(workerJs.includes('ON CONFLICT(telegram_id, utc_day) DO NOTHING'), 'daily opportunity state is utc_day scoped');
check(workerJs.includes('chain_depth, activated_at, last_roll_at'), 'daily opportunity state tracks chain depth and active timestamps');
check(workerJs.includes('chain_depth, activated_at, last_roll_at, created_at, updated_at'), 'daily state payload keeps current-day scoped fields');

console.log('\n[4] Missed history persistence checks');
check(workerJs.includes('backfillMissedPerkGapsFromLastActiveDay'), 'worker backfills missed history across missed UTC days');
check(workerJs.includes('days_backfilled') && workerJs.includes('entries_created'), 'backfill returns non-misleading day and entry counters');
const digestRouteCorpus = `${workerJs}\n${dailyDigestModuleJs}`;
check(digestRouteCorpus.includes('FROM daily_missed_perks') && digestRouteCorpus.includes('ORDER BY missed_at DESC'), 'missed history route reads persistent missed table newest-first');
check(digestRouteCorpus.includes('missed_history_count'), 'daily-state route returns missed history count separately from today active data');
check(digestRouteCorpus.includes('The city kept moving while you were away.'), 'worker/module includes required missed-history retention copy');
check(digestRouteCorpus.includes('total_all_time'), 'missed history route exposes all-time total');
check(digestRouteCorpus.includes('metadata_json: row.metadata_json || null') && digestRouteCorpus.includes('metadata: safeJsonParse(row.metadata_json, {})'), 'missed history route returns raw metadata_json and parsed metadata');
check(!digestRouteCorpus.includes('missedAt: body?.missed_at') && digestRouteCorpus.includes('client_missed_at'), 'mark-missed does not trust client missed_at for primary ordering');
// Missed XP all-time tracking (never resets)
check(digestRouteCorpus.includes('missed_xp_all_time'), 'worker/module exposes missed_xp_all_time in daily-state and missed-history payloads');
check(digestRouteCorpus.includes('missed_events_all_time'), 'worker/module exposes missed_events_all_time in payloads');
check(digestRouteCorpus.includes('missed_xp_today'), 'worker/module exposes missed_xp_today in daily-state and WTF events payloads');
check(digestRouteCorpus.includes('missed_events_today'), 'worker/module exposes missed_events_today in payloads');
check(
  digestRouteCorpus.includes('missed_xp_value: Math.max(0, Math.floor') ||
  digestRouteCorpus.includes('missed_xp_value: rowResult.has_missed_xp_value ? Math.max(0, Math.floor'),
  'worker normalizes missed_xp_value per row in missed-history response'
);
check(workerJs.includes('MISSED_XP_PER_TIMED_EVENT') && workerJs.includes('MISSED_XP_PER_DAILY_WINDOW'), 'worker defines XP constants for timed events and daily window misses');
check(!digestRouteCorpus.includes('missedXpValue: body?.missed_xp_value'), 'mark-missed does not accept client-supplied missedXpValue');
check(digestRouteCorpus.includes('missedXpValue: 0'), 'mark-missed keeps worker-authority missedXpValue behavior');
check(workerJs.includes('hasDailyMissedXpValueColumn') && workerJs.includes('PRAGMA table_info(daily_missed_perks)'), 'worker detects missed_xp_value column availability for migration-safe reads');
check(workerJs.includes('getMissedPerkTotals') && workerJs.includes('SELECT COUNT(*) AS events_total'), 'worker keeps missed event counts independent from missed_xp_value SUM queries');
check(digestRouteCorpus.includes('getMissedPerkRows') && digestRouteCorpus.includes('has_missed_xp_value') && digestRouteCorpus.includes('missed_xp_value: rowResult.has_missed_xp_value ?'), 'worker/module falls back to rows without missed_xp_value and maps missed_xp_value to 0 when unavailable');
check(workerJs.includes('insertMissedPerkEntry') && workerJs.includes('const hasMissedXpValue = missedXpValueAvailable == null') && workerJs.includes('runInsertWithoutXp'), 'worker write path detects missed_xp_value availability and supports migration-safe fallback inserts');
check(workerJs.includes('status_value, metadata_json, missed_at, created_at') && workerJs.includes("message.includes('no such column')"), 'worker can insert missed entries without missed_xp_value when migration 021 is not yet applied');
// dashboard.html must remain wiki/editorial only - no missed XP player data
check(!dashboardHtml.includes('missed_xp') && !dashboardHtml.includes('missed_xp_all_time'), 'dashboard.html does not contain missed_xp player data (wiki/editorial only)');

console.log('\n[5] Telegram digest checks');
check(workerJs.includes('claimDailyDigestSlot'), 'worker claims one digest slot per user/day');
check(digestRouteCorpus.includes('telegram_daily_digest_log'), 'worker/module logs digest status in telegram_daily_digest_log');
check(workerJs.includes('DIGEST_PENDING_STALE_MINUTES') && workerJs.includes("status = 'failed'") && workerJs.includes("status = 'pending'"), 'worker allows safe retry for failed/stale pending digest slots');
check(workerJs.includes("reason: 'pending_recent'") && workerJs.includes("reason: 'already_sent'"), 'worker blocks resend for recent pending and sent states');
check(workerJs.includes("safeStatus === 'sent' ? nowIso : null"), 'worker sets sent_at only for sent status');
check(workerJs.includes('DIGEST_SEND_BATCH_SIZE') && workerJs.includes('DIGEST_SEND_MAX_CONCURRENCY') && workerJs.includes('Promise.all'), 'digest runner uses bounded batching/concurrency');
check(workerJs.includes('processed: 0') && workerJs.includes('skipped:') && workerJs.includes('failed: 0'), 'digest summary includes processed/sent/failed/skipped tracking');
check(workerJs.includes('GM, the Battle Chamber has reset. Your faction has new work.'), 'digest includes hello/check-in copy');
check(/Today.{0,12}faction daily missions/.test(workerJs), 'digest includes today mission section');
check(workerJs.includes('Missed perks update'), 'digest includes missed perks update');
check(workerJs.includes('Faction daily log'), 'digest includes faction daily log');
check(workerJs.includes('Open Battle Chamber') && workerJs.includes('Play Arcade') && workerJs.includes('View Faction Chamber'), 'digest includes CTA links');
check(workerJs.includes('getLinkedTelegramUsersForDigest'), 'digest source uses linked-user query');

console.log('\n[6] UI checks');
check(communityHtml.includes('battle-todays-active-options'), 'Battle Chamber has Today’s Active Options panel');
check(communityHtml.includes('battle-missed-perks-history'), 'Battle Chamber has Missed Days / Missed Perks panel');
check(communityHtml.includes('Missed perks history builds over time.'), 'Missed panel copy says history builds over time');
check(!communityHtml.toLowerCase().includes('missed history clears daily'), 'no copy contains "missed history clears daily" (case-insensitive)');
check(factionPageJs.includes('fcp-daily-digest') && factionPageJs.includes('fcp-missed-perks'), 'faction chamber renderer includes missed/digest hooks');
check(bridgeJs.includes('MOONBOYS_ROGUELITE_DAILY_STATE') && bridgeJs.includes('MOONBOYS_ROGUELITE_MISSED_HISTORY'), 'bridge wires roguelite daily/missed caches');
check(gamesHtml.includes('roguelite-daily-digest-summary'), 'arcade hub includes daily signal summary hook');
check(gamesHtml.includes('DAILY_DIGEST_SUMMARY_POLL_MS') && gamesHtml.includes('5 * 60 * 1000') && !gamesHtml.includes('setInterval(renderDailyDigestSummary, 30000)'), 'arcade hub daily digest polling reduced to at least 5 minutes');
check(gamesHtml.includes("document.addEventListener('visibilitychange'"), 'arcade hub pauses digest polling while hidden');
check(gamesHtml.includes('scheduleDailyDigestSummaryRefresh') && gamesHtml.includes('DAILY_DIGEST_SUMMARY_DEBOUNCE_MS'), 'arcade hub uses debounced digest summary refresh scheduler');
check(gamesHtml.includes('digestSummaryRequestInFlight') && gamesHtml.includes('digestSummaryRefreshQueued'), 'arcade hub guards digest refresh requests with in-flight/queued state');

console.log('\n[7] Safety checks');
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
const safetyCorpus = [workerJs, hubJs, factionPageJs, communityHtml, gamesHtml, bridgeJs].join('\n').toLowerCase();
for (const term of FORBIDDEN) {
  check(!safetyCorpus.includes(term), `forbidden wording absent: "${term}"`);
}
check(workerJs.includes('const ARCADE_XP_PER_POINT = 0.02;'), 'Arcade XP formula constant unchanged');
check(leaderboardJs.includes('export async function submitScore'), 'leaderboard accepted-score flow entrypoint unchanged');
check(leaderboardJs.includes('callFactionEarn("score_accept", score)'), 'leaderboard accepted-score faction flow unchanged');
for (const factionKey of [
  'hard-fork-rockers',
  'rugpull-miners',
  'graffpunks',
  'blockchain-furies',
  'crypto-moongirls',
  'blockstars',
  'all-city-bulls',
  'nomad-bears',
  'crypto-stoned-boys',
]) {
  check(workerJs.includes(factionKey), `worker preserves faction canon key: ${factionKey}`);
}

console.log('\n─── Result ─────────────────────────────────────────────────────');
console.log(`  Passed : ${passed}`);
console.log(`  Failed : ${failed}`);
console.log('────────────────────────────────────────────────────────────────\n');

if (failed > 0) process.exit(1);
console.log('Telegram daily digest + missed perks tests PASSED.');
