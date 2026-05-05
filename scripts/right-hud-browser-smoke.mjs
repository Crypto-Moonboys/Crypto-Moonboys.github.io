#!/usr/bin/env node
/**
 * right-hud-browser-smoke.mjs
 *
 * Browser-rendered smoke test for the right HUD panel (Player Status + Next Actions).
 *
 * Uses Playwright (Chromium headless) to load each affected page from a local
 * HTTP server so that site-shell.js actually executes and DOM mutations happen
 * before assertions are made.  Static grep / audit checks cannot catch
 * runtime failures such as:
 *   - JS errors that abort site-shell.js before rightPanel is inserted
 *   - CSS rules that hide the panel after insertion
 *   - Script ordering that breaks component mounting
 *   - Another script removing or overwriting the inserted panel
 *
 * Pages tested:
 *   /  /index.html  /sam.html  /graph.html  /search.html  /timeline.html
 *   /games/leaderboard.html  /games/
 *
 * Assertions per page (after all scripts run):
 *   ✓ document.querySelector('#homepage-right-panel') exists
 *   ✓ #homepage-right-panel is visible (display≠none, visibility≠hidden, bbox>0)
 *   ✓ document.querySelector('[data-csp-panel]') exists
 *   ✓ document.querySelector('[data-las-panel]') exists
 *   ✓ document.body.textContent includes "Player Status"
 *   ✓ document.body.textContent includes "Next Actions"
 *   ✓ no #live-feed-widget in DOM (LIVE_FEED=false)
 *   ✓ no "Live System Feed" text (removed section)
 *   ✓ no "System Status" text (removed section)
 *   ✓ no "WIKI NODES" fake row
 *   ✓ no .hud-stat-val placeholder chips
 *   ✓ right panel has ≤ 3 HUD boxes (currently 2)
 *
 * Also logged per page:
 *   • window.location.pathname
 *   • document.body.className
 *   • shouldShowRightPanel() result (derived locally from the same logic as
 *     site-shell.js — not read from a window debug hook)
 *   • whether /js/site-shell.js loaded successfully
 *   • any browser console errors
 *   • any failed script requests
 *
 * Run:
 *   node scripts/right-hud-browser-smoke.mjs
 *
 * Port:
 *   Uses an ephemeral port by default (OS assigns a free port).
 *   Override with env RIGHT_HUD_SMOKE_PORT=<number>.
 *
 * Viewport:
 *   Set to 1440×900 so the CSS rule that makes the right panel visible
 *   (min-width ≥ 1201 px) is active during computed-style assertions.
 */

import http from 'node:http';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORT = Number(process.env.RIGHT_HUD_SMOKE_PORT) || 0; // 0 = OS picks a free port

// ── Pages to test ─────────────────────────────────────────────────────────────
const PAGES = [
  '/',
  '/index.html',
  '/sam.html',
  '/graph.html',
  '/search.html',
  '/timeline.html',
  '/games/leaderboard.html',
  '/games/',
];

// ── MIME helper ───────────────────────────────────────────────────────────────
function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.mjs':  'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico':  'image/x-icon',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.ttf':  'font/ttf',
  };
  return map[ext] || 'application/octet-stream';
}

// ── Local static file server ──────────────────────────────────────────────────
function createServer() {
  return http.createServer((req, res) => {
    try {
      // Decode percent-encoding, strip query string
      let decoded;
      try {
        decoded = decodeURIComponent((req.url || '/').split('?')[0]);
      } catch (_) {
        res.statusCode = 400;
        res.end('Bad request');
        return;
      }

      // Build candidate path and resolve to absolute
      const candidate = decoded.endsWith('/') || decoded === ''
        ? path.join(ROOT, decoded, 'index.html')
        : path.join(ROOT, decoded);
      const resolved  = path.resolve(candidate);

      // Path traversal guard: resolved path must be inside ROOT
      const rel = path.relative(ROOT, resolved);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }

      // Serve only if it exists and is a file
      if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
        res.statusCode = 404;
        res.end('Not found: ' + decoded);
        return;
      }

      res.setHeader('Content-Type', mimeType(resolved));
      // No-cache so tests always see the freshest build
      res.setHeader('Cache-Control', 'no-store');
      fs.createReadStream(resolved).pipe(res);
    } catch (err) {
      res.statusCode = 500;
      res.end(String(err));
    }
  });
}

// ── Test result helpers ───────────────────────────────────────────────────────
let totalChecks  = 0;
let totalFailed  = 0;

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

