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
ok('css/waxonedge.css exists', exists('css/waxonedge.css'));
ok('js/waxonedge.js exists', exists('js/waxonedge.js'));
ok('js/waxonedge-sources.js exists', exists('js/waxonedge-sources.js'));

const html = exists('waxonedge.html') ? read('waxonedge.html') : '';
const css = exists('css/waxonedge.css') ? read('css/waxonedge.css') : '';
const js = exists('js/waxonedge.js') ? read('js/waxonedge.js') : '';
const sourcesJs = exists('js/waxonedge-sources.js') ? read('js/waxonedge-sources.js') : '';

ok('waxonedge.html references /css/waxonedge.css', html.includes('/css/waxonedge.css'));
ok('waxonedge.html references /js/waxonedge.js', html.includes('/js/waxonedge.js'));
ok('waxonedge.html references /js/waxonedge-sources.js', html.includes('/js/waxonedge-sources.js'));

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
ok('waxonedge.html explains data honesty in detail note',
  html.includes('Requires indexed backend') || html.includes('Unavailable'),
);
ok('waxonedge.css includes token detail layout styles', css.includes('.woe-detail-grid') && css.includes('.woe-chart-panel'));
ok('waxonedge.css includes active token row styling', css.includes('.woe-row-active'));

console.log('\nwaxonedge-smoke.test: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  process.exit(1);
}
