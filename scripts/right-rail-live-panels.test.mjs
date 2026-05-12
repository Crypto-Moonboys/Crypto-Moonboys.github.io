import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const checks = [];
function check(condition, message) {
  checks.push({ ok: !!condition, message });
  if (!condition) console.error('FAIL:', message);
  else console.log('PASS:', message);
}

const community = read('community.html');
const games = read('games/index.html');
const incubator = read('gkniftyheads-incubator.html');
const incubatorLink = read('js/incubator-link.js');
const siteShell = read('js/site-shell.js');
const csp = read('js/components/connection-status-panel.js');
const las = read('js/components/live-activity-summary.js');
const wtf = read('js/arcade/systems/daily-wtf-event-system.js');
const xpBurst = read('js/components/xp-burst-animation.js');
const bridge = read('js/battle-chamber-faction-bridge.js');
const worker = read('workers/moonboys-api/worker.js');
const dailyDigestRoutes = read('workers/moonboys-api/routes/daily-digest.js');
const workerAndDailyDigest = worker + '\n' + dailyDigestRoutes;
const globalHeader = read('js/components/global-player-header.js');
const homeWidgets = read('js/home-widgets.js');
const telegramCommunity = read('js/telegram-community.js');
const leaderboardClient = read('js/leaderboard-client.js');
const moonboysState = read('js/core/moonboys-state.js');

function hasScript(html, src) {
  return html.includes(`src="${src}"`) || html.includes(`src='${src}'`);
}
function hasModuleScript(html, src) {
  const re = new RegExp(`<script[^>]+type=["']module["'][^>]+src=["']${src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`);
  return re.test(html);
}
function hasPreloadFor(html, href) {
  const re = new RegExp(`<link[^>]+rel=["']preload["'][^>]+href=["']${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`);
  return re.test(html);
}
function hasModulePreloadFor(html, href) {
  const re = new RegExp(`<link[^>]+rel=["']modulepreload["'][^>]+href=["']${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`);
  return re.test(html);
}
function hasCfBypassedModuleScript(html, src) {
  const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`<script[^>]+data-cfasync=["']false["'][^>]+type=["']module["'][^>]+src=["']${escaped}["']`).test(html);
}

function functionBlock(src, name) {
  const start = src.indexOf(`function ${name}`);
  if (start === -1) return '';
  const remainder = src.slice(start + 1);
  const nextMatch = remainder.match(/\n\s*function\s+/);
  const next = nextMatch ? start + 1 + nextMatch.index : -1;
  return src.slice(start, next === -1 ? src.length : next);
}

function routeBlock(src, route) {
  const start = src.indexOf(`path === '${route}'`);
  if (start === -1) return '';
  const next = src.indexOf("\n    // ──", start + 1);
  return src.slice(start, next === -1 ? src.length : next);
}

console.log('\n[1] Live page warning cleanup');
check(!hasPreloadFor(community, '/js/battle-chamber-faction-bridge.js'), 'community.html does not classic-preload the module Battle Chamber bridge');
check(!hasPreloadFor(community, '/js/arcade/systems/daily-wtf-event-system.js'), 'community.html does not classic-preload the Daily WTF module');
check(!hasPreloadFor(games, '/js/arcade/systems/daily-wtf-event-system.js'), 'games/index.html does not classic-preload the Daily WTF module');
check(!hasModulePreloadFor(community, '/js/battle-chamber-faction-bridge.js'), 'community.html does not modulepreload the Battle Chamber bridge before delayed shell/component work');
check(!hasModulePreloadFor(community, '/js/arcade/systems/daily-wtf-event-system.js'), 'community.html does not modulepreload the Daily WTF system before delayed shell/component work');
check(!hasModulePreloadFor(games, '/js/arcade/systems/daily-wtf-event-system.js'), 'games/index.html does not modulepreload the Daily WTF system before delayed shell/component work');
check(hasModuleScript(community, '/js/battle-chamber-faction-bridge.js'), 'community.html still runtime-loads Battle Chamber bridge as a module');
check(hasModuleScript(community, '/js/arcade/systems/daily-wtf-event-system.js'), 'community.html still runtime-loads Daily WTF system as a module');
check(hasCfBypassedModuleScript(community, '/js/battle-chamber-faction-bridge.js'), 'community.html bypasses Cloudflare Rocket Loader for Battle Chamber module runtime load');
check(hasCfBypassedModuleScript(community, '/js/arcade/systems/daily-wtf-event-system.js'), 'community.html bypasses Cloudflare Rocket Loader for Daily WTF module runtime load');
check(hasCfBypassedModuleScript(games, '/js/arcade/systems/daily-wtf-event-system.js'), 'games/index.html bypasses Cloudflare Rocket Loader for Daily WTF module runtime load');
check(!community.includes('href="/favicon.ico"'), 'community.html does not reference a missing or fake /favicon.ico asset');
check(community.includes('<link rel="icon" type="image/png" href="/favicon.png">'), 'community.html uses the standardized PNG favicon');
check(!fs.existsSync(path.join(ROOT, 'favicon.ico')), 'repo does not ship a fake .ico file containing SVG text');
check(incubator.includes('href="/favicon.png"') && !incubator.includes('href="/favicon.ico"'), 'incubator page uses standardized PNG favicon without /favicon.ico fallback');

