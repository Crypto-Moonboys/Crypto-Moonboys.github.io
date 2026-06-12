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
ok('css/waxonedge.css exists', exists('css/waxonedge.css'));
ok('js/waxonedge.js exists', exists('js/waxonedge.js'));
ok('js/waxonedge-sources.js exists', exists('js/waxonedge-sources.js'));

const html = exists('waxonedge.html') ? read('waxonedge.html') : '';
const aliasHtml = exists('waxonedge/index.html') ? read('waxonedge/index.html') : '';
const css = exists('css/waxonedge.css') ? read('css/waxonedge.css') : '';
const js = exists('js/waxonedge.js') ? read('js/waxonedge.js') : '';
const sourcesJs = exists('js/waxonedge-sources.js') ? read('js/waxonedge-sources.js') : '';

ok('waxonedge.html references /css/waxonedge.css', html.includes('/css/waxonedge.css'));
ok('waxonedge.html references /js/waxonedge.js', html.includes('/js/waxonedge.js'));
ok('waxonedge.html references /js/waxonedge-sources.js', html.includes('/js/waxonedge-sources.js'));
ok('waxonedge clean-route alias redirects to /waxonedge.html', aliasHtml.includes('url=/waxonedge.html'));
ok('waxonedge clean-route alias preserves query-string routing', aliasHtml.includes("window.location.search || ''"));
ok('waxonedge clean-route alias preserves hash routing', aliasHtml.includes("window.location.hash || ''"));

ok('waxonedge.html includes terminal top bar', html.includes('woe-og-bar'));
ok('waxonedge.html includes bubble terminal nav labels',
  html.includes('Bubbles') && html.includes('Top 99 Tokens') && html.includes('Top Pairs') && html.includes('Token Detail'));
ok('waxonedge.html includes WAX price block', html.includes('id="woe-topbar-wax-price"'));
ok('waxonedge.html waits for live WAX price data by default', html.includes('Waiting for live data...'));
ok('waxonedge.html includes read-only terminal action area', html.includes('Read-Only') && html.includes('woe-wide-toggle'));

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
ok('waxonedge.html contains read-only badge', /Read-Only|read-only|woe-readonly-badge/.test(html));

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

ok('waxonedge-sources.js references swap.nefty contract', sourcesJs.includes('swap.nefty'));
ok('waxonedge-sources.js includes WaxBlock link for swap.nefty', sourcesJs.includes('waxblock.io/account/swap.nefty'));
ok('waxonedge-sources.js uses Alcor api/v2 base', sourcesJs.includes("var ALCOR_API = 'https://wax.alcor.exchange/api/v2';"));
ok('waxonedge-sources.js defines /pairs path', sourcesJs.includes("pairs: '/pairs'") || sourcesJs.includes("healthPath: '/pairs'"));
ok('waxonedge-sources.js defines /analytics/global path', sourcesJs.includes("analyticsGlobal: '/analytics/global'") || sourcesJs.includes("healthPath: '/analytics/global'"));
ok('waxonedge-sources.js defines /markets helper path for chart fetches', sourcesJs.includes("markets: '/markets'"));

ok('waxonedge.js calls /api/waxonedge/bootstrap before diagnostic fallback',
  js.includes("waxonedgeApi('/bootstrap')") && js.includes('loadDiagnosticFallback'));
ok('waxonedge.js keeps direct browser fetches as diagnostic fallback',
  js.includes('loadDiagnosticFallback') && js.includes('Backend bootstrap unavailable'));
ok('waxonedge.js uses configured WAX RPC fallbacks', js.includes('WAXONEDGE_WAX_RPC_FALLBACKS'));
ok('waxonedge.js performs swap.nefty ABI lookup', js.includes('get_abi') || js.includes('getAbi'));
ok('waxonedge.js includes query-string token detail state', js.includes('token=') && js.includes('contract='));
ok('waxonedge.js fetches Alcor chart candles from /markets/:id/charts for diagnostic fallback', js.includes('/charts') && js.includes('/markets'));

ok('waxonedge.html includes KPI strip', html.includes('woe-kpi-grid') && html.includes('Indexed Tokens') && html.includes('Indexed Pairs'));
ok('waxonedge.html includes source status strip', html.includes('Source Status') && html.includes('id="woe-sources-grid"'));
ok('waxonedge.html includes bubble board container', html.includes('id="woe-bubble-board"'));
ok('waxonedge.html includes top token card grid', html.includes('id="woe-token-rank-grid"'));
ok('waxonedge.html includes token detail section', html.includes('id="woe-token-detail"'));
ok('waxonedge.html includes selected token pair matrix', html.includes('id="woe-table-matrix"'));
ok('waxonedge.html includes pair detail panel', html.includes('id="woe-pair-detail-panel"'));
ok('waxonedge.html includes all-pairs matrix', html.includes('id="woe-table-pairs"'));
ok('bubble scanner is placed before token detail',
  html.indexOf('id="woe-bubble-board"') > -1 &&
  html.indexOf('id="woe-bubble-board"') < html.indexOf('id="woe-token-detail"'));

