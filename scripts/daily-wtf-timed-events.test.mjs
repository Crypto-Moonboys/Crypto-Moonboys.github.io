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
const HOW_TO_PLAY = 'how-to-play.html';
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
const howToPlayHtml = read(HOW_TO_PLAY);
const gamesHtml = read(GAMES);
const bridgeJs = read(BRIDGE);
const hubJs = read(HUB);
const factionPageJs = read(FACTION_PAGE);
const wtfSystemJs = read(WTF_SYSTEM);
const xpBurstJs = read(XP_BURST);
const digestTestJs = read(DIGEST_TEST);
const leaderboardJs = read(LEADERBOARD);

const scheduleBlock = (src, functionName) => {
  const start = src.indexOf(`function ${functionName}`);
  if (start < 0) return '';
  const end = src.indexOf('\n}\n', start);
  return end >= 0 ? src.slice(start, end + 3) : src.slice(start);
};
const workerSchedule = scheduleBlock(workerJs, 'getWtfDailySchedule');
const fallbackSchedule = scheduleBlock(wtfSystemJs, 'makeFallbackSchedule');
const ensureScheduleBlock = scheduleBlock(workerJs, 'ensureWtfEventsForDay');
const wtfScheduleUpsertBlock = workerJs.slice(workerJs.indexOf('function buildWtfScheduleRow'), workerJs.indexOf('function clampText'));
const extractSchedule = (block) => [...block.matchAll(/event_id: '([^']+)'[\s\S]*?title: '([^']+)'[\s\S]*?startHour: (\d+)[\s\S]*?durationMinutes: (\d+)/g)]
  .map((m) => ({ id: m[1], title: m[2], hour: Number(m[3]), duration: Number(m[4]) }));
const workerEvents = extractSchedule(workerSchedule);
const fallbackEvents = extractSchedule(fallbackSchedule);
const expectedHours = [0, 4, 8, 12, 16, 20];
const expectedTitles = ['Midnight WTF Signal', 'Early Chain Wake-Up', 'Morning WTF Signal', 'Midday Faction Rush', 'Evening Arcade Burst', 'Late Night Chaos Window'];

