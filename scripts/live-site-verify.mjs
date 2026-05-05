#!/usr/bin/env node
/**
 * live-site-verify.mjs
 *
 * Verifies that the live deployed site at cryptomoonboys.com is serving the
 * expected shell / right-HUD system.  Intended to be run AFTER a GitHub Pages
 * deployment has fully propagated through Cloudflare, not on every PR.
 *
 * Run:
 *   npm run test:live-site
 *   # or directly:
 *   node scripts/live-site-verify.mjs
 *
 * Trigger via GitHub Actions:
 *   .github/workflows/live-site-verify.yml  (workflow_dispatch only)
 *
 * Pages checked:
 *   https://cryptomoonboys.com/
 *   https://cryptomoonboys.com/index.html
 *   https://cryptomoonboys.com/sam.html
 *   https://cryptomoonboys.com/graph.html
 *   https://cryptomoonboys.com/search.html
 *   https://cryptomoonboys.com/timeline.html
 *   https://cryptomoonboys.com/games/
 *   https://cryptomoonboys.com/games/leaderboard.html
 *
 * Per-page assertions:
 *   ✓ #site-header exists
 *   ✓ #sidebar exists
 *   ✓ #homepage-right-panel exists
 *   ✓ #live-feed-widget exists
 *   ✓ [data-csp-panel] exists
 *   ✓ [data-las-panel] exists
 *   ✓ body text includes "Player Status"
 *   ✓ body text includes "System Status"
 *   ✓ body text includes "Live System Feed"
 *   ✓ #homepage-right-panel is visible (display≠none, visibility≠hidden, bbox>0)
 *   ✓ no console error containing banned substrings (ROCKET LOADER, Placeholder
 *     for script, was detached from document, Script will not be executed)
 *   ✓ no failed request for critical JS files
 *
 * JS source assertions (fetched directly, not via browser):
 *   https://cryptomoonboys.com/js/site-shell.js must contain:
 *     shouldShowRightPanel, homepage-right-panel, live-feed-widget,
 *     data-csp-panel, data-las-panel
 */

import https from 'node:https';
import { chromium } from 'playwright';

// ── Config ────────────────────────────────────────────────────────────────────
const BASE = 'https://cryptomoonboys.com';

const PAGES = [
  '/',
  '/index.html',
  '/sam.html',
  '/graph.html',
  '/search.html',
  '/timeline.html',
  '/games/',
  '/games/leaderboard.html',
];

// Console error messages that indicate a broken deployment.
const BANNED_CONSOLE_SUBSTRINGS = [
  'ROCKET LOADER',
  'Placeholder for script',
  'was detached from document',
  'Script will not be executed',
];

// JS files whose 4xx/5xx responses indicate a broken deployment.
const CRITICAL_JS_PATHS = [
  '/js/site-shell.js',
  '/js/components/connection-status-panel.js',
  '/js/components/global-player-header.js',
  '/js/components/live-activity-summary.js',
  '/js/wiki.js',
];

// Strings that site-shell.js source MUST contain.
const SHELL_SOURCE_MUST_CONTAIN = [
  'shouldShowRightPanel',
  'homepage-right-panel',
  'live-feed-widget',
  'data-csp-panel',
  'data-las-panel',
];

// ── Result helpers ────────────────────────────────────────────────────────────
let totalChecks = 0;
let totalFailed = 0;

function pass(msg) {
  totalChecks++;
  process.stdout.write(`    [PASS] ${msg}\n`);
}

function fail(msg) {
  totalChecks++;
  totalFailed++;
  process.stderr.write(`    [FAIL] ${msg}\n`);
}

function info(msg) {
  process.stdout.write(`    [INFO] ${msg}\n`);
}