ok('waxonedge.js renders visual token bubbles', js.includes('function renderBubbles') && js.includes('woe-bubble-token'));
ok('waxonedge.js sizes bubbles from liquidity, volume, or pair count',
  js.includes('metricValueForToken') && js.includes("metric === 'volume'") && js.includes("metric === 'pairs'"));
ok('waxonedge.js colors bubbles from 24h change', js.includes('woe-bubble-up') && js.includes('woe-bubble-down'));
ok('waxonedge.js derives source badges from indexed pair rows', js.includes('function getTokenSources') && js.includes('sourceBadgesHtml'));
ok('waxonedge.js renders Top 99 Tokens', js.includes('getRankedTokenRecords().slice(0, 99)'));
ok('waxonedge.js renders global pair matrix', js.includes('function renderGlobalPairMatrix') && js.includes('woe-pairs-body'));
ok('waxonedge.js renders pair detail on row click', js.includes('function renderPairDetail') && js.includes('woe-pair-detail-link'));
ok('waxonedge.js no longer auto-selects a default token-first view',
  js.includes("return { symbol: '', contract: '', key: '' };"));

for (const label of [
  'Selected price',
  'Selected price source',
  '24h change',
  '24h volume',
  'Total indexed liquidity',
  'Cumulated pair liquidity',
  'Source count',
  'Strongest WAX liquidity pair',
]) {
  ok('new token stats label exists: ' + label, js.includes(label) || html.includes(label));
}

ok('waxonedge.js explicitly marks unavailable states', js.includes('Unavailable'));
ok('waxonedge.js explicitly marks indexed-backend-only states', js.includes('Requires indexed backend'));
ok('waxonedge.js explicitly marks unindexed chart states', js.includes('Source not indexed yet'));
ok('waxonedge.js does not present market cap from issued supply fallback', !js.includes('Issued supply basis'));
ok('holder lookup copy does not claim holder distribution',
  !html.includes('Holder Data') &&
  !html.includes('Holder distribution') &&
  !js.includes('Holder distribution'));
ok('account lookup input has an accessible label',
  js.includes('aria-label="WAX account for token balance lookup"'));

ok('waxonedge.css includes terminal shell and detail layout styles',
  css.includes('.woe-og-bar') &&
  css.includes('.woe-detail-grid') &&
  css.includes('.woe-chart-panel'));
ok('waxonedge.css includes bubble dashboard styling', css.includes('.woe-bubble-board') && css.includes('.woe-bubble-token'));
ok('waxonedge.css includes source strip styling', css.includes('.woe-source-strip') && css.includes('.woe-source-pill'));
ok('waxonedge.css includes pair detail styling', css.includes('.woe-pair-detail-panel'));
ok('waxonedge.css includes dense matrix/icon styling',
  css.includes('.woe-icon-placeholder') &&
  css.includes('#woe-table-matrix'));
ok('waxonedge.css hides/minimizes sidebar for WaxOnEdge by default',
  css.includes('body.page-waxonedge #sidebar'));
ok('waxonedge.css includes wide mode layout overrides', css.includes('body.woe-wide-mode'));
ok('waxonedge.css wide mode hides sidebar in terminal mode', css.includes('body.woe-wide-mode #sidebar'));
ok('waxonedge.css includes active token styling', css.includes('.woe-token-rank-active') || css.includes('.woe-row-active'));

ok('waxonedge.js renders source/token icon placeholders',
  js.includes('iconPlaceholderHtml') &&
  js.includes('sourceCellHtml') &&
  js.includes('tokenCellHtml'));
ok('waxonedge.js updates the top bar WAX price block',
  js.includes('updateTopBarWaxPrice') &&
  js.includes('woe-topbar-wax-price'));
ok('waxonedge.html includes wide mode toggle button', html.includes('id="woe-wide-toggle"'));
ok('waxonedge.js implements toggleWideMode and woe-wide-mode class',
  js.includes('toggleWideMode') && js.includes('woe-wide-mode'));
ok('waxonedge.js restores wide mode from localStorage on boot', js.includes('restoreWideMode'));

console.log('\nwaxonedge-smoke.test: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  process.exit(1);
}
