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
ok('waxonedge.html lets the AntBubbles scanner own the page without old dashboard scripts',
  !html.includes('/js/waxonedge.js') && !html.includes('/js/waxonedge-sources.js'));
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

ok('waxonedge-bubbles-v2.js uses WaxOnEdge backend endpoints, not AntBubbles or live Alcor APIs',
  v2Js.includes("var BOOTSTRAP_API = '/api/waxonedge/bootstrap';") &&
  v2Js.includes("var HEALTH_API = '/api/waxonedge/indexer-health';") &&
  v2Js.includes("var LIVE_API = '/api/waxonedge/live';") &&
  !v2Js.includes('antbubbles') &&
  !v2Js.includes('wax.alcor.exchange'));
ok('waxonedge-bubbles-v2.js renders AntBubbles-style canvas scanner',
  v2Js.includes('woe-ab-canvas') &&
  v2Js.includes('drawBubbleOffscreen') &&
  v2Js.includes('forceSimulationEquivalent') &&
  v2Js.includes('requestAnimationFrame') &&
  v2Js.includes('bubbleCanvasCache'));
ok('waxonedge-bubbles-v2.js supports Ant-style metric and timeframe modes',
  v2Js.includes("change: '% Change'") &&
  v2Js.includes("price: 'Price'") &&
  v2Js.includes("volume: 'Volume'") &&
  v2Js.includes("tvl: 'TVL'") &&
  v2Js.includes("liquidity: 'Liquidity'") &&
  v2Js.includes("mcap: 'Mkt Cap'") &&
  v2Js.includes("var TIMEFRAME_LABELS = { '24h': '24h', '7d': '7D', '30d': '30D'") &&
  v2Js.includes("if (metric === 'price') return record.selectedPriceUsd != null ? record.selectedPriceUsd : record.selectedPriceWax") &&
  v2Js.includes("if (timeframe === '7d')") &&
  v2Js.includes("if (timeframe === '30d')"));
ok('waxonedge.html exposes Liquidity scanner metric control when liquidity mode exists',
  html.includes('data-woe-metric="liquidity"') &&
  html.includes('>Liquidity</button>'));
ok('waxonedge-bubbles-v2.js keeps metric availability honest without metric-only sizing',
  v2Js.includes('return change != null ? Math.abs(change) : null') &&
  /if\s*\(\s*metric\s*===\s*'tvl'\s*\)\s*\{\s*return\s+record\.tvlUsd\s*!=\s*null\s*\?\s*record\.tvlUsd\s*:\s*record\.tvlWax\s*;\s*\}/.test(v2Js) &&
  /if\s*\(\s*metric\s*===\s*'liquidity'\s*\)\s*return\s+record\.liquidityUsd\s*!=\s*null\s*\?\s*record\.liquidityUsd\s*:\s*record\.liquidityWax/.test(v2Js) &&
  /if\s*\(\s*metric\s*===\s*'mcap'\s*\)\s*return\s+record\.marketCapUsd\s*!=\s*null\s*\?\s*record\.marketCapUsd\s*:\s*record\.marketCapWax/.test(v2Js) &&
  v2Js.includes('metricCount < records.length') &&
  v2Js.includes("with ' + METRIC_LABELS[state.metric] + ' data") &&
  v2Js.includes('blendedMarketScore(record)') &&
  !v2Js.includes('record.tvlUsd || record.liquidityUsd') &&
  !v2Js.includes('record.tvlWax || record.liquidityWax') &&
  !v2Js.includes('if (record.change24 == null) record.change24 = asNum(pair.change_24h)') &&
  !v2Js.includes('if (record.liquidityWax == null') &&
  !v2Js.includes('if (record.volume24Wax == null') &&
  !v2Js.includes('record.volume24Usd || record.volume24Wax || record.liquidityUsd || record.liquidityWax || record.indexedPairCount') &&
  !v2Js.includes('record.fdvUsd || record.marketCapWax') &&
  !v2Js.includes(" + ' FDV'"));
