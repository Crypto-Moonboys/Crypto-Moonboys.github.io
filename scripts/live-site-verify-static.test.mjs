/**
 * live-site-verify-static.test.mjs
 *
 * Static self-tests for scripts/live-site-verify.mjs.
 * Verifies the verifier's own invariants so stale assumptions
 * cannot drift back in silently.
 *
 * Checks:
 *   ✓ script passes node --check
 *   ✓ page list includes all critical routes
 *   ✓ stale selectors absent (data-las-panel, "Player Status", "Next Actions")
 *   ✓ BTQM live asset URL checks target .png, NOT .png.base64
 *   ✓ current right-rail section hooks present (data-csp-faction-ops, etc.)
 *   ✓ no Telegram credentials required (no real auth references in script)
 *   ✓ site-shell.js source MUST contain includes current hooks, not legacy ones
 *   ✓ SHELL_SOURCE_MUST_NOT_CONTAIN list includes data-las-panel
 *   ✓ dashboard is in NO_RIGHT_PANEL_PAGES, not RIGHT_PANEL_PAGES
 *   ✓ 8-game roster constant is present and complete
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT  = path.join(ROOT, 'scripts', 'live-site-verify.mjs');
const WORKFLOW = path.join(ROOT, '.github', 'workflows', 'live-site-verify.yml');
const source  = readFileSync(SCRIPT, 'utf8');
const workflowSource = readFileSync(WORKFLOW, 'utf8');
const pkgJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const { ARCADE_MANIFEST } = await import(pathToFileURL(path.join(ROOT, 'js', 'arcade', 'arcade-manifest.js')).href);

// ── 1. Syntax check ───────────────────────────────────────────────────────────
execFileSync(process.execPath, ['--check', SCRIPT], { encoding: 'utf8' });
console.log('PASS: node --check scripts/live-site-verify.mjs');

// ── 1b. Manual/post-deploy workflow exists, never a PR gate ─────────────
assert.ok(workflowSource.includes('workflow_dispatch:'), 'live-site workflow must be manually triggerable');
assert.ok(workflowSource.includes('default: "90"'), 'live-site workflow wait_seconds default must match the workflow fallback');
assert.ok(workflowSource.includes('workflow_run:'), 'live-site workflow may run after Pages deployment');
assert.ok(
  workflowSource.includes('workflows: ["Deploy GitHub Pages"]') ||
    workflowSource.includes("workflows: ['Deploy GitHub Pages']"),
  'live-site workflow must only subscribe to the Pages deployment workflow',
);
assert.ok(
  workflowSource.includes("github.event.workflow_run.conclusion == 'success'"),
  'post-deploy live-site verification must run only after successful Pages deploys',
);
assert.ok(
  workflowSource.includes("github.event.workflow_run.head_sha"),
  'workflow_run live-site verification must checkout the deployed Pages revision',
);
assert.ok(!/^\s*pull_request:/m.test(workflowSource), 'live-site workflow must not run on pull_request');
assert.ok(!/^\s*push:/m.test(workflowSource), 'live-site workflow must not run directly on push');
assert.ok(!/^\s*schedule:/m.test(workflowSource), 'live-site workflow must not run on a schedule');
assert.ok(workflowSource.includes('node-version: 22'), 'live-site workflow must use Node 22');
assert.ok(workflowSource.includes('npx playwright install --with-deps chromium'), 'live-site workflow must install Playwright Chromium');
assert.ok(workflowSource.includes('npm run test:live-site'), 'live-site workflow must run the live-site verifier');
console.log('PASS: live-site workflow is manual/post-Pages only and runs the verifier');

// ── 2. Critical page routes present ───────────────────────────────────────────
const REQUIRED_ROUTES = [
  '/',
  '/index.html',
  '/search.html',
  '/games/',
  '/games/leaderboard.html',
  '/gkniftyheads-incubator.html',
  '/games/block-topia-quest-maze/',
  '/dashboard.html',
];

for (const route of REQUIRED_ROUTES) {
  assert.ok(
    source.includes(`'${route}'`),
    `live-site-verify.mjs must include route: ${route}`,
  );
  console.log(`PASS: route present: ${route}`);
}

// ── 3. Stale selectors must be absent ─────────────────────────────────────────
// data-las-panel was removed from site-shell.js — it must not be a required check.
// Extract only the SHELL_SOURCE_MUST_CONTAIN array literal (stops at first ];).
{
  const mustContainMatch = source.match(/const SHELL_SOURCE_MUST_CONTAIN\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(mustContainMatch, 'SHELL_SOURCE_MUST_CONTAIN constant must be present');
  const mustContainBody = mustContainMatch[1];
  assert.ok(
    !mustContainBody.includes('data-las-panel'),
    'live-site-verify.mjs must not require data-las-panel in SHELL_SOURCE_MUST_CONTAIN',
  );
}
console.log('PASS: data-las-panel absent from SHELL_SOURCE_MUST_CONTAIN');

// "Player Status" and "Next Actions" were old right-rail copy — removed.
assert.ok(
  !source.includes('"Player Status"') && !source.includes("'Player Status'"),
  'live-site-verify.mjs must not check for old "Player Status" text',
);
console.log('PASS: old "Player Status" copy not required');

assert.ok(
  !source.includes('"Next Actions"') && !source.includes("'Next Actions'"),
  'live-site-verify.mjs must not check for old "Next Actions" text',
);
console.log('PASS: old "Next Actions" copy not required');

// ── 4. BTQM asset checks must target .png, NOT .png.base64 ────────────────────
const btqmBlock = source.match(/BTQM_LIVE_ASSET_CHECKS\s*=\s*\[[\s\S]*?\];/);
assert.ok(btqmBlock, 'BTQM_LIVE_ASSET_CHECKS constant must be present');
assert.ok(
  !btqmBlock[0].includes('.png.base64'),
  'BTQM live asset checks must not reference .png.base64 paths (Pages hydrates to .png)',
);
// All BTQM path entries must end with .png
const btqmPaths = [...btqmBlock[0].matchAll(/path:\s*'([^']+)'/g)].map(m => m[1]);
assert.ok(btqmPaths.length > 0, 'BTQM_LIVE_ASSET_CHECKS must include at least one entry');
for (const p of btqmPaths) {
  assert.ok(p.endsWith('.png'), `BTQM asset path must end with .png (not .png.base64): ${p}`);
  console.log(`PASS: BTQM asset path targets .png: ${p}`);
}

// ── 5. Current right-rail section hooks present ───────────────────────────────
const REQUIRED_CSP_HOOKS = [
  'data-csp-panel',
  'data-csp-faction-ops',
  'data-csp-wtf-signal',
  'data-csp-missed',
];
for (const hook of REQUIRED_CSP_HOOKS) {
  assert.ok(
    source.includes(`'${hook}'`),
    `live-site-verify.mjs must reference current CSP hook: ${hook}`,
  );
  console.log(`PASS: current CSP hook referenced: ${hook}`);
}

// ── 6. SHELL_SOURCE_MUST_NOT_CONTAIN includes data-las-panel ─────────────────
const mustNotContainBlock = source.match(/SHELL_SOURCE_MUST_NOT_CONTAIN\s*=\s*\[[\s\S]*?\];/);
assert.ok(mustNotContainBlock, 'SHELL_SOURCE_MUST_NOT_CONTAIN constant must be present');
assert.ok(
  mustNotContainBlock[0].includes('data-las-panel'),
  'SHELL_SOURCE_MUST_NOT_CONTAIN must include data-las-panel (legacy hook removed)',
);
console.log('PASS: SHELL_SOURCE_MUST_NOT_CONTAIN includes data-las-panel');

// ── 7. /dashboard.html in NO_RIGHT_PANEL_PAGES, not RIGHT_PANEL_PAGES ────────
const noRightPanelBlock = source.match(/NO_RIGHT_PANEL_PAGES\s*=\s*\[[\s\S]*?\];/);
const rightPanelBlock   = source.match(/RIGHT_PANEL_PAGES\s*=\s*\[[\s\S]*?\];/);
assert.ok(noRightPanelBlock, 'NO_RIGHT_PANEL_PAGES constant must be present');
assert.ok(rightPanelBlock,   'RIGHT_PANEL_PAGES constant must be present');
assert.ok(
  noRightPanelBlock[0].includes('/dashboard.html'),
  '/dashboard.html must be in NO_RIGHT_PANEL_PAGES',
);
assert.ok(
  !rightPanelBlock[0].includes('/dashboard.html'),
  '/dashboard.html must NOT be in RIGHT_PANEL_PAGES',
);
console.log('PASS: /dashboard.html correctly in NO_RIGHT_PANEL_PAGES');

// ── 8. No real Telegram credentials required ──────────────────────────────────
// The script must not call for TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, or
// process.env references that imply requiring real auth for verification.
assert.ok(
  !source.includes('TELEGRAM_BOT_TOKEN') && !source.includes('TELEGRAM_API_KEY'),
  'live-site-verify.mjs must not require TELEGRAM_BOT_TOKEN or TELEGRAM_API_KEY',
);
console.log('PASS: no Telegram credentials required');

// ── 9. Canonical roster is manifest-backed and complete ───────────────────────
const canonicalGamesBlock = source.match(/CANONICAL_GAMES\s*=\s*\[[\s\S]*?\];/);
assert.ok(canonicalGamesBlock, 'CANONICAL_GAMES constant must be present');
assert.equal(ARCADE_MANIFEST.length, 8, 'ARCADE_MANIFEST must contain exactly 8 live games');
const expectedGames = ARCADE_MANIFEST.map(entry => entry.label.replace(/^[^\p{L}\p{N}]+/u, '').trim());
const canonicalGames = [...canonicalGamesBlock[0].matchAll(/'([^']+)'/g)].map(match => match[1]);
assert.equal(canonicalGames.length, 8, 'CANONICAL_GAMES must contain exactly 8 labels');
for (const name of expectedGames) {
  assert.ok(
    canonicalGames.includes(name),
    `CANONICAL_GAMES must include: ${name}`,
  );
  console.log(`PASS: canonical game present: ${name}`);
}
// HexGL must not appear in the roster.
assert.ok(
  !canonicalGamesBlock[0].toLowerCase().includes('hexgl'),
  'CANONICAL_GAMES must not include HexGL',
);
console.log('PASS: HexGL absent from CANONICAL_GAMES');

// ── 10. live-site-verify.mjs (the live Playwright runner) NOT in npm test ─────
// The static self-test (live-site-verify-static.test.mjs) IS allowed in npm test.
// Only the live Playwright runner must remain a manual/post-deploy tool.
assert.ok(
  !pkgJson.scripts.test.includes('live-site-verify.mjs'),
  'npm test must not include live-site-verify.mjs (the live Playwright runner must remain manual/post-deploy)',
);
console.log('PASS: live-site-verify.mjs (live runner) not in npm test (not a CI gate)');

// ── 11. test:live-site script exists ─────────────────────────────────────────
assert.ok(
  pkgJson.scripts['test:live-site'] &&
  pkgJson.scripts['test:live-site'].includes('live-site-verify'),
  'package.json must expose npm run test:live-site',
);
console.log('PASS: npm run test:live-site is defined');

// Local Node TLS inspection errors should not make the post-deploy verifier
// report a broken site when browser-backed checks can still load the same
// resources. Other network errors remain fatal in live-site-verify.mjs.
assert.ok(
  source.includes('function isLocalTlsInspectionError') &&
    source.includes('SELF_SIGNED_CERT_IN_CHAIN') &&
    source.includes('self-signed certificate in certificate chain'),
  'live-site-verify.mjs must recognize local TLS interception errors',
);
assert.ok(
  source.includes('site-shell.js direct source check skipped') &&
    source.includes('direct HEAD skipped') &&
    source.includes('totalWarnings') &&
    source.includes('function warn') &&
    source.includes('totalChecks++;') &&
    source.includes('totalChecks - totalFailed - totalWarnings'),
  'live-site-verify.mjs must downgrade local TLS inspection failures to warnings',
);
console.log('PASS: local TLS inspection failures are warnings, not deploy failures');

console.log('\nlive-site-verify-static.test: PASS');