// ── Per-page test ─────────────────────────────────────────────────────────────
async function testPage(page, pathname, port) {
  const url = `http://127.0.0.1:${port}${pathname}`;
  process.stdout.write(`\n── ${pathname} ──────────────────────────────────────────\n`);

  const consoleErrors  = [];
  const failedRequests = [];
  let   shellLoaded    = false;

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  page.on('response', resp => {
    if (resp.url().includes('/js/site-shell.js')) {
      shellLoaded = resp.status() < 400;
    }
    if (!resp.ok() && resp.request().resourceType() === 'script') {
      failedRequests.push(`HTTP ${resp.status()} — ${resp.url()}`);
    }
  });

  // Navigate and wait until initial HTML + render-blocking scripts have run.
  // We do NOT use 'networkidle' because external API calls (fonts, analytics,
  // Telegram etc.) vary in timing and would make the test flaky.  'load' is
  // used instead of 'domcontentloaded' so that stylesheets are fully applied
  // before we read computed styles (visibility assertions require the CSSOM).
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 20000 });
  } catch (err) {
    fail(`page load failed: ${err.message}`);
    return;
  }

  // Wait for the shell to finish injecting the right panel (up to 5 s).
  // If it never appears the later assertions will record the failure cleanly.
  try {
    await page.waitForSelector('#homepage-right-panel', { timeout: 5000 });
  } catch (_) { /* assertion below will record the failure */ }

  // ── Diagnostic info ──────────────────────────────────────────────────
  const diag = await page.evaluate(() => {
    /* replicate shouldShowRightPanel logic from site-shell.js — derived
       locally; not read from a window debug hook */
    function shouldShowRightPanel(pn, body) {
      if (body.classList.contains('page-has-right-panel')) return true;
      var p = pn === '/' ? '/index.html'
            : (pn.length > 1 && pn.charAt(pn.length - 1) === '/')
              ? pn.slice(0, -1)
              : pn;
      var exact = [
        '/index.html', '/sam.html', '/graph.html', '/search.html',
        '/timeline.html', '/dashboard.html', '/community.html',
        '/how-to-play.html', '/games', '/games/', '/games/index.html',
        '/games/leaderboard.html',
      ];
      if (exact.indexOf(p) !== -1) return true;
      var prefixes = ['/categories/', '/wiki/'];
      for (var i = 0; i < prefixes.length; i++) {
        if (p.indexOf(prefixes[i]) === 0) return true;
      }
      return false;
    }

    function visibilityInfo(sel) {
      var el = document.querySelector(sel);
      if (!el) return { exists: false, display: null, visibility: null, w: 0, h: 0 };
      var cs = window.getComputedStyle(el);
      var bb = el.getBoundingClientRect();
      return {
        exists:     true,
        display:    cs.display,
        visibility: cs.visibility,
        w:          bb.width,
        h:          bb.height,
      };
    }

    return {
      pathname:          window.location.pathname,
      bodyClass:         document.body.className,
      shouldShowPanel:   shouldShowRightPanel(window.location.pathname, document.body),
      rightPanel:        visibilityInfo('#homepage-right-panel'),
      cspPanelInDOM:     !!document.querySelector('[data-csp-panel]'),
      lasPanelInDOM:     !!document.querySelector('[data-las-panel]'),
      textPlayerStatus:  document.body.textContent.includes('Player Status'),
      textNextActions:   document.body.textContent.includes('Next Actions'),
      // Anti-fake-data guards
      noLiveFeed:        !document.getElementById('live-feed-widget'),
      noSystemStatus:    !document.body.textContent.includes('System Status'),
      noWikiNodes:       !document.body.textContent.includes('WIKI NODES'),
      noLiveFeedText:    !document.body.textContent.includes('Live System Feed'),
      // No placeholder "--" in player panel stat chips
      noPlaceholderDash: !document.querySelector('.hud-stat-val'),
      // Max 2 retro-hud-box sections in right panel (Player Status + Next Actions)
      hudBoxCount:       document.querySelectorAll('#homepage-right-panel .retro-hud-box').length,
      layoutId:          !!document.getElementById('layout'),
      mainWrapperId:     !!document.getElementById('main-wrapper'),
    };
  });

  // ── Log diagnostics ──────────────────────────────────────────────────
  info(`pathname:            ${diag.pathname}`);
  info(`body.className:      ${diag.bodyClass}`);
  info(`shouldShowRightPanel: ${diag.shouldShowPanel}`);
  info(`site-shell.js loaded: ${shellLoaded}`);
  info(`#layout in DOM:      ${diag.layoutId}`);
  info(`#main-wrapper in DOM:${diag.mainWrapperId}`);
  if (diag.rightPanel.exists) {
    info(`HUD box count in right panel: ${diag.hudBoxCount}`);
  }

  if (consoleErrors.length > 0) {
    consoleErrors.forEach(e => info(`console error: ${e}`));
  } else {
    info('console errors: none');
  }

  if (failedRequests.length > 0) {
    failedRequests.forEach(r => info(`failed script: ${r}`));
  } else {
    info('failed script requests: none');
  }

  // ── Assertions ────────────────────────────────────────────────────────
  const rp = diag.rightPanel;
  if (rp.exists) {
    pass('#homepage-right-panel exists in post-JS DOM');
  } else {
    fail('#homepage-right-panel MISSING from post-JS DOM');
  }

  // Visibility assertions for #homepage-right-panel
  if (rp.exists && rp.display !== 'none') {
    pass('#homepage-right-panel display !== "none"');
  } else if (rp.exists) {
    fail('#homepage-right-panel has display:none (hidden)');
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

  if (diag.cspPanelInDOM) {
    pass('[data-csp-panel] exists in post-JS DOM');
  } else {
    fail('[data-csp-panel] MISSING from post-JS DOM');
  }

  if (diag.lasPanelInDOM) {
    pass('[data-las-panel] exists in post-JS DOM');
  } else {
    fail('[data-las-panel] MISSING from post-JS DOM');
  }

  if (diag.textPlayerStatus) {
    pass('body text includes "Player Status"');
  } else {
    fail('body text MISSING "Player Status"');
  }

  if (diag.textNextActions) {
    pass('body text includes "Next Actions"');
  } else {
    fail('body text MISSING "Next Actions"');
  }

  // Anti-fake-data guards
  if (diag.noLiveFeed) {
    pass('no #live-feed-widget in DOM (LIVE_FEED=false, correctly absent)');
  } else {
    fail('#live-feed-widget present — must be removed when LIVE_FEED=false');
  }

  if (diag.noLiveFeedText) {
    pass('body text does not include removed "Live System Feed" section');
  } else {
    fail('body text still contains "Live System Feed" — section must be removed');
  }

  if (diag.noSystemStatus) {
    pass('body text does not include removed "System Status" section');
  } else {
    fail('body text still contains "System Status" — section must be removed');
  }

  if (diag.noWikiNodes) {
    pass('body text does not include fake "WIKI NODES" row');
  } else {
    fail('body text contains fake "WIKI NODES" row — must be removed');
  }

  if (diag.noPlaceholderDash) {
    pass('no .hud-stat-val placeholder chips in DOM');
  } else {
    fail('.hud-stat-val placeholder chips found — fake "--" stat chips must be removed');
  }

  if (rp.exists) {
    if (diag.hudBoxCount <= 3) {
      pass(`right panel has ${diag.hudBoxCount} HUD box(es) — within 3-section limit`);
    } else {
      fail(`right panel has ${diag.hudBoxCount} HUD boxes — must be ≤ 3 sections`);
    }
  }
}

