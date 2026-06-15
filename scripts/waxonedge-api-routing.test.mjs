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

console.log('\nwaxonedge-api-routing.test: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