ok('waxonedge-bubbles-v2.js reduces max bubble radius for dense Top 100 scanner layout',
  v2Js.includes('mobile ? 52 : 88') &&
  !v2Js.includes('mobile ? 72 : 132'));
ok('waxonedge-bubbles-v2.js removes structured modal stats and object string leaks',
  !v2Js.includes('function formatStatValue') &&
  !v2Js.includes('function renderModal') &&
  !v2Js.includes('[object Object]'));
ok('waxonedge-bubbles-v2.js preserves distinct indexed source keys',
  v2Js.includes('function pairSourceKey(pair)') &&
  v2Js.includes('token.source_keys || token.sourceKeys || token.sources') &&
  v2Js.includes('pair.source || pair.adapter || pair.rawSource || pair.raw_source') &&
  v2Js.includes('function sourceRank(source)') &&
  v2Js.includes('return index === -1 ? SOURCE_ORDER.length : index') &&
  v2Js.includes('localeCompare') &&
  v2Js.includes('sort(compareSources)') &&
  v2Js.includes("if (source === 'alcor') return 'alcor';") &&
  v2Js.includes("if (source === 'swap.alcor') return 'swap.alcor';") &&
  v2Js.includes("if (source === 'swap.taco') return 'swap.taco';") &&
  v2Js.includes("if (source === 'swap.nefty') return 'swap.nefty';") &&
  v2Js.includes("if (source === 'swap.box') return 'swap.box';"));
ok('waxonedge-bubbles-v2.js selects Top 100 using multi-DEX aggregate fields',
  v2Js.includes('var TOP_LIMIT = 100') &&
  v2Js.includes('selected_price_wax') &&
  v2Js.includes('selected_price_usd') &&
  v2Js.includes('source_count') &&
  v2Js.includes('indexed_pair_count') &&
  v2Js.includes('selected_pair_source') &&
  v2Js.includes('source_keys') &&
  v2Js.includes('return base.slice(0, TOP_LIMIT)'));
ok('WaxOnEdge keeps missing 7d/30d/candle data honest instead of fake',
  v2Js.includes('7D unavailable') &&
  v2Js.includes('30D unavailable') &&
  v2Js.includes('history building from fresh live data') &&
  js.includes('Indexed chart building from fresh live data') &&
  js.includes('function historicalVolumeAvailabilityHtml') &&
  js.includes("if (isFreshHistoryAccumulating(stats, key)) return availabilityHtml('Building from fresh live history')") &&
  js.includes('return tokenAvailabilityHtml(stats, key)') &&
  js.includes('function isFreshHistoryAccumulating') &&
  js.includes('var statusText = metaLabel || reason') &&
  js.includes('No fake candles are shown') &&
  !v2Js.includes('synthesized candle') &&
  !js.includes('synthesized candle') &&
  !v2Js.includes('fallback candle') &&
  !js.includes('fallback candle') &&
  !v2Js.includes('hardcoded WUF') &&
  !js.includes('hardcoded WUF'));
ok('waxonedge-bubbles-v2.js filters search by symbol, contract, source, and pair labels',
  v2Js.includes('function tokenSearchText') &&
  v2Js.includes('record.symbol') &&
  v2Js.includes('record.contract') &&
  v2Js.includes('record.selectedSource') &&
  v2Js.includes('record.strongestPairLabel') &&
  v2Js.includes('record.sources.join'));
ok('waxonedge-bubbles-v2.js opens full token analytics directly without token modal flow',
  v2Js.includes('function openTokenAnalytics') &&
  v2Js.includes('function tokenAnalyticsUrl') &&
  v2Js.includes("'/analytics/token/?token='") &&
  v2Js.includes('window.location.href = tokenAnalyticsUrl(record)') &&
  !v2Js.includes('function openTokenModal') &&
  !v2Js.includes('woe-ab-modal-panel') &&
  !v2Js.includes('Open fullscreen analytics') &&
  !html.includes('woe-ab-modal'));