// ── HTTPS fetch helper ────────────────────────────────────────────────────────
function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'live-site-verify/1.0' } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── Per-page test ─────────────────────────────────────────────────────────────
async function testPage(page, pathname) {
  const url = `${BASE}${pathname}`;
  process.stdout.write(`\n── ${pathname} ──────────────────────────────────────────\n`);

  const consoleErrors  = [];
  const failedRequests = [];
  const criticalStatus = {};

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  page.on('response', resp => {
    const respUrl = resp.url();
    for (const critPath of CRITICAL_JS_PATHS) {
      if (respUrl.includes(critPath)) {
        criticalStatus[critPath] = resp.status();
      }
    }
    if (!resp.ok() && resp.request().resourceType() === 'script') {
      failedRequests.push(`HTTP ${resp.status()} — ${respUrl}`);
    }
  });

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  } catch (err) {
    fail(`page load failed: ${err.message}`);
    return;
  }

  // Wait for the shell to inject the right panel (up to 8 s — live site has
  // Cloudflare edge latency on top of local rendering).
  try {
    await page.waitForSelector('#homepage-right-panel', { timeout: 8000 });
  } catch (_) { /* assertion below records the failure cleanly */ }

  // ── Collect diagnostics from the browser ──────────────────────────────
  const diag = await page.evaluate(() => {
    function visInfo(sel) {
      const el = document.querySelector(sel);
      if (!el) return { exists: false, display: null, visibility: null, w: 0, h: 0 };
      const cs = window.getComputedStyle(el);
      const bb = el.getBoundingClientRect();
      return {
        exists:     true,
        display:    cs.display,
        visibility: cs.visibility,
        w:          bb.width,
        h:          bb.height,
      };
    }
    return {
      pathname:         window.location.pathname,
      bodyClass:        document.body.className,
      siteHeader:       !!document.querySelector('#site-header'),
      sidebar:          !!document.querySelector('#sidebar'),
      rightPanel:       visInfo('#homepage-right-panel'),
      liveFeed:         visInfo('#live-feed-widget'),
      cspPanel:         !!document.querySelector('[data-csp-panel]'),
      lasPanel:         !!document.querySelector('[data-las-panel]'),
      textPlayerStatus: document.body.textContent.includes('Player Status'),
      textSystemStatus: document.body.textContent.includes('System Status'),
      textLiveFeed:     document.body.textContent.includes('Live System Feed'),
    };
  });

  // ── Log diagnostics ───────────────────────────────────────────────────
  info(`pathname:             ${diag.pathname}`);
  info(`body.className:       ${diag.bodyClass}`);
  info(`#site-header in DOM:  ${diag.siteHeader}`);
  info(`#sidebar in DOM:      ${diag.sidebar}`);

  if (consoleErrors.length > 0) {
    consoleErrors.forEach(e => info(`console error: ${e}`));
  } else {
    info('console errors: none');
  }

  if (failedRequests.length > 0) {
    failedRequests.forEach(r => info(`failed request: ${r}`));
  } else {
    info('failed script requests: none');
  }

  // ── Structural assertions ─────────────────────────────────────────────
  if (diag.siteHeader) {
    pass('#site-header exists');
  } else {
    fail('#site-header MISSING');
  }

  if (diag.sidebar) {
    pass('#sidebar exists');
  } else {
    fail('#sidebar MISSING');
  }

  const rp = diag.rightPanel;
  if (rp.exists) {
    pass('#homepage-right-panel exists');
  } else {
    fail('#homepage-right-panel MISSING');
  }

  const lf = diag.liveFeed;
  if (lf.exists) {
    pass('#live-feed-widget exists');
  } else {
    fail('#live-feed-widget MISSING');
  }

  if (diag.cspPanel) {
    pass('[data-csp-panel] exists');
  } else {
    fail('[data-csp-panel] MISSING');
  }

  if (diag.lasPanel) {
    pass('[data-las-panel] exists');
  } else {
    fail('[data-las-panel] MISSING');
  }

  if (diag.textPlayerStatus) {
    pass('body text includes "Player Status"');
  } else {
    fail('body text MISSING "Player Status"');
  }

  if (diag.textSystemStatus) {
    pass('body text includes "System Status"');
  } else {
    fail('body text MISSING "System Status"');
  }

  if (diag.textLiveFeed) {
    pass('body text includes "Live System Feed"');
  } else {
    fail('body text MISSING "Live System Feed"');
  }

  // ── Visibility assertions for #homepage-right-panel ───────────────────
  if (rp.exists && rp.display !== 'none') {
    pass('#homepage-right-panel display !== "none"');
  } else if (rp.exists) {
    fail('#homepage-right-panel has display:none');
  }

  if (rp.exists && rp.visibility !== 'hidden') {
    pass('#homepage-right-panel visibility !== "hidden"');
  } else if (rp.exists) {
    fail('#homepage-right-panel has visibility:hidden');
  }

  if (rp.exists && rp.w > 0 && rp.h > 0) {
    pass(`#homepage-right-panel bounding box ${rp.w.toFixed(0)}×${rp.h.toFixed(0)} > 0`);
  } else if (rp.exists) {
    fail(`#homepage-right-panel bounding box is zero (${rp.w}×${rp.h})`);
  }

  // ── Console error assertions ──────────────────────────────────────────
  for (const banned of BANNED_CONSOLE_SUBSTRINGS) {
    const hits = consoleErrors.filter(e => e.includes(banned));
    if (hits.length === 0) {
      pass(`no console error containing "${banned}"`);
    } else {
      hits.forEach(e => fail(`console error contains "${banned}": ${e}`));
    }
  }

  // ── Critical JS file assertions ───────────────────────────────────────
  for (const critPath of CRITICAL_JS_PATHS) {
    if (critPath in criticalStatus) {
      const s = criticalStatus[critPath];
      if (s < 400) {
        pass(`${critPath} loaded (HTTP ${s})`);
      } else {
        fail(`${critPath} failed (HTTP ${s})`);
      }
    } else {
      // Not requested on this page — not a failure, just skip.
      info(`${critPath} not requested on this page`);
    }
  }
}