// ── Rocket Loader placeholder simulation ─────────────────────────────────────
//
// Simulates what Cloudflare Rocket Loader does: it replaces later <script>
// tags with placeholder <div data-cflasync> nodes before those scripts execute.
// site-shell.js must NOT detach those placeholder nodes when it rebuilds body.
//
// This test:
//   1. Loads /index.html (which has site-shell.js) in a fresh page.
//   2. Before site-shell.js has a chance to run, injects 3 fake Rocket Loader
//      placeholder divs into body (simulating CFL behaviour).
//   3. Allows site-shell.js to execute.
//   4. Asserts that ALL 3 placeholder nodes are still attached to document.body.
//   5. Asserts #homepage-right-panel was still created correctly.
async function testRocketLoaderPlaceholders(context, port) {
  process.stdout.write('\n── Rocket Loader placeholder simulation ─────────────────────────\n');

  const page = await context.newPage();
  try {
    // Block site-shell.js loading briefly so we can inject placeholders first.
    // We achieve this by intercepting the HTML response and injecting a tiny
    // synchronous inline script that inserts placeholder nodes BEFORE
    // site-shell.js executes (site-shell.js is synchronous at end of body).
    await page.route('**/index.html', async route => {
      const response = await route.fetch();
      let html = await response.text();
      // Inject placeholder nodes immediately before the site-shell.js <script>
      // tag, mimicking Rocket Loader replacing later scripts with placeholders.
      const placeholderInjection =
        '<div data-cflasync="placeholder-1" id="rl-placeholder-1" style="display:none"></div>' +
        '<div data-cflasync="placeholder-2" id="rl-placeholder-2" style="display:none"></div>' +
        '<div data-cflasync="placeholder-3" id="rl-placeholder-3" style="display:none"></div>';
      html = html.replace(
        /(<script[^>]*data-cfasync="false"[^>]*src="\/js\/site-shell\.js"[^>]*>)/,
        placeholderInjection + '$1'
      );
      await route.fulfill({ response, body: html });
    });

    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    try {
      await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 20000 });
    } catch (err) {
      fail(`Rocket Loader sim: page load failed: ${err.message}`);
      return;
    }

    try {
      await page.waitForSelector('#homepage-right-panel', { timeout: 5000 });
    } catch (_) { /* assertion below will record the failure */ }

    const result = await page.evaluate(() => {
      return {
        ph1: !!document.getElementById('rl-placeholder-1'),
        ph2: !!document.getElementById('rl-placeholder-2'),
        ph3: !!document.getElementById('rl-placeholder-3'),
        ph1InBody: document.getElementById('rl-placeholder-1')
          ? document.getElementById('rl-placeholder-1').isConnected
          : false,
        ph2InBody: document.getElementById('rl-placeholder-2')
          ? document.getElementById('rl-placeholder-2').isConnected
          : false,
        ph3InBody: document.getElementById('rl-placeholder-3')
          ? document.getElementById('rl-placeholder-3').isConnected
          : false,
        rightPanelExists: !!document.getElementById('homepage-right-panel'),
      };
    });

    if (result.ph1 && result.ph1InBody) {
      pass('Rocket Loader sim: placeholder-1 still attached after site-shell.js ran');
    } else {
      fail('Rocket Loader sim: placeholder-1 was DETACHED by site-shell.js');
    }

    if (result.ph2 && result.ph2InBody) {
      pass('Rocket Loader sim: placeholder-2 still attached after site-shell.js ran');
    } else {
      fail('Rocket Loader sim: placeholder-2 was DETACHED by site-shell.js');
    }

    if (result.ph3 && result.ph3InBody) {
      pass('Rocket Loader sim: placeholder-3 still attached after site-shell.js ran');
    } else {
      fail('Rocket Loader sim: placeholder-3 was DETACHED by site-shell.js');
    }

    if (result.rightPanelExists) {
      pass('Rocket Loader sim: #homepage-right-panel still created correctly');
    } else {
      fail('Rocket Loader sim: #homepage-right-panel MISSING after placeholder injection');
    }

    // No Rocket Loader "detached" errors in console
    const rlErrors = consoleErrors.filter(e => /ROCKET LOADER.*detached/i.test(e));
    if (rlErrors.length === 0) {
      pass('Rocket Loader sim: no "[ROCKET LOADER] detached" console errors');
    } else {
      rlErrors.forEach(e => fail(`Rocket Loader sim: console error: ${e}`));
    }
  } finally {
    await page.close();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Start local HTTP server on ephemeral port (or env override)
  const server = createServer();
  const port = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server.address().port));
  });

  process.stdout.write('\n═══ Right HUD Browser Smoke Test ═══════════════════════════════\n');
  process.stdout.write(`    Serving repo from: ${ROOT}\n`);
  process.stdout.write(`    Port: ${port}\n`);

  // Launch Playwright Chromium with a 1440×900 viewport so the right panel's
  // CSS show-rule (≥1201 px) is active during visibility assertions.
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  let exitCode = 0;

  try {
    for (const pathname of PAGES) {
      const page = await context.newPage();
      try {
        await testPage(page, pathname, port);
      } finally {
        await page.close();
      }
    }

    // Rocket Loader placeholder simulation (uses a fresh context with routing)
    const rlContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      await testRocketLoaderPlaceholders(rlContext, port);
    } finally {
      await rlContext.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  process.stdout.write('\n═══ Summary ════════════════════════════════════════════════════\n');
  process.stdout.write(`    Total checks : ${totalChecks}\n`);
  process.stdout.write(`    Passed       : ${totalChecks - totalFailed}\n`);
  process.stdout.write(`    Failed       : ${totalFailed}\n`);
  process.stdout.write('════════════════════════════════════════════════════════════════\n\n');

  if (totalFailed > 0) {
    process.stderr.write(`Right HUD browser smoke test FAILED with ${totalFailed} failure(s).\n\n`);
    exitCode = 1;
  } else {
    process.stdout.write('Right HUD browser smoke test PASSED. ✅\n\n');
  }

  process.exit(exitCode);
}

main().catch(err => {
  process.stderr.write(`Unhandled error: ${err.stack || err}\n`);
  process.exit(1);
});
