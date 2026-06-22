/**
 * waxonedge-api-routing.test.mjs
 *
 * Guards the static WaxOnEdge page against drifting back to same-origin
 * /api/waxonedge calls that cannot work on GitHub Pages/custom-domain static hosting.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(ROOT, 'waxonedge.html'), 'utf8');
const wuffiHtml = readFileSync(path.join(ROOT, 'wiki/wuffi.html'), 'utf8');
const tokenAnalyticsPageJs = readFileSync(path.join(ROOT, 'js/token-analytics-page.js'), 'utf8');
const waxcashHtml = readFileSync(path.join(ROOT, 'waxcash.html'), 'utf8');
const waxonedgeBubblesJs = readFileSync(path.join(ROOT, 'js/waxonedge-bubbles-v2.js'), 'utf8');

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

const apiConfigIndex = html.indexOf('src="/js/api-config.js"');
const bubblesIndex = html.indexOf('src="/js/waxonedge-bubbles-v2.js');
const routingShimIndex = html.indexOf('function rewriteWaxOnEdgeUrl');
const wuffiApiConfigIndex = wuffiHtml.indexOf('src="/js/api-config.js"');
const wuffiAnalyticsIndex = wuffiHtml.indexOf('src="/js/token-analytics-page.js');

ok('waxonedge.html loads api-config before the bubbles runtime',
  apiConfigIndex !== -1 && bubblesIndex !== -1 && apiConfigIndex < bubblesIndex);
ok('waxonedge.html installs WaxOnEdge API routing shim before the bubbles runtime',
  routingShimIndex !== -1 && bubblesIndex !== -1 && routingShimIndex < bubblesIndex);
ok('routing shim uses configured Moonboys production API fallback',
  html.includes('api.getApiBaseInfo({ allowProductionFallback: true })') &&
  html.includes('api.PRODUCTION_BASE_URL'));
ok('routing shim only rewrites WaxOnEdge API paths',
  html.includes('var waxonedgePath = /^\\/api\\/waxonedge(?:\\/|\\?|$)/;'));
ok('routing shim rewrites fetch calls used by WaxOnEdge bootstrap/live/detail/chart requests',
  html.includes('window.fetch = function (input, init)') &&
  html.includes('return nativeFetch.call(this, rewriteWaxOnEdgeUrl(input), init);'));
ok('routing shim rewrites future EventSource stream endpoints too',
  html.includes('window.EventSource = function (url, config)') &&
  html.includes('new NativeEventSource(rewriteWaxOnEdgeUrl(String(url)), config)'));
ok('routing shim does not introduce wallet or trading UI',
  !html.includes('Connect Wallet') &&
  !html.includes('Swap') &&
  !html.includes('Add Liquidity') &&
  !html.includes('Remove Liquidity'));
ok('wuffi.html loads api-config before token analytics runtime',
  wuffiApiConfigIndex !== -1 && wuffiAnalyticsIndex !== -1 && wuffiApiConfigIndex < wuffiAnalyticsIndex);
ok('WUF token analytics resolves Worker API through MOONBOYS_API production fallback',
  tokenAnalyticsPageJs.includes('cfg.getApiBaseInfo({ allowProductionFallback: true })') &&
  tokenAnalyticsPageJs.includes("var TOKEN_PAGE_PATH = '/api/waxonedge/token-page/wuffi/WUF';") &&
  tokenAnalyticsPageJs.includes('new URL(base + TOKEN_PAGE_PATH, window.location.origin)') &&
  tokenAnalyticsPageJs.includes("url.searchParams.set('sort', pairSort);"));
ok('WUF token analytics URL builder supports absolute and relative API bases',
  tokenAnalyticsPageJs.includes('window.location.origin') &&
  new URL('https://api.example.test/api/waxonedge/token-page/wuffi/WUF', 'https://cryptomoonboys.com').toString() === 'https://api.example.test/api/waxonedge/token-page/wuffi/WUF' &&
  new URL('/api-proxy/api/waxonedge/token-page/wuffi/WUF', 'https://cryptomoonboys.com').toString() === 'https://cryptomoonboys.com/api-proxy/api/waxonedge/token-page/wuffi/WUF');
ok('WUF token analytics does not fetch same-origin /api directly',
  !tokenAnalyticsPageJs.includes("fetch('/api/waxonedge") &&
  !tokenAnalyticsPageJs.includes('fetch("/api/waxonedge') &&
  !tokenAnalyticsPageJs.includes("var ENDPOINT = '/api/waxonedge"));
ok('wuffi.html cache-busts the WUF token analytics runtime',
  wuffiHtml.includes('/js/token-analytics-page.js?v=wuf-waxcash-metrics-20260622-1'));
ok('WUF table exposes liquidity and 24h volume sort buttons',
  wuffiHtml.includes('id="wuf-sort-liquidity"') &&
  wuffiHtml.includes('data-sort="liquidity"') &&
  wuffiHtml.includes('id="wuf-sort-volume24"') &&
  wuffiHtml.includes('data-sort="volume24"') &&
  wuffiHtml.includes('aria-pressed="true"'));
ok('WUF token analytics supports liquidity and 24h volume sorting',
  tokenAnalyticsPageJs.includes("var pairSort = 'liquidity';") &&
  tokenAnalyticsPageJs.includes("url.searchParams.set('sort', pairSort);") &&
  tokenAnalyticsPageJs.includes('function setPairSort(sortKey)') &&
  tokenAnalyticsPageJs.includes('loadAnalytics();') &&
  tokenAnalyticsPageJs.includes('analyticsRequestId'));
ok('WUF generic table renders selected pair, DEX logos, token icons, native volume fallback, and clean verified liquidity badge',
  tokenAnalyticsPageJs.includes('token-selected-pair') &&
  tokenAnalyticsPageJs.includes('token-dex-logo') &&
  tokenAnalyticsPageJs.includes('token-icon') &&
  tokenAnalyticsPageJs.includes('Native units') &&
  tokenAnalyticsPageJs.includes('display_liquidity_wax') &&
  tokenAnalyticsPageJs.includes('display_liquidity_basis') &&
  tokenAnalyticsPageJs.includes('display_price') &&
  tokenAnalyticsPageJs.includes('display_change_24h') &&
  tokenAnalyticsPageJs.includes("display_' + prefix + '_wax") &&
  tokenAnalyticsPageJs.includes("display_' + prefix + '_native") &&
  tokenAnalyticsPageJs.includes('Verified liquidity') &&
  tokenAnalyticsPageJs.includes('blocked_pair_count'));
ok('WUF token analytics keeps missing metrics unavailable without treating real zero as missing',
  tokenAnalyticsPageJs.includes('function firstValue()') &&
  tokenAnalyticsPageJs.includes('function owns(obj, key)') &&
  tokenAnalyticsPageJs.includes('var hasDisplayVolume = owns(row, displayWaxKey)') &&
  tokenAnalyticsPageJs.includes("arguments[i] != null && arguments[i] !== ''") &&
  tokenAnalyticsPageJs.includes('firstValue(row && row.display_change_24h, row && row.change_24h)') &&
  tokenAnalyticsPageJs.includes('firstValue(stats.volume_24h_wax, stats.volume_24h)'));
ok('WUF public table no longer renders proof icons or internal policy text',
  !tokenAnalyticsPageJs.includes('token-proof') &&
  !tokenAnalyticsPageJs.includes("label || '?'") &&
  !tokenAnalyticsPageJs.includes("symbol || '?'") &&
  !tokenAnalyticsPageJs.includes('Large liquidity row kept because') &&
  !tokenAnalyticsPageJs.includes('WAX-direct') &&
  !tokenAnalyticsPageJs.includes('24h WAX volume proof') &&
  !tokenAnalyticsPageJs.includes('public-feed policy') &&
  !wuffiHtml.includes('token-proof'));
ok('WUF table polish markers are not added to WAXCASH page or bubble runtime',
  !waxcashHtml.includes('wuf-sort-liquidity') &&
  !waxcashHtml.includes('wuf-waxcash-metrics-20260622-1') &&
  !waxonedgeBubblesJs.includes('wuf-sort-liquidity') &&
  !waxonedgeBubblesJs.includes('wuf-waxcash-metrics-20260622-1'));

console.log('\nwaxonedge-api-routing.test: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
