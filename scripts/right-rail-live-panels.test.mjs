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
const indexHtml = read('index.html');
const searchHtml = read('search.html');
const timelineHtml = read('timeline.html');
const graphHtml = read('graph.html');
const samHtml = read('sam.html');
const aboutHtml = read('about.html');
const howToPlayHtml = read('how-to-play.html');
const incubatorHtml = read('gkniftyheads-incubator.html');
const incubator = read('gkniftyheads-incubator.html');
const nftTemplateExample = read('wiki/gkniftyheads-nova-shadow-shredder-784419.html');
const blockTopiaPage = read('games/block-topia/index.html');
const incubatorLink = read('js/incubator-link.js');
const siteShell = read('js/site-shell.js');
const csp = read('js/components/connection-status-panel.js');
const las = read('js/components/live-activity-summary.js');
const factionAlignment = read('js/faction-alignment.js');
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
const retroTheme = read('css/retro-16bit-theme.css');

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


function stringArrayValues(src, varName) {
  const escapedVarName = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:var|let|const)\\s+${escapedVarName}\\s*=\\s*\\[([\\s\\S]*?)\\]`);
  const match = src.match(re);
  if (!match) {
    throw new Error(`Unable to locate string array definition for "${varName}"`);
  }
  return Array.from(match[1].matchAll(/['"]([^'"]+)['"]/g)).map((m) => m[1]);
}

function routeBlock(src, route) {
  const start = src.indexOf(`path === '${route}'`);
  if (start === -1) return '';
  const next = src.indexOf("\n    // ──", start + 1);
  return src.slice(start, next === -1 ? src.length : next);
}

function hasFunctionDeclaration(src, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('function\\s+' + escaped + '\\s*\\(').test(src);
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
check(csp.includes('blocktopiaBadgeLabel(blocktopiaStatus)') && csp.includes("return 'BT OPEN'") && csp.includes("return 'BT LOCK'") && csp.includes("return 'BT SYNC'"), 'initial badge uses shared BT OPEN / BT LOCK / BT SYNC labels');
const stateSubscribeBlock = csp.slice(csp.indexOf('MOONBOYS_STATE.subscribe'), csp.indexOf('// ── Bootstrap'));
check(stateSubscribeBlock.includes('blocktopiaBadgeLabel(blocktopiaStatus)'), 'live XP subscription path reuses shared BT status labels');
check(!stateSubscribeBlock.includes("btNode.textContent = unlocked ? 'unlocked' : 'locked'"), 'live badge updater does not flip back to old unlocked / locked labels');
check(stateSubscribeBlock.includes("state.source === 'server'") && stateSubscribeBlock.includes('_progressionCache && _progressionCache.confirmed === true'), 'live Block Topia updater requires server-confirmed link/progression before confirmed unlock labels');
check(stateSubscribeBlock.includes('blocktopiaAccessHTML(linked, state.xp, requiredXp, serverLinkedConfirmed, progressionConfirmed)'), 'live Block Topia row updater reuses initial access markup helper with confirmation flags');

console.log('\n[4] Panel separation');
check(siteShell.includes('PLAYER LIVE FEED') && siteShell.includes('FACTION DAILY OPS') && siteShell.includes('DAILY WTF SIGNAL') && siteShell.includes('MISSED OPPORTUNITIES'), 'right rail restores multi-section live ecosystem headings');
check(!siteShell.includes('data-las-panel') && siteShell.includes('data-csp-panel') && siteShell.includes('data-csp-faction-ops') && siteShell.includes('data-csp-wtf-signal') && siteShell.includes('data-csp-missed'), 'right rail mounts only shared connection-status-panel section hooks (no data-las-panel hook)');
check(siteShell.includes('hud-box--actions') && siteShell.includes('hud-box--events') && siteShell.includes('hud-box--missed'), 'right rail includes separate visual boxes for ops/signal/missed sections');
const liveFeedBlock = functionBlock(csp, 'buildPlayerLiveFeedHTML');
const opsBlock = functionBlock(csp, 'buildFactionDailyOpsHTML');
const wtfSectionBlock = functionBlock(csp, 'buildDailyWtfSignalHTML');
const missedSectionBlock = functionBlock(csp, 'buildMissedOpportunitiesHTML');
check(liveFeedBlock.includes('csp-live-row') && !liveFeedBlock.includes('csp-grid') && liveFeedBlock.includes('Arcade XP') && liveFeedBlock.includes('Block Topia') && liveFeedBlock.includes('Latest:'), 'player live feed linked content stays compact rows with Arcade XP/Block Topia/latest — no csp-grid mini-cards');
check(opsBlock.includes('csp-ops-row') && opsBlock.includes('Faction XP') && opsBlock.includes('Contribution') && opsBlock.includes('Daily Ops Status') && opsBlock.includes('Completed Today') && opsBlock.includes('Missed Today'), 'Faction Daily Ops section renders faction XP/contribution/status/completed/missed as compact ops rows');
check(wtfSectionBlock.includes('csp-signal-card') && wtfSectionBlock.includes('csp-wtf-badge') && wtfSectionBlock.includes('Timer') && wtfSectionBlock.includes('Action') && !wtfSectionBlock.includes('csp-grid'), 'Daily WTF Signal section renders badge/timer/action as compact signal card module, not generic csp-grid');
check(wtfSectionBlock.includes('data-csp-wtf-countdown'), 'Daily WTF section renders a dedicated countdown data hook');
check(missedSectionBlock.includes('Missed XP (all-time)') && missedSectionBlock.includes('Missed Today') && missedSectionBlock.includes('Missed Count'), 'Missed Opportunities section renders all-time/today/count from shared state');
// New richer content checks
check(opsBlock.includes('Play Arcade'), 'Faction Daily Ops contains Play Arcade action link');
check(opsBlock.includes("Today's Missions") && opsBlock.includes('mission_opportunities'), "Faction Daily Ops renders Today's Missions section using mission_opportunities");
check(!opsBlock.includes('Latest Activity'), 'Faction Daily Ops does not include Latest Activity (owned by Player Live Feed)');
check(wtfSectionBlock.includes('active_event') && wtfSectionBlock.includes('next_event') && wtfSectionBlock.includes('upcoming_events'), 'Daily WTF Signal renders event title/name from active/next/upcoming event state');
check(wtfSectionBlock.includes('csp-wtf-badge') && wtfSectionBlock.includes('ACTIVE') && wtfSectionBlock.includes('UPCOMING') && wtfSectionBlock.includes('COMPLETE') && wtfSectionBlock.includes('MISSED') && wtfSectionBlock.includes('SYNCING') && wtfSectionBlock.includes('WAITING') && wtfSectionBlock.includes('UNAVAILABLE'), 'Daily WTF Signal renders status badge with ACTIVE/UPCOMING/COMPLETE/MISSED/SYNCING/WAITING/UNAVAILABLE states');
check(missedSectionBlock.includes('csp-missed-badge') && missedSectionBlock.includes('MISSED'), 'Missed Opportunities renders MISSED badge with warning-card style');
check(csp.includes('shared.dailyLoopApplied = true'), 'right rail marks when daily-loop state has been applied');
check(csp.includes('shared.dailyLoopOwnsFaction = true'), 'daily-loop faction/contribution ownership is explicit');
check(csp.includes('shared.dailyLoopOwnsDailyMissions = true'), 'daily-loop daily mission ownership is explicit');
check(csp.includes('shared.dailyLoopOwnsMissed = true'), 'daily-loop missed-opportunity ownership is explicit');
check(csp.includes('shared.dailyLoopOwnsWtf = true'), 'daily-loop Daily WTF ownership is explicit');
check(csp.includes('if (contribution.pending)') && csp.includes('if (!shared.dailyLoopOwnsFaction)'), 'daily-loop faction/contribution survives legacy fallback and player-state fetch');
check(csp.includes('shared.dailyLoopOwnsDailyMissions ? shared.dailyOpsStatus : getDailyOpsStatus'), 'daily-loop dailyOpsStatus survives legacy fallback when old daily state is missing');
check(csp.includes('shared.dailyLoopOwnsMissed ? shared.missedXp : missedXpAllTime'), 'daily-loop missed values survive legacy fallback');
check(csp.includes('shared.dailyLoopOwnsWtf ? shared.dailyWtfStatusDisplay : getDailyWtfSignalStatus'), 'daily-loop Daily WTF source truth survives legacy fallback');
check(csp.includes("wtf.source_state === 'preview'") && csp.includes("badgeLabel = 'PREVIEW'"), 'daily-loop Daily WTF preview renders PREVIEW, not LIVE');
check(csp.includes("statusState === 'query_failed'") && csp.includes("status: 'error'"), 'daily-loop query_failed renders unavailable/error, not LIVE');
check(csp.includes("statusState === 'query_failed' || statusState === 'migration_pending' || statusState === 'unavailable'"), 'migration_pending and unavailable share the non-live Daily WTF error path');
check(csp.includes('if (!api || typeof api.getState !== \'function\') return null;') && csp.includes("var latestActivityText = latestLine ? latestLine.text : 'Play Arcade to create activity';"), 'legacy fallback still works when MOONBOYS_DAILY_LOOP is missing or unusable');
check(csp.includes('#homepage-right-panel .csp-live-row-val{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}') && csp.includes('#homepage-right-panel .csp-ops-val{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'), 'homepage right-rail compact overrides stay scoped to rail truncation only');
check(!csp.includes('#homepage-right-panel .csp-live-row{align-items:center;gap:4px;padding:2px 0;font-size:.64rem;line-height:1.16}') && !csp.includes('#homepage-right-panel .csp-ops-row{align-items:center;gap:4px;padding:2px 0;font-size:.64rem;line-height:1.16}'), 'homepage right-rail no longer shrinks live/ops row typography below shared defaults');
check(csp.includes('#homepage-right-panel .csp-live-row-val{') && csp.includes('overflow:hidden') && csp.includes('text-overflow:ellipsis') && csp.includes('white-space:nowrap'), 'right-rail live row values enforce nowrap ellipsis to prevent vertical wrapping');
check(csp.includes('#homepage-right-panel .csp-ops-val{') && csp.includes('overflow:hidden') && csp.includes('text-overflow:ellipsis') && csp.includes('white-space:nowrap'), 'right-rail ops row values enforce nowrap ellipsis to prevent vertical wrapping');
check(csp.includes('#homepage-right-panel .csp-feed-text{') && csp.includes('white-space:nowrap') && csp.includes('text-overflow:ellipsis') && !csp.includes('#homepage-right-panel .csp-feed-text{font-size:.62rem;line-height:1.16;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;overflow-wrap:normal}'), 'right-rail latest/feed text keeps one-line scoped ellipsis without forced tiny font-size');
check(csp.includes('#homepage-right-panel .csp-mission-row{white-space:nowrap}') && !csp.includes('#homepage-right-panel .csp-mission-row{align-items:center;gap:4px;padding:2px 0;font-size:.66rem;line-height:1.14;white-space:nowrap}'), 'right-rail mission rows keep scoped compact wrapping guard without forced tiny typography');
check(csp.includes('.csp-live-row{') && csp.includes('font-size:.8rem') && !csp.includes('.csp-live-row{display:flex;align-items:center;justify-content:space-between;gap:4px;min-width:0;padding:2px 0;border-bottom:1px solid rgba(86,220,255,.08);font-size:.64rem'), 'global live-row base stays readable outside right rail (not forced tiny)');
check(csp.includes('.csp-live-row-val{') && csp.includes('font-size:.84rem') && !csp.includes('.csp-live-row-val{flex:1 1 auto;min-width:0;text-align:right;font-size:.66rem;font-weight:600;line-height:1.16;color:var(--color-text,#e6f0ff);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'), 'global live-row values are not globally forced to tiny nowrap+ellipsis');
check(csp.includes('.csp-mission-title{') && csp.includes('overflow:hidden') && csp.includes('text-overflow:ellipsis') && csp.includes('white-space:nowrap'), 'mission titles use one-line ellipsis to avoid oversized row height');
check(!csp.includes('#homepage-right-panel .csp-wtf-badge{padding:2px 8px;font-size:.58rem;line-height:1.1;letter-spacing:.06em;margin-bottom:5px}') && !csp.includes('#homepage-right-panel .csp-missed-badge{padding:2px 8px;font-size:.58rem;line-height:1.1;letter-spacing:.06em;margin-bottom:5px}'), 'homepage right-rail no longer applies tiny WTF/MISSED badge typography overrides');
const blocktopiaAccessBlock = functionBlock(csp, 'blocktopiaAccessHTML');
const blocktopiaAccessStateBlock = functionBlock(csp, 'resolveBlocktopiaAccessState');
check(blocktopiaAccessStateBlock.includes("return 'link_check_required'") && blocktopiaAccessStateBlock.includes("return 'server_check_pending'") && blocktopiaAccessStateBlock.includes("return 'unlocked'") && blocktopiaAccessStateBlock.includes("return 'locked'"), 'Block Topia access state helper distinguishes link pending, server pending, unlocked, and locked states');
check(blocktopiaAccessStateBlock.indexOf("return 'server_check_pending'") < blocktopiaAccessStateBlock.indexOf("return 'unlocked'"), 'local linked + XP alone cannot reach confirmed unlocked state before server checks');
check(blocktopiaAccessBlock.includes('Link check required') && blocktopiaAccessBlock.includes('Server check pending') && blocktopiaAccessBlock.includes('Unlocked</span>') && blocktopiaAccessBlock.includes('Locked ') && !blocktopiaAccessBlock.includes('Access unlocked') && !blocktopiaAccessBlock.includes('Arcade XP</span>'), 'Block Topia row uses compact honest copy (Link check required / Server check pending / Unlocked / Locked x/y)');
check(csp.includes("var progressionConfirmed = progression.confirmed === true;") && csp.includes('isServerLinkedConfirmed()') && csp.includes('resolveBlocktopiaAccessState(linked, arcadeXp, requiredXp, serverLinkedConfirmed, progressionConfirmed)'), 'server-confirmed linked + required XP path can render unlocked state');
check(csp.includes("var fallback = { requiredXp: FALLBACK_REQUIRED_XP, confirmed: false };") && csp.includes("return 'server_check_pending'"), 'missing progression confirmation renders pending/sync-needed state instead of confirmed unlock');
const fetchRequiredXpBlock = functionBlock(csp, 'fetchRequiredXp');
check(!fetchRequiredXpBlock.includes('_progressionCache = fallback'), 'fetchRequiredXp does not cache unconfirmed fallback — transient API failure stays retryable');
check(fetchRequiredXpBlock.includes('if (result.confirmed) _progressionCache = result'), 'fetchRequiredXp only caches server-confirmed progression so retry path is open after transient failures');
check(fetchRequiredXpBlock.includes('_progressionInflight = null') && !fetchRequiredXpBlock.includes('_progressionCache = fallback'), 'fetchRequiredXp clears in-flight after unconfirmed result so later successful response can update to confirmed state');
check(opsBlock.includes('csp-ops-label">Battle</span>') && opsBlock.includes("var actionLabel = 'Open';") && !opsBlock.includes('Battle Chamber') && !opsBlock.includes('Open Battle Chamber'), 'Battle Chamber row uses compact Battle/Open copy in the narrow right rail');
check(wtfSectionBlock.includes('Ready</a>') && wtfSectionBlock.includes('Play</a>') && wtfSectionBlock.includes('Open</a>') && !wtfSectionBlock.includes('Get Ready') && !wtfSectionBlock.includes('Play Arcade') && !wtfSectionBlock.includes('Open Arcade'), 'Daily WTF action labels are compact (Ready/Play/Open)');
check(missedSectionBlock.includes('csp-live-row-val csp-live-row-val--warn') && csp.includes('#homepage-right-panel .csp-live-row-val{') && csp.includes('white-space:nowrap'), 'Missed values use right-rail nowrap styling so numbers cannot stack vertically');
check(
  retroTheme.includes('body.page-home #main-wrapper,') &&
  retroTheme.includes('body.page-home #content {') &&
  !/\/\* Homepage mobile\/tablet content centering \+ overflow guard \*\/[\s\S]*?@media \(max-width: 900px\)\s*\{[\s\S]*?overflow-x:\s*(?:clip|hidden)\s*!important;/u.test(retroTheme),
  'retro theme uses structural homepage mobile centering constraints instead of overflow clipping guards'
);
check(retroTheme.includes('body.page-home .home-hero,') && retroTheme.includes('body.page-home .category-grid,') && retroTheme.includes('margin-left: auto !important;') && retroTheme.includes('margin-right: auto !important;'), 'homepage mobile content cards/grids keep centered full-width constraints');
// Fix checks: honest copy, no hard-coded faction name, badge not contradictory
check(!opsBlock.includes('GraffPUNKS'), 'Faction Daily Ops syncing copy does not hard-code GraffPUNKS faction name');
check(opsBlock.includes('shared.faction.label') && opsBlock.includes('daily ops syncing'), 'Faction Daily Ops syncing copy uses shared.faction.label for faction-aware pending message');
check(!wtfSectionBlock.includes("'Check In'") && !wtfSectionBlock.includes('"Check In"') && !wtfSectionBlock.includes('>Check In<'), 'Daily WTF Signal does not render fake Check In action (no real check-in handler wired)');
// Badge derives from wtfState directly (not statusText string comparison) — verified by checking state fields drive badge, not human-readable text
check(wtfSectionBlock.includes('wtf.status === \'error\'') && wtfSectionBlock.includes('wtf.active_event') && wtfSectionBlock.includes('wtf.next_event') && wtfSectionBlock.includes('wtf.completed_today') && wtfSectionBlock.includes('wtf.missed_today'), 'Daily WTF badge is derived directly from wtfState fields, not from human-readable statusText string');
const ownBattleBlock = functionBlock(csp, 'isOwnBattleActivity');
const latestActivityBlock = functionBlock(csp, 'latestActivityRows');
check(csp.includes('isOwnBattleActivity') && csp.includes('getTelegramId()') && csp.includes('activity.filter(isOwnBattleActivity)'), 'player feed filters Battle Chamber activity to the linked player when possible');
check(!ownBattleBlock.includes('getDisplayName()') && !ownBattleBlock.includes('display_name'), 'personal Battle Chamber matching does not rely on display name when Telegram identifiers are required');
check(!latestActivityBlock.includes("tag: 'Global'") && !latestActivityBlock.includes('global feed active'), 'global/unmatched Battle Chamber rows are not rendered inside Recent Personal Activity');
check((las.includes("Today\\'s Missions") || las.includes("Today's Missions")) && las.includes('Daily WTF Signal') && las.includes('Missed Opportunities'), 'faction panel owns missions/events/missed signals');
check(las.includes('las-ops-snapshot') && las.includes('Daily Ops') && las.includes('Completed') && las.includes('Missed XP'), 'faction daily ops panel surfaces compact live faction snapshot rows');
check(!las.includes('data-csp-xp') && !las.includes('data-csp-panel'), 'faction ops panel does not repeat the Arcade XP block');
check(!siteShell.includes('id="hud-player-name">Guest'), 'right rail no longer renders a duplicate Guest/Telegram name block');
check(!siteShell.includes('Live linked avatar'), 'HUD player-name logic does not replace the name with literal Live linked avatar');
check(las.includes('p.progress != null') && las.includes('p.target != null') && las.includes('p.complete === true'), 'mission normalization reads saved progress, target, and complete fields from bridge cache');
check(las.includes("return '<div class=\"las-empty\">' + esc(safeLabel) + ' daily ops syncing…</div>';"), 'missing mission payload renders faction syncing state instead of false empty state');
check(las.includes("return '<div class=\"las-empty\">' + esc(safeLabel) + ' daily ops unavailable right now. Try again shortly.</div>';"), 'missing mission payload error renders explicit unavailable state');
check(las.includes('esc(String(current))') && las.includes('esc(String(target))') && las.includes('las-mission-row') && las.includes('las-mission-meta') && las.includes('las-mission-sep'), 'mission renderer displays compact title + progress · reward rows');
check(las.includes('Number.isFinite(Number(m.current))') && las.includes('Number.isFinite(Number(m.target))') && !las.includes('las-mission-card') && !las.includes('las-mission-top') && !las.includes('las-mission-obj') && !las.includes('las-progress'), 'mission cards do not render large objective paragraphs or progress bars in right rail');
const viewDetailsCount = (las.match(/View details/g) || []).length;
check(viewDetailsCount === 1, 'faction ops panel keeps only one compact "View details" link');
check(csp.includes("'/roguelite/daily-state'") && csp.includes("'/player/state'"), 'single shared state authority fetches server-backed daily-state and player state');
check(!las.includes("postJson('/roguelite/daily-state')") && !las.includes("postJson('/player/state')"), 'live-activity-summary does not independently own right-rail daily/player fetch loops');
check(!functionBlock(csp, 'buildSharedRailState').includes('latestGlobalBattleRows()') && !functionBlock(csp, 'buildSharedRailState').includes('publicRows'), 'shared state does not compute unused publicRows/latestGlobalBattleRows when no visible section renders them');
check(las.includes('missedHTML(panelState && panelState.dailyState ? panelState.dailyState : null)'), 'missed XP rendering prefers server-backed daily-state payload');
check(csp.includes('scheduleLiveDataRefresh') && csp.includes('_liveDataRefreshTimer') && csp.includes('setTimeout(function ()'), 'connection status panel debounces live-data refreshes');
check(csp.includes("if (detail && detail.source === 'load') return;"), 'connection status panel ignores load-sourced moonboys:faction-status refresh recursion');
check(csp.includes('maybeRefreshFactionStatus') && csp.includes('FACTION_STATUS_LOAD_THROTTLE_MS') && csp.includes('_factionStatusInflight'), 'connection status panel throttles/inflight-guards faction status loads to avoid repeated /faction/status calls');
for (const evt of ['battle-chamber:faction-data-ready','battle-chamber:activity-ready','moonboys:wtf-events-ready','moonboys:wtf-event-checkin','moonboys:wtf-event-complete','moonboys:roguelite-options-unlocked','moonboys:faction-status','moonboys:faction-boost']) {
  check(csp.includes(evt), `connection status panel listens for ${evt}`);
}
check(csp.includes('moonboys:sync-state') && csp.includes('moonboys:score-updated'), 'connection status panel refreshes on relink/reset and accepted-run sync events');
check(las.includes("window.addEventListener('moonboys:sync-state', invalidateAndRefresh);") && las.includes("window.addEventListener('moonboys:score-updated', invalidateAndRefresh);"), 'faction daily ops panel refreshes on relink/reset and accepted-run sync events');
check(bridge.includes("'moonboys:sync-state'") && bridge.includes("'moonboys:score-updated'") && bridge.includes('scheduleServerAuthorityRefresh'), 'battle chamber bridge refreshes server authority after sync and score events');
check(csp.includes('RIGHT_RAIL_SECTION_SELECTORS') && csp.includes('mountAllSections'), 'shared renderer remounts all right-rail sections through one section selector set');
check(csp.includes("window.addEventListener('moonboys:wtf-countdown-tick', updateWtfCountdownUI);"), 'countdown tick is handled by a dedicated WTF timer updater');
const cspCountdownTickBlock = functionBlock(csp, 'updateWtfCountdownUI');
check(cspCountdownTickBlock.includes("document.querySelectorAll('[data-csp-wtf-countdown]')") && !cspCountdownTickBlock.includes('mountAllSections('), 'WTF countdown tick patches only timer nodes without remounting whole right rail');

console.log('\n[4b] Identity/faction hierarchy — no duplication');
const renderHudLivePillBlock = functionBlock(siteShell, 'renderHudLivePill');
const clearHudLivePillBlock = functionBlock(siteShell, 'clearHudLivePill');
const resolveHudSignedTelegramAuthBlock = functionBlock(siteShell, 'resolveHudSignedTelegramAuth');
const bindHudIdentityRefreshBlock = functionBlock(siteShell, 'bindHudIdentityRefresh');
// username appears once — only in the shell portrait row, not inside the Player Live Feed renderer
check(!liveFeedBlock.includes('csp-avatar-mini') && !liveFeedBlock.includes('csp-live-identity'), 'player live feed renderer does not include duplicate avatar/name identity block');
check(!liveFeedBlock.includes('>Faction<') && !liveFeedBlock.includes('"Faction"') && !liveFeedBlock.includes("'Faction'"), 'player live feed renderer does not include Faction row (faction belongs to Faction Daily Ops only)');
check(!liveFeedBlock.includes('>Telegram<'), 'player live feed renderer does not include Telegram LIVE LINKED row');
check(!liveFeedBlock.includes('csp-player-link') || liveFeedBlock.indexOf('csp-player-link') === liveFeedBlock.lastIndexOf('csp-player-link'), 'player live feed renderer does not embed username link (identity handled by shell)');
// Faction Daily Ops owns the faction row
check(opsBlock.includes('csp-ops-row') && opsBlock.includes('>Faction<'), 'Faction Daily Ops renderer includes Faction row as the single faction authority');
// LIVE LINKED / RELINK shown once — in the shell portrait row, not inside the inner renderer
check(!functionBlock(csp, 'buildPlayerLiveFeedHTML').includes('LIVE LINKED'), 'player live feed renderer does not output LIVE LINKED pill (shell portrait row is the single authority)');
check(siteShell.includes('hud-live-pill') && siteShell.includes('LIVE LINKED'), 'shell portrait row renders LIVE LINKED pill once for the identity area');
check(siteShell.includes('hud-live-pill--relink') && siteShell.includes('RELINK'), 'shell portrait row renders RELINK pill once when signed auth is expired');
check(siteShell.includes('hud-live-pill--pending') && siteShell.includes('SYNC PENDING'), 'site-shell exposes SYNC PENDING pill with a dedicated pending class when auth is fresh but API writes are not configured');
check(resolveHudSignedTelegramAuthBlock.includes('gate.restoreLinkedTelegramAuth()') && renderHudLivePillBlock.includes('resolveHudSignedTelegramAuth(gate)'), 'shell attempts restoreLinkedTelegramAuth before rendering RELINK');
check(clearHudLivePillBlock.includes("querySelector('.hud-live-pill')") && renderHudLivePillBlock.includes('clearHudLivePill(nameEl);'), 'shell replaces existing .hud-live-pill instead of appending duplicates');
check(bindHudIdentityRefreshBlock.includes("window.addEventListener('moonboys:sync-state', scheduleHudIdentityRefresh);"), 'shell portrait pill refreshes on moonboys:sync-state');
check(bindHudIdentityRefreshBlock.includes("window.addEventListener('moonboys:faction-status', scheduleHudIdentityRefresh);"), 'shell portrait pill refreshes on moonboys:faction-status');
check(bindHudIdentityRefreshBlock.includes("window.addEventListener('storage'") && bindHudIdentityRefreshBlock.includes('moonboys_tg_') && bindHudIdentityRefreshBlock.includes('MOONBOYS_TELEGRAM_AUTH'), 'shell portrait pill refreshes on Telegram auth/link storage changes');
// Profile image in shell only
check(!functionBlock(csp, 'buildPlayerLiveFeedHTML').includes('csp-avatar-mini'), 'player live feed renderer does not render a duplicate avatar');
check(siteShell.includes('getTelegramPhotoUrl') && siteShell.includes('hud-player-avatar'), 'shell portrait area is the single authority for player profile image');
check(siteShell.includes('hud-avatar-icon'), 'shell portrait area preserves fallback pixel avatar when no Telegram photo is available');
// Multi-section right rail structure intact
check(siteShell.includes('data-csp-panel') && siteShell.includes('data-csp-faction-ops') && siteShell.includes('data-csp-wtf-signal') && siteShell.includes('data-csp-missed'), 'multi-section right rail remains intact with all four section hooks');
// One shared state authority
check(csp.includes('buildSharedRailState') && csp.includes('RIGHT_RAIL_SECTION_SELECTORS'), 'one shared state authority drives all right-rail section renders');

console.log('\n[4c] Visual composition — compact/passive inner renderers');
// Inner linked renderers no longer output nested .csp-panel wrappers
check(!opsBlock.includes('class="csp-panel') && !wtfSectionBlock.includes('class="csp-panel') && !missedSectionBlock.includes('class="csp-panel'), 'lower section renderers (ops/wtf/missed) do not use nested csp-panel card wrappers');
// Player Live Feed linked state uses compact rows in right-rail context but keeps framing for standalone mounts
check(liveFeedBlock.includes('var inRightRail') && liveFeedBlock.includes('if (inRightRail) return linkedRows;') && liveFeedBlock.includes('<div class="csp-panel csp-panel--live-feed"'), 'player live feed linked renderer branches by mount context: right rail frame-free, standalone framed');
check(liveFeedBlock.includes('csp-panel csp-panel--live-feed') && liveFeedBlock.includes('data-csp-bt-access') && liveFeedBlock.includes('csp-live-row-val'), 'standalone connection panel markup remains readable with Block Topia status row');
const buildSectionBlock = functionBlock(csp, 'buildSectionHTML');
check(csp.includes('function isRightRailMount') && buildSectionBlock.includes('buildPlayerLiveFeedHTML(shared, { inRightRail: isRightRailMount(contextEl) })'), 'buildSectionHTML passes mount context so right-rail data-csp-panel renders frame-free while standalone stays framed');
// Faction Daily Ops uses compact ops rows and mission list, not six-box grid
check(opsBlock.includes('csp-section-rows') && opsBlock.includes('csp-ops-row') && !opsBlock.includes('csp-grid'), 'Faction Daily Ops linked state uses csp-section-rows/csp-ops-row, not six-box csp-grid layout');
// WTF Signal uses csp-signal-card with badge/event/timer/action
check(wtfSectionBlock.includes('csp-signal-card') && wtfSectionBlock.includes('csp-wtf-badge') && wtfSectionBlock.includes('data-csp-wtf-countdown'), 'Daily WTF Signal linked state uses csp-signal-card module with badge and countdown data hook');
// Missed Opportunities uses csp-warning-card with MISSED badge and warning stats
check(missedSectionBlock.includes('csp-warning-card') && missedSectionBlock.includes('csp-missed-badge') && missedSectionBlock.includes('MISSED'), 'Missed Opportunities linked state uses csp-warning-card module with MISSED badge and warning stats');
// Lower unlinked/relink sections do not each render repeated big CTA buttons
check(!opsBlock.includes('csp-live-cta') && !wtfSectionBlock.includes('csp-live-cta') && !missedSectionBlock.includes('csp-live-cta'), 'lower sections (ops/wtf/missed) do not render repeated big Link/RELINK CTA buttons');
// Player Live Feed keeps the main Link/RELINK CTA
check(liveFeedBlock.includes('csp-live-cta') && liveFeedBlock.includes('Link Telegram') && liveFeedBlock.includes('RELINK Telegram'), 'Player Live Feed retains the main Link Telegram / RELINK CTA for unlinked/relink states');
// Standalone pages still mount data-csp-panel outside the right-rail shell
check(incubator.includes('data-csp-panel') && !incubator.includes('homepage-right-panel'), 'gkniftyheads-incubator standalone data-csp-panel mount remains outside homepage-right-panel shell');
check(blockTopiaPage.includes('data-csp-panel') && !blockTopiaPage.includes('homepage-right-panel'), 'games/block-topia standalone data-csp-panel mount remains outside homepage-right-panel shell');
// Top comment reflects new architecture
check(!csp.includes('data-csp-panel) is the single right-rail live source'), 'top comment no longer claims data-csp-panel is the only right-rail source');
check(csp.includes('Standalon') && csp.includes('framed `.csp-panel` wrapper'), 'top comment documents standalone data-csp-panel framed exception');
check(!csp.includes('csp-live-identity') && !csp.includes('.csp-avatar-mini{display:none}'), 'connection-status-panel removes misleading csp-live-identity/csp-avatar-mini drift');

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
// dashboard.html must remain wiki/editorial only, both in static HTML and runtime shell injection.
const dashboard = read('dashboard.html');
const shouldShowRightPanelBlock = functionBlock(siteShell, 'shouldShowRightPanel');
const rightPanelAllowlist = stringArrayValues(shouldShowRightPanelBlock, 'exact');
check(!dashboard.includes('missed_xp') && !dashboard.includes('missed_xp_all_time'), 'dashboard.html does not contain missed XP player data (wiki/editorial only)');
check(!dashboard.includes('data-las-panel') && !dashboard.includes('data-csp-panel'), 'dashboard.html does not contain live player feed panel hooks');
check(!dashboard.includes('page-has-right-panel'), 'dashboard.html does not opt into the runtime right rail');
check(!rightPanelAllowlist.includes('/dashboard.html'), 'site-shell.js right-panel allowlist excludes /dashboard.html');
check(shouldShowRightPanelBlock.includes("if (p === '/dashboard.html') return false;"), 'site-shell.js explicitly prevents dashboard runtime right-rail injection even if body classes drift');
check(shouldShowRightPanelBlock.includes("if (body.classList.contains('page-no-right-panel')) return false;"), 'site-shell.js supports page-no-right-panel as a force-disable before opt-in classes');
check(shouldShowRightPanelBlock.includes("if (body.classList.contains('page-has-right-panel')) return true;"), 'site-shell.js keeps page-has-right-panel as explicit opt-in');
for (const [route, html] of [
  ['/index.html', indexHtml],
  ['/search.html', searchHtml],
  ['/timeline.html', timelineHtml],
  ['/graph.html', graphHtml],
  ['/sam.html', samHtml],
  ['/about.html', aboutHtml],
  ['/how-to-play.html', howToPlayHtml],
  ['/gkniftyheads-incubator.html', incubatorHtml],
]) {
  check(!rightPanelAllowlist.includes(route), `site-shell.js right-panel allowlist excludes ${route}`);
  check(!html.includes('page-has-right-panel'), `${route} does not force page-has-right-panel`);
  check(html.includes('page-standard-shell'), `${route} uses page-standard-shell`);
}
check(!rightPanelAllowlist.includes('/wiki/') && !shouldShowRightPanelBlock.includes("'/wiki/'"), 'site-shell.js does not auto-enable right rail for /wiki/ prefix');
check(!rightPanelAllowlist.includes('/categories/') && !shouldShowRightPanelBlock.includes("'/categories/'"), 'site-shell.js does not auto-enable right rail for /categories/ prefix');
check(rightPanelAllowlist.includes('/community.html') && community.includes('page-has-right-panel'), 'community.html still opts into the Battle Chamber/right-rail live system');
check(rightPanelAllowlist.includes('/games/index.html') && games.includes('page-has-right-panel'), 'games/index.html still opts into the live/action right rail');
check(!nftTemplateExample.includes('page-has-right-panel'), 'NFT template example does not force page-has-right-panel');
check(nftTemplateExample.includes('page-standard-shell'), 'NFT template example uses page-standard-shell');
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
const missedXpBlock = functionBlock(csp, 'missedXpAllTime');
check(missedXpBlock.includes('return null;'), 'missedXpAllTime returns null when no confirmed data is available');
check(csp.includes('syncing…'), 'connection-status-panel shows "syncing…" for unconfirmed Missed XP');
check(!/return\s+0\s*;/.test(missedXpBlock), 'missedXpAllTime must not default to hard 0 when globals are absent');

// Issue 4: Daily WTF fallback is labelled syncing/fallback
check(las.includes('Syncing schedule'), 'Daily WTF fallback card is labelled "Syncing schedule" not presented as confirmed live');
check(las.includes('Fallback schedule'), 'Daily WTF fallback card includes a "Fallback schedule" label for the local estimate');

// Issue 5: LIVE SYNC badge requires fresh signed auth
check(csp.includes('RELINK'), 'connection-status-panel has a RELINK badge state for linked-but-expired-auth');
check(csp.includes('getSignedTelegramAuth'), 'connection-status-panel checks getSignedTelegramAuth before showing LIVE SYNC');
check(csp.includes('csp-badge--relink'), 'RELINK badge has its own CSS class');
check(csp.includes('Auth expired'), 'RELINK badge copy includes "Auth expired" to explain the state');
const buildBadgeBlock = functionBlock(csp, 'buildBadgeHTML');
check(buildBadgeBlock.includes('restoreLinkedTelegramAuth'), 'buildBadgeHTML attempts restoreLinkedTelegramAuth before rendering RELINK badge');
check(buildBadgeBlock.includes('csp-badge--pending') && buildBadgeBlock.includes('SYNC PENDING'), 'buildBadgeHTML uses a dedicated pending badge class when API writes are unavailable');
check(csp.includes('Signed Telegram auth expired — relink required.') && csp.includes('RELINK Telegram'), 'player live feed shows explicit relink state + CTA when signed auth is unavailable');
check(csp.includes('Sync pending') && csp.includes('Local cached only') && csp.includes('getSyncPendingLabel(shared.apiInfo)'), 'connection-status-panel labels local/dev no-config state as sync pending/local cached only');
check(functionBlock(csp, 'buildSharedRailState').includes('getSignedTelegramAuthWithRestore'), 'shared rail state checks signed/restorable auth before activating live mode');
check(csp.includes('Endpoint disabled') && csp.includes('API endpoint disabled for this context') && csp.includes('Sync pending — ') && csp.includes('getApiSummary'), 'connection-status-panel keeps disabled endpoint copy distinct from config-required/server-unavailable states');

// Issue 6: Hydration is authoritative for cached state but cannot roll back live in-session XP
check(moonboysState.includes('_liveXpRevision'), 'moonboys-state.js has a _liveXpRevision race guard to protect live in-session XP from hydration rollback');
check(moonboysState.includes('hydrateXpRevision'), 'moonboys-state.js captures hydrateXpRevision before fetch to detect live xp:updates during hydration');
check(moonboysState.includes('_liveXpRevision === hydrateXpRevision'), 'moonboys-state.js applies server XP unconditionally only when no live xp:update arrived during fetch');
check(moonboysState.includes('Server is authoritative during hydration'), 'moonboys-state.js documents that server XP is authoritative on hydration');

// Issue 7: global-player-header.js must not auto-create [data-las-panel] unless opted in
check(globalHeader.includes("data-auto-las-panel"), 'global-player-header.js gates autoMountActivityPanel behind data-auto-las-panel opt-in');
check(globalHeader.includes("document.body.dataset.autoLasPanel !== 'true'"), 'global-player-header.js skips auto-mount unless body data attribute is set');
check(!globalHeader.includes("setTimeout(autoMountActivityPanel") || globalHeader.includes("data-auto-las-panel"), 'autoMountActivityPanel is either removed or properly gated from bootstrap');

// Issue 8: Home widgets do not label disabled feeds as live
const initLiveFeedBlock = functionBlock(homeWidgets, 'initLiveFeed');
const initLeaderboardBlock = functionBlock(homeWidgets, 'initLeaderboard');
const initActivityPanelBlock = functionBlock(homeWidgets, 'initActivityPanel');
const initCommentsTeaserBlock = functionBlock(homeWidgets, 'initCommentsTeaser');
check(initLiveFeedBlock.includes('Activity feed not live yet.'), 'disabled homepage live feed renders honest not-live-yet copy');
check(initLeaderboardBlock.includes('Engagement leaderboard not yet available.'), 'disabled homepage leaderboard renders honest not-yet-available copy');
check(initActivityPanelBlock.includes('activity heat not live yet'), 'disabled homepage activity panel renders honest not-live-yet copy');
check(initCommentsTeaserBlock.includes('Community comments are not yet available here.'), 'disabled homepage comments teaser renders honest not-yet-available copy');
check(!initLiveFeedBlock.includes('Recent activity is generated from synced arcade'), 'disabled homepage live feed does not use misleading "is generated" copy');
check(!initLiveFeedBlock.includes('Live feed'), 'disabled homepage live feed does not label a disabled endpoint as "Live feed"');

// Issue 9: Telegram community does not use "Active" for non-presence state
check(!telegramCommunity.includes('>✅ Active<'), 'telegram-community.js does not use "Active" for profile-found/faction-linked state');
check(telegramCommunity.includes('>✅ Linked<'), 'telegram-community.js uses "Linked" instead of "Active" for profile card badge');

// Issue 10: leaderboard fetch errors are distinguishable from empty leaderboard
const fetchLeaderboardBlock = functionBlock(leaderboardClient, 'fetchLeaderboard');
const arcadeLeaderboard = read('js/arcade-leaderboard.js');
const loadLeaderboardBlock = functionBlock(arcadeLeaderboard, 'loadLeaderboard');
const setEmptyStateBlock = functionBlock(arcadeLeaderboard, 'setEmptyState');
check(fetchLeaderboardBlock.includes('error: true') && fetchLeaderboardBlock.includes('entries: null'), 'fetchLeaderboard returns structured error object on fetch failure');
check(!fetchLeaderboardBlock.includes('return [];'), 'fetchLeaderboard does not return empty [] on catch (ambiguous with real empty leaderboard)');
check(loadLeaderboardBlock.includes('data.error === true') && loadLeaderboardBlock.includes('Leaderboard unavailable'), 'arcade leaderboard treats structured fetch errors as unavailable, not empty');
check(setEmptyStateBlock.includes('No scores recorded yet'), 'arcade leaderboard preserves normal empty-state copy for real empty arrays');

// dashboard.html wiki/editorial checks are covered in the targeted dashboard block above.

// Issue 11: connection-status-panel top Latest row must not show broken daily-state copy
check(!csp.includes('Daily opportunity state synced'), 'connection-status-panel does not contain "Daily opportunity state synced"');
const latestActivityRowsBlock = functionBlock(csp, 'latestActivityRows');
check(!latestActivityRowsBlock.includes('Daily opportunity'), 'latestActivityRows does not generate generic "Daily opportunity" text');
check(!latestActivityRowsBlock.includes('MOONBOYS_ROGUELITE_DAILY_STATE') && !latestActivityRowsBlock.includes('MOONBOYS_DAILY_ROGUELITE_LOTTERY'), 'latestActivityRows does not read daily-state globals (daily logic belongs in dedicated status rows)');

console.log('\n[12] Confirmed Missed XP fetch — non-blocking and cache-safe');
const buildPanelHTMLBlock = functionBlock(csp, 'buildFactionDailyOpsHTML');
const buildSharedRailStateBlock = functionBlock(csp, 'buildSharedRailState');
const fetchDailyStateBlock = functionBlock(csp, 'fetchDailyStateWithAuth');
const fetchPlayerStateBlock = functionBlock(csp, 'fetchPlayerStateWithAuth');
const invalidateDailyStateCacheBlock = functionBlock(csp, 'invalidateDailyStateCache');
const invalidatePlayerStateCacheBlock = functionBlock(csp, 'invalidatePlayerStateCache');
const scheduleRefreshBlock = functionBlock(csp, 'scheduleLiveDataRefresh');
const schedulePanelRemountBlock = functionBlock(csp, 'schedulePanelRemount');
const contributionBlock = functionBlock(csp, 'getContribution');
const invalidateAndRefreshBlock = functionBlock(csp, 'invalidateAndRefresh');
const invalidateSharedRailStateBlock = functionBlock(csp, 'invalidateSharedRailState');
// buildPanelHTML must not unconditionally await the fetch before checking globals
check(!buildPanelHTMLBlock.includes('await fetchDailyStateWithAuth()'), 'buildPanelHTML does not block-await daily-state fetch before rendering');
check(buildSharedRailStateBlock.includes('fetchDailyStateWithAuth().then'), 'shared right-rail state fires daily-state fetch in background when Missed XP is unconfirmed');
check(!buildPanelHTMLBlock.includes("document.querySelectorAll('.csp-item-val[data-csp-missed-xp]')"), 'buildPanelHTML does not directly patch Missed XP DOM nodes from daily-state fetch callback');
check(buildSharedRailStateBlock.includes('schedulePanelRemount()'), 'confirmed daily-state fetch triggers panel remount path');
check(csp.includes('var _dailyStateGeneration = 0;'), 'connection-status-panel defines _dailyStateGeneration');
check(csp.includes('var _sharedRailStateGeneration = 0;') && csp.includes('var _sharedRailStateInflightGeneration = -1;'), 'connection-status-panel tracks shared-state generation and inflight generation');
check(invalidateDailyStateCacheBlock.includes('_dailyStateGeneration++'), 'invalidateDailyStateCache increments _dailyStateGeneration');
// fetchDailyStateWithAuth must target the correct Worker route
check(fetchDailyStateBlock.includes("'/roguelite/daily-state'"), 'fetchDailyStateWithAuth targets /roguelite/daily-state Worker route');
check(fetchDailyStateBlock.includes('var requestGeneration = _dailyStateGeneration;'), 'fetchDailyStateWithAuth captures requestGeneration');
check(fetchDailyStateBlock.includes('requestGeneration === _dailyStateGeneration') && fetchDailyStateBlock.includes('_dailyStateCache = payload;'), 'fetchDailyStateWithAuth guards _dailyStateCache assignment by generation match');
// daily-state cache must be invalidated when live-data refresh events fire
check(csp.includes('function invalidateDailyStateCache'), 'connection-status-panel has invalidateDailyStateCache helper');
check(scheduleRefreshBlock.includes('invalidateDailyStateCache()'), 'scheduleLiveDataRefresh calls invalidateDailyStateCache before remounting panels');
check(scheduleRefreshBlock.includes('invalidateSharedRailState();') && scheduleRefreshBlock.includes('mountAllSections();'), 'scheduleLiveDataRefresh clears shared cache+inflight before remounting all sections');
check(invalidateAndRefreshBlock.includes('invalidateSharedRailState();') && invalidateAndRefreshBlock.includes('mountAllSections();'), 'invalidateAndRefresh clears shared cache+inflight before remounting all sections');
check(schedulePanelRemountBlock.includes('mountAllSections()') && !schedulePanelRemountBlock.includes('invalidateDailyStateCache()'), 'schedulePanelRemount remounts panels without invalidating daily-state cache');
check(schedulePanelRemountBlock.includes('invalidateSharedRailState();'), 'schedulePanelRemount clears shared cache+inflight before remounting sections');
check(invalidateSharedRailStateBlock.includes('_sharedRailStateCache = null;') && invalidateSharedRailStateBlock.includes('_sharedRailStateInflight = null;') && invalidateSharedRailStateBlock.includes('_sharedRailStateGeneration++;'), 'shared-state invalidation clears cache/inflight and bumps generation');
check(buildSharedRailStateBlock.includes('_sharedRailStateInflightGeneration === _sharedRailStateGeneration') && buildSharedRailStateBlock.includes('if (generation === _sharedRailStateGeneration)'), 'shared-state in-flight reuse/cache write are generation-guarded against stale promises');
// _dailyStateInflight must be cleared in exactly one finally path
const inflightNullCount = (fetchDailyStateBlock.match(/_dailyStateInflight\s*=\s*null/g) || []).length;
check(inflightNullCount === 1, 'fetchDailyStateWithAuth clears _dailyStateInflight in exactly one path');
check(fetchDailyStateBlock.includes('} finally {') && fetchDailyStateBlock.includes('_dailyStateInflight = null'), 'fetchDailyStateWithAuth clears _dailyStateInflight inside a finally block');
check(buildSharedRailStateBlock.includes('var patchGeneration = _dailyStateGeneration;') && buildSharedRailStateBlock.includes('if (patchGeneration !== _dailyStateGeneration) return;'), 'shared right-rail state guards Missed XP background patch by generation match');
// Missed XP still must not default to hard 0 after fetch refactor
check(!/return\s+0\s*;/.test(functionBlock(csp, 'missedXpAllTime')), 'missedXpAllTime still does not default to hard 0 after background-fetch refactor');
const dailyCountsBlock = functionBlock(csp, 'getDailyCounts');
check(dailyCountsBlock.includes('today_active') && dailyCountsBlock.includes('mission_opportunities') && dailyCountsBlock.includes('row.completed'), 'connection-status completed count derives from today_active.mission_opportunities[].completed');
check(buildPanelHTMLBlock.includes("var completedDisplay = shared.dailyCounts && shared.dailyCounts.completed != null ? String(shared.dailyCounts.completed) : 'syncing…'") && buildPanelHTMLBlock.includes("var missedTodayDisplay = shared.dailyCounts && shared.dailyCounts.missed != null ? String(shared.dailyCounts.missed) : 'syncing…'"), 'connection-status shows syncing for missing completed/missed daily counts instead of fake 0');
check(contributionBlock.includes('Object.prototype.hasOwnProperty.call(contributions, factionKey)') && contributionBlock.includes("return { value: '0', pending: false };"), 'confirmed player-state with missing faction contribution key renders 0 (not syncing)');
check(contributionBlock.includes('if (!player) return { value: \'syncing…\', pending: true };'), 'contribution is pending only when player-state is unavailable');
check(buildSharedRailStateBlock.includes('if (contribution.pending)') && buildSharedRailStateBlock.includes('fetchPlayerStateWithAuth().then') && buildSharedRailStateBlock.includes('if (confirmedState)') && buildSharedRailStateBlock.includes('schedulePanelRemount();'), 'player-state remount path only schedules when contribution is actually pending');
check(fetchPlayerStateBlock.includes('var requestGeneration = _playerStateGeneration;') && fetchPlayerStateBlock.includes('requestGeneration === _playerStateGeneration') && fetchPlayerStateBlock.includes('_playerStateCache = payload;'), 'fetchPlayerStateWithAuth guards cache assignment with player-state generation');
check(invalidatePlayerStateCacheBlock.includes('_playerStateGeneration++'), 'invalidatePlayerStateCache increments _playerStateGeneration');
check(invalidateAndRefreshBlock.includes('_playerStateGeneration++;'), 'invalidateAndRefresh increments _playerStateGeneration on identity refresh/relink');
check(scheduleRefreshBlock.includes('invalidatePlayerStateCache()'), 'scheduleLiveDataRefresh invalidates player-state generation before remount');

console.log('\n[13] Dead-code drift prevention');
// connection-status-panel: removed faction helpers must not return
check(!hasFunctionDeclaration(csp, 'getFactionApi'), 'connection-status-panel does not define getFactionApi helper');
check(!hasFunctionDeclaration(csp, 'getFactionStatus'), 'connection-status-panel does not define getFactionStatus helper');
check(!hasFunctionDeclaration(csp, 'factionLabel'), 'connection-status-panel does not define factionLabel helper');
check(!hasFunctionDeclaration(csp, 'normaliseFactionKey'), 'connection-status-panel does not define normaliseFactionKey helper');
// The subscriber must not patch legacy [data-csp-faction] fields (distinct from section hook data-csp-faction-ops)
check(!csp.includes('data-csp-faction]') && !csp.includes('querySelectorAll(\'[data-csp-faction]\')'), 'connection-status-panel subscriber does not patch legacy [data-csp-faction] elements');
// Header badge must not include faction or unaligned rendered text (use specific rendered patterns)
const buildBadgeHTMLBlock = functionBlock(csp, 'buildBadgeHTML');
check(!buildBadgeHTMLBlock.includes('data-csp-faction') && !buildBadgeHTMLBlock.includes('No faction selected yet') && !buildBadgeHTMLBlock.includes('factionLabel'), 'buildBadgeHTML does not render faction data or call factionLabel in the header badge');

console.log('\n[14] Server-authoritative faction sync guards');
check(factionAlignment.includes('getFreshTelegramAuth') || factionAlignment.includes('getSignedTelegramAuthWithRestore'), 'faction alignment uses shared fresh signed-auth path before faction status fetch');
check(factionAlignment.includes('cachedTelegramId') && factionAlignment.includes('identityTelegramId') && factionAlignment.includes('cachedTelegramId !== identityTelegramId'), 'cached faction state is ignored when Telegram identity changes');
check(factionAlignment.includes('clearCachedStatus'), 'faction alignment exposes cache-clear helper for relink/reset flows');
check(las.includes('resolveFactionStatus(linked)') && las.includes('factionApi.loadStatus'), 'faction daily ops resolves faction through server-backed faction status before rendering');
check(factionAlignment.includes('var cooldownMs = Math.max(0, Number(data && data.cooldown_ms) || 0);'), 'joinFaction reads server cooldown_ms as an explicit duration value');
check(factionAlignment.includes('cooldown_ms: cooldownMs') && factionAlignment.includes('cooldown_ms_remaining: 0'), 'joinFaction separates cooldown duration metadata from current remaining cooldown state');
check(factionAlignment.includes('season_key: data.season_key || (priorStatus && priorStatus.season_key) || null'), 'earnFactionXp preserves season_key when endpoint omits it');

console.log('\n[15] Right-rail recursion + non-blocking guards');
const lasBuildHTMLBlock = functionBlock(las, 'buildHTML');
check(!lasBuildHTMLBlock.includes('await fetchPanelServerState') && !lasBuildHTMLBlock.includes('await resolveFactionStatus') && lasBuildHTMLBlock.includes('scheduleBackgroundRefresh(linked);'), 'live-activity-summary renders immediately from cached/syncing state and fetches server state in background');
check(lasBuildHTMLBlock.includes('var panelState = getPanelState(linked);'), 'live-activity-summary first paint uses cached/syncing panel state before async fetch resolves');
check(las.includes("detail && detail.source === 'load'") && las.includes('shouldRefreshForLoadFactionEvent'), 'live-activity-summary filters load-sourced faction-status events to prevent recursive refresh');
check(las.includes("payload && payload.source === 'load'") && las.includes('factionRefreshSuppressedUntil'), 'live-activity-summary filters load-sourced faction:update bus events with suppression/transition guard');
check(las.includes('today_active') && las.includes('mission_opportunities') && las.includes('row.completed') && las.includes("var completedDisplay = completedToday == null ? 'syncing…'"), 'live-activity-summary derives completed count from mission_opportunities and shows syncing when unknown');
check(bridge.includes('UNALIGNED_LOAD_TTL_MS') && bridge.includes('_lastUnalignedLoadCheckAt') && bridge.includes("detail.source === 'load' && (!detail.faction || detail.faction === 'unaligned')"), 'battle chamber bridge applies unaligned TTL and ignores load-sourced unaligned faction status to prevent polling loops');

// live-activity-summary: removed sync/faction/log helpers must not return
check(!hasFunctionDeclaration(las, 'syncSummary'), 'live-activity-summary does not define syncSummary helper');
check(!hasFunctionDeclaration(las, 'updateSyncUI'), 'live-activity-summary does not define updateSyncUI helper');
check(!hasFunctionDeclaration(las, 'updateFactionUI'), 'live-activity-summary does not define updateFactionUI helper');
check(!hasFunctionDeclaration(las, 'factionSummary'), 'live-activity-summary does not define factionSummary helper');
check(!hasFunctionDeclaration(las, 'buildLogHTML'), 'live-activity-summary does not define buildLogHTML helper');
// Compact ops panel must not render Core API / Sync rows
check(!las.includes('data-las-sync'), 'live-activity-summary does not render [data-las-sync] rows in compact ops');
check(!las.includes('data-las-faction'), 'live-activity-summary does not render [data-las-faction] rows in compact ops');

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error(`\n${failed.length} right-rail live panel checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} right-rail live panel checks passed.`);
