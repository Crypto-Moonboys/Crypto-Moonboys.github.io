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
const WORKER = 'workers/moonboys-api/worker.js';
const WRANGLER = 'workers/moonboys-api/wrangler.toml';
const BRIDGE = 'js/battle-chamber-faction-bridge.js';
const HUB = 'js/battle-chamber-factions.js';
const FACTION_PAGE = 'js/faction-chamber-page.js';
const COMMUNITY = 'community.html';
const GAMES = 'games/index.html';
const LEADERBOARD = 'js/leaderboard-client.js';

const migrationSql = exists(MIGRATION) ? read(MIGRATION) : '';
const workerJs = read(WORKER);
const wranglerToml = exists(WRANGLER) ? read(WRANGLER) : '';
const bridgeJs = read(BRIDGE);
const hubJs = read(HUB);
const factionPageJs = read(FACTION_PAGE);
const communityHtml = read(COMMUNITY);
const gamesHtml = read(GAMES);
const leaderboardJs = read(LEADERBOARD);

console.log('[1] Schema checks');
check(exists(MIGRATION), `${MIGRATION} exists`);
check(migrationSql.includes('CREATE TABLE IF NOT EXISTS daily_missed_perks'), 'migration creates daily_missed_perks');
check(migrationSql.includes('CREATE TABLE IF NOT EXISTS telegram_daily_digest_log'), 'migration creates telegram_daily_digest_log');
check(migrationSql.includes('CREATE TABLE IF NOT EXISTS daily_opportunity_state'), 'migration creates daily_opportunity_state');
check(migrationSql.includes('idx_daily_missed_perks_user_day'), 'migration defines missed history (telegram_id, utc_day) index');
check(migrationSql.includes('idx_daily_missed_perks_user_missed_desc'), 'migration defines missed history (telegram_id, missed_at DESC) index');
check(/UNIQUE\s*\(telegram_id,\s*utc_day\)/.test(migrationSql), 'migration defines unique (telegram_id, utc_day)');

console.log('\n[2] Route checks');
check(workerJs.includes("path === '/roguelite/daily-state'"), 'worker includes /roguelite/daily-state');
check(workerJs.includes("path === '/roguelite/missed-history'"), 'worker includes /roguelite/missed-history');
check(workerJs.includes("path === '/roguelite/mark-missed'"), 'worker includes /roguelite/mark-missed');
check(workerJs.includes("path === '/telegram/daily-digest/run'"), 'worker includes /telegram/daily-digest/run');
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
check(workerJs.includes('FROM daily_missed_perks') && workerJs.includes('ORDER BY missed_at DESC'), 'missed history route reads persistent missed table newest-first');
check(workerJs.includes('missed_history_count'), 'daily-state route returns missed history count separately from today active data');
check(workerJs.includes('The city kept moving while you were away.'), 'worker includes required missed-history retention copy');
check(workerJs.includes('total_all_time'), 'missed history route exposes all-time total');
check(workerJs.includes('metadata_json: row.metadata_json || null') && workerJs.includes('metadata: safeJsonParse(row.metadata_json, {})'), 'missed history route returns raw metadata_json and parsed metadata');
check(!workerJs.includes('missedAt: body?.missed_at') && workerJs.includes('client_missed_at'), 'mark-missed does not trust client missed_at for primary ordering');

console.log('\n[5] Telegram digest checks');
check(workerJs.includes('claimDailyDigestSlot'), 'worker claims one digest slot per user/day');
check(workerJs.includes('telegram_daily_digest_log'), 'worker logs digest status in telegram_daily_digest_log');
check(workerJs.includes('DIGEST_PENDING_STALE_MINUTES') && workerJs.includes("status = 'failed'") && workerJs.includes("status = 'pending'"), 'worker allows safe retry for failed/stale pending digest slots');
check(workerJs.includes("reason: 'pending_recent'") && workerJs.includes("reason: 'already_sent'"), 'worker blocks resend for recent pending and sent states');
check(workerJs.includes("safeStatus === 'sent' ? nowIso : null"), 'worker sets sent_at only for sent status');
check(workerJs.includes('DIGEST_SEND_BATCH_SIZE') && workerJs.includes('DIGEST_SEND_MAX_CONCURRENCY') && workerJs.includes('Promise.all'), 'digest runner uses bounded batching/concurrency');
check(workerJs.includes('processed: 0') && workerJs.includes('skipped:') && workerJs.includes('failed: 0'), 'digest summary includes processed/sent/failed/skipped tracking');
check(workerJs.includes('GM, the Battle Chamber has reset. Your faction has new work.'), 'digest includes hello/check-in copy');
check(workerJs.includes('Today’s faction daily missions'), 'digest includes today mission section');
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
  'rugpull-minors',
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
