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
ok('waxcash.html exists', exists('waxcash.html'));
ok('waxonedge/index.html clean-route alias exists', exists('waxonedge/index.html'));
ok('analytics/token/index.html token analytics route exists', exists('analytics/token/index.html'));
ok('css/waxonedge.css exists', exists('css/waxonedge.css'));
ok('css/waxonedge-bubbles-v2.css exists', exists('css/waxonedge-bubbles-v2.css'));
ok('js/waxonedge.js exists', exists('js/waxonedge.js'));
ok('js/waxonedge-sources.js exists', exists('js/waxonedge-sources.js'));
ok('js/waxonedge-featured-tokens.js exists', exists('js/waxonedge-featured-tokens.js'));
ok('js/waxonedge-bubbles-v2.js exists', exists('js/waxonedge-bubbles-v2.js'));
ok('js/waxcash-analytics.js exists', exists('js/waxcash-analytics.js'));

const html = exists('waxonedge.html') ? read('waxonedge.html') : '';
const waxcashHtml = exists('waxcash.html') ? read('waxcash.html') : '';
const tokenHtml = exists('analytics/token/index.html') ? read('analytics/token/index.html') : '';
const aliasHtml = exists('waxonedge/index.html') ? read('waxonedge/index.html') : '';
const css = exists('css/waxonedge.css') ? read('css/waxonedge.css') : '';
const v2Css = exists('css/waxonedge-bubbles-v2.css') ? read('css/waxonedge-bubbles-v2.css') : '';
const js = exists('js/waxonedge.js') ? read('js/waxonedge.js') : '';
const sourcesJs = exists('js/waxonedge-sources.js') ? read('js/waxonedge-sources.js') : '';
const featuredJs = exists('js/waxonedge-featured-tokens.js') ? read('js/waxonedge-featured-tokens.js') : '';
const v2Js = exists('js/waxonedge-bubbles-v2.js') ? read('js/waxonedge-bubbles-v2.js') : '';
const waxcashAnalyticsJs = exists('js/waxcash-analytics.js') ? read('js/waxcash-analytics.js') : '';

ok('waxonedge.html references /css/waxonedge.css', html.includes('/css/waxonedge.css'));
ok('waxonedge.html references /css/waxonedge-bubbles-v2.css', html.includes('/css/waxonedge-bubbles-v2.css'));
ok('waxonedge.html lets the AntBubbles scanner own the page without old dashboard scripts',
  !html.includes('/js/waxonedge.js') && !html.includes('/js/waxonedge-sources.js'));
ok('waxonedge.html references /js/waxonedge-bubbles-v2.js', html.includes('/js/waxonedge-bubbles-v2.js'));
ok('waxonedge.html loads featured-token config before scanner runtime',
  html.indexOf('/js/waxonedge-featured-tokens.js') !== -1 &&
  html.indexOf('/js/waxonedge-featured-tokens.js') < html.indexOf('/js/waxonedge-bubbles-v2.js'));
ok('analytics token page loads featured-token config before waxonedge.js',
  tokenHtml.indexOf('/js/waxonedge-featured-tokens.js') !== -1 &&
  tokenHtml.indexOf('/js/waxonedge-featured-tokens.js') < tokenHtml.indexOf('/js/waxonedge.js'));
ok('waxonedge.html versions WaxOnEdge scanner assets to avoid stale CDN bundles',
  html.includes('/css/waxonedge.css?v=woe-') &&
  html.includes('/css/waxonedge-bubbles-v2.css?v=woe-') &&
  html.includes('/js/waxonedge-bubbles-v2.js?v=woe-'));
ok('OG analytics parity PR cache-busts changed WaxOnEdge scanner assets',
  html.includes('/js/waxonedge-featured-tokens.js?v=woe-20260616-featured') &&
  html.includes('/js/waxonedge-bubbles-v2.js?v=woe-20260617-bubble-liquidity') &&
  !html.includes('/js/waxonedge-bubbles-v2.js?v=woe-20260617-og-analytics') &&
  !html.includes('/js/waxonedge-bubbles-v2.js?v=woe-20260617-trust-hardening') &&
  !html.includes('/js/waxonedge-bubbles-v2.js?v=woe-20260617-confidence') &&
  !html.includes('/js/waxonedge-bubbles-v2.js?v=woe-20260615-galaxy3'));
ok('OG analytics parity PR cache-busts changed token analytics assets',
  tokenHtml.includes('/js/waxonedge-featured-tokens.js?v=woe-20260616-featured') &&
  tokenHtml.includes('/js/waxonedge.js?v=woe-20260617-og-analytics') &&
  !tokenHtml.includes('/js/waxonedge.js?v=woe-20260617-trust-hardening') &&
  !tokenHtml.includes('/js/waxonedge.js?v=woe-20260617-confidence'));
ok('WaxOnEdge CSS cache keys remain on the existing CSS version because this PR does not edit CSS assets',
  html.includes('/css/waxonedge.css?v=woe-20260615-galaxy3') &&
  html.includes('/css/waxonedge-bubbles-v2.css?v=woe-20260615-galaxy3'));
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
ok('waxcash.html is a dedicated analytics page without top nav or graph runtime',
  waxcashHtml.includes('WAXCASH Analytics') &&
  waxcashHtml.includes('/js/waxcash-analytics.js') &&
  !waxcashHtml.includes('/js/waxcash-graph.js') &&
  !waxcashHtml.includes('woe-ab-segments') &&
  !waxcashHtml.includes('woe-og-nav') &&
  !waxcashHtml.includes('href="/index.html"') &&
  !waxcashHtml.includes('>Home<') &&
  !waxcashHtml.includes('>Spot<') &&
  !waxcashHtml.includes('>Markets<') &&
  !waxcashHtml.includes('>Analytics<'));
ok('waxcash analytics frontend calls the dedicated backend endpoint only',
  waxcashAnalyticsJs.includes("var ENDPOINT = '/api/waxonedge/waxcash-analytics'") &&
  !waxcashAnalyticsJs.includes('/api/waxonedge/waxcash-graph') &&
  !waxcashAnalyticsJs.includes('/api/waxonedge/bootstrap') &&
  waxcashAnalyticsJs.includes('sections.token_stats') &&
  waxcashAnalyticsJs.includes('sections.supply_proof') &&
  waxcashAnalyticsJs.includes('sections.pair_table') &&
  waxcashAnalyticsJs.includes('sections.chart_external') &&
  !waxcashAnalyticsJs.includes('/api/waxonedge/waxcash-analytics/chart-feed'));
ok('waxcash frontend removes visible explanatory chart/status/proof labels',
  !waxcashHtml.includes('Chart and stats') &&
  !waxcashHtml.includes('WAXCASH token analytics for graffitiking::WAXCASH') &&
  !waxcashHtml.includes('Price proof:') &&
  !waxcashHtml.includes('Alcor pool #8388 display feed') &&
  !waxcashHtml.includes('Full embedded chart') &&
  !waxcashHtml.includes('Single WAXCASH/WAX feed') &&
  !waxcashHtml.includes('Display-only') &&
  !waxcashHtml.includes('Standalone chart display, separate from WaxOnEdge token detail proof.') &&
  !waxcashHtml.includes('Display-only pair detail views') &&
  !waxcashHtml.includes('wx-view-controls') &&
  !waxcashHtml.includes('wx-pair-detail'));