// ── site-shell.js source verification ────────────────────────────────────────
async function verifyShellSource() {
  process.stdout.write('\n── site-shell.js source check ───────────────────────────────────\n');
  const shellUrl = `${BASE}/js/site-shell.js`;
  let result;
  try {
    result = await fetchText(shellUrl);
  } catch (err) {
    fail(`could not fetch ${shellUrl}: ${err.message}`);
    return;
  }

  if (result.status < 400) {
    pass(`${shellUrl} responded HTTP ${result.status}`);
  } else {
    fail(`${shellUrl} responded HTTP ${result.status}`);
    return;
  }

  for (const needle of SHELL_SOURCE_MUST_CONTAIN) {
    if (result.body.includes(needle)) {
      pass(`site-shell.js source contains "${needle}"`);
    } else {
      fail(`site-shell.js source MISSING "${needle}"`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  process.stdout.write('\n═══ Live Site Verification — cryptomoonboys.com ═════════════════\n');
  process.stdout.write(`    Base URL: ${BASE}\n`);
  process.stdout.write(`    Pages:    ${PAGES.length}\n`);
  process.stdout.write(`    Time:     ${new Date().toISOString()}\n`);

  // Verify site-shell.js source first (fast, no browser needed).
  await verifyShellSource();

  // Launch Playwright Chromium with a 1440×900 viewport so right-panel CSS
  // show-rules (min-width ≥ 1201 px) are active during visibility checks.
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'live-site-verify/1.0 Playwright/Chromium',
  });

  try {
    for (const pathname of PAGES) {
      const page = await context.newPage();
      try {
        await testPage(page, pathname);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  // ── Summary ───────────────────────────────────────────────────────────
  process.stdout.write('\n═══ Summary ═════════════════════════════════════════════════════\n');
  process.stdout.write(`    Checks:  ${totalChecks}\n`);
  process.stdout.write(`    Passed:  ${totalChecks - totalFailed}\n`);
  process.stdout.write(`    Failed:  ${totalFailed}\n`);

  if (totalFailed > 0) {
    process.stderr.write(`\n[FAIL] ${totalFailed} check(s) failed — live site may be stale or broken.\n`);
    process.exit(1);
  } else {
    process.stdout.write('\n[PASS] All checks passed — live site looks healthy.\n');
  }
}

main().catch(err => {
  process.stderr.write(`\n[ERROR] Unhandled error: ${err.stack || err}\n`);
  process.exit(1);
});
