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
  tokenAnalyticsPageJs.includes('return base + TOKEN_PAGE_PATH;'));
ok('WUF token analytics does not fetch same-origin /api directly',
  !tokenAnalyticsPageJs.includes("fetch('/api/waxonedge") &&
  !tokenAnalyticsPageJs.includes('fetch("/api/waxonedge') &&
  !tokenAnalyticsPageJs.includes("var ENDPOINT = '/api/waxonedge"));
ok('wuffi.html cache-busts the WUF token analytics runtime',
  /src="\/js\/token-analytics-page\.js\?v=[^"]+"/.test(wuffiHtml));
ok('WUF generic table renders selected pair, DEX logos, token icons, native volume fallback, and proof tooltips',
  tokenAnalyticsPageJs.includes('token-selected-pair') &&
  tokenAnalyticsPageJs.includes('token-dex-logo') &&
  tokenAnalyticsPageJs.includes('token-icon') &&
  tokenAnalyticsPageJs.includes('Native units') &&
  tokenAnalyticsPageJs.includes('token-proof') &&
  tokenAnalyticsPageJs.includes('blocked_pair_count'));

console.log('\nwaxonedge-api-routing.test: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