console.log('\n[1b] Incubator direct-visit link handling');
check(incubator.includes('/js/incubator-link.js'), 'incubator page still loads Telegram link handler');
check(incubatorLink.includes('getTelegramHashState') && incubatorLink.includes('params.has(HASH_KEY)'), 'incubator link handler distinguishes direct visits from empty bot callbacks');
check(incubatorLink.includes('Use /gklink in the Telegram bot to connect your account.'), 'incubator direct visit shows neutral /gklink instructions');
check(!incubatorLink.includes("debug('payload_missing');"), 'incubator direct visit does not log noisy payload_missing');
check(incubatorLink.includes("debug('payload_missing_after_callback');"), 'incubator empty bot callback still records debug context');

console.log('\n[2] Daily WTF frontend verification');
check(hasScript(community, '/js/components/xp-burst-animation.js') && hasScript(games, '/js/components/xp-burst-animation.js'), 'xp-burst-animation.js is loaded on community and games hub');
check(hasScript(community, '/js/arcade/systems/daily-wtf-event-system.js') && hasScript(games, '/js/arcade/systems/daily-wtf-event-system.js'), 'daily-wtf-event-system.js is loaded on community and games hub');
check(wtf.includes('window.MOONBOYS_WTF_EVENTS') && wtf.includes('/wtf/events/today'), 'Daily WTF system populates window.MOONBOYS_WTF_EVENTS from /wtf/events/today');
for (const evt of ['moonboys:wtf-events-ready','moonboys:wtf-event-checkin','moonboys:wtf-event-complete','moonboys:xp-burst','moonboys:roguelite-options-unlocked']) {
  check(wtf.includes(evt), `Daily WTF system dispatches ${evt}`);
}
check(!/wtf\/events\/(today|check-in|complete|choose-option)[^`'"\n]*telegram_auth/.test(wtf), 'Daily WTF system does not put auth payloads in WTF GET query strings');
check(!xpBurst.includes('innerHTML'), 'XP burst animation avoids unsafe dynamic innerHTML rendering');

console.log('\n[3] Top notice');
check(csp.includes('LIVE SYNC') && csp.includes('Telegram Sync Required'), 'compact Telegram/XP live notice supports linked and unlinked states');
check(csp.includes('csp-badge-stack') && csp.includes('csp-badge-chip'), 'top notice is compact and chip-based');
check(csp.indexOf('LIVE SYNC') < csp.indexOf('async function buildPanelHTML') || csp.includes('async function buildBadgeHTML'), 'top notice is rendered by badge path, not the full panel');
check(csp.includes('blocktopiaBadgeLabel(unlocked)') && csp.includes("return unlocked ? 'BT OPEN' : 'BT LOCK'"), 'initial badge uses shared BT OPEN / BT LOCK labels');
const stateSubscribeBlock = csp.slice(csp.indexOf('MOONBOYS_STATE.subscribe'), csp.indexOf('// ── Bootstrap'));
check(stateSubscribeBlock.includes('blocktopiaBadgeLabel(unlocked)'), 'live XP subscription path reuses BT OPEN / BT LOCK labels');
check(!stateSubscribeBlock.includes("btNode.textContent = unlocked ? 'unlocked' : 'locked'"), 'live badge updater does not flip back to old unlocked / locked labels');
check(stateSubscribeBlock.includes('blocktopiaAccessHTML(linked, state.xp, requiredXp)'), 'live Block Topia row updater reuses initial access markup helper');

console.log('\n[4] Panel separation');
check(siteShell.includes('PLAYER LIVE FEED') && siteShell.includes('FACTION DAILY OPS'), 'right rail boxes are titled PLAYER LIVE FEED and FACTION DAILY OPS');
check(csp.includes('Latest:') && csp.includes('csp-feed-row--latest') && csp.includes('csp-feed-text') && csp.includes('Missed XP'), 'player live feed latest status is a compact muted row with bounded wrap');
check(!csp.includes('<div class="csp-item-label">Faction</div>') && !csp.includes('<div class="csp-item-label">Season</div>') && !csp.includes('<div class="csp-item-label">API Sync</div>'), 'player live feed does not repeat faction/season/API rows');
const ownBattleBlock = functionBlock(csp, 'isOwnBattleActivity');
const latestActivityBlock = functionBlock(csp, 'latestActivityRows');
check(csp.includes('isOwnBattleActivity') && csp.includes('getTelegramId()') && csp.includes('activity.filter(isOwnBattleActivity)'), 'player feed filters Battle Chamber activity to the linked player when possible');
check(!ownBattleBlock.includes('getDisplayName()') && !ownBattleBlock.includes('display_name'), 'personal Battle Chamber matching does not rely on display name when Telegram identifiers are required');
check(!latestActivityBlock.includes("tag: 'Global'") && !latestActivityBlock.includes('global feed active'), 'global/unmatched Battle Chamber rows are not rendered inside Recent Personal Activity');
check(csp.includes('Latest Public Battle Chamber Activity') && csp.includes("tag: 'Public'") && csp.includes('latestGlobalBattleRows'), 'global Battle Chamber feed is rendered only under a public/global heading');
check(!csp.includes('No public Battle Chamber activity yet.') && !csp.includes("buildFeedHTML(latestGlobalBattleRows(), 'No public Battle Chamber activity yet.')"), 'public Battle Chamber box is hidden when empty');
check(csp.includes('(publicRows.length') && csp.includes('buildFeedHTML(publicRows)'), 'public Battle Chamber section only renders when there are public rows');
check((las.includes("Today\\'s Missions") || las.includes("Today's Missions")) && las.includes('Daily WTF Signal') && las.includes('Missed Opportunities'), 'faction panel owns missions/events/missed signals');
check(!las.includes('data-csp-xp') && !las.includes('data-csp-panel'), 'faction ops panel does not repeat the Arcade XP block');
check(!siteShell.includes('id="hud-player-name">Guest'), 'right rail no longer renders a duplicate Guest/Telegram name block');
check(!siteShell.includes('Live linked avatar'), 'HUD player-name logic does not replace the name with literal Live linked avatar');
check(las.includes('p.progress != null') && las.includes('p.target != null') && las.includes('p.complete === true'), 'mission normalization reads saved progress, target, and complete fields from bridge cache');
check(las.includes('esc(String(current))') && las.includes('esc(String(target))') && las.includes('las-mission-row') && las.includes('las-mission-meta') && las.includes('las-mission-sep'), 'mission renderer displays compact title + progress · reward rows');
check(las.includes('Number.isFinite(Number(m.current))') && las.includes('Number.isFinite(Number(m.target))') && !las.includes('las-mission-card') && !las.includes('las-mission-top') && !las.includes('las-mission-obj') && !las.includes('las-progress'), 'mission cards do not render large objective paragraphs or progress bars in right rail');
const viewDetailsCount = (las.match(/View details/g) || []).length;
check(viewDetailsCount === 1, 'faction ops panel keeps only one compact "View details" link');
check(csp.includes('scheduleLiveDataRefresh') && csp.includes('_liveDataRefreshTimer') && csp.includes('setTimeout(function ()'), 'connection status panel debounces live-data refreshes');
for (const evt of ['battle-chamber:faction-data-ready','battle-chamber:activity-ready','moonboys:wtf-events-ready','moonboys:wtf-event-checkin','moonboys:wtf-event-complete','moonboys:roguelite-options-unlocked','moonboys:faction-status','moonboys:faction-boost']) {
  check(csp.includes(evt), `connection status panel listens for ${evt}`);
}
check(csp.includes("document.querySelectorAll('[data-csp-panel]').forEach(function (el) { mount(el); })"), 'recent personal activity remounts after live-data events so empty feed is not permanently stuck');

console.log('\n[5] WTF event visibility');
check(las.includes('window.MOONBOYS_WTF_EVENTS'), 'faction ops panel reads window.MOONBOYS_WTF_EVENTS');
check(las.includes('active_event') && las.includes('upcoming_events') && las.includes('next_event'), 'faction ops panel renders active/upcoming/next event state');
check(las.includes('data-wtf-countdown'), 'faction ops panel includes countdown field');
check(las.includes('data-wtf-checkin') && las.includes('checkInWtfEvent'), 'faction ops panel includes wired check-in CTA');
check(las.includes('getWtfProofSource') && las.includes('VALID_WTF_COMPLETION_SOURCES'), 'faction ops panel gates completion behind valid proof sources');
check(!las.includes("completeWtfEvent(eventId, 'right_rail_ops', 'faction_daily_ops')") && !las.includes('right_rail_ops'), 'right rail does not call completeWtfEvent with invalid right_rail_ops proof source');
check(las.includes('data-completion-source') && las.includes('data-source-id') && las.includes('Complete with proof'), 'complete CTA only renders with proof source and source id attributes');
check(las.includes('Daily WTF:') && las.includes('Starts in') && las.includes('Ends in') && las.includes('Get Ready'), 'Daily WTF rail is compact with title/timer/action');
check(!las.includes('Live now - Daily WTF signals open every 4 hours') && !las.includes('Get ready - Daily WTF signals open every 4 hours across the UTC day.'), 'Daily WTF rail removes verbose legacy subcopy');
check(las.includes('function wtfStatusLabel(status, completedOnly)') && las.includes("if (completedOnly || status === 'completed') return 'COMPLETE';") && las.includes("if (status === 'waiting') return 'WAITING';"), 'Daily WTF rail has explicit status-label mapping for completed/missed/waiting');
check(las.includes('var statusLabel = wtfStatusLabel(status, completedOnly);') && !las.includes("var statusLabel = status === 'active' || status === 'checked in' ? 'Active' : 'Upcoming';"), 'Daily WTF status labels are derived from the status-label helper, not upcoming-only fallback');
check(wtf.includes('setTransientState') && wtf.includes('Loading Daily WTF signal…'), 'Daily WTF system publishes a loading state before fetch resolves');
check(wtf.includes('window.MOONBOYS_DAILY_WTF') && wtf.includes('makeFallbackSchedule,'), 'Daily WTF global API exposes makeFallbackSchedule for shared fallback rendering');
check(wtf.includes('Signal feed unavailable; deterministic local schedule rendered') && wtf.includes('makeFallbackSchedule'), 'Daily WTF system has a deterministic fallback instead of leaving schedule loading forever');
check(wtf.includes('FETCH_TIMEOUT_MS = 8000') && wtf.includes('Promise.race([') && wtf.includes("error: 'timeout'"), 'Daily WTF fetch path enforces timeout instead of waiting forever');
check(wtf.includes('timeoutId = setTimeout') && wtf.includes('if (timeoutId) clearTimeout(timeoutId);'), 'Daily WTF fetch timeout timer is cleared after request settles');
check(wtf.includes('scheduleApiBaseRetry') && wtf.includes('api_base_missing') && wtf.includes('API_BASE_RETRY_DELAYS_MS = [1500, 3000, 6000, 12000]'), 'api_base_missing retry uses capped stepped backoff');
check(wtf.includes('apiBaseRetryAttempt') && wtf.includes('if (apiBaseRetryAttempt >= API_BASE_RETRY_DELAYS_MS.length) return;'), 'api_base_missing retry attempts are capped');
check(wtf.includes('resetApiBaseRetryState') && wtf.includes('if (payload && payload.ok) resetApiBaseRetryState();'), 'successful Daily WTF refresh resets api-base retry state');
check(wtf.includes('normalizeEvent') && wtf.includes('start_at: event.start_at || event.starts_at') && wtf.includes('end_at: event.end_at || event.ends_at'), 'Daily WTF system normalizes Worker event field aliases');
check(las.includes('data-wtf-state="loading"') && las.includes('Daily WTF: Loading signal'), 'faction ops panel renders an explicit loading state');
check(las.includes('WTF_LOADING_STALL_MS = 8000') && las.includes('buildDeterministicWtfFallbackState') && las.includes('data-wtf-state="fallback"'), 'faction ops panel renders deterministic fallback after loading stall timeout');
check(las.includes('scheduleWtfLoadingFallbackRepaint') && las.includes('wtfLoadingRepaintTimer') && las.includes('setTimeout(function ()') && las.includes('refresh();'), 'loading state schedules a one-shot repaint so fallback appears without ready events');
check(las.includes('clearWtfLoadingRepaintTimer') && las.includes('clearTimeout(_singleton.wtfLoadingRepaintTimer)'), 'loading repaint timer is cleared when real Daily WTF state resolves');
check(las.includes('window.MOONBOYS_DAILY_WTF') && las.includes('api.makeFallbackSchedule') && !las.includes('wtf-midnight-signal'), 'right-rail fallback uses shared Daily WTF fallback helper instead of duplicating schedule windows');
check(las.includes('buildDeterministicWtfFallbackState') && las.includes('api.makeFallbackSchedule(current)') && las.includes('data-wtf-state="fallback"'), 'right-rail deterministic fallback path can call shared helper and render fallback card');
check(las.includes('normalizeEmergencyState') && las.includes('getSignedAuthForEmergencyRecovery') && las.includes('maybeKickEmergencyWtfRecovery'), 'right-rail exposes emergency recovery helpers for direct real-feed recovery');
check(las.includes("method: 'POST'") && las.includes("body: JSON.stringify({ telegram_auth: auth })") && las.includes("fetch(base + '/wtf/events/today', requestOptions)") && las.includes('if (ac) requestOptions.signal = ac.signal;'), 'linked emergency recovery uses POST body auth while preserving timeout abort support');
check(las.includes('var requestOptions = auth') && las.includes(': {};'), 'unlinked emergency recovery falls back to public GET without auth payload');
check(las.includes('var emergencyState = getEmergencyStateIfUsable();') && las.includes("if ((!state || state.status === 'error') && emergencyState)"), 'right-rail applies recovered emergency state before rendering unavailable card');
check(las.includes('hasUsablePrimaryWtfState(getWtfState())') && las.includes('_singleton.wtfEmergencyState = null;') && las.includes('_singleton.wtfEmergencyRecoveredAt = 0;'), 'right-rail clears emergency recovered state only after primary state becomes usable');
check(las.includes('WTF_EMERGENCY_STATE_TTL_MS') && las.includes('getEmergencyStateIfUsable') && las.includes('(Date.now() - recoveredAt) > WTF_EMERGENCY_STATE_TTL_MS'), 'right-rail keeps emergency state stable across ticks while primary stays broken, with bounded TTL');
check(las.includes('Daily WTF:') && las.includes('data-wtf-state="fallback"'), 'fallback WTF card stays compact');
check(las.includes('scheduleWtfHelperRetry') && las.includes('wtfHelperRetryAttempts') && las.includes('WTF_HELPER_RETRY_MAX'), 'right-rail handles delayed fallback-helper availability with capped retries');
check(!las.includes('Fallback helper unavailable. Unable to construct a local Daily WTF schedule right now.'), 'right-rail does not expose technical helper-unavailable copy to users');
check(!las.includes('Daily WTF signals open every 4 hours across the UTC day') && !las.includes('Objective:'), 'Daily WTF rail omits oversized explanatory/objective copy');
check(las.includes('data-wtf-state="error"') && las.includes('href="/games/"') && las.includes('Get Ready'), 'right-rail fallback and error cards always include compact CTA');
check(las.includes("if (state.status === 'error') {") && las.includes('maybeKickEmergencyWtfRecovery();') && las.includes("if ((!state || state.status === 'error') && emergencyState)"), 'unavailable card is recoverable and does not persist when recovered next_event state exists');
check(las.includes('tomorrowStart = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 1))') && las.includes('nextFromTomorrow') && las.includes('Date.parse(next.start_at) - current.getTime()'), 'right-rail fallback looks ahead to tomorrow midnight signal and computes countdown after final daily window');
check(las.includes('data-wtf-state="error"') && las.includes('Daily WTF: Signal unavailable'), 'faction ops panel renders a controlled compact feed failure state');
check(las.includes('Get Ready') && las.includes('Starts in'), 'upcoming WTF state renders compact preparation card');
check(las.includes('Check In') && las.includes('data-wtf-checkin') && las.includes('Ends in'), 'active WTF state renders Check In CTA for linked users');
check(las.includes('No Daily WTF signals generated for today') && las.includes('Get Ready'), 'no-event WTF fallback remains actionable');
check(las.includes('_QUARANTINED_FACTION_MISSION_FALLBACKS') && !las.includes('fallbackDailyMissions'), 'faction mission fallbacks are quarantined and not rendered as live faction data');
check(las.includes('Link Telegram') && las.includes('Telegram sync inactive'), 'unlinked users see a Link Telegram CTA');
check(las.includes('var state = window.MOONBOYS_WTF_EVENTS || null') && las.includes('wtfHTML(linked)'), 'faction ops mount path reads existing window.MOONBOYS_WTF_EVENTS state and does not rely only on future events');

const wtfStatusBlock = functionBlock(las, 'wtfStatus');
const wtfHtmlBlock = functionBlock(las, 'wtfHTML');
const updateGlobalBlock = functionBlock(wtf, 'updateGlobal');
const setTransientBlock = functionBlock(wtf, 'setTransientState');
const refreshBlock = functionBlock(wtf, 'refresh');
const tickerBlock = functionBlock(wtf, 'startCountdownTicker');
check(wtfStatusBlock.indexOf('state.next_event') < wtfStatusBlock.indexOf('state.completed_today'), 'upcoming/next WTF signal has render priority over completed_today');
check(wtfHtmlBlock.includes('completedOnly = completed && !active && !next') && wtfHtmlBlock.includes("var completedPrefix = completedOnly ? 'COMPLETE ' : '';"), 'completed tick only appears when no active or next signal exists');
check(las.includes("if (completedOnly || status === 'completed') return 'COMPLETE';"), 'completed Daily WTF status maps to COMPLETE');

const mojibakeMarkers = ['Ã', 'Â', '�', 'â‚¬', 'â€œ', 'â€', 'Å“'];
for (const marker of mojibakeMarkers) {
  check(!las.includes(marker), `live-activity-summary is free of mojibake marker: ${marker}`);
  check(!wtf.includes(marker), `daily-wtf-event-system is free of mojibake marker: ${marker}`);
}
check(updateGlobalBlock.includes("const isLoading = transientStatus === 'loading'") && updateGlobalBlock.includes('const active = isLoading ? null') && updateGlobalBlock.includes('let next = isLoading ? null'), 'loading state does not populate active or next_event');
check(updateGlobalBlock.includes('const computedCountdown = isLoading ? 0') && updateGlobalBlock.includes('const hasServerCountdown = !isLoading'), 'loading state does not derive or tick a countdown');
check(setTransientBlock.includes("updateGlobal({ ok: false") && setTransientBlock.includes("if (status !== 'loading') dispatch('moonboys:wtf-events-ready'"), 'loading state does not dispatch the final ready event');
check(wtf.includes("dispatch('moonboys:wtf-events-ready', window.MOONBOYS_WTF_EVENTS);") && wtf.includes('updateGlobal(finalState)'), 'final Worker/fallback WTF state still dispatches ready');
check(refreshBlock.includes('payload = await fetchTodayEvents()') && refreshBlock.includes('finalState = fallbackFromError') && refreshBlock.includes("setTransientState('error', 'Signal feed unavailable.')"), 'refresh always resolves to worker payload, fallback, or explicit unavailable state');
check(wtf.includes('triggerBoundaryRefresh') && tickerBlock.includes('state.countdown_seconds === 0') && tickerBlock.includes('triggerBoundaryRefresh()'), 'countdown boundary triggers immediate refresh so upcoming cannot stay at 00:00:00');
check(las.includes("window.addEventListener('moonboys:wtf-countdown-tick', updateWtfCountdownUI)") && !las.includes('setInterval(updateWtfCountdownUI'), 'right rail uses one countdown update mechanism');
const addToLogBlock = functionBlock(las, 'addToLog');
check(!addToLogBlock.includes("document.querySelectorAll('[data-las-panel]').forEach(function (el) { mount(el); });"), 'addToLog does not force full right-rail remount when visible log UI is absent');

console.log('\n[6] Missed perks');
check(las.includes('missed_history_count') && las.includes('missed_today'), 'missed count and daily missed summary can render');
check(!las.includes('The city kept moving while you were away.'), 'missed opportunities does not include oversized away copy');
check(!las.includes('Daily WTF signals open every 4 hours. Daily options reset at UTC midnight. Missed history does not reset.'), 'right rail omits oversized reset/explainer copy');
check(las.includes('las-missed-stat') && las.includes('las-missed-sep') && las.includes('missed all-time') && las.includes('today'), 'missed opportunities summary stays compact and avoids awkward wrapping');
// All-time missed XP visibility in right-rail PLAYER LIVE FEED
check(las.includes('missed_xp_all_time'), 'right rail reads missed_xp_all_time for all-time missed XP display');
check(las.includes('Missed XP:'), 'right rail renders "Missed XP:" label for all-time missed XP');
check(!las.includes('Missed opportunities are tracked over time.'), 'right rail omits repeated missed-opportunities explanatory paragraph');
check(las.includes('MOONBOYS_ROGUELITE_DAILY_STATE'), 'right rail reads missed_xp_all_time from roguelite daily state as fallback');
check(!las.includes('state.missed_xp_all_time || rogueliteState.missed_xp_all_time'), 'right rail does not use truthy fallback for missed_xp_all_time');
check(!las.includes('state.missed_xp_today || rogueliteState.missed_xp_today'), 'right rail does not use truthy fallback for missed_xp_today');
check(las.includes('state.missed_xp_all_time != null ? state.missed_xp_all_time') && las.includes('rogueliteState.missed_xp_all_time != null ? rogueliteState.missed_xp_all_time'), 'right rail preserves authoritative 0 missed_xp_all_time values');
check(las.includes('state.missed_events_all_time != null ? state.missed_events_all_time') && las.includes('state.missed_events_today != null ? state.missed_events_today'), 'right rail preserves authoritative 0 missed event counters');
// dashboard.html must not contain missed XP (wiki/editorial only)
const dashboard = read('dashboard.html');
check(!dashboard.includes('missed_xp') && !dashboard.includes('missed_xp_all_time'), 'dashboard.html does not contain missed XP player data (wiki/editorial only)');
// Missed history persistence: data is accumulated, not reset by UTC day
check(!las.toLowerCase().includes('missed xp resets') && !las.includes('missed_xp_reset'), 'right rail does not suggest missed XP resets by day');


console.log('\n[7] Roguelite client/server method contract');
const dailyStateBlock = routeBlock(dailyDigestRoutes, '/roguelite/daily-state');
const missedHistoryBlock = routeBlock(dailyDigestRoutes, '/roguelite/missed-history');
check(worker.includes("import { handleRogueliteDailyRoutes } from './routes/daily-digest.js';"), 'Worker imports delegated roguelite daily route handler module');
check(worker.includes('handleRogueliteDailyRoutes(request, env, url,'), 'Worker delegates roguelite daily route handling to shared module');
check(dailyStateBlock.includes("request.method === 'GET' || request.method === 'POST'"), 'Worker supports POST /roguelite/daily-state while keeping GET compatibility');
check(missedHistoryBlock.includes("request.method === 'GET' || request.method === 'POST'"), 'Worker supports POST /roguelite/missed-history while keeping GET compatibility');
check(dailyStateBlock.includes('tgBody = await request.json()') && dailyStateBlock.includes('verifyTelegramIdentityFromBody(tgBody'), 'daily-state POST reads telegram_auth from JSON body');
check(workerAndDailyDigest.includes('GET  /roguelite/daily-state') && workerAndDailyDigest.includes('POST /roguelite/daily-state  JSON { telegram_auth }'), 'Worker route docs document daily-state GET and POST JSON body separately');
check(missedHistoryBlock.includes('tgBody = await request.json()') && missedHistoryBlock.includes('verifyTelegramIdentityFromBody(tgBody'), 'missed-history POST reads telegram_auth from JSON body');
check(missedHistoryBlock.includes("request.method === 'POST' ? tgBody?.limit") && missedHistoryBlock.includes("request.method === 'POST' ? tgBody?.utc_day"), 'missed-history POST body supports limit and utc_day filters');
check(workerAndDailyDigest.includes('GET  /roguelite/missed-history?limit=30') && workerAndDailyDigest.includes('POST /roguelite/missed-history  JSON { telegram_auth, limit, utc_day }'), 'Worker route docs distinguish GET query limit from POST JSON body filters');
check(workerAndDailyDigest.includes('legacy query-auth compatibility; deprecated for linked state'), 'legacy GET auth compatibility is explicitly documented as deprecated');
check(bridge.includes("fetchJsonWithTelegramAuth(apiBase + '/roguelite/daily-state')") && bridge.includes("fetchJsonWithTelegramAuth(apiBase + '/roguelite/missed-history', { limit: 8 })"), 'Battle Chamber bridge uses the Worker POST contract for roguelite state');
check(worker.includes('getNextDailyWtfEvent') && worker.includes('addUtcDays') && worker.includes('upcomingEvents = [nextEvent]'), 'Worker /wtf/events/today returns a next Daily WTF signal even after today’s windows expire');

console.log('\n[8] Safety and no auth query drift');
check(!bridge.includes('telegram_auth=') && !bridge.includes('buildTelegramAuthQuery'), 'Battle Chamber bridge no longer sends auth payloads in GET query strings');
check(bridge.includes("method: 'POST'") && bridge.includes('body: JSON.stringify(body)'), 'linked roguelite state fetches use POST bodies when auth is needed');
check(!csp.includes('FALLBACK_REQUIRED_XP = 51') && csp.includes('FALLBACK_REQUIRED_XP = 50'), 'Block Topia fallback XP threshold was not changed');
check(!/Score\s*=\s*Arcade XP/.test(csp + las + siteShell), 'leaderboard score and Arcade XP labels remain separate');
check(!/token reward|NFT reward|passive income|financial reward/i.test(csp + las + siteShell), 'no token/NFT/passive/financial reward wording was added');

console.log('\n[9] Honest live data — new enforcement checks');

// Issue 1: site-shell.js must not contain "Live identity below"
check(!siteShell.includes('Live identity below'), 'site-shell.js does not contain fake "Live identity below" placeholder');
check(siteShell.includes('Telegram not linked'), 'site-shell.js uses honest "Telegram not linked" default for hud-player-name');

// Issue 2: live-activity-summary.js must not render hardcoded fallback missions as live ops
check(!las.includes('fallbackDailyMissions'), 'live-activity-summary.js does not have a fallbackDailyMissions function that renders as live faction data');
check(las.includes('_QUARANTINED_FACTION_MISSION_FALLBACKS'), 'faction mission fallbacks are quarantined and clearly labelled as such');
check(las.includes('No live faction missions reported'), 'live-activity-summary.js renders honest empty state when no real mission data');
check(!las.includes('{ factionKey: factionKey, missions: fallback'), 'normaliseMissionList does not return hardcoded fallback missions');

// Issue 3: Missed XP panel must not default to 0 before confirmed data
check(csp.includes('return null;'), 'missedXpAllTime returns null (not 0) when no confirmed data is available');
check(csp.includes("syncing\u2026") || csp.includes('syncing\\u2026'), 'connection-status-panel shows "syncing…" for unconfirmed Missed XP');
check(!csp.includes('return 0;\n  }') || (function() {
  // Ensure the remaining `return 0` is not the bottom-of-function fallback
  const idx = csp.lastIndexOf('return 0;');
  return idx === -1 || !csp.slice(idx - 50, idx).includes('function missedXpAllTime');
}()), 'missedXpAllTime no longer hard-returns 0 when globals are absent');

// Issue 4: Daily WTF fallback is labelled syncing/fallback
check(las.includes('Syncing schedule'), 'Daily WTF fallback card is labelled "Syncing schedule" not presented as confirmed live');
check(las.includes('Fallback schedule'), 'Daily WTF fallback card includes a "Fallback schedule" label for the local estimate');

// Issue 5: LIVE SYNC badge requires fresh signed auth
check(csp.includes('RELINK'), 'connection-status-panel has a RELINK badge state for linked-but-expired-auth');
check(csp.includes('getSignedTelegramAuth'), 'connection-status-panel checks getSignedTelegramAuth before showing LIVE SYNC');
check(csp.includes('csp-badge--relink'), 'RELINK badge has its own CSS class');
check(csp.includes('Auth expired'), 'RELINK badge copy includes "Auth expired" to explain the state');

// Issue 6: Server XP always wins during hydration
check(!moonboysState.includes('if (incomingXp >= _state.xp)'), 'moonboys-state.js does not guard server XP with >= local XP on hydration');
check(moonboysState.includes('Server is authoritative during hydration'), 'moonboys-state.js documents that server XP is authoritative on hydration');

// Issue 7: global-player-header.js must not auto-create [data-las-panel] unless opted in
check(globalHeader.includes("data-auto-las-panel"), 'global-player-header.js gates autoMountActivityPanel behind data-auto-las-panel opt-in');
check(globalHeader.includes("document.body.dataset.autoLasPanel !== 'true'"), 'global-player-header.js skips auto-mount unless body data attribute is set');
check(!globalHeader.includes("setTimeout(autoMountActivityPanel") || globalHeader.includes("data-auto-las-panel"), 'autoMountActivityPanel is either removed or properly gated from bootstrap');

// Issue 8: Home widgets do not label disabled feeds as live
check(homeWidgets.includes('not yet available') || homeWidgets.includes('not live yet') || homeWidgets.includes('coming soon'), 'home-widgets.js uses honest copy when live feed is disabled');
check(!homeWidgets.includes('Recent activity is generated from synced arcade'), 'home-widgets.js does not use misleading "is generated" copy when LIVE_FEED is false');

// Issue 9: Telegram community does not use "Active" for non-presence state
check(!telegramCommunity.includes('>✅ Active<'), 'telegram-community.js does not use "Active" for profile-found/faction-linked state');
check(telegramCommunity.includes('>✅ Linked<'), 'telegram-community.js uses "Linked" instead of "Active" for profile card badge');

// Issue 10: leaderboard fetch errors are distinguishable from empty leaderboard
check(leaderboardClient.includes('error: true') && leaderboardClient.includes('entries: null'), 'fetchLeaderboard returns structured error object on fetch failure');
check(!leaderboardClient.includes('return [];\n  }'), 'fetchLeaderboard does not return empty [] on catch (ambiguous with real empty leaderboard)');

// dashboard.html remains wiki/editorial only (existing check extended)
check(!dashboard.includes('missed_xp') && !dashboard.includes('missed_xp_all_time'), 'dashboard.html does not contain missed XP player data (wiki/editorial only)');
check(!dashboard.includes('data-las-panel') && !dashboard.includes('data-csp-panel'), 'dashboard.html does not contain live player feed panels');

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error(`\n${failed.length} right-rail live panel checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} right-rail live panel checks passed.`);