ok('waxonedge-bubbles-v2.js makes the canvas keyboard focusable and opens analytics from keyboard',
  v2Js.includes('tabindex="0"') &&
  v2Js.includes('role="application"') &&
  v2Js.includes('WaxOnEdge WAX Galaxy scanner') &&
  v2Js.includes('Use Enter or Space to open the highlighted token analytics page') &&
  v2Js.includes('function onCanvasKeydown') &&
  v2Js.includes("event.key !== 'Enter'") &&
  v2Js.includes("event.key !== ' '") &&
  v2Js.includes('openTokenAnalytics(node.record)'));
ok('waxonedge-bubbles-v2.js caps image and offscreen bubble canvas caches',
  v2Js.includes('var IMAGE_CACHE_LIMIT = 160') &&
  v2Js.includes('var BUBBLE_CANVAS_CACHE_LIMIT = 240') &&
  v2Js.includes('function capMap(map, limit)') &&
  v2Js.includes('capMap(imageCache, IMAGE_CACHE_LIMIT)') &&
  v2Js.includes('capMap(bubbleCanvasCache, BUBBLE_CANVAS_CACHE_LIMIT)') &&
  v2Js.includes('bubbleCanvasCache.clear()'));
ok('WaxOnEdge frontend keeps the scanner and token analytics on Worker API routes only',
  v2Js.includes("var BOOTSTRAP_API = '/api/waxonedge/bootstrap';") &&
  v2Js.includes("var LIVE_API = '/api/waxonedge/live';") &&
  v2Js.includes("var HEALTH_API = '/api/waxonedge/indexer-health';") &&
  js.includes("'/token/' + encodeURIComponent(chartContract) + '/' + encodeURIComponent(chartSymbol) + '/chart'") &&
  js.includes("selectedTokenApiPath(selection, '')") &&
  !v2Js.includes('wax.alcor.exchange') &&
  !v2Js.includes('antbubbles'));
ok('waxonedge-bubbles-v2.js renders cached fake-3D planet bubbles with live impact shockwaves',
  v2Js.includes('function drawBubbleOffscreen') &&
  v2Js.includes('function visualRadius') &&
  v2Js.includes('function drawPlanetBands') &&
  v2Js.includes('function drawPlanetNoise') &&
  v2Js.includes('function drawAnimatedBands') &&
  v2Js.includes('function drawCastShadow') &&
  v2Js.includes('function drawShockwaves') &&
  v2Js.includes('function queuePendingShockwaves') &&
  v2Js.includes('function isLiveImpactEvent') &&
  v2Js.includes('ctx.createRadialGradient') &&
  v2Js.includes('ctx.strokeText(record.symbol') &&
  v2Js.includes("record.sourceCount + ' src'") &&
  v2Js.includes('bubbleCanvasCache.get(record.id)') &&
  !/function applyLiveTokenUpdate[\s\S]*?bubbleCanvasCache\.delete\(record\.id\)[\s\S]*?function refreshLiveTargetRadii/.test(v2Js));
ok('waxonedge-bubbles-v2.js uses blended base market score for bubble sizing',
  v2Js.includes('function blendedMarketScore') &&
  v2Js.includes('function reweightedScore') &&
  v2Js.includes('function metricEmphasis') &&
  v2Js.includes('record.baseMarketScore = score') &&
  v2Js.includes('liquidityWax') &&
  v2Js.includes('volume24Wax') &&
  v2Js.includes('marketCapWax') &&
  v2Js.includes('indexedPairCount') &&
  !/function computeRadii[\s\S]*valueForMetric\(record, state\.metric, state\.timeframe\)/.test(v2Js));