ok('waxcash frontend embeds GeckoTerminal WAXCASH/WAX candle chart instead of Alcor pool analytics',
  waxcashHtml.includes('https://www.geckoterminal.com/wax/pools/swap-alcor-8388?embed=1') &&
  waxcashHtml.includes('WAXCASH/WAX GeckoTerminal candle chart') &&
  waxcashAnalyticsJs.includes('https://www.geckoterminal.com/wax/pools/swap-alcor-8388?embed=1') &&
  waxcashAnalyticsJs.includes('GeckoTerminal candle chart') &&
  waxcashAnalyticsJs.includes("var iframe = host.querySelector('.wx-external-chart-frame')") &&
  waxcashAnalyticsJs.includes("if (!iframe) {") &&
  waxcashAnalyticsJs.includes("if (iframe.getAttribute('src') !== external.url) iframe.setAttribute('src', external.url)") &&
  !waxcashAnalyticsJs.includes("host.innerHTML =\r\n      '<iframe class=\"wx-external-chart-frame\" src=\"'") &&
  !waxcashHtml.includes('https://alcor.exchange/v/wax/analytics/pools/8388') &&
  !waxcashAnalyticsJs.includes('https://alcor.exchange/v/wax/analytics/pools/8388') &&
  !waxcashAnalyticsJs.includes('/api/waxonedge/waxcash-analytics/chart-feed'));
ok('waxcash pair table exposes WAX-only liquidity and 24h volume sort controls',
  waxcashHtml.includes('id="wx-sort-liquidity"') &&
  waxcashHtml.includes('data-sort="liquidity"') &&
  waxcashHtml.includes('id="wx-sort-volume24"') &&
  waxcashHtml.includes('data-sort="volume24"') &&
  exists('img/waxonedge/dex/neftyblocks.png') &&
  exists('img/waxonedge/dex/alcor.png') &&
  exists('img/waxonedge/dex/taco.png') &&
  exists('img/waxonedge/dex/defibox.png') &&
  exists('img/waxonedge/dex/adex.png') &&
  exists('img/waxonedge/dex/waxfusion.png') &&
  waxcashHtml.includes('<th>Price</th>') &&
  waxcashHtml.includes('<th>24h change</th>') &&
  waxcashHtml.includes('<th>7d volume</th>') &&
  waxcashHtml.includes('<th>30d volume</th>') &&
  waxcashHtml.includes('<td colspan="10"') &&
  !waxcashHtml.includes('<th>Status</th>') &&
  !waxcashHtml.includes('<th>Reserves</th>') &&
  !waxcashHtml.includes('<th>Pair price</th>') &&
  waxcashAnalyticsJs.includes('function sortedPairRows(rows)') &&
  waxcashAnalyticsJs.includes('function sourceLogoUrl(row)') &&
  waxcashAnalyticsJs.includes('function sourceCell(row)') &&
  waxcashAnalyticsJs.includes("'swap.nefty': '/img/waxonedge/dex/neftyblocks.png'") &&
  waxcashAnalyticsJs.includes("'swap.alcor': '/img/waxonedge/dex/alcor.png'") &&
  waxcashAnalyticsJs.includes("'alcordexmain': '/img/waxonedge/dex/alcor.png'") &&
  waxcashAnalyticsJs.includes("'swap.taco': '/img/waxonedge/dex/taco.png'") &&
  waxcashAnalyticsJs.includes("'swap.box': '/img/waxonedge/dex/defibox.png'") &&
  waxcashAnalyticsJs.includes("'swap.adex': '/img/waxonedge/dex/adex.png'") &&
  waxcashAnalyticsJs.includes("'dapp.fusion': '/img/waxonedge/dex/waxfusion.png'") &&
  waxcashAnalyticsJs.includes('<img class="wx-source-logo" src="') &&
  waxcashAnalyticsJs.includes("'<td>' + sourceCell(row) + '</td>'") &&
  waxcashAnalyticsJs.includes('return num(row && row.liquidity_wax)') &&
  waxcashAnalyticsJs.includes('return num(row && row.volume_24h_wax)') &&
  waxcashAnalyticsJs.includes('priceCell(row)') &&
  waxcashAnalyticsJs.includes('changeCell(row.change_24h)') &&
  waxcashAnalyticsJs.includes('dual(row.volume_7d_wax, row.volume_7d_usd, row.reason)') &&
  waxcashAnalyticsJs.includes('dual(row.volume_30d_wax, row.volume_30d_usd, row.reason)') &&
  !waxcashAnalyticsJs.includes('pairStatus(row)') &&
  !waxcashAnalyticsJs.includes('row.reserves_label') &&
  !waxcashAnalyticsJs.includes('function metricValue(row, usdKey, waxKey)') &&
  !waxcashAnalyticsJs.includes("metricValue(row, 'liquidity_usd', 'liquidity_wax')") &&
  !waxcashAnalyticsJs.includes("metricValue(row, 'volume_24h_usd', 'volume_24h_wax')") &&
  waxcashAnalyticsJs.includes('defaultPairSort(rows)') &&
  waxcashAnalyticsJs.includes('if (!state.payload)') &&
  waxcashAnalyticsJs.includes('updateSortButtons([])') &&
  waxcashAnalyticsJs.includes('renderPairs(state.payload)') &&
  !waxcashAnalyticsJs.includes('renderPairs(state.payload || {})') &&
  waxcashAnalyticsJs.includes("button.textContent = isActive ? label + ' ' + String.fromCharCode(8595) : label"));

const FORBIDDEN_LABELS = ['Swap', 'Add Liquidity', 'Remove Liquidity', 'Connect Wallet', 'Trade on Swap', 'Static read-only MVP'];
for (const label of FORBIDDEN_LABELS) {
  ok(
    'waxonedge does NOT contain forbidden label: "' + label + '"',
    !html.includes(label),
    'Found "' + label + '" in WaxOnEdge frontend',
  );
}
for (const label of FORBIDDEN_LABELS) {
  ok(
    'waxcash analytics page does NOT contain forbidden label: "' + label + '"',
    !waxcashHtml.includes(label) && !waxcashAnalyticsJs.includes(label),
    'Found "' + label + '" in WAXCASH analytics page',
  );
}

const waxonedgeFrontendBundle = [html, tokenHtml, js, v2Js].join('\n');
const waxonedgePageMarkup = [html, tokenHtml].join('\n');
ok('WaxOnEdge Bubbles public pages have no trading buttons, buy/sell CTA, or connect-wallet-to-trade copy',
  !/(<button[^>]*>|<a[^>]*>|value=["'])([^<"']*\b(?:Swap|Buy|Sell|Connect Wallet|Trade on Swap|Add Liquidity|Remove Liquidity)\b[^<"']*)/i.test(waxonedgePageMarkup) &&
  !/\bconnect[-\s]?wallet[-\s]?to[-\s]?trade\b/i.test(waxonedgePageMarkup));
