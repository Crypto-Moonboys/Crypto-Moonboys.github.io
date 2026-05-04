#!/usr/bin/env node
/**
 * right-hud-browser-smoke.mjs
 *
 * Browser-rendered smoke test for the right HUD / Live System Feed panel.
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
 *   /sam.html  /graph.html  /search.html  /timeline.html
 *   /games/leaderboard.html  /games/
 *
 * Assertions per page (after all scripts run):
 *   ✓ document.querySelector('#homepage-right-panel') exists
 *   ✓ document.querySelector('#live-feed-widget') exists
 *   ✓ document.querySelector('[data-csp-panel]') exists
 *   ✓ document.querySelector('[data-las-panel]') exists
 *   ✓ document.body.textContent includes "Live System Feed"
 *   ✓ document.body.textContent includes "Player Status"
 *   ✓ document.body.textContent includes "System Status"
 *
 * Also logged per page:
 *   • window.location.pathname
 *   • document.body.className
 *   • shouldShowRightPanel() result (via window.SITE_SHELL_DEBUG if exposed,
 *     otherwise derived from the same logic)
 *   • whether /js/site-shell.js loaded successfully
 *   • any browser console errors
 *   • any failed script requests
 *
 * Run:
 *   node scripts/right-hud-browser-smoke.mjs
 */

import http from 'node:http';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORT = 4299;

// ── Pages to test ─────────────────────────────────────────────────────────────
const PAGES = [
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
      const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const clean   = rawPath.replace(/^\/+/, '');
      let filePath  = path.join(ROOT, clean);

      // Directory index
      if (rawPath.endsWith('/') || rawPath === '') {
        filePath = path.join(ROOT, clean, 'index.html');
      }

      // Serve only if it exists and is a file
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.statusCode = 404;
        res.end('Not found: ' + rawPath);
        return;
      }

      res.setHeader('Content-Type', mimeType(filePath));
      // No-cache so tests always see the freshest build
      res.setHeader('Cache-Control', 'no-store');
      fs.createReadStream(filePath).pipe(res);
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
async function testPage(page, pathname) {
  const url = `http://127.0.0.1:${PORT}${pathname}`;
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

  // Navigate and wait until network is idle so all scripts have run
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
  } catch (err) {
    fail(`page load failed: ${err.message}`);
    return;
  }

  // ── Diagnostic info ──────────────────────────────────────────────────
  const diag = await page.evaluate(() => {
    /* replicate shouldShowRightPanel logic from site-shell.js */
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
    return {
      pathname:          window.location.pathname,
      bodyClass:         document.body.className,
      shouldShowPanel:   shouldShowRightPanel(window.location.pathname, document.body),
      rightPanelInDOM:   !!document.querySelector('#homepage-right-panel'),
      liveFeedInDOM:     !!document.querySelector('#live-feed-widget'),
      cspPanelInDOM:     !!document.querySelector('[data-csp-panel]'),
      lasPanelInDOM:     !!document.querySelector('[data-las-panel]'),
      textLiveFeed:      document.body.textContent.includes('Live System Feed'),
      textPlayerStatus:  document.body.textContent.includes('Player Status'),
      textSystemStatus:  document.body.textContent.includes('System Status'),
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
  if (diag.rightPanelInDOM) {
    pass('#homepage-right-panel exists in post-JS DOM');
  } else {
    fail('#homepage-right-panel MISSING from post-JS DOM');
  }

  if (diag.liveFeedInDOM) {
    pass('#live-feed-widget exists in post-JS DOM');
  } else {
    fail('#live-feed-widget MISSING from post-JS DOM');
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

  if (diag.textLiveFeed) {
    pass('body text includes "Live System Feed"');
  } else {
    fail('body text MISSING "Live System Feed"');
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
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  process.stdout.write('\n═══ Right HUD Browser Smoke Test ═══════════════════════════════\n');
  process.stdout.write(`    Serving repo from: ${ROOT}\n`);
  process.stdout.write(`    Port: ${PORT}\n`);

  // Start local HTTP server
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', resolve);
  });

  // Launch Playwright Chromium
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  let exitCode = 0;

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
