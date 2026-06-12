/**
 * waxonedge-smoke.test.mjs
 *
 * Structural smoke tests for the WAXONEDGE read-only analytics dashboard.
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
    passed++;
  } else {
    console.error('FAIL: ' + label + (detail ? ' — ' + detail : ''));
    failed++;
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
ok('waxonedge.html includes OG WaxOnEdge top bar', html.includes('woe-og-bar'));
ok('waxonedge.html includes OG nav labels', html.includes('HOME') && html.includes('SPOT') && html.includes('MARKETS') && html.includes('ANALYTICS'));
ok('waxonedge.html includes WAX price block', html.includes('id="woe-topbar-wax-price"'));
ok('waxonedge.html waits for live WAX price data by default', html.includes('Waiting for live data…'));
ok('waxonedge.html includes project/account action area', html.includes('PROJECT') && html.includes('ACCOUNT'));

const FORBIDDEN_LABELS = ['Swap', 'Add Liquidity', 'Remove Liquidity', 'Connect Wallet', 'Trade on Swap'];
for (const label of FORBIDDEN_LABELS) {
  ok(
    'waxonedge.html does NOT contain forbidden label: "' + label + '"',
    !html.includes(label),
    'Found "' + label + '" in waxonedge.html — trading actions are forbidden',
  );
}

ok(
  'waxonedge.html has canonical favicon tag',
  html.includes('<link rel="icon" type="image/png" href="/favicon.png">'),
);

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

ok(
  'waxonedge.html does not reference old domain crypto-moonboys.github.io',
  !/crypto-moonboys\.github\.io/.test(html),
);

ok('waxonedge.html contains read-only badge', /Read-Only|read-only|woe-readonly-badge/.test(html));
ok('waxonedge-sources.js references swap.nefty contract', sourcesJs.includes('swap.nefty'));
ok('waxonedge-sources.js includes WaxBlock link for swap.nefty', sourcesJs.includes('waxblock.io/account/swap.nefty'));
ok('waxonedge-sources.js uses Alcor api/v2 base', sourcesJs.includes("var ALCOR_API = 'https://wax.alcor.exchange/api/v2';"));
ok('waxonedge-sources.js defines /pairs path', sourcesJs.includes("pairs: '/pairs'") || sourcesJs.includes("healthPath: '/pairs'"));
ok('waxonedge-sources.js defines /analytics/global path', sourcesJs.includes("analyticsGlobal: '/analytics/global'") || sourcesJs.includes("healthPath: '/analytics/global'"));
ok('waxonedge-sources.js defines /markets helper path for chart fetches', sourcesJs.includes("markets: '/markets'"));

ok('waxonedge.js uses last_price ticker field', js.includes('last_price'));
ok('waxonedge.js uses change24 ticker field', js.includes('change24'));
ok('waxonedge.js uses configured WAX RPC fallbacks', js.includes('WAXONEDGE_WAX_RPC_FALLBACKS'));
ok('waxonedge.js performs swap.nefty ABI lookup', js.includes('get_abi') || js.includes('getAbi'));
ok('waxonedge.js includes query-string token detail state', js.includes('token=') && js.includes('contract='));
ok('waxonedge.js fetches Alcor chart candles from /markets/:id/charts', js.includes('/charts') && js.includes('/markets'));
ok('waxonedge.js calls /api/waxonedge/bootstrap before direct diagnostic fallback',
  js.includes("waxonedgeApi('/bootstrap')") && js.includes('loadDiagnosticFallback'));
ok('waxonedge.js names direct browser fetches as diagnostic fallback',
  js.includes('loadDiagnosticFallback') && js.includes('Backend bootstrap unavailable'));

ok('holder lookup copy does not claim holder distribution',
  !html.includes('Holder Data') &&
  !html.includes('Holder distribution') &&
  !js.includes('Holder distribution'),
);

ok('token detail section exists', html.includes('id="woe-token-detail"'));
ok('token summary container exists', html.includes('id="woe-token-summary"'));
ok('stats grid container exists', html.includes('id="woe-token-stats"'));
ok('chart container exists', html.includes('id="woe-chart-panel"'));
ok('pool/pair matrix exists', html.includes('id="woe-table-matrix"'));
ok('source/DEX column exists', html.includes('Source / DEX'));
ok('chart and stats heading exists', html.includes('Chart and stats'));

for (const label of [
  'Holder count',
  'Decimals',
  'Total token supply',
  'Circulating supply',
  'TVL',
  'Cumulated pair liquidity',
  'Current price in WAX and USD',
  '24h price change',
  '24h volume',
  '7d volume',
  '30d volume',
  'Market cap',
  'Fully diluted valuation',
]) {
  ok('token stats label exists: ' + label, js.includes(label) || html.includes(label));
}

ok('waxonedge.js explicitly marks unavailable historical metrics', js.includes('Unavailable'));
ok('waxonedge.js explicitly marks indexed-backend-only metrics', js.includes('Requires indexed backend'));
ok('waxonedge.js does not present market cap from issued supply fallback', !js.includes('Issued supply basis'));
ok('waxonedge.html explains data honesty in detail note',
  html.includes('Requires indexed backend') || html.includes('Unavailable'),
);
ok('account lookup input has an accessible label',
  js.includes('aria-label="WAX account for token balance lookup"'),
);
ok('token detail section is placed above source status section',
  html.indexOf('id="woe-token-detail"') > -1 &&
  html.indexOf('id="woe-token-detail"') < html.indexOf('id="woe-sources-grid"'),
);
ok('waxonedge.css includes OG shell and detail layout styles',
  css.includes('.woe-og-bar') &&
  css.includes('.woe-detail-grid') &&
  css.includes('.woe-chart-panel'),
);
ok('waxonedge.css includes dense matrix/icon styling',
  css.includes('.woe-icon-placeholder') &&
  css.includes('#woe-table-matrix'),
);
ok('waxonedge.js renders source/token icon placeholders',
  js.includes('iconPlaceholderHtml') &&
  js.includes('sourceCellHtml') &&
  js.includes('tokenCellHtml'),
);
ok('waxonedge.js updates the top bar WAX price block',
  js.includes('updateTopBarWaxPrice') &&
  js.includes('woe-topbar-wax-price'),
);
ok('waxonedge.css includes active token row styling', css.includes('.woe-row-active'));

// ── New: default token selection guards ─────────────────────────────
ok(
  'waxonedge.js defines WAX_NATIVE_KEY constant to skip eosio.token/WAX in default selection',
  js.includes('WAX_NATIVE_KEY') && js.includes('eosio.token') && js.includes("'WAX'"),
);
ok(
  'waxonedge.js skips WAX_NATIVE_KEY when picking default token',
  js.includes('key !== WAX_NATIVE_KEY'),
);
ok(
  'waxonedge.js prefers tokens that are tokenA in an Alcor market (alcorBaseKeys)',
  js.includes('alcorBaseKeys'),
);

// ── New: scanner-first empty state ──────────────────────────────────
ok(
  'waxonedge.js shows scanner-first empty state message when no token selected',
  js.includes('Select a token from the scanner below to load analytics.'),
);
ok(
  'waxonedge.js uses woe-scanner-first-state class for empty state',
  js.includes('woe-scanner-first-state'),
);
ok(
  'waxonedge.css defines scanner-first empty state styles',
  css.includes('.woe-scanner-first-state'),
);

// ── New: wide / fullscreen mode ──────────────────────────────────────
ok(
  'waxonedge.html includes wide mode toggle button',
  html.includes('id="woe-wide-toggle"'),
);
ok(
  'waxonedge.js implements toggleWideMode and woe-wide-mode class',
  js.includes('toggleWideMode') && js.includes('woe-wide-mode'),
);
ok(
  'waxonedge.js restores wide mode from localStorage on boot',
  js.includes('restoreWideMode'),
);
ok(
  'waxonedge.css includes wide mode layout overrides',
  css.includes('body.woe-wide-mode'),
);
ok(
  'waxonedge.css wide mode hides sidebar in terminal mode',
  css.includes('body.woe-wide-mode #sidebar'),
);

console.log('\nwaxonedge-smoke.test: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  process.exit(1);
}