ok('waxonedge-bubbles-v2.js adds live WAX Galaxy reactions from real update data',
  html.includes('woe-ab-live-feed') &&
  v2Js.includes('function addLiveFeed') &&
  v2Js.includes('function updateCamera') &&
  v2Js.includes('return node.record && node.record.key === record.key') &&
  v2Js.includes('state.camera.focusX = currentNode ? currentNode.x : (record.nodeX || 0)') &&
  v2Js.includes('function marketWeather') &&
  v2Js.includes('record.recentUntil') &&
  v2Js.includes('record.volumeSpikeUntil') &&
  v2Js.includes('Whale/high-volume update detected') &&
  v2Js.includes('Fresh history building') &&
  v2Js.includes('safeTimeLabel') &&
  !v2Js.includes('Invalid Date'));
ok('waxonedge-bubbles-v2.js pauses animation when hidden and respects reduced motion',
  v2Js.includes("window.matchMedia('(prefers-reduced-motion: reduce)'") &&
  v2Js.includes('function shouldAnimate()') &&
  v2Js.includes('!document.hidden && !prefersReducedMotion()') &&
  v2Js.includes('if (document.hidden) return') &&
  v2Js.includes('document.addEventListener(\'visibilitychange\'') &&
  v2Js.includes('reducedMotionQuery.addEventListener'));
ok('waxonedge-bubbles-v2.js keeps WAX price meta honest',
  v2Js.includes('WAX price unavailable') &&
  v2Js.includes('Connecting to WaxOnEdge indexer') &&
  v2Js.includes('WAX price from ') &&
  v2Js.includes('data.summary.wax_price_usd') &&
  !v2Js.includes('Indexed from Alcor, Taco, Nefty, BOX'));

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
ok('waxonedge.js prefers aggregate 24h change for scanner bubbles',
  js.includes('var change = record.change24 != null ? record.change24 : (market && market.change24 != null ? market.change24 : null);'));
ok('waxonedge.js derives source badges from indexed pair rows', js.includes('function getTokenSources') && js.includes('sourceBadgesHtml'));
ok('waxonedge.js derives scanner source badges from aggregate source keys first',
  js.includes('tokenRecord.sourceKeys') &&
  js.includes('if (aggregateSources.length) return aggregateSources.slice().sort();'));
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
ok('waxonedge.js fetches selected-token detail, pairs, and chart endpoints',
  js.includes('tokenDetailCache') &&
  js.includes('tokenPairCache') &&
  js.includes('tokenChartCache') &&
  js.includes('function loadSelectedTokenDetail(selection)') &&
  js.includes('function loadSelectedTokenPairs(selection)') &&
  js.includes('function loadSelectedTokenChart(selection)') &&
  js.includes("selectedTokenApiPath(selection, 'pairs')") &&
  js.includes("loadChartData('backend:' + selection.key)"));
ok('waxonedge.js uses selected-token pair cache for matrix/proof rows',
  js.includes('function getMarketsForSelection(selection)') &&
  js.includes('state.tokenPairCache[selection.key]') &&
  js.includes('var rows = state.selected && state.selected.key ? getMarketsForSelection(state.selected) : getAllMarkets();'));
ok('renderTokenStats uses backend detail stats without aggregate-complete gating',
  js.includes('function isCanonicalAggregateValid(stats)') &&
  js.includes('var stats = context.stats || {};') &&
  js.includes('var currentPriceWax = asNum(stats.selected_price_wax);') &&
  js.includes('var currentPriceUsd = asNum(stats.selected_price_usd);') &&
  js.includes('var volume24 = asNum(stats.volume_24h_wax);') &&
  js.includes('var liquidityWax = asNum(stats.liquidity_wax);') &&
  js.includes('stats.aggregate_status') &&
  js.includes('tokenStatReason(stats') &&
  !js.includes('var currentPriceWax = token.systemPrice'));

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
  'Total indexed liquidity',
  'Cumulated pair liquidity',
  'Source count',
  'Strongest pair',
]) {
  ok('token stats label exists: ' + label, js.includes(label) || html.includes(label));
}

