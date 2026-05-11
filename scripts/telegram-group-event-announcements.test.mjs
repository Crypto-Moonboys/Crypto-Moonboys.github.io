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

const WORKER = 'workers/moonboys-api/worker.js';
const WRANGLER = 'workers/moonboys-api/wrangler.toml';
const MIGRATION = 'workers/moonboys-api/migrations/020_telegram_group_event_announcements.sql';
const PACKAGE = 'package.json';
const DAILY_WTF_TEST = 'scripts/daily-wtf-timed-events.test.mjs';
const LEADERBOARD = 'js/leaderboard-client.js';
const BLOCKTOPIA_ROUTE = 'workers/moonboys-api/blocktopia/routes.js';
const workerJs = read(WORKER);
const wranglerToml = read(WRANGLER);
const migrationSql = exists(MIGRATION) ? read(MIGRATION) : '';
const packageJson = read(PACKAGE);
const dailyWtfTest = read(DAILY_WTF_TEST);
const leaderboardJs = read(LEADERBOARD);
const blockTopiaRoutes = read(BLOCKTOPIA_ROUTE);

const scheduleBlock = (src, functionName) => {
  const start = src.indexOf(`function ${functionName}`);
  if (start < 0) return '';
  const end = src.indexOf('\n}\n', start);
  return end >= 0 ? src.slice(start, end + 3) : src.slice(start);
};
const extractSchedule = (block) => [...block.matchAll(/event_id: '([^']+)'[\s\S]*?title: '([^']+)'[\s\S]*?startHour: (\d+)[\s\S]*?durationMinutes: (\d+)/g)]
  .map((m) => ({ id: m[1], title: m[2], hour: Number(m[3]), duration: Number(m[4]) }));
const workerEvents = extractSchedule(scheduleBlock(workerJs, 'getWtfDailySchedule'));

console.log('\n--- Telegram Group Event Announcement Tests ---\n');

console.log('[1] Config');
check(workerJs.includes('TELEGRAM_GROUP_CHAT_ID'), 'reads TELEGRAM_GROUP_CHAT_ID from env');
check(workerJs.includes('TELEGRAM_GROUP_THREAD_ID'), 'optionally reads TELEGRAM_GROUP_THREAD_ID from env');
check(workerJs.includes('telegram_group_not_configured'), 'missing group config skips safely with required log label');
check(workerJs.includes('message_thread_id') && workerJs.includes('groupConfig.message_thread_id'), 'topic/thread config is passed as message_thread_id');
check(!workerJs.includes('-1001967931909'), 'main group ID is not hardcoded');

console.log('\n[2] Timed event announcements');
check(workerEvents.length === 6, 'six WTF events per UTC day are considered');
check(JSON.stringify(workerEvents.map((event) => event.hour)) === JSON.stringify([0, 4, 8, 12, 16, 20]), 'WTF event hours are 00/04/08/12/16/20 UTC');
check(workerEvents.every((event) => event.duration === 90), 'each WTF event remains a 90-minute window');
check(workerJs.includes('TELEGRAM_GROUP_PRE_EVENT_MINUTES = 10'), 'announcements are scheduled 10 minutes before event start');
check(workerJs.includes('TELEGRAM_GROUP_ANNOUNCEMENT_LOOKAHEAD_MS = 15 * 60 * 1000'), 'due window tolerates cron jitter with a 15-minute window');
check(workerJs.includes('Date.parse(row.starts_at) - TELEGRAM_GROUP_PRE_EVENT_MINUTES * 60 * 1000'), 'midnight event naturally announces on previous day at 23:50 UTC');
check(!workerJs.includes('force || (nowMs >= scheduledMs'), 'generic force does not bypass timed-event due filtering');
check(workerJs.includes('const explicitlyForced = force && (announcementKeyFilter || (eventIdFilter && utcDayFilter))'), 'force for timed events requires explicit announcement_key or event_id plus utc_day');
check(workerJs.includes('announcementKey: options.announcement_key || options.announcementKey || null'), 'manual runner accepts explicit announcement_key filter');
check(workerJs.includes('nowMs >= scheduledMs && nowMs <= scheduledMs + windowMs'), 'due-time boundary is inclusive for late cron tolerance');
check(workerJs.includes('`wtf:${utcDay}:${row.event_id}:minus_10`'), 'timed announcement keys are stable');
check(workerJs.includes("existing?.status === 'sent'") && workerJs.includes("reason: 'already_sent'"), 'duplicate sends are blocked after a sent log row');
check(workerJs.includes('buildWtfPreEventGroupAnnouncement'), 'pre-event group message builder exists');
check(workerJs.includes('Battle Chamber: ${SITE_URL}/community.html') && workerJs.includes('Arcade: ${SITE_URL}/games/'), 'pre-event messages include Battle Chamber and Arcade links');

console.log('\n[3] Daily group summary');
check(workerJs.includes('buildDailyGroupSummaryMessage'), 'daily group summary exists');
check(workerJs.includes('`daily-summary:${utcDay}`'), 'daily summary key sends once per UTC day');
check(workerJs.includes('Six Daily WTF signals open today'), 'daily summary includes Daily WTF windows');
check(workerJs.includes('Battle Chamber: ${SITE_URL}/community.html') && workerJs.includes('Arcade: ${SITE_URL}/games/') && workerJs.includes('Faction Chambers: ${SITE_URL}/battle-chamber/factions/index.html'), 'daily summary includes Battle Chamber, Arcade, and Faction Chambers links');
check(workerJs.includes("coverage: ['daily_faction_missions', 'battle_chamber_proof', 'missed_opportunities']"), 'non-timed tasks/quests are covered by daily summary only');
check(!workerJs.includes('for (const user of group') && !workerJs.includes('sendDailyDigestMessage(db, env, telegramId, utcDay) && runTelegramGroupAnnouncements'), 'group summary does not send one message per user');