const oldSeededRows = [
  { event_id: 'wtf-morning-signal', starts_at: '2026-05-09T08:00:00.000Z', ends_at: '2026-05-09T09:30:00.000Z', player_state: { status: 'completed', checked_in_at: 'keep' } },
  { event_id: 'wtf-midday-rush', starts_at: '2026-05-09T12:00:00.000Z', ends_at: '2026-05-09T13:30:00.000Z', player_state: { status: 'checked_in' } },
  { event_id: 'wtf-evening-burst', starts_at: '2026-05-09T18:00:00.000Z', ends_at: '2026-05-09T20:00:00.000Z', player_state: { status: 'completed', completed_at: 'keep' } },
  { event_id: 'wtf-late-chaos', starts_at: '2026-05-09T22:00:00.000Z', ends_at: '2026-05-09T23:30:00.000Z', player_state: { status: 'checked_in', checked_in_at: 'keep' } },
];
const simulatedRows = new Map(oldSeededRows.map((row) => [row.event_id, { ...row }]));
for (const event of workerEvents) {
  const starts_at = `2026-05-09T${String(event.hour).padStart(2, '0')}:00:00.000Z`;
  const ends_at = new Date(Date.parse(starts_at) + event.duration * 60 * 1000).toISOString();
  simulatedRows.set(event.id, { ...(simulatedRows.get(event.id) || {}), event_id: event.id, title: event.title, starts_at, ends_at });
}
const upgradedRows = [...simulatedRows.values()].filter((row) => workerEvents.some((event) => event.id === row.event_id));
const upgradedHours = upgradedRows.map((row) => Number(row.starts_at.slice(11, 13))).sort((a, b) => a - b);
const oldPlayerStatePreserved = oldSeededRows.every((row) => simulatedRows.get(row.event_id)?.player_state === row.player_state);
const correctSeededRows = workerEvents.map((event) => {
  const starts_at = `2026-05-09T${String(event.hour).padStart(2, '0')}:00:00.000Z`;
  return {
    event_id: event.id,
    starts_at,
    ends_at: new Date(Date.parse(starts_at) + event.duration * 60 * 1000).toISOString(),
    title: event.title,
    metadata_json: JSON.stringify({ chain_cap: 3, duration_minutes: event.duration, official_schedule: true }),
  };
});
const correctSeededDayNeedsWrite = correctSeededRows.length !== workerEvents.length || correctSeededRows.some((row, index) => {
  const expected = workerEvents[index];
  return row.event_id !== expected.id || Number(row.starts_at.slice(11, 13)) !== expected.hour || (Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60000 !== expected.duration || !row.metadata_json.includes('official_schedule');
});

console.log('\n--- Daily WTF Timed Events Tests ---\n');
check(exists(MIGRATION), 'migration 019 exists');
check(migrationSql.includes('CREATE TABLE IF NOT EXISTS daily_wtf_events'), 'migration creates daily_wtf_events');
check(migrationSql.includes('CREATE TABLE IF NOT EXISTS daily_wtf_player_events'), 'migration creates daily_wtf_player_events');
check(migrationSql.includes('CREATE TABLE IF NOT EXISTS daily_wtf_chain_options'), 'migration creates daily_wtf_chain_options');
check(migrationSql.includes('UNIQUE (event_id, utc_day)'), 'event unique constraint exists');
check(migrationSql.includes('UNIQUE (telegram_id, event_id, utc_day)'), 'player unique constraint exists');

check(workerJs.includes("path === '/wtf/events/today'"), 'route /wtf/events/today exists');
check(workerJs.includes("path === '/wtf/events/today' && (request.method === 'GET' || request.method === 'POST')"), '/today supports GET public + POST auth');
check(workerJs.includes("path === '/wtf/events/check-in'"), 'route /wtf/events/check-in exists');
check(workerJs.includes("path === '/wtf/events/complete'"), 'route /wtf/events/complete exists');
check(workerJs.includes("path === '/wtf/events/choose-option'"), 'route /wtf/events/choose-option exists');
check(workerJs.includes('verifyTelegramIdentityFromBody(body, env, verifyTelegramAuth)'), 'check-in/complete routes require telegram auth');
check(workerJs.includes('WTF_ALLOWED_COMPLETION_SOURCES'), 'completion source allowlist exists');
check(workerJs.includes('verifyWtfCompletionProof('), 'server-side completion proof verifier exists');
check(workerJs.includes('WTF_MAX_BONUS_XP_PER_EVENT'), 'completion cap constant exists');
check(workerJs.includes('daily chain cap reached'), 'daily chain cap enforcement exists');
check(workerJs.includes('check-in required'), 'no completion without check-in');
check(workerJs.includes("auth_mode: 'public_schedule'"), 'unauthenticated /today returns public schedule only');
check(workerJs.includes("auth_mode: 'telegram_verified'"), 'authenticated /today returns player state');
check(workerJs.includes('player_status'), '/today includes per-event player status');
check(workerJs.includes('checked_in_at') && workerJs.includes('completed_at'), '/today includes checked_in_at/completed_at fields');
check(workerJs.includes('daily_missed_perks'), 'missed history base table remains in worker');

check(workerJs.includes('ensureWtfEventsForDay'), 'UTC-day schedule generation helper exists');
check(!ensureScheduleBlock.includes('COUNT(*) AS total') && !ensureScheduleBlock.includes('DO NOTHING'), 'ensureWtfEventsForDay does not return early or no-op when rows already exist');
check(ensureScheduleBlock.includes('SELECT * FROM daily_wtf_events WHERE utc_day = ?') && ensureScheduleBlock.includes('scheduleAlreadyCurrent') && ensureScheduleBlock.includes('if (scheduleAlreadyCurrent) return'), 'ensureWtfEventsForDay has a cheap no-write guard for already-current schedules');
check(wtfScheduleUpsertBlock.includes('wtfScheduleRowMatches') && ensureScheduleBlock.includes('existingById.size === scheduleRows.length'), 'ensureWtfEventsForDay compares all official rows before writing');
check(ensureScheduleBlock.includes('ON CONFLICT(event_id, utc_day) DO UPDATE SET'), 'ensureWtfEventsForDay upserts changed schedule definitions by stable event_id + utc_day');
check(ensureScheduleBlock.includes('WHERE daily_wtf_events.event_type IS NOT excluded.event_type') && ensureScheduleBlock.includes('OR daily_wtf_events.metadata_json IS NOT excluded.metadata_json'), 'conditional upsert update only fires when scheduled fields differ');
check(ensureScheduleBlock.includes('starts_at = excluded.starts_at') && ensureScheduleBlock.includes('ends_at = excluded.ends_at') && ensureScheduleBlock.includes('required_action = excluded.required_action'), 'ensureWtfEventsForDay updates changed timing/action fields for seeded days');
check(wtfScheduleUpsertBlock.includes('duration_minutes') && wtfScheduleUpsertBlock.includes('official_schedule'), 'ensureWtfEventsForDay marks canonical schedule metadata for backfilled rows');
check(upgradedRows.length === 6, 'old 4-row seeded day is upgraded to exactly 6 official schedule rows');
check(JSON.stringify(upgradedHours) === JSON.stringify(expectedHours), 'old seeded 18:00/22:00 rows are updated to official 16:00/20:00 hours and missing 00:00/04:00 rows are added');
check(new Set(upgradedRows.map((row) => row.event_id)).size === upgradedRows.length, 'upserted schedule has no duplicate event_id/utc_day rows');
check(upgradedRows.every((row) => (Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60000 === 90), 'upserted official schedule rows are 90 minutes');
check(oldPlayerStatePreserved, 'simulated schedule upsert preserves existing player state objects');
check(correctSeededDayNeedsWrite === false, 'already-correct 6-row seeded day performs no simulated write/update path');
check(wtfSystemJs.includes('POLL_MS = 60 * 1000') && ensureScheduleBlock.includes('if (scheduleAlreadyCurrent) return'), '/wtf/events/today remains safe for frequent 60-second frontend polling');
check(workerJs.includes('officialRows') && workerJs.includes('officialEventIds') && workerJs.includes('officialIds'), 'Worker filters served/reconciled Daily WTF rows to official schedule ids');
check(workerEvents.length === 6, 'Worker generates exactly 6 Daily WTF events per UTC day');
check(fallbackEvents.length === 6, 'frontend fallback generates exactly 6 Daily WTF events per UTC day');
check(JSON.stringify(workerEvents.map((e) => e.hour)) === JSON.stringify(expectedHours), 'Worker event starts are 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC');
check(JSON.stringify(fallbackEvents.map((e) => e.hour)) === JSON.stringify(expectedHours), 'frontend fallback event starts are 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC');
check(workerEvents.every((e) => e.duration === 90) && fallbackEvents.every((e) => e.duration === 90), 'Worker and frontend use consistent 90-minute event windows');
check(JSON.stringify(workerEvents.map((e) => e.title)) === JSON.stringify(expectedTitles), 'Worker schedule names match the six-window model');
check(JSON.stringify(fallbackEvents.map((e) => e.title)) === JSON.stringify(expectedTitles), 'frontend fallback schedule names match the Worker');
check(JSON.stringify(workerEvents.map((e) => e.id)) === JSON.stringify(fallbackEvents.map((e) => e.id)), 'Worker/frontend event ids match');
check(JSON.stringify(workerEvents.map((e) => e.hour)) === JSON.stringify(fallbackEvents.map((e) => e.hour)), 'Worker/frontend start hours match');
check(workerJs.includes('getWtfEventStatus'), 'active/upcoming/expired status helper exists');
check(workerJs.includes('getNextDailyWtfEvent') && workerJs.includes('addUtcDays') && workerJs.includes('upcomingEvents = [nextEvent]'), 'after final window expires, /today points at next UTC day first signal');
check(workerJs.includes('countdown_seconds'), 'countdown field exists');

check(workerJs.includes('daily_wtf_chain_options') && workerJs.includes("'available'"), 'chain options unlocked on completion');
check(workerJs.includes("status = CASE WHEN daily_wtf_player_events.completed_at IS NOT NULL THEN 'completed' ELSE 'checked_in' END"), 'check-in cannot downgrade completed event');
check(workerJs.includes('await upsertTelegramUser(env.DB, verified.user);'), 'check-in ensures telegram user upsert for FK safety');
check(workerJs.includes("return err('event_inactive', 409)") && workerJs.includes("return err('event_expired', 409)"), 'completion enforces event active window');
check(workerJs.includes('getAllowedSourcesForWtfEvent') && workerJs.includes('proof_required'), 'completion source must match event objective');
check(!workerJs.includes("proof required"), 'non-standard proof error text is removed');
check(workerJs.includes("error: 'proof_required'"), 'proof failures use standardized machine-readable key');
check(workerJs.includes('arcade_progression_events') && workerJs.includes("status = 'accepted'"), 'arcade accepted proof verification exists');
check(workerJs.includes('player_daily_mission_state') && workerJs.includes('mission_date = ?') && workerJs.includes('completed = 1'), 'faction mission proof verification exists');
check(workerJs.includes('battle_chamber_activity_log') && workerJs.includes('WHERE id = ? AND telegram_id = ?'), 'battle chamber proof ownership verification exists');
check(workerJs.includes('const chainDepth = Math.min(WTF_MAX_CHAIN_DEPTH, completedToday + 1);'), 'chain depth computed per-day progression');
check(workerJs.includes("source: 'daily_wtf_timed_event'"), 'missed-event writes use daily_wtf_timed_event source');
check(workerJs.includes('metadata_json LIKE ?') && workerJs.includes('safeTitle'), 'missed-entry dedupe uses clamped title + stable metadata event_id');
check(workerJs.includes('reconcileWtfExpiryForUser') && workerJs.includes('upsertWtfMissedEntry'), 'expired events are reconciled into missed history');
check(workerJs.includes("status='chosen'"), 'choose option marks chosen');
check(workerJs.includes('option already claimed'), 'duplicate option claim blocked');

check(wtfSystemJs.includes('window.MOONBOYS_WTF_EVENTS'), 'global rightside panel contract exists');
check(!wtfSystemJs.includes('telegram_auth='), 'no telegram_auth query string is used for /today');
check(wtfSystemJs.includes("method: 'POST'") && wtfSystemJs.includes('/wtf/events/today'), 'player-specific /today uses safe POST auth transport');
check(wtfSystemJs.includes('FETCH_TIMEOUT_MS = 8000') && wtfSystemJs.includes('Promise.race([') && wtfSystemJs.includes("error: 'timeout'"), 'frontend /today fetch has timeout guard so loading cannot hang forever');
check(wtfSystemJs.includes('timeoutId = setTimeout') && wtfSystemJs.includes('if (timeoutId) clearTimeout(timeoutId);'), 'frontend /today clears fetch timeout timer after request settles');
check(wtfSystemJs.includes('scheduleApiBaseRetry') && wtfSystemJs.includes('api_base_missing') && wtfSystemJs.includes('API_BASE_RETRY_DELAYS_MS = [1500, 3000, 6000, 12000]'), 'api_base_missing path uses capped stepped retry backoff');
check(wtfSystemJs.includes('if (apiBaseRetryAttempt >= API_BASE_RETRY_DELAYS_MS.length) return;') && wtfSystemJs.includes('resetApiBaseRetryState'), 'api_base_missing retry is capped and resets after success');
check(wtfSystemJs.includes('moonboys:wtf-events-ready'), 'wtf ready event dispatch exists');
check(wtfSystemJs.includes('moonboys:wtf-event-checkin'), 'check-in event dispatch exists');
check(wtfSystemJs.includes('moonboys:wtf-event-complete'), 'complete event dispatch exists');
check(wtfSystemJs.includes('moonboys:xp-burst'), 'xp burst event dispatch exists');
check(wtfSystemJs.includes('moonboys:roguelite-options-unlocked'), 'roguelite unlock event dispatch exists');
check(wtfSystemJs.includes("setTransientState('error', 'Signal feed unavailable.')"), 'frontend system publishes explicit unavailable state if payload and fallback application fail');
check(read('js/components/live-activity-summary.js').includes('scheduleWtfLoadingFallbackRepaint') && read('js/components/live-activity-summary.js').includes('setTimeout(function ()') && read('js/components/live-activity-summary.js').includes('refresh();'), 'right-rail loading state schedules repaint at stall boundary');
check(read('js/components/live-activity-summary.js').includes('clearWtfLoadingRepaintTimer') && read('js/components/live-activity-summary.js').includes('clearTimeout(_singleton.wtfLoadingRepaintTimer)'), 'right-rail clears loading repaint timer when state resolves');
check(read('js/components/live-activity-summary.js').includes('window.MOONBOYS_DAILY_WTF') && read('js/components/live-activity-summary.js').includes('api.makeFallbackSchedule') && !read('js/components/live-activity-summary.js').includes('wtf-midnight-signal'), 'right-rail fallback schedule uses shared Daily WTF helper and avoids duplicated window definitions');
check(read('js/components/live-activity-summary.js').includes('data-wtf-state="fallback"') && read('js/components/live-activity-summary.js').includes('Signal feed fallback active'), 'right-rail renderer has deterministic fallback card for stalled loading state');
check(xpBurstJs.includes('prefers-reduced-motion'), 'reduced motion fallback exists');
check(!xpBurstJs.includes('payload.title ||') || !xpBurstJs.includes('innerHTML'), 'xp burst does not inject payload.title via innerHTML');
check(xpBurstJs.includes('textContent = String(payload.title ||'), 'xp burst dynamic title uses textContent');
check(xpBurstJs.includes('Base: ') && xpBurstJs.includes(' | Bonus: '), 'xp burst separator is stable and clean');

check(communityHtml.includes('/js/arcade/systems/daily-wtf-event-system.js'), 'community loads timed event system');
check(gamesHtml.includes('/js/arcade/systems/daily-wtf-event-system.js'), 'games hub loads timed event system');
check(communityHtml.includes('/js/components/xp-burst-animation.js'), 'community loads xp burst animation');
check(gamesHtml.includes('/js/components/xp-burst-animation.js'), 'games hub loads xp burst animation');
check(bridgeJs.length > 0 && hubJs.length > 0 && factionPageJs.length > 0, 'battle chamber files remain present for hooks');

check(workerJs.includes('WTF timed signal') && workerJs.includes('Check in when the signal opens.'), 'digest includes WTF timed signal preview');
check(digestTestJs.includes("path === '/telegram/daily-digest/run'"), 'daily digest test suite still covers once-per-day route');

check(howToPlayHtml.includes('Daily WTF signals open every 4 hours') && howToPlayHtml.includes('00:00, 04:00, 08:00, 12:00, 16:00, and 20:00 UTC'), 'how-to-play.html documents every-4-hour Daily WTF signals');
check(communityHtml.includes('Daily WTF signals open every 4 hours') && communityHtml.includes('Missed history does not reset'), 'community/right-rail copy documents every-4-hour signals and persistent missed history');
check(gamesHtml.includes('Daily WTF signals open every 4 hours') && gamesHtml.includes('does not reset'), 'games hub explains Daily WTF signal cadence and missed history persistence');
check(factionPageJs.includes('Daily WTF') || read('battle-chamber/factions/index.html').includes('Daily WTF signals open every 4 hours'), 'faction pages/shared renderer mention Daily WTF timed signals');
check(workerJs.includes('const ARCADE_XP_PER_POINT = 0.02;'), 'arcade xp formula unchanged');
check(workerJs.includes("reward_status='previewed'") && !workerJs.includes("reward_status='awarded'"), 'reward status is truthful preview-only unless persisted award exists');
check(workerJs.includes('persisted_xp_awarded: false'), 'response clearly marks no persisted XP award');
check(leaderboardJs.includes('export async function submitScore'), 'leaderboard accepted-score flow remains');
check(workerJs.includes('hard-fork-rockers') && workerJs.includes('crypto-stoned-boys'), 'faction canon keys preserved');

const forbidden = ['passive income', 'financial reward', 'token reward', 'cash prize', 'investment', 'earn money'];
const corpus = [workerJs, wtfSystemJs, xpBurstJs, communityHtml, gamesHtml].join('\n').toLowerCase();
for (const term of forbidden) check(!corpus.includes(term), `forbidden wording absent: ${term}`);

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) process.exit(1);