ok('waxonedge.js explicitly marks unavailable states', js.includes('Unavailable'));
ok('waxonedge.js explicitly marks indexed-backend-only states', js.includes('Requires indexed backend'));
ok('waxonedge.js explicitly marks unindexed chart states', js.includes('Source not indexed yet'));
ok('WaxOnEdge never renders Invalid Date for scanner timestamps',
  v2Js.includes('function safeTimeLabel') &&
  v2Js.includes("if (!value) return ''") &&
  v2Js.includes("if (!Number.isFinite(date.getTime())) return ''") &&
  v2Js.includes("safeTimeLabel(state.lastUpdated) || 'Waiting for sync'") &&
  v2Js.includes('(tokens[tokens.length - 1] && tokens[tokens.length - 1].updated_at)') &&
  v2Js.includes('state.lastUpdated = loadedData.updated_at || loadedData.generated_at || new Date().toISOString()') &&
  !v2Js.includes('state.lastUpdated = state.live.cursor') &&
  !v2Js.includes('loadedData.updated_at || loadedData.generated_at || loadedData.next_cursor') &&
  !/function safeTimeLabel[\s\S]*new Date\(\)[\s\S]*return date\.toLocaleTimeString/.test(v2Js) &&
  !v2Js.includes('Invalid Date') &&
  !html.includes('Invalid Date') &&
  !tokenHtml.includes('Invalid Date'));
ok('waxonedge.js does not present market cap from issued supply fallback', !js.includes('Issued supply basis'));
ok('holder lookup copy does not claim holder distribution',
  !html.includes('Holder Data') &&
  !tokenHtml.includes('Holder Data') &&
  !html.includes('Holder distribution') &&
  !tokenHtml.includes('Holder distribution') &&
  !js.includes('Holder distribution'));
ok('account lookup panel is not exposed on scanner or token analytics pages',
  !html.includes('woe-account-lookup') &&
  !tokenHtml.includes('woe-account-lookup') &&
  !tokenHtml.includes('woe-holder-account') &&
  !js.includes('state/get_tokens') &&
  !js.includes('Look up balances') &&
  !js.includes('WAXONEDGE_HYPERION'));
ok('token analytics renders honest holder indexing placeholder only',
  tokenHtml.includes('id="woe-holders-panel"') &&
  js.includes('Holder indexing not enabled yet') &&
  js.includes('No fake holder rows are shown') &&
  !js.includes('woe-holder-result-card'));
ok('token analytics preserves all-pairs WAX valuation model copy',
  js.includes('All-pairs WAX valuation sums usable indexed pair value across supported DEXs where a trusted WAX route exists') &&
  js.includes('All-pairs WAX valuation is partial when a pair cannot be valued through a trusted indexed WAX route') &&
  v2Js.includes('All-pairs WAX valuation model'));

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

ok('waxonedge-bubbles-v2.css includes AntBubbles-style black/orange shell styling',
  v2Css.includes('.woe-antbubbles-page') &&
  v2Css.includes('.woe-ab-topbar') &&
  v2Css.includes('#f89422') &&
  v2Css.includes('.woe-ab-canvas') &&
  v2Css.includes('.woe-ab-stats'));
ok('waxonedge-bubbles-v2.css includes live feed and tooltip styling without modal chrome',
  v2Css.includes('.woe-ab-live-feed') &&
  v2Css.includes('.woe-ab-feed-item') &&
  v2Css.includes('.woe-ab-tooltip') &&
  v2Css.includes('.woe-ab-chart-empty') &&
  !v2Css.includes('.woe-ab-modal-panel') &&
  !v2Css.includes('.woe-ab-open-analytics'));
ok('waxonedge-bubbles-v2.css includes responsive scanner support',
  v2Css.includes('@media (max-width: 920px)') && v2Css.includes('@media (max-width: 620px)'));
ok('waxonedge-bubbles-v2.css includes focus-visible and reduced-motion scanner support',
  v2Css.includes('.woe-ab-canvas:focus-visible') &&
  v2Css.includes('@media (prefers-reduced-motion: reduce)') &&
  v2Css.includes('.woe-ab-pulse') &&
  v2Css.includes('animation: none'));

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
