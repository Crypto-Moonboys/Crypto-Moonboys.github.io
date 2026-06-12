/**
 * waxonedge-smoke.test.mjs
 *
 * Smoke tests for the WAXONEDGE read-only analytics dashboard.
 *
 * Verifies:
 *  1. /waxonedge.html exists
 *  2. /css/waxonedge.css exists
 *  3. /js/waxonedge.js exists
 *  4. /js/waxonedge-sources.js exists
 *  5. waxonedge.html references /css/waxonedge.css
 *  6. waxonedge.html references /js/waxonedge.js
 *  7. waxonedge.html references /js/waxonedge-sources.js
 *  8. waxonedge.html contains NO forbidden trading-action labels:
 *       "Swap", "Add Liquidity", "Remove Liquidity", "Connect Wallet"
 *  9. waxonedge.html has the canonical favicon tag
 * 10. waxonedge.js passes node --check (syntax valid)
 * 11. waxonedge-sources.js passes node --check (syntax valid)
 * 12. waxonedge.html does NOT reference the old crypto-moonboys.github.io domain
 * 13. waxonedge.html contains the read-only badge
 * 14. waxonedge-sources.js exports the swap.nefty contract name
 * 15. waxonedge-sources.js includes the WaxBlock explorer link for swap.nefty
 * 16. waxonedge-sources.js uses the Alcor v2 API base
 * 17. waxonedge-sources.js defines /pairs and /analytics/global paths
 * 18. waxonedge.js uses Alcor v2 ticker fields last_price and change24
 * 19. holder lookup copy does not claim holder distribution data
 * 20. swap.nefty uses get_abi detection before table reads
 * 21. rpcPost uses the configured WAX RPC fallback array
 */

import assert from 'node:assert/strict';
import { execFileSync }   from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
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

// ── 1-4. Files exist ─────────────────────────────────────────────
ok('waxonedge.html exists',          exists('waxonedge.html'));
ok('css/waxonedge.css exists',       exists('css/waxonedge.css'));
ok('js/waxonedge.js exists',         exists('js/waxonedge.js'));
ok('js/waxonedge-sources.js exists', exists('js/waxonedge-sources.js'));

// ── Load HTML for content checks ─────────────────────────────────
const html = exists('waxonedge.html') ? read('waxonedge.html') : '';

// ── 5-7. Script and CSS references ───────────────────────────────
ok('waxonedge.html references /css/waxonedge.css',
  html.includes('/css/waxonedge.css'));
ok('waxonedge.html references /js/waxonedge.js',
  html.includes('/js/waxonedge.js'));
ok('waxonedge.html references /js/waxonedge-sources.js',
  html.includes('/js/waxonedge-sources.js'));

// ── 8. No forbidden trading-action labels ────────────────────────
const FORBIDDEN_LABELS = ['Swap', 'Add Liquidity', 'Remove Liquidity', 'Connect Wallet'];
for (const label of FORBIDDEN_LABELS) {
  ok(
    'waxonedge.html does NOT contain forbidden label: "' + label + '"',
    !html.includes(label),
    'Found "' + label + '" in waxonedge.html — trading actions are forbidden',
  );
}

// ── 9. Canonical favicon ─────────────────────────────────────────
ok('waxonedge.html has canonical favicon tag',
  html.includes('<link rel="icon" type="image/png" href="/favicon.png">'));

// ── 10-11. Syntax checks ──────────────────────────────────────────
try {
  execFileSync(process.execPath, ['--check', path.join(ROOT, 'js/waxonedge.js')], { encoding: 'utf8' });
  ok('js/waxonedge.js passes node --check', true);
} catch (e) {
  ok('js/waxonedge.js passes node --check', false, e.message);
}

try {
  execFileSync(process.execPath, ['--check', path.join(ROOT, 'js/waxonedge-sources.js')], { encoding: 'utf8' });
  ok('js/waxonedge-sources.js passes node --check', true);
} catch (e) {
  ok('js/waxonedge-sources.js passes node --check', false, e.message);
}

// ── 12. No old domain ────────────────────────────────────────────
// Use escaped-dot regex (same pattern as anti-drift-check.mjs) so the check
// is precise to the exact hostname rather than a loose substring match.
ok('waxonedge.html does not reference old domain crypto-moonboys.github.io',
  !/crypto-moonboys\.github\.io/.test(html));

// ── 13. Read-only badge present ──────────────────────────────────
ok('waxonedge.html contains read-only badge',
  html.includes('Read-Only') || html.includes('read-only') || html.includes('woe-readonly-badge'));

// ── 14-15. waxonedge-sources.js swap.nefty content ───────────────
const sourcesJs = exists('js/waxonedge-sources.js') ? read('js/waxonedge-sources.js') : '';
ok('waxonedge-sources.js references swap.nefty contract',
  sourcesJs.includes('swap.nefty'));
ok('waxonedge-sources.js includes WaxBlock link for swap.nefty',
  sourcesJs.includes('waxblock.io/account/swap.nefty'));
ok('waxonedge-sources.js uses Alcor api/v2 base',
  sourcesJs.includes("var ALCOR_API = 'https://wax.alcor.exchange/api/v2';"));
ok('waxonedge-sources.js defines /pairs path',
  sourcesJs.includes("pairs: '/pairs'") || sourcesJs.includes("healthPath: '/pairs'"));
ok('waxonedge-sources.js defines /analytics/global path',
  sourcesJs.includes("analyticsGlobal: '/analytics/global'") || sourcesJs.includes("healthPath: '/analytics/global'"));

const waxonedgeJs = exists('js/waxonedge.js') ? read('js/waxonedge.js') : '';
ok('waxonedge.js uses last_price ticker field',
  waxonedgeJs.includes('last_price'));
ok('waxonedge.js uses change24 ticker field',
  waxonedgeJs.includes('change24'));
ok('holder lookup copy does not claim holder distribution',
  !html.includes('Holder Data') &&
  !html.includes('Holder distribution') &&
  !waxonedgeJs.includes('Holder distribution'));
ok('waxonedge.js performs swap.nefty ABI lookup',
  waxonedgeJs.includes('get_abi') || waxonedgeJs.includes('getAbi'));
ok('waxonedge.js uses configured WAX RPC fallbacks',
  waxonedgeJs.includes('WAXONEDGE_WAX_RPC_FALLBACKS'));

// ── Summary ──────────────────────────────────────────────────────
console.log('\nwaxonedge-smoke.test: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  process.exit(1);
}
