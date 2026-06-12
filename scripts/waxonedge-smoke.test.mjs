/**
 * waxonedge-smoke.test.mjs
 *
 * Structural smoke tests for the WAXONEDGE read-only bubble analytics dashboard.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel) {
  return existsSync(path.join(ROOT, rel));
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

let passed = 0;
let failed = 0;

function ok(label, condition, detail) {
  if (condition) {
    console.log('PASS: ' + label);
    passed += 1;
  } else {
    console.error('FAIL: ' + label + (detail ? ' - ' + detail : ''));
    failed += 1;
  }
}

ok('waxonedge.html exists', exists('waxonedge.html'));
ok('waxonedge/index.html clean-route alias exists', exists('waxonedge/index.html'));
ok('analytics/token/index.html token analytics route exists', exists('analytics/token/index.html'));
ok('css/waxonedge.css exists', exists('css/waxonedge.css'));
ok('css/waxonedge-bubbles-v2.css exists', exists('css/waxonedge-bubbles-v2.css'));
ok('js/waxonedge.js exists', exists('js/waxonedge.js'));
ok('js/waxonedge-sources.js exists', exists('js/waxonedge-sources.js'));
ok('js/waxonedge-bubbles-v2.js exists', exists('js/waxonedge-bubbles-v2.js'));

const html = exists('waxonedge.html') ? read('waxonedge.html') : '';
const tokenHtml = exists('analytics/token/index.html') ? read('analytics/token/index.html') : '';
const aliasHtml = exists('waxonedge/index.html') ? read('waxonedge/index.html') : '';
const css = exists('css/waxonedge.css') ? read('css/waxonedge.css') : '';
const v2Css = exists('css/waxonedge-bubbles-v2.css') ? read('css/waxonedge-bubbles-v2.css') : '';
const js = exists('js/waxonedge.js') ? read('js/waxonedge.js') : '';
const sourcesJs = exists('js/waxonedge-sources.js') ? read('js/waxonedge-sources.js') : '';
const v2Js = exists('js/waxonedge-bubbles-v2.js') ? read('js/waxonedge-bubbles-v2.js') : '';

ok('waxonedge.html references /css/waxonedge.css', html.includes('/css/waxonedge.css'));
ok('waxonedge.html references /css/waxonedge-bubbles-v2.css', html.includes('/css/waxonedge-bubbles-v2.css'));
ok('waxonedge.html references /js/waxonedge.js', html.includes('/js/waxonedge.js'));
ok('waxonedge.html references /js/waxonedge-sources.js', html.includes('/js/waxonedge-sources.js'));
ok('waxonedge.html references /js/waxonedge-bubbles-v2.js', html.includes('/js/waxonedge-bubbles-v2.js'));
ok('waxonedge clean-route alias redirects to /waxonedge.html', aliasHtml.includes('url=/waxonedge.html'));
ok('waxonedge clean-route alias preserves query-string routing', aliasHtml.includes("window.location.search || ''"));
ok('waxonedge clean-route alias preserves hash routing', aliasHtml.includes("window.location.hash || ''"));

ok('waxonedge.html includes terminal top bar', html.includes('woe-og-bar'));
ok('waxonedge.html removes visible scanner chrome buttons',
  !html.includes('woe-og-nav') &&
  !html.includes('woe-og-actions') &&
  !html.includes('woe-readonly-badge') &&
  !html.includes('Read-Only') &&
  !html.includes('Exit Wide') &&
  !html.includes('id="woe-wide-toggle"'));
ok('waxonedge.html includes WAX price block', html.includes('id="woe-topbar-wax-price"'));
ok('waxonedge.html waits for live WAX price data by default', html.includes('Waiting for live data...'));
ok('analytics token page removes unnecessary header nav/actions',
  !tokenHtml.includes('woe-og-nav') &&
  !tokenHtml.includes('href="/waxonedge.html">Bubbles</a>') &&
  !tokenHtml.includes('href="#woe-chart-heading"') &&
  !tokenHtml.includes('href="#woe-token-pairs-heading"') &&
  !tokenHtml.includes('Read-Only') &&
  !tokenHtml.includes('Exit Wide') &&
  !tokenHtml.includes('id="woe-wide-toggle"'));

const FORBIDDEN_LABELS = ['Swap', 'Add Liquidity', 'Remove Liquidity', 'Connect Wallet', 'Trade on Swap', 'Static read-only MVP'];
for (const label of FORBIDDEN_LABELS) {
  ok(
    'waxonedge does NOT contain forbidden label: "' + label + '"',
    !html.includes(label),
    'Found "' + label + '" in WaxOnEdge frontend',
  );
}

ok('waxonedge.html has canonical favicon tag', html.includes('<link rel="icon" type="image/png" href="/favicon.png">'));
ok('waxonedge.html does not reference old domain crypto-moonboys.github.io', !/crypto-moonboys\.github\.io/.test(html));
ok('waxonedge.html does not expose read-only badge chrome', !/Read-Only|woe-readonly-badge/.test(html));

try {
  execFileSync(process.execPath, ['--check', path.join(ROOT, 'js/waxonedge.js')], { encoding: 'utf8' });
  ok('js/waxonedge.js passes node --check', true);
} catch (error) {
  ok('js/waxonedge.js passes node --check', false, error.message);
}

try {
  execFileSync(process.execPath, ['--check', path.join(ROOT, 'js/waxonedge-sources.js')], { encoding: 'utf8' });
  ok('js/waxonedge-sources.js passes node --check', true);
} catch (error) {
  ok('js/waxonedge-sources.js passes node --check', false, error.message);
}

try {
  execFileSync(process.execPath, ['--check', path.join(ROOT, 'js/waxonedge-bubbles-v2.js')], { encoding: 'utf8' });
  ok('js/waxonedge-bubbles-v2.js passes node --check', true);
} catch (error) {
  ok('js/waxonedge-bubbles-v2.js passes node --check', false, error.message);
}

ok('waxonedge-sources.js references swap.nefty contract', sourcesJs.includes('swap.nefty'));
ok('waxonedge-sources.js includes WaxBlock link for swap.nefty', sourcesJs.includes('waxblock.io/account/swap.nefty'));
ok('waxonedge-sources.js uses Alcor api/v2 base', sourcesJs.includes("var ALCOR_API = 'https://wax.alcor.exchange/api/v2';"));
ok('waxonedge-sources.js defines /pairs path', sourcesJs.includes("pairs: '/pairs'") || sourcesJs.includes("healthPath: '/pairs'"));
ok('waxonedge-sources.js defines /analytics/global path', sourcesJs.includes("analyticsGlobal: '/analytics/global'") || sourcesJs.includes("healthPath: '/analytics/global'"));
ok('waxonedge-sources.js defines /markets helper path for chart fetches', sourcesJs.includes("markets: '/markets'"));

ok('waxonedge.js calls /api/waxonedge/bootstrap before diagnostic fallback',
  /waxonedgeApi\('\/bootstrap'\)\.then[\s\S]*return loadDiagnosticFallback\(\)/.test(js));
ok('waxonedge.js keeps direct browser fetches as diagnostic fallback',
  js.includes('loadDiagnosticFallback') && js.includes('Backend bootstrap unavailable'));
ok('waxonedge.js uses configured WAX RPC fallbacks', js.includes('WAXONEDGE_WAX_RPC_FALLBACKS'));
ok('waxonedge.js performs swap.nefty ABI lookup', js.includes('get_abi') || js.includes('getAbi'));
ok('waxonedge.js includes query-string token detail state', js.includes('token=') && js.includes('contract='));
ok('waxonedge.js uses path-segment-safe token analytics route detection',
  js.includes("return /^\\/analytics\\/token(?:\\/|$)/.test(path);") &&
  !js.includes('/\\/analytics\\/token\\/?/.test'));
ok('waxonedge.js fetches Alcor chart candles from /markets/:id/charts for diagnostic fallback', js.includes('/charts') && js.includes('/markets'));
ok('waxonedge.js keeps Lightweight Charts support', js.includes('window.LightweightCharts') && js.includes('tv.createChart'));

ok('waxonedge-bubbles-v2.js uses backend bootstrap endpoint',
  v2Js.includes("var API_PATH = '/api/waxonedge/bootstrap';"));
ok('waxonedge-bubbles-v2.js renders v2 visual bubble map',
  v2Js.includes('function renderBubbles') && v2Js.includes('woe-v2-bubble') && v2Js.includes('woe-v2-bubble-cloud'));
ok('waxonedge-bubbles-v2.js supports liquidity, volume, and pair-count sizing',
  v2Js.includes("metric === 'volume'") && v2Js.includes("metric === 'pairs'") && v2Js.includes('liquidityWax'));
ok('waxonedge-bubbles-v2.js preserves distinct indexed source keys',
  v2Js.includes('function pairSourceKey(pair)') &&
  v2Js.includes('pair.source || pair.adapter || pair.rawSource || pair.raw_source') &&
  v2Js.includes("if (source === 'alcor') return 'alcor';") &&
  v2Js.includes("if (source === 'swap.alcor') return 'swap.alcor';") &&
  v2Js.includes("if (source === 'swap.taco') return 'swap.taco';") &&
  v2Js.includes("if (source === 'swap.nefty') return 'swap.nefty';") &&
  v2Js.includes("if (source === 'swap.box') return 'swap.box';"));
ok('waxonedge-bubbles-v2.js suppresses self-triggered observer loops',
  v2Js.includes('function commitBoardHtml') && v2Js.includes('window.setTimeout(function ()') && v2Js.includes('state.rendering = false'));
ok('waxonedge-bubbles-v2.js marks v2 bubbles as bound for the base click binder',
  v2Js.includes('data-bound="true"'));
ok('waxonedge-bubbles-v2.js parses active selection once per render',
  v2Js.includes('function getActiveTokenKey') && v2Js.includes('var activeKey = getActiveTokenKey();'));
ok('waxonedge-bubbles-v2.js exposes accessible rail group label',
  v2Js.includes('role="group"') && v2Js.includes('Visible bubble market summary'));
ok('waxonedge-bubbles-v2.js routes bubble clicks to fullscreen token analytics',
  v2Js.includes("'/analytics/token/?token='") &&
  v2Js.includes('window.location.href = buildTokenAnalyticsHref') &&
  !v2Js.includes("url.hash = 'woe-token-detail'"));

ok('waxonedge.html is scanner-only and omits dominant KPI/source strips',
  !html.includes('woe-kpi-grid') &&
  !html.includes('id="woe-sources-grid"') &&
  !html.includes('Source Status'));
ok('waxonedge.html includes bubble board container', html.includes('id="woe-bubble-board"'));
ok('waxonedge.html does not expose old detail/table sections by default',
  !html.includes('id="woe-token-rank-grid"') &&
  !html.includes('id="woe-token-detail"') &&
  !html.includes('id="woe-table-matrix"') &&
  !html.includes('id="woe-pair-detail-panel"') &&
  !html.includes('id="woe-table-pairs"') &&
  !html.includes('id="woe-account-lookup"'));
ok('analytics token page contains fullscreen stats/chart/pairs structure',
  tokenHtml.includes('woe-token-analytics-page') &&
  tokenHtml.includes('id="woe-token-detail"') &&
  tokenHtml.includes('id="woe-chart-panel"') &&
  tokenHtml.includes('id="woe-table-matrix"') &&
  tokenHtml.includes('id="woe-pair-detail-panel"'));

ok('waxonedge.js renders visual token bubbles', js.includes('function renderBubbles') && js.includes('woe-bubble-token'));
ok('waxonedge.js sizes bubbles from liquidity, volume, or pair count',
  js.includes('metricValueForToken') && js.includes("metric === 'volume'") && js.includes("metric === 'pairs'"));
ok('waxonedge.js colors bubbles from 24h change', js.includes('woe-bubble-up') && js.includes('woe-bubble-down'));
ok('waxonedge.js derives source badges from indexed pair rows', js.includes('function getTokenSources') && js.includes('sourceBadgesHtml'));
ok('waxonedge.js maps backend source labels without collapsing swap adapters into Alcor',
  js.includes("'swap.alcor': { label: 'swap.alcor'") &&
  js.includes("'swap.taco': { label: 'swap.taco'") &&
  js.includes("'swap.nefty': { label: 'swap.nefty'") &&
  js.includes("'swap.box': { label: 'swap.box'"));
ok('waxonedge.js still builds Top 99 scanner records for bubble sizing', js.includes('getRankedTokenRecords().slice(0, 99)'));
ok('waxonedge.js keeps pair matrix renderer for token analytics route', js.includes('function renderMatrix') && js.includes('woe-matrix-body'));
ok('waxonedge.js renders pair detail on row click', js.includes('function renderPairDetail') && js.includes('woe-pair-detail-link'));
ok('waxonedge.js no longer auto-selects a default token-first view',
  js.includes("return { symbol: '', contract: '', key: '' };"));

ok('waxonedge.js has exactly one pickDefaultSelection definition',
  countMatches(js, /function pickDefaultSelection\s*\(/g) === 1);
ok('waxonedge.js has exactly one renderMatrix definition',
  countMatches(js, /function renderMatrix\s*\(/g) === 1);
ok('waxonedge.js defines shared stable pair key helper',
  js.includes('function getPairKey(market)') &&
  js.includes("market.marketId || market.pairId || market.pair_id || market.id") &&
  js.includes("tokenAKey + '|' + tokenBKey"));
ok('pairRowHtml uses getPairKey without render-time index fallback',
  js.includes('var pairKey = getPairKey(market);') &&
  !js.includes('market.marketId || index'));
ok('attachPairDetailLinks resolves pairs with shared getPairKey',
  js.includes('return getPairKey(candidate) === pairKey;'));
ok('wide mode toggle updates aria-pressed',
  js.includes("btn.setAttribute('aria-pressed', enabled ? 'true' : 'false')"));
ok('wide mode localStorage zero disables default wide mode',
  js.includes("localStorage.getItem('woe_wide_mode') === '0'") && js.includes('applyWideMode(false)'));
ok('default wide mode remains enabled in scanner body class',
  /<body[^>]*class="[^"]*\bwoe-wide-mode\b[^"]*"/.test(html));

for (const label of [
  'Selected price source',
  'Current price in WAX and USD',
  '24h price change',
  '24h volume',
  'Total liquidity',
  'Cumulated pair liquidity',
  'Source count',
  'Strongest pair',
]) {
  ok('token stats label exists: ' + label, js.includes(label) || html.includes(label));
}

ok('waxonedge.js explicitly marks unavailable states', js.includes('Unavailable'));
ok('waxonedge.js explicitly marks indexed-backend-only states', js.includes('Requires indexed backend'));
ok('waxonedge.js explicitly marks unindexed chart states', js.includes('Source not indexed yet'));
ok('waxonedge.js does not present market cap from issued supply fallback', !js.includes('Issued supply basis'));
ok('holder lookup copy does not claim holder distribution',
  !html.includes('Holder Data') &&
  !tokenHtml.includes('Holder Data') &&
  !html.includes('Holder distribution') &&
  !tokenHtml.includes('Holder distribution') &&
  !js.includes('Holder distribution'));
ok('account lookup panel is not exposed on scanner or token analytics pages',
  !html.includes('woe-account-lookup') && !tokenHtml.includes('woe-account-lookup'));

ok('waxonedge.css includes terminal shell and detail layout styles',
  css.includes('.woe-og-bar') &&
  css.includes('.woe-analytics-grid') &&
  css.includes('.woe-chart-panel'));
ok('waxonedge.css includes bubble dashboard styling', css.includes('.woe-bubble-board') && css.includes('.woe-bubble-token'));
ok('waxonedge.css includes source strip styling', css.includes('.woe-source-strip') && css.includes('.woe-source-pill'));
ok('waxonedge.css includes pair detail styling', css.includes('.woe-pair-detail-panel'));
ok('waxonedge.css includes dense matrix/icon styling',
  css.includes('.woe-icon-placeholder') &&
  css.includes('#woe-table-matrix'));
ok('waxonedge.css includes scanner-only and token analytics page layouts',
  css.includes('.woe-scanner-page') && css.includes('.woe-token-analytics-page') && css.includes('.woe-analytics-chart-panel'));
ok('waxonedge.css hides/minimizes sidebar for WaxOnEdge by default',
  css.includes('body.page-waxonedge #sidebar'));
ok('waxonedge.css includes wide mode layout overrides', css.includes('body.woe-wide-mode'));
ok('waxonedge.css wide mode hides sidebar in terminal mode', css.includes('body.woe-wide-mode #sidebar'));
ok('waxonedge.css includes active token styling', css.includes('.woe-token-rank-active') || css.includes('.woe-row-active'));

ok('waxonedge-bubbles-v2.css includes v2 board and cloud styling',
  v2Css.includes('.woe-v2-board') && v2Css.includes('.woe-v2-bubble-cloud'));
ok('waxonedge-bubbles-v2.css includes v2 bubble styling',
  v2Css.includes('.woe-v2-bubble') && v2Css.includes('.woe-v2-bubble-active'));
ok('waxonedge-bubbles-v2.css includes responsive and reduced-motion support',
  v2Css.includes('@media (max-width: 980px)') && v2Css.includes('@media (prefers-reduced-motion: reduce)'));

ok('waxonedge.js renders source/token icon placeholders',
  js.includes('iconPlaceholderHtml') &&
  js.includes('sourceCellHtml') &&
  js.includes('tokenCellHtml'));
ok('waxonedge.js updates the top bar WAX price block',
  js.includes('updateTopBarWaxPrice') &&
  js.includes('woe-topbar-wax-price'));
ok('waxonedge.html omits wide mode toggle button chrome', !html.includes('id="woe-wide-toggle"'));
ok('waxonedge.js implements toggleWideMode and woe-wide-mode class',
  js.includes('toggleWideMode') && js.includes('woe-wide-mode'));
ok('waxonedge.js restores wide mode from localStorage on boot', js.includes('restoreWideMode'));

console.log('\nwaxonedge-smoke.test: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  process.exit(1);
}