ok('WaxOnEdge frontend does not expose slippage, receiver, swap modal, or orderbook trading fields',
  !/\b(slippage|receiver|swap modal|orderbook|order book)\b/i.test(waxonedgeFrontendBundle) &&
  !/id=["'][^"']*(slippage|receiver|swap-modal|orderbook)[^"']*["']/i.test(waxonedgeFrontendBundle) &&
  !/name=["'][^"']*(slippage|receiver)[^"']*["']/i.test(waxonedgeFrontendBundle));
ok('WaxOnEdge frontend does not load wallet signing or transaction execution libraries',
  !/\b(waxjs|eosjs|anchor-link|ual-|wallet[-_]?plugin|SigningRequest|transact\(|signTransaction|wallet\.sign|api\.transact)\b/i.test(waxonedgeFrontendBundle));
ok('WaxOnEdge Bubbles page loads only read-only analytics scripts, not hidden trading runtimes',
  html.includes('/js/waxonedge-bubbles-v2.js') &&
  tokenHtml.includes('/js/waxonedge.js') &&
  !/src=["'][^"']*(swap|trade|wallet|sign|transaction|orderbook|aggregator)[^"']*\.js/i.test(waxonedgePageMarkup));
ok('WaxOnEdge visible metrics stay read-only and proof-backed',
  v2Js.includes("if (record.selectedPriceConfidence !== 'good') return null") &&
  v2Js.includes("if (record.tvlConfidence !== 'good') return null") &&
  v2Js.includes("if (record.liquidityConfidence !== 'good') return null") &&
  /if \(metric === 'mcap'\) return capabilityEnabled\(\['market_cap', 'mcap'\], DEFAULT_METRIC_ALLOWED\.mcap\)/.test(v2Js) &&
  js.includes("var hasMarketCap = metricStatusLive(stats, 'market_cap')") &&
  js.includes("var hasFdv = metricStatusLive(stats, 'fdv')"));

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
  execFileSync(process.execPath, ['--check', path.join(ROOT, 'js/waxonedge-featured-tokens.js')], { encoding: 'utf8' });
  ok('js/waxonedge-featured-tokens.js passes node --check', true);
} catch (error) {
  ok('js/waxonedge-featured-tokens.js passes node --check', false, error.message);
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
ok('waxonedge-bubbles-v2.js supports WAX Galaxy metric modes with dead controls gated',
  v2Js.includes("change: '% Change'") &&
  v2Js.includes("price: 'Price'") &&
  v2Js.includes("volume: 'Volume'") &&
  v2Js.includes("tvl: 'TVL'") &&
  v2Js.includes("liquidity: 'Liquidity'") &&
  v2Js.includes("mcap: 'Mkt Cap'") &&
  v2Js.includes("var TIMEFRAME_LABELS = { '24h': '24h', '7d': '7D', '30d': '30D'") &&
  v2Js.includes("if (record.selectedPriceConfidence !== 'good') return null") &&
  v2Js.includes("if (timeframe === '7d')") &&
  v2Js.includes("if (timeframe === '30d')") &&
  v2Js.includes('function metricAllowed(metric)') &&
  v2Js.includes('function timeframeAllowed(timeframe)') &&
  v2Js.includes("mcap: true") &&
  v2Js.includes("'7d': false") &&
  v2Js.includes("'30d': false"));
ok('waxonedge.html exposes Liquidity scanner metric control when liquidity mode exists',
  html.includes('data-woe-metric="liquidity"') &&
  html.includes('>Liquidity</button>'));
ok('waxonedge.html exposes required scanner metric controls by default',
  html.includes('data-woe-metric="mcap"') &&
  html.includes('>Market Cap</button>') &&
  !html.includes('data-woe-capability="market_cap" hidden') &&
  html.includes('data-woe-metric="price"') &&
  html.includes('data-woe-metric="volume"') &&
  html.includes('data-woe-metric="tvl"') &&
  html.includes('data-woe-metric="liquidity"') &&
  html.includes('data-woe-timeframe="7d"') &&
  html.includes('data-woe-capability="volume_7d" hidden') &&
  html.includes('data-woe-timeframe="30d"') &&
  html.includes('data-woe-capability="volume_30d" hidden'));
ok('waxonedge-bubbles-v2.js keeps metric availability honest with selected-metric sizing',
  v2Js.includes('return change != null ? Math.abs(change) : null') &&
  /if\s*\(\s*metric\s*===\s*'tvl'\s*\)\s*\{[\s\S]*if\s*\(\s*record\.tvlConfidence\s*!==\s*'good'\s*\)\s*return\s+null;[\s\S]*record\.bubbleTvlUsd[\s\S]*record\.bubbleTvlWax[\s\S]*return\s+record\.tvlUsd\s*!=\s*null\s*\?\s*record\.tvlUsd\s*:\s*record\.tvlWax\s*;[\s\S]*\}/.test(v2Js) &&
  /if\s*\(\s*metric\s*===\s*'liquidity'\s*\)\s*\{[\s\S]*if\s*\(\s*record\.liquidityConfidence\s*!==\s*'good'\s*\)\s*return\s+null;[\s\S]*return\s+record\.graphLiquidityWax;[\s\S]*\}/.test(v2Js) &&
  /if\s*\(\s*metric\s*===\s*'mcap'\s*\)\s*\{[\s\S]*if\s*\(\s*record\.marketCapConfidence\s*!==\s*'good'\s*\)\s*return\s+null;[\s\S]*return\s+record\.marketCapWax;[\s\S]*\}/.test(v2Js) &&
  v2Js.includes('metricCount < records.length') &&
  v2Js.includes("with ' + METRIC_LABELS[state.metric] + ' data") &&
  v2Js.includes('blendedMarketScore(record)') &&
  /function computeRadii[\s\S]*valueForMetric\(record, metric, state\.timeframe\)/.test(v2Js) &&
  !v2Js.includes('record.tvlUsd || record.liquidityUsd') &&
  !v2Js.includes('record.tvlWax || record.liquidityWax') &&
  !v2Js.includes('if (record.change24 == null) record.change24 = asNum(pair.change_24h)') &&
  !v2Js.includes('if (record.liquidityWax == null') &&
  !v2Js.includes('if (record.volume24Wax == null') &&
  !v2Js.includes('record.volume24Usd || record.volume24Wax || record.liquidityUsd || record.liquidityWax || record.indexedPairCount') &&
  !v2Js.includes('record.fdvUsd || record.marketCapWax') &&
  !v2Js.includes(" + ' FDV'"));
ok('waxonedge-bubbles-v2.js uses organic page-wide WAX Galaxy layout instead of rows or columns',
  v2Js.includes('function seededUnit(seed)') &&
  v2Js.includes('var golden = Math.PI * (3 - Math.sqrt(5))') &&
  v2Js.includes('var ring = Math.sqrt((index + 0.62) / Math.max(count, 1))') &&
  v2Js.includes('function layoutPosition(index, count, width, height, radius)') &&
  v2Js.includes('node.homeX = position.x') &&
  v2Js.includes('node.homeY = position.y') &&
  !v2Js.includes('var cols = Math.max') &&
  !v2Js.includes('var cellLimit =') &&
  !v2Js.includes('for (var gx = 0; gx < width; gx += grid)') &&
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
ok('waxonedge-bubbles-v2.js selects featured tokens using multi-DEX aggregate fields',
  featuredJs.includes('window.WAXONEDGE_FEATURED_TOKENS = [') &&
  v2Js.includes('selected_price_wax') &&
  v2Js.includes('selected_price_usd') &&
  v2Js.includes('source_count') &&
  v2Js.includes('indexed_pair_count') &&
  v2Js.includes('selected_pair_source') &&
  v2Js.includes('source_keys') &&
  v2Js.includes('return base.map(function (record, index)'));
ok('WaxOnEdge keeps missing 7d/30d/candle data honest instead of fake',
  v2Js.includes('No indexed 7D volume') &&
  v2Js.includes('No indexed 30D volume') &&
  v2Js.includes('history building from indexed snapshots') &&
  js.includes('Indexed candles not available yet for this pair') &&
  js.includes('Pair proof is available below') &&
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
  v2Js.includes('record.displaySymbol') &&
  v2Js.includes('record.symbol') &&
  v2Js.includes('record.contract') &&
  v2Js.includes('record.selectedSource') &&
  v2Js.includes('record.strongestPairLabel') &&
  v2Js.includes('record.sources.join'));
ok('WaxOnEdge featured-token allowlist is defined in one shared config file',
  featuredJs.includes('window.WAXONEDGE_FEATURED_TOKENS = [') &&
  featuredJs.includes("['AIGOD', 'aigodtokenwx', 'AIGOD']") &&
  featuredJs.includes("['WAXP', 'eosio.token', 'WAX']") &&
  !js.includes("['AIGOD', 'aigodtokenwx', 'AIGOD']") &&
  !v2Js.includes("['AIGOD', 'aigodtokenwx', 'AIGOD']") &&
  !js.includes("['WAXP', 'eosio.token', 'WAX']") &&
  !v2Js.includes("['WAXP', 'eosio.token', 'WAX']"));
ok('waxonedge-bubbles-v2.js renders backend graph tokens with shared featured labels when available',
  v2Js.includes('Array.isArray(window.WAXONEDGE_FEATURED_TOKENS)') &&
  v2Js.includes('? window.WAXONEDGE_FEATURED_TOKENS') &&
  v2Js.includes('var WAXONEDGE_FEATURED_TOKEN_MAP = WAXONEDGE_FEATURED_TOKENS.reduce') &&
  v2Js.includes('var featured = WAXONEDGE_FEATURED_TOKEN_MAP[key]') &&
  v2Js.includes('if (!key) return;') &&
  v2Js.includes('displaySymbol: featured ? featured.label : symbol') &&
  v2Js.includes('return Object.keys(byKey).map(function (key)') &&
  !v2Js.includes('if (!key || !featured) return;') &&
  !v2Js.includes("console.debug('missing_featured_token', featured.key)") &&
  !v2Js.includes('var TOP_LIMIT = 100') &&
  !v2Js.includes('base.slice(0, TOP_LIMIT)'));
ok('waxonedge-bubbles-v2.js renders only backend-marked direct WAXCASH bubble tokens',
  v2Js.includes('var visibleBubbleKeys = {};') &&
  v2Js.includes('if (token.visible_in_waxcash_bubbles !== true) return;') &&
  v2Js.includes('visibleBubbleKeys[key] = true;') &&
  v2Js.includes('visibleInWaxcashBubbles: true') &&
  v2Js.includes('if (!visibleBubbleKeys[key]) return;'));
ok('waxonedge-bubbles-v2.js creates pair-only graph records without requiring allowlisted pair keys',
  v2Js.includes('function pairDerivedRecord(featured, key)') &&
  v2Js.includes('var featured = WAXONEDGE_FEATURED_TOKEN_MAP[key]') &&
  !v2Js.includes('if (!featured) return;') &&
  v2Js.includes('byKey[key] = pairDerivedRecord(featured || null, key)') &&
  v2Js.includes('displaySymbol: featured && featured.label ? featured.label : symbol') &&
  v2Js.includes('computedPairCount: 0') &&
  v2Js.includes('strongestPair: null') &&
  v2Js.includes('record.searchText = tokenSearchText(record)'));
ok('waxonedge-bubbles-v2.js pair-only featured records do not fake price, TVL, liquidity, or volume',
  /function pairDerivedRecord\(featured, key\)[\s\S]*selectedPriceWax: null[\s\S]*selectedPriceUsd: null[\s\S]*volume24Wax: null[\s\S]*volume24Usd: null[\s\S]*liquidityWax: null[\s\S]*liquidityUsd: null[\s\S]*tvlWax: null[\s\S]*tvlUsd: null/.test(v2Js) &&
  /function pairDerivedRecord\(featured, key\)[\s\S]*volume7dWax: null[\s\S]*volume7dUsd: null[\s\S]*volume30dWax: null[\s\S]*volume30dUsd: null/.test(v2Js));
ok('waxonedge-bubbles-v2.js keeps modes and search scoped to backend graph tokens without fake metric zeroes',
  /function rankedRecords\(\)[\s\S]*state\.records\.filter[\s\S]*record\.searchText\.indexOf\(query\)[\s\S]*base\.map/.test(v2Js) &&
  /function computeRadii[\s\S]*value == null \? 0 : Math\.abs\(value\)/.test(v2Js) &&
  v2Js.includes('No indexed TVL') &&
  v2Js.includes('No graph liquidity') &&
  v2Js.includes('No indexed volume') &&
  v2Js.includes('WAXCASH graph tokens') &&
  !v2Js.includes('Featured tokens only'));
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
  html.includes('WaxOnEdge WAX Galaxy scanner') &&
  !html.includes('WaxOnEdge AntBubbles-style scanner') &&
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
  v2Js.includes('node.collisionUntil') &&
  v2Js.includes('var collisionPulse = node.collisionUntil') &&
  v2Js.includes('ctx.createRadialGradient') &&
  v2Js.includes('ctx.strokeText(symbolLabel') &&
  v2Js.includes('} else if (!showText) {') &&
  v2Js.includes("record.sourceCount + ' src'") &&
  v2Js.includes('bubbleCanvasCache.get(record.id)') &&
  !/function applyLiveTokenUpdate[\s\S]*?bubbleCanvasCache\.delete\(record\.id\)[\s\S]*?function refreshLiveTargetRadii/.test(v2Js));
ok('waxonedge-bubbles-v2.js uses selected metric and blended base score for bubble sizing',
  v2Js.includes('function blendedMarketScore') &&
  v2Js.includes('function reweightedScore') &&
  v2Js.includes('function metricEmphasis') &&
  v2Js.includes('record.baseMarketScore = score') &&
  v2Js.includes('liquidityWax') &&
  v2Js.includes('volume24Wax') &&
  v2Js.includes('marketCapWax') &&
  v2Js.includes('indexedPairCount') &&
  /function computeRadii[\s\S]*valueForMetric\(record, metric, state\.timeframe\)/.test(v2Js));
ok('waxonedge-bubbles-v2.js adds live WAX Galaxy reactions without camera jumps',
  !html.includes('id="woe-ab-live-feed"') &&
  v2Js.includes('id="woe-ab-live-feed" class="woe-ab-live-feed"') &&
  v2Js.includes('function addLiveFeed') &&
  v2Js.includes('function updateCamera') &&
  v2Js.includes('camera.offsetX = 0') &&
  v2Js.includes('function sceneBounds(width, height, radius)') &&
  v2Js.includes('function clampNodeToBounds(node, width, height)') &&
  v2Js.includes('driftPhaseX') &&
  v2Js.includes('driftAngle') &&
  v2Js.includes('movementEvent') &&
  v2Js.includes('node.vx *= 0.965') &&
  v2Js.includes("displayValueForMetric(record, 'volume', '24h')") &&
  v2Js.includes('function displayValueForMetric(record, metric, timeframeOverride)') &&
  v2Js.includes('var oldTimeframe = state.timeframe') &&
  v2Js.includes('} finally {') &&
  !v2Js.includes('state.camera.focusX = currentNode.x') &&
  !v2Js.includes('state.camera.focusY = currentNode.y') &&
  !v2Js.includes('record.nodeX || 0') &&
  !v2Js.includes('record.nodeY || 0') &&
  v2Js.includes('function marketWeather') &&
  v2Js.includes('record.recentUntil') &&
  v2Js.includes('record.volumeSpikeUntil') &&
  v2Js.includes('Whale/high-volume update detected') &&
  v2Js.includes('indexed snapshot data') &&
  v2Js.includes('updated from WaxOnEdge snapshots') &&
  v2Js.includes('safeTimeLabel') &&
  !v2Js.includes('Invalid Date'));

const movementEventSection = (v2Js.match(/var MOVEMENT_EVENT_TABLE = \[([\s\S]*?)\];/) || [null, ''])[1];
const movementMessageSection = (v2Js.match(/function movementEventMessage[\s\S]*?function pushShockwave/) || [''])[0];
ok('waxonedge-bubbles-v2.js includes visual-only 1-100 random movement event table',
  v2Js.includes('var MOVEMENT_EVENT_TABLE = [') &&
  v2Js.includes("min: 1, max: 45, event: 'normal_drift'") &&
  v2Js.includes("min: 46, max: 60, event: 'soft_bounce'") &&
  v2Js.includes("min: 61, max: 72, event: 'orbit_wobble'") &&
  v2Js.includes("min: 73, max: 82, event: 'pulse_drift'") &&
  v2Js.includes("min: 83, max: 90, event: 'magnetic_repel'") &&
  v2Js.includes("min: 91, max: 95, event: 'whale_pulse'") &&
  v2Js.includes("min: 96, max: 98, event: 'shockwave'") &&
  v2Js.includes("min: 99, max: 99, event: 'bonus_surge'") &&
  v2Js.includes("min: 100, max: 100, event: 'mega_event'") &&
  v2Js.includes('function rollMovementEvent') &&
  v2Js.includes('6000 + seededUnit') &&
  v2Js.includes('* 8000') &&
  v2Js.includes('movementRoll') &&
  v2Js.includes('movementEvent') &&
  v2Js.includes('eventUntil') &&
  v2Js.includes('driftAngle') &&
  v2Js.includes('driftSpeed') &&
  v2Js.includes('shockwaveUntil') &&
  v2Js.includes('lastCollisionAt') &&
  v2Js.includes('nearbyRepelUntil'));
ok('waxonedge movement events are visual-only and avoid prize/trading language',
  movementEventSection.includes('bonus_surge') &&
  movementEventSection.includes('mega_event') &&
  movementMessageSection.includes('Bonus surge visual') &&
  movementMessageSection.includes('Mega visual event') &&
  !/wallet|trading|trade|swap|win|wins|prize|payout|jackpot/i.test(movementEventSection + movementMessageSection));
ok('waxonedge-bubbles-v2.js pauses animation when hidden and respects reduced motion',
  v2Js.includes("window.matchMedia('(prefers-reduced-motion: reduce)'") &&
  v2Js.includes('function shouldAnimate()') &&
  v2Js.includes('!document.hidden && !prefersReducedMotion()') &&
  v2Js.includes('if (document.hidden) return') &&
  v2Js.includes('document.addEventListener(\'visibilitychange\'') &&
  v2Js.includes('reducedMotionQuery.addEventListener'));
ok('waxonedge-bubbles-v2.js keeps WAX price meta honest',
  v2Js.includes('WAX price not indexed') &&
  v2Js.includes('Connecting to WaxOnEdge indexer') &&
  v2Js.includes('WAX price from ') &&
  v2Js.includes('data.summary.wax_price_usd') &&
  !v2Js.includes('Indexed from Alcor, Taco, Nefty, BOX'));
ok('waxonedge-bubbles-v2.js labels snapshot polling honestly instead of fake streaming live status',
  v2Js.includes("state.live.transport === 'snapshot-polling' && state.connected") &&
  v2Js.includes("'SYNCED 10s'") &&
  v2Js.includes("'SNAPSHOT POLLING'") &&
  v2Js.includes("state.live.transport === 'sse' && state.connected") &&
  v2Js.includes("'INDEXED STREAM'") &&
  !v2Js.includes("text.textContent = state.connected ? 'LIVE' : 'CONNECTING'"));

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
ok('waxonedge.js blocks weak price, liquidity, and TVL from bubble values',
  js.includes("if (record.selectedPriceConfidence !== 'good') return null") &&
  js.includes("if (record.liquidityConfidence !== 'good') return null") &&
  js.includes("if (record.tvlConfidence !== 'good') return null") &&
  js.includes("if (confidence === 'weak') return 'Proof weak'") &&
  js.includes('guardedDualMetric(record,'));
ok('waxonedge.js preserves real zero values in metric fallbacks',
  js.includes("var liquidity = metricValueForToken(record, 'liquidity');") &&
  js.includes("return liquidity != null ? liquidity : metricValueForToken(record, 'tvl');") &&
  js.includes('record.selectedPriceWax != null ? record.selectedPriceWax : record.systemPrice') &&
  js.includes('record.selectedPriceUsd != null ? record.selectedPriceUsd : record.usdPrice') &&
  !js.includes('record.selectedPriceWax || record.systemPrice') &&
  !js.includes('record.selectedPriceUsd || record.usdPrice'));
ok('waxonedge-bubbles-v2.js blocks weak price, liquidity, and TVL from sizing/display',
  v2Js.includes("if (record.selectedPriceConfidence !== 'good') return null") &&
  v2Js.includes("if (record.liquidityConfidence !== 'good') return null") &&
  v2Js.includes("if (record.tvlConfidence !== 'good') return null") &&
  v2Js.includes("if (record.selectedPriceConfidence === 'weak') return 'Proof weak'") &&
  v2Js.includes("if (record.liquidityConfidence === 'weak') return 'Proof weak'") &&
  v2Js.includes("record.liquidityConfidence === 'good' ? (toUsd(") &&
  v2Js.includes('record.graphLiquidityWax'));
ok('waxonedge-bubbles-v2.js reads bootstrap confidence fields for proof-backed metric data',
  v2Js.includes("selectedPriceConfidence: metricConfidenceFrom(token, 'selected_price')") &&
  v2Js.includes("liquidityConfidence: metricConfidenceFrom(token, 'liquidity')") &&
  v2Js.includes("tvlConfidence: metricConfidenceFrom(token, 'tvl')") &&
  v2Js.includes("marketCapConfidence: metricConfidenceFrom(token, 'market_cap')") &&
  v2Js.includes("fdvConfidence: metricConfidenceFrom(token, 'fdv')") &&
  v2Js.includes("metricReasonCodes: parseReasonCodes(token.metric_reason_codes || token.reason_codes || token.unavailable_reasons)"));
ok('waxonedge-bubbles-v2.js preserves confidence fields from live updates without erasing omitted values',
  v2Js.includes('function normalizeConfidence(value)') &&
  v2Js.includes("if (direct) return normalizeConfidence(direct) || 'unavailable';") &&
  v2Js.includes("if (text === 'good' || text === 'weak' || text === 'unavailable') return text;") &&
  v2Js.includes("if (text === 'live' || text === 'true' || text === '1') return 'good';") &&
  v2Js.includes("if (text === 'false' || text === '0' || text === 'missing' || text === 'not_indexed') return 'unavailable';") &&
  v2Js.includes("return '';") &&
  v2Js.includes("['selectedPriceConfidence', ['selected_price_confidence', 'selectedPriceConfidence']]") &&
  v2Js.includes("['liquidityConfidence', ['liquidity_confidence', 'liquidityConfidence']]") &&
  v2Js.includes("['tvlConfidence', ['tvl_confidence', 'tvlConfidence']]") &&
  v2Js.includes("if (!Object.prototype.hasOwnProperty.call(update, keys[i])) continue;") &&
  v2Js.includes('var next = normalizeConfidence(update[keys[i]]);') &&
  v2Js.includes('if (next && record[prop] !== next)') &&
  v2Js.includes("Object.prototype.hasOwnProperty.call(update, 'metric_reason_codes')") &&
  !/applyLiveTokenUpdate[\s\S]*selectedPriceConfidence\s*=\s*['"]unavailable['"]/.test(v2Js));
ok('waxonedge-bubbles-v2.js clears stale live values only when explicit null arrives with weak or unavailable confidence',
  v2Js.includes('function assignLiveMetricNumber(record, prop, update, keys, confidence)') &&
  v2Js.includes("if ((confidence === 'weak' || confidence === 'unavailable') && record[prop] != null)") &&
  v2Js.includes("assignLiveMetricNumber(record, 'selectedPriceWax', update, ['price_wax', 'selected_price_wax'], nextPriceConfidence)") &&
  v2Js.includes("assignLiveMetricNumber(record, 'selectedPriceUsd', update, ['price_usd', 'selected_price_usd'], nextPriceConfidence)") &&
  v2Js.includes("assignLiveMetricNumber(record, 'tvlWax', update, ['tvl_wax'], nextTvlConfidence)") &&
  v2Js.includes("assignLiveMetricNumber(record, 'tvlUsd', update, ['tvl_usd'], nextTvlConfidence)") &&
  v2Js.includes("assignLiveMetricNumber(record, 'liquidityWax', update, ['liquidity_wax'], nextLiquidityConfidence)") &&
  v2Js.includes("assignLiveMetricNumber(record, 'liquidityUsd', update, ['liquidity_usd'], nextLiquidityConfidence)"));
ok('waxonedge-bubbles-v2.js preserves zero token metrics during normalization',
  v2Js.includes('selectedPriceWax: asNum(token.selected_price_wax != null ? token.selected_price_wax : token.price_wax)') &&
  v2Js.includes('selectedPriceUsd: asNum(token.selected_price_usd != null ? token.selected_price_usd : token.price_usd)') &&
  v2Js.includes('volume24Wax: asNum(token.volume_24h_wax != null ? token.volume_24h_wax : token.volume_24h)') &&
  !v2Js.includes('selectedPriceWax: asNum(token.selected_price_wax || token.price_wax)') &&
  !v2Js.includes('selectedPriceUsd: asNum(token.selected_price_usd || token.price_usd)') &&
  !v2Js.includes('volume24Wax: asNum(token.volume_24h_wax || token.volume_24h)'));
ok('waxonedge-bubbles-v2.js direct confidence normalization is strict',
  v2Js.includes("if (text === 'live' || text === 'true' || text === '1') return 'good';") &&
  v2Js.includes("if (text === 'false' || text === '0' || text === 'missing' || text === 'not_indexed') return 'unavailable';") &&
  v2Js.includes("return '';") &&
  !v2Js.includes('return String(direct).toLowerCase();'));
ok('waxonedge-bubbles-v2.js parses reason codes without source-label normalization',
  v2Js.includes('function parseReasonCodes(value)') &&
  v2Js.includes('return Object.keys(value).filter(function (key) { return !!value[key]; });') &&
  v2Js.includes('var reasonCodes = parseReasonCodes(update.metric_reason_codes || update.reason_codes || update.unavailable_reasons)') &&
  !v2Js.includes('var reasonCodes = parseSourceKeys(update.metric_reason_codes || update.reason_codes || update.unavailable_reasons)'));
ok('waxonedge-bubbles-v2.js keeps proof-backed price, liquidity, and TVL data countable',
  /function valueForMetric[\s\S]*if \(metric === 'price'\)[\s\S]*record\.selectedPriceConfidence !== 'good'[\s\S]*return record\.selectedPriceUsd != null \? record\.selectedPriceUsd : record\.selectedPriceWax/.test(v2Js) &&
  /function valueForMetric[\s\S]*if \(metric === 'tvl'\)[\s\S]*record\.tvlConfidence !== 'good'[\s\S]*record\.bubbleTvlUsd[\s\S]*record\.bubbleSuspiciousLiquidityPairCount[\s\S]*return record\.tvlUsd != null \? record\.tvlUsd : record\.tvlWax/.test(v2Js) &&
  /function valueForMetric[\s\S]*if \(metric === 'liquidity'\)[\s\S]*record\.liquidityConfidence !== 'good'[\s\S]*return record\.graphLiquidityWax/.test(v2Js));
ok('waxonedge-bubbles-v2.js exposes market cap mode only through proof-backed capability and values',
  v2Js.includes("mcap: true") &&
  /if \(metric === 'mcap'\) return capabilityEnabled\(\['market_cap', 'mcap'\], DEFAULT_METRIC_ALLOWED\.mcap\)/.test(v2Js) &&
  /function valueForMetric[\s\S]*if \(metric === 'mcap'\)[\s\S]*record\.marketCapConfidence !== 'good'[\s\S]*return null[\s\S]*return record\.marketCapWax/.test(v2Js) &&
  /function displayValue[\s\S]*if \(state\.metric === 'mcap'\)[\s\S]*record\.marketCapConfidence === 'weak'[\s\S]*record\.marketCapConfidence !== 'good'[\s\S]*No verified market cap[\s\S]*record\.marketCapUsd != null[\s\S]*record\.marketCapWax != null[\s\S]*WAX mcap/.test(v2Js) &&
  v2Js.includes("['marketCapConfidence', ['market_cap_confidence', 'marketCapConfidence']]") &&
  v2Js.includes("assignLiveMetricNumber(record, 'marketCapWax', update, ['market_cap_wax'], nextMarketCapConfidence)") &&
  v2Js.includes("assignLiveMetricNumber(record, 'marketCapUsd', update, ['market_cap_usd'], nextMarketCapConfidence)") &&
  !v2Js.includes("if (metric === 'mcap') return false;") &&
  !v2Js.includes('No indexed market cap') &&
  !/function valueForMetric[\s\S]*if \(metric === 'mcap'\) return record\.marketCap/.test(v2Js));
ok('waxonedge-bubbles-v2.js live token updates immediately resize market-cap bubbles from market_cap_wax',
  v2Js.includes("assignLiveMetricNumber(record, 'marketCapWax', update, ['market_cap_wax'], nextMarketCapConfidence)") &&
  v2Js.includes('function refreshLiveTargetRadii()') &&
  /function refreshLiveTargetRadii\(\)[\s\S]*computeRadii\(state\.visible[\s\S]*node\.targetRadius = radii\[index\]/.test(v2Js) &&
  /function applyLiveSnapshot\(snapshot\)[\s\S]*applyLiveTokenUpdate\(record, update\)[\s\S]*refreshLiveTargetRadii\(\)[\s\S]*syncNodes\(\)/.test(v2Js) &&
  /function valueForMetric[\s\S]*if \(metric === 'mcap'\)[\s\S]*return record\.marketCapWax/.test(v2Js));
{
  const mcapBranchStart = v2Js.indexOf("if (state.metric === 'mcap') {");
  const mcapBranchEnd = v2Js.indexOf("return 'Not indexed';", mcapBranchStart);
  const displayMcapBranch = mcapBranchStart >= 0 && mcapBranchEnd > mcapBranchStart
    ? v2Js.slice(mcapBranchStart, mcapBranchEnd)
    : '';
  ok('waxonedge-bubbles-v2.js mcap display falls back to WAX and has no duplicate unreachable confidence branch',
    displayMcapBranch.includes("if (record.marketCapUsd != null) return '$' + fmtNum(record.marketCapUsd) + ' mcap';") &&
    displayMcapBranch.includes("if (record.marketCapWax != null) return fmtNum(record.marketCapWax) + ' WAX mcap';") &&
    !displayMcapBranch.includes('No indexed market cap') &&
    (displayMcapBranch.match(/record\.marketCapConfidence !== 'good'/g) || []).length === 1);
}
ok('waxonedge-bubbles-v2.js excludes unproofed market cap and FDV from blended score',
  /function blendedMarketScore\(record\)[\s\S]*?function metricEmphasis/.test(v2Js) &&
  /function blendedMarketScore\(record\)[\s\S]*?var volume = toUsd\(record\.volume24Wax, record\.volume24Usd\);[\s\S]*?var price = record\.selectedPriceConfidence === 'good'[\s\S]*?function metricEmphasis/.test(v2Js) &&
  !/function blendedMarketScore\(record\)[\s\S]*?marketCap[\s\S]*?function metricEmphasis/.test(v2Js) &&
  !/function blendedMarketScore\(record\)[\s\S]*?fdv[\s\S]*?function metricEmphasis/.test(v2Js) &&
  !/function blendedMarketScore\(record\)[\s\S]*?var cap[\s\S]*?function metricEmphasis/.test(v2Js));
ok('waxonedge-bubbles-v2.js sizes liquidity from graph liquidity and TVL from bubble-safe metrics',
  v2Js.includes('if (record.bubbleTvlUsd != null) return record.bubbleTvlUsd;') &&
  v2Js.includes('if (record.bubbleTvlWax != null) return record.bubbleTvlWax;') &&
  v2Js.includes("if ((record.bubbleSuspiciousLiquidityPairCount || 0) > 0) return null;") &&
  v2Js.includes('return record.graphLiquidityWax;') &&
  v2Js.includes('graphLiquidityWax: asNum(token.graph_liquidity_wax)') &&
  v2Js.includes('bubbleSuspiciousLiquidityPairCount: asNum(token.bubble_suspicious_liquidity_pair_count)') &&
  v2Js.includes('record.bubbleTvlWax != null ? record.bubbleTvlWax : record.tvlWax') &&
  v2Js.includes("changed = assignLiveMetricNumber(record, 'graphLiquidityWax', update, ['graph_liquidity_wax'], nextLiquidityConfidence) || changed;") &&
  v2Js.includes("changed = assignLiveNumber(record, 'bubbleSuspiciousLiquidityPairCount', update.bubble_suspicious_liquidity_pair_count) || changed;"));
ok('waxonedge-bubbles-v2.js does not size liquidity mode from direct WAXCASH pair fields',
  !/function valueForMetric\(record, metric, timeframe\)[\s\S]*?if \(metric === 'liquidity'\)[\s\S]*?direct_waxcash_pair_liquidity_wax[\s\S]*?if \(metric === 'mcap'\)/.test(v2Js) &&
  !/function valueForMetric\(record, metric, timeframe\)[\s\S]*?if \(metric === 'liquidity'\)[\s\S]*?directWaxcashPairLiquidityWax[\s\S]*?if \(metric === 'mcap'\)/.test(v2Js));
ok('waxonedge-bubbles-v2.js footer uses clean gain/loss labels',
  v2Js.includes("'<span class=\"woe-ab-up\">Up '") &&
  v2Js.includes("'<span class=\"woe-ab-down\">Down '") &&
  !v2Js.includes("'<span class=\"woe-ab-up\">? '") &&
  !v2Js.includes("'<span class=\"woe-ab-down\">? '"));
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
ok('waxonedge.js renders only featured token records in legacy scanner paths',
  js.includes('Array.isArray(window.WAXONEDGE_FEATURED_TOKENS)') &&
  js.includes('? window.WAXONEDGE_FEATURED_TOKENS') &&
  js.includes('function featuredTokenRecords()') &&
  js.includes('state.tokenMap && state.tokenMap.byKey ? state.tokenMap.byKey[featured.key] : null') &&
  js.includes('var tokens = getRankedTokenRecords();') &&
  js.includes('var rows = tokensData.map(function (record, index)') &&
  js.includes('state.missingFeaturedLogged[featured.key]') &&
  js.includes("console.debug('missing_featured_token', featured.key)") &&
  !js.includes('getRankedTokenRecords().slice(0, 99)') &&
  !js.includes('tokensData.slice(0, 250)'));
ok('waxonedge.js mapBackendToken passes metric confidence and proof fields through',
  js.includes('selected_price_confidence: row.selected_price_confidence') &&
  js.includes('liquidity_confidence: row.liquidity_confidence') &&
  js.includes('tvl_confidence: row.tvl_confidence') &&
  js.includes('metric_status: row.metric_status') &&
  js.includes('metric_reason_codes: row.metric_reason_codes') &&
  js.includes('unavailable_reasons: row.unavailable_reasons'));
ok('waxonedge.js creates pair-only featured records from exact allowlisted pair keys',
  js.includes('function addPairDerivedFeaturedTokenRecords(tokenMap, pairsData)') &&
  js.includes('var featured = WAXONEDGE_FEATURED_TOKEN_MAP[key]') &&
  js.includes('if (!featured || tokenMap.byKey[key]) return;') &&
  js.includes('tokenMap.byKey[key] = pairDerivedFeaturedTokenRecord(') &&
  !/pairDerivedFeaturedTokenRecord[\s\S]*map\.bySymbol/.test(js));
ok('waxonedge.js pair-only featured records do not fake price, TVL, liquidity, or volume',
  /function pairDerivedFeaturedTokenRecord\(featured, key, pairCount, sourceKeys, strongestPair\)[\s\S]*systemPrice: null[\s\S]*usdPrice: null[\s\S]*selectedPriceWax: null[\s\S]*selectedPriceUsd: null[\s\S]*volume24: null[\s\S]*volume24Wax: null[\s\S]*volume24Usd: null[\s\S]*liquidityWax: null[\s\S]*liquidityUsd: null[\s\S]*tvlWax: null[\s\S]*tvlUsd: null/.test(js) &&
  /function pairDerivedFeaturedTokenRecord\(featured, key, pairCount, sourceKeys, strongestPair\)[\s\S]*sourceKeys: sourceKeys[\s\S]*strongestPair: strongestPair \|\| null/.test(js));
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
ok('token analytics respects backend proof before rendering dead metrics',
  js.includes('function metricStatusLive(stats, key)') &&
  js.includes('function hasRealHolderSnapshot(stats)') &&
  js.includes("var hasMarketCap = metricStatusLive(stats, 'market_cap')") &&
  js.includes("var hasFdv = metricStatusLive(stats, 'fdv')") &&
  !js.includes("var hasMarketCap = backendFlag(stats.has_market_cap) || metricStatusLive(stats, 'market_cap')") &&
  !js.includes("var hasFdv = backendFlag(stats.has_fdv) || metricStatusLive(stats, 'fdv') || fdvWax != null || fdvUsd != null") &&
  js.includes('var hasHolderCount = hasRealHolderSnapshot(stats) && stats.holder_count != null') &&
  js.includes("var hasVolume7d = metricStatusLive(stats, 'volume_7d') && volume7d != null") &&
  js.includes("var hasVolume30d = metricStatusLive(stats, 'volume_30d') && volume30d != null") &&
  js.includes("statsHtml += statRow('Market cap', hasMarketCap && (marketCapWax != null || marketCapUsd != null)") &&
  js.includes("statsHtml += statRow('7d volume', hasVolume7d") &&
  js.includes("statsHtml += statRow('30d volume', hasVolume30d") &&
  !js.includes('marketCapWax != null || marketCapUsd != null\\n      ? escHtml(formatDualMetric(marketCapWax, marketCapUsd))'));

ok('waxonedge.js has exactly one pickDefaultSelection definition',
  countMatches(js, /function pickDefaultSelection\s*\(/g) === 1);
ok('waxonedge.js has exactly one renderMatrix definition',
  countMatches(js, /function renderMatrix\s*\(/g) === 1);
ok('waxonedge.js has exactly one renderTokens definition',
  countMatches(js, /function renderTokens\s*\(/g) === 1);
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
  v2Js.includes('function isValidIsoTimestamp') &&
  v2Js.includes("if (!isValidIsoTimestamp(value)) return ''") &&
  v2Js.includes("safeTimeLabel(state.lastUpdated) || 'Waiting for sync'") &&
  v2Js.includes('function latestTokenUpdatedAt(tokens)') &&
  v2Js.includes('state.live.lastEventAt') &&
  v2Js.includes('function advanceLiveDisplayTimestamp(value)') &&
  v2Js.includes('function setBackendLiveCursor(nextCursor)') &&
  v2Js.includes('state.live.cursorFromBackend = true') &&
  v2Js.includes('if (nextCursor) setBackendLiveCursor(nextCursor)') &&
  v2Js.includes('state.live.cursor && state.live.cursorFromBackend') &&
  v2Js.includes('setBackendLiveCursor(loadedData.next_cursor)') &&
  v2Js.includes('isValidIsoTimestamp(loadedData.generated_at)') &&
  !v2Js.includes('state.lastUpdated = state.live.cursor') &&
  !v2Js.includes('state.live.cursor = state.lastUpdated') &&
  !v2Js.includes('advanceLiveFallbackCursor') &&
  !v2Js.includes('loadedData.updated_at || loadedData.generated_at || loadedData.next_cursor') &&
  !v2Js.includes('safeTimeLabel(data.next_cursor') &&
  !v2Js.includes('safeTimeLabel(snapshot.next_cursor') &&
  !v2Js.includes('safeTimeLabel(loadedData.next_cursor') &&
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
ok('token analytics hides the public holder panel until real indexed holder data exists',
  !tokenHtml.includes('id="woe-holders-panel"') &&
  !tokenHtml.includes('Holder Panel') &&
  !tokenHtml.includes('Backend holder indexing') &&
  js.includes('Holder indexing not enabled yet') &&
  js.includes('No fake holder rows are shown') &&
  !js.includes('woe-holder-result-card'));
ok('token analytics preserves all-pairs WAX valuation model copy',
  js.includes('All-pairs WAX valuation sums usable indexed pair value across supported DEXs where a trusted WAX route exists') &&
  js.includes('All-pairs WAX valuation is partial when a pair cannot be valued through a trusted indexed WAX route') &&
  v2Js.includes('WAXCASH graph tokens'));

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

ok('waxonedge-bubbles-v2.css includes cyberpunk WAX Galaxy shell styling',
  v2Css.includes('.woe-antbubbles-page') &&
  v2Css.includes('.woe-ab-topbar') &&
  v2Css.includes('#00e5ff') &&
  v2Css.includes('#ff2bd6') &&
  v2Css.includes('#39ff88') &&
  v2Css.includes('.woe-ab-canvas') &&
  v2Css.includes('.woe-ab-stats'));
ok('waxonedge-bubbles-v2.css includes live feed and tooltip styling without modal chrome',
  v2Css.includes('.woe-ab-live-feed') &&
  v2Css.includes('.woe-ab-feed-item') &&
  v2Css.includes('.woe-ab-tooltip') &&
  v2Css.includes('.woe-ab-chart-empty') &&
  !v2Css.includes('.woe-ab-modal-panel') &&
  !v2Css.includes('.woe-ab-open-analytics'));
ok('waxonedge-bubbles-v2.css renders a page-wide transparent galaxy instead of a boxed board',
  v2Css.includes('.woe-antbubbles-page::before') &&
  /\.woe-ab-board-section\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;[\s\S]*?background:\s*transparent;/.test(v2Css) &&
  /\.woe-antbubbles-page \.woe-bubble-board,\s*\n\.woe-ab-canvas\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?width:\s*100vw;[\s\S]*?height:\s*100vh;/.test(v2Css) &&
  v2Css.includes('@keyframes woe-ab-ticker') &&
  v2Css.includes('animation: woe-ab-ticker 120s linear infinite') &&
  v2Css.includes('grid-template-columns: minmax(390px, auto) minmax(260px, 1fr) auto') &&
  v2Css.includes('mask-image: linear-gradient') &&
  /body\.woe-antbubbles-page\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*color:\s*#fff;[^}]*\}/.test(v2Css) &&
  !/body\.woe-antbubbles-page\s*\{[^}]*background:/.test(v2Css) &&
  v2Css.includes('background: transparent;') &&
  !v2Css.includes('#020008') &&
  !v2Js.includes('ctx.fillRect(0, 0, width, height)') &&
  !v2Js.includes('ctx.createRadialGradient(width * 0.5') &&
  !v2Css.includes('right: 14px;\n  bottom: 48px') &&
  !v2Css.includes('display: grid;\n  gap: 7px'));
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