console.log('\n[4] Dedupe/log migration');
check(exists(MIGRATION), 'migration 020 exists');
check(migrationSql.includes('CREATE TABLE IF NOT EXISTS telegram_group_announcement_log'), 'migration creates telegram_group_announcement_log');
for (const column of ['announcement_key', 'utc_day', 'event_id', 'announcement_type', 'scheduled_for', 'sent_at', 'status', 'error_message', 'metadata_json', 'created_at', 'updated_at']) {
  check(migrationSql.includes(column), `migration includes ${column}`);
}
check(migrationSql.includes('announcement_key   TEXT PRIMARY KEY'), 'announcement_key is unique through primary key');
check(!migrationSql.includes('idx_telegram_group_announcement_key'), 'migration does not add redundant unique index for announcement_key');
check(workerJs.includes('INSERT OR IGNORE INTO telegram_group_announcement_log'), 'claim path uses insert-or-ignore dedupe');
check(workerJs.includes("VALUES (?, ?, ?, ?, ?, 'sending'"), 'new claims atomically insert a sending row');
check(workerJs.includes("status = 'failed'") && workerJs.includes("status IN ('pending', 'sending') AND updated_at <= ?"), 'atomic retry claims only failed or stale pending/sending rows');
check(workerJs.includes('Number(updateResult?.meta?.changes || 0) === 1'), 'claim result uses meta.changes from conditional update');
check(workerJs.includes("if (existing?.status === 'sent') return { claimed: false, reason: 'already_sent' }"), 'sent row is never resent');
check(workerJs.includes("reason: 'already_claimed'"), 'fresh pending/sending rows are treated as already claimed');
check(workerJs.includes("finalizeTelegramGroupAnnouncement(env.DB, candidate, 'sent'"), 'successful send locks the key as sent');

console.log('\n[5] Admin route');
check(workerJs.includes("path === '/telegram/group-announcements/run'"), 'manual group announcement route exists');
check(workerJs.includes('readAdminSecret(request)') && workerJs.includes('admin_telegram_auth'), 'route requires admin secret or admin Telegram auth');
check(workerJs.includes('dry_run: body?.dry_run === true'), 'route supports dry_run');
check(workerJs.includes('if (dryRun)') && workerJs.includes('summary.skipped_count = dueAnnouncements.length'), 'dry_run does not send messages, including force-filtered dry runs');
for (const field of ['group_configured', 'due_announcements', 'sent_count', 'skipped_count', 'failed_count', 'dry_run', 'errors']) {
  check(workerJs.includes(field), `route response includes ${field}`);
}

console.log('\n[6] Scheduled integration');
check(workerJs.includes('async scheduled(event, env, _ctx)'), 'scheduled handler accepts event safely');
check(workerJs.includes("cron === '0 9 * * *'") && workerJs.includes('runTelegramDailyDigest'), 'existing 09:00 personal digest cron still runs');
check(workerJs.includes("cron === '*/5 * * * *'") && workerJs.includes("type: groupType"), 'scheduled handler supports 5-minute timed announcement checks');
check(workerJs.includes("if (dueAnnouncements.length > 0) console.log('telegram_group_not_configured')"), 'missing group config logs only when announcements are due');
check(wranglerToml.includes('"0 9 * * *"') && wranglerToml.includes('"*/5 * * * *"'), 'wrangler.toml includes daily and 5-minute cron triggers');

console.log('\n[7] Message safety');
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
const safetyCorpus = [workerJs].join('\n').toLowerCase();
for (const term of FORBIDDEN) {
  check(!safetyCorpus.includes(term), `forbidden wording absent: "${term}"`);
}

console.log('\n[8] Preservation');
check(workerJs.includes('const ARCADE_XP_PER_POINT = 0.02;'), 'Arcade XP formula constant unchanged');
check(leaderboardJs.includes('export async function submitScore') && leaderboardJs.includes('callFactionEarn("score_accept", score)'), 'leaderboard accepted-score flow unchanged');
for (const factionKey of ['hard-fork-rockers', 'rugpull-miners', 'graffpunks', 'blockchain-furies', 'crypto-moongirls', 'blockstars', 'all-city-bulls', 'nomad-bears', 'crypto-stoned-boys']) {
  check(workerJs.includes(factionKey), `faction canon key preserved: ${factionKey}`);
}
check(blockTopiaRoutes.includes('handleBlockTopiaProgressionRoute'), 'Block Topia route module remains present');
check(workerJs.includes('verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth)'), 'Telegram auth core pattern remains present');
check(dailyWtfTest.includes('const ARCADE_XP_PER_POINT = 0.02;'), 'existing anti-drift preservation coverage remains wired');
check(packageJson.includes('scripts/telegram-group-event-announcements.test.mjs'), 'npm test runs telegram group announcement tests');

console.log('\n─── Result ─────────────────────────────────────────────────────');
console.log(`  Passed : ${passed}`);
console.log(`  Failed : ${failed}`);
console.log('────────────────────────────────────────────────────────────────\n');

if (failed > 0) process.exit(1);
console.log('Telegram group event announcement tests PASSED.');
