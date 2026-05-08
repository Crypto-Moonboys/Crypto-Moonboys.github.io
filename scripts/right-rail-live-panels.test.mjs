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
const siteShell = read('js/site-shell.js');
const csp = read('js/components/connection-status-panel.js');
const las = read('js/components/live-activity-summary.js');
const wtf = read('js/arcade/systems/daily-wtf-event-system.js');
const xpBurst = read('js/components/xp-burst-animation.js');
const bridge = read('js/battle-chamber-faction-bridge.js');
const worker = read('workers/moonboys-api/worker.js');

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
function routeBlock(src, route) {
  const start = src.indexOf(`path === '${route}'`);
  if (start === -1) return '';
  const next = src.indexOf("\n    // ──", start + 1);
  return src.slice(start, next === -1 ? src.length : next);
}

console.log('\n[1] Live page warning cleanup');
check(!hasPreloadFor(community, '/js/battle-chamber-faction-bridge.js'), 'community.html does not classic-preload the module Battle Chamber bridge');
check(!hasPreloadFor(community, '/js/arcade/systems/daily-wtf-event-system.js'), 'community.html does not classic-preload the Daily WTF module');
check(hasModuleScript(community, '/js/battle-chamber-faction-bridge.js'), 'community.html still runtime-loads Battle Chamber bridge as a module');
check(hasModuleScript(community, '/js/arcade/systems/daily-wtf-event-system.js'), 'community.html still runtime-loads Daily WTF system as a module');
check(!community.includes('href="/favicon.ico"'), 'community.html does not reference a missing or fake /favicon.ico asset');
check(community.includes('href="/img/favicon.svg"') && community.includes('type="image/svg+xml"') && community.includes('sizes="any"'), 'community.html uses the existing SVG favicon with an explicit type');
check(!fs.existsSync(path.join(ROOT, 'favicon.ico')), 'repo does not ship a fake .ico file containing SVG text');

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

console.log('\n[4] Panel separation');
check(siteShell.includes('PLAYER LIVE FEED') && siteShell.includes('FACTION DAILY OPS'), 'right rail boxes are titled PLAYER LIVE FEED and FACTION DAILY OPS');
check(csp.includes('Recent Personal Activity') && csp.includes('No synced activity yet. Play an arcade run or complete a faction task.'), 'player panel owns user/sync/progression/recent activity data');
check((las.includes("Today\\'s Missions") || las.includes("Today's Missions")) && las.includes('Daily WTF Signal') && las.includes('Missed Opportunities'), 'faction panel owns missions/events/missed signals');
check(!las.includes('data-csp-xp') && !las.includes('data-csp-panel'), 'faction ops panel does not repeat the Arcade XP block');
check(!siteShell.includes('id="hud-player-name">Guest'), 'right rail no longer renders a duplicate Guest/Telegram name block');
check(!siteShell.includes('Live linked avatar'), 'HUD player-name logic does not replace the name with literal Live linked avatar');
check(las.includes('p.progress != null') && las.includes('p.target != null') && las.includes('p.complete === true'), 'mission normalization reads saved progress, target, and complete fields from bridge cache');
check(las.includes('esc(String(m.current))') && las.includes('esc(String(m.target))') && las.includes("m.done ? '✓ COMPLETE'"), 'mission renderer displays saved progress counters and completed check state');

console.log('\n[5] WTF event visibility');
check(las.includes('window.MOONBOYS_WTF_EVENTS'), 'faction ops panel reads window.MOONBOYS_WTF_EVENTS');
check(las.includes('active_event') && las.includes('upcoming_events') && las.includes('next_event'), 'faction ops panel renders active/upcoming/next event state');
check(las.includes('data-wtf-countdown'), 'faction ops panel includes countdown field');
check(las.includes('data-wtf-checkin') && las.includes('checkInWtfEvent'), 'faction ops panel includes wired check-in CTA');
check(las.includes('data-wtf-complete') && las.includes('completeWtfEvent'), 'faction ops panel includes safe complete CTA hook');

console.log('\n[6] Missed perks');
check(las.includes('missed_history_count') && las.includes('missed_today'), 'missed count and daily missed summary can render');
check(las.includes('The city kept moving while you were away.'), 'missed opportunities copy is present');
check(las.includes('Daily options reset at UTC midnight. Missed history does not reset.'), 'daily reset copy and missed history persistence copy are separate and present');


console.log('\n[7] Roguelite client/server method contract');
const dailyStateBlock = routeBlock(worker, '/roguelite/daily-state');
const missedHistoryBlock = routeBlock(worker, '/roguelite/missed-history');
check(dailyStateBlock.includes("request.method === 'GET' || request.method === 'POST'"), 'Worker supports POST /roguelite/daily-state while keeping GET compatibility');
check(missedHistoryBlock.includes("request.method === 'GET' || request.method === 'POST'"), 'Worker supports POST /roguelite/missed-history while keeping GET compatibility');
check(dailyStateBlock.includes('tgBody = await request.json()') && dailyStateBlock.includes('verifyTelegramIdentityFromBody(tgBody'), 'daily-state POST reads telegram_auth from JSON body');
check(missedHistoryBlock.includes('tgBody = await request.json()') && missedHistoryBlock.includes('verifyTelegramIdentityFromBody(tgBody'), 'missed-history POST reads telegram_auth from JSON body');
check(missedHistoryBlock.includes("request.method === 'POST' ? tgBody?.limit") && missedHistoryBlock.includes("request.method === 'POST' ? tgBody?.utc_day"), 'missed-history POST body supports limit and utc_day filters');
check(bridge.includes("fetchJsonWithTelegramAuth(apiBase + '/roguelite/daily-state')") && bridge.includes("fetchJsonWithTelegramAuth(apiBase + '/roguelite/missed-history', { limit: 8 })"), 'Battle Chamber bridge uses the Worker POST contract for roguelite state');

console.log('\n[8] Safety and no auth query drift');
check(!bridge.includes('telegram_auth=') && !bridge.includes('buildTelegramAuthQuery'), 'Battle Chamber bridge no longer sends auth payloads in GET query strings');
check(bridge.includes("method: 'POST'") && bridge.includes('body: JSON.stringify(body)'), 'linked roguelite state fetches use POST bodies when auth is needed');
check(!csp.includes('FALLBACK_REQUIRED_XP = 51') && csp.includes('FALLBACK_REQUIRED_XP = 50'), 'Block Topia fallback XP threshold was not changed');
check(!/Score\s*=\s*Arcade XP/.test(csp + las + siteShell), 'leaderboard score and Arcade XP labels remain separate');
check(!/token reward|NFT reward|passive income|financial reward/i.test(csp + las + siteShell), 'no token/NFT/passive/financial reward wording was added');

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error(`\n${failed.length} right-rail live panel checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} right-rail live panel checks passed.`);
