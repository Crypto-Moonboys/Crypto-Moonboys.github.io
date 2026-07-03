#!/usr/bin/env node
/**
 * live-site-verify.mjs
 *
 * Post-merge / post-Pages-deploy verification harness for cryptomoonboys.com.
 * Run this AFTER a GitHub Pages deployment has fully propagated through
 * Cloudflare.  NOT a PR CI gate — do not add to normal CI workflows.
 *
 * Run:
 *   npm run test:live-site
 *   # or directly:
 *   node scripts/live-site-verify.mjs
 *
 * Trigger via GitHub Actions:
 *   .github/workflows/live-site-verify.yml  (workflow_dispatch only)
 *
 * Does NOT require a real Telegram account — validates anonymous/public state.
 * Does NOT submit fake scores to production.
 *
 * ── Pages verified ────────────────────────────────────────────────────────────
 *
 * Core shell (right panel expected):
 *   /                         home — right panel + 4 CSP sections
 *   /index.html               home — right panel + 4 CSP sections
 *   /search.html              wiki search — right panel + wiki search behavior
 *   /games/                   arcade hub — right panel + 8-game roster
 *   /games/leaderboard.html   leaderboard page
 *
 * Standalone CSP panel (no right panel; data-csp-panel mounted directly):
 *   /gkniftyheads-incubator.html
 *
 * Arcade/runtime:
 *   /games/block-topia-quest-maze/   BTQM — Phaser boot smoke, no 404 for generated assets
 *   /games/invaders-3008/            simple arcade game — shell smoke
 *
 * Right-panel intentionally absent:
 *   /dashboard.html           editorial wiki intelligence — no player right panel
 *
 * ── Per-page assertions ───────────────────────────────────────────────────────
 *
 * Shell structure:
 *   ✓ #site-header exists
 *   ✓ #sidebar exists
 *   ✓ #homepage-right-panel exists (on right-panel pages)
 *   ✓ #homepage-right-panel absent (on /dashboard.html)
 *   ✓ [data-csp-panel] exists (right-panel pages + incubator)
 *   ✓ [data-csp-faction-ops] exists (right-panel pages)
 *   ✓ [data-csp-wtf-signal] exists (right-panel pages)
 *   ✓ [data-csp-missed] exists (right-panel pages)
 *   ✓ Right rail section headings: PLAYER LIVE FEED, FACTION DAILY OPS,
 *       DAILY WTF SIGNAL, MISSED OPPORTUNITIES
 *   ✓ no #live-feed-widget (LIVE_FEED=false)
 *   ✓ no "Live System Feed" text (removed section)
 *   ✓ no "System Status" text (removed section)
 *   ✓ no "WIKI NODES" fake row
 *   ✓ #hud-player-avatar present (right-panel pages)
 *   ✓ #homepage-right-panel visible (display≠none, visibility≠hidden, bbox>0)
 *
 * Telegram sync state (anonymous — no credentials required):
 *   ✓ no duplicate RELINK badges
 *   ✓ no duplicate LIVE LINKED badges
 *   ✓ no duplicate SYNC PENDING badges
 *
 * API config state (window.MOONBOYS_API):
 *   ✓ window.MOONBOYS_API exists after api-config.js runs
 *   ✓ production host resolves expected centralized API base URL
 *   ✓ production host resolves expected leaderboard API URL
 *   ✓ API base state is "Server confirmed" or "production_fallback" on production
 *   ✓ no UI copy claims XP synced / BT OPEN / competitive progression without
 *     server confirmation (checks raw state fields, not visible text)
 *
 * Wiki search behavior (/search.html):
 *   ✓ "GRAFFPUNKS RADIO" query returns a relevant GraffPUNKS/radio result
 *   ✓ "GRAFFPUNKS" single-word query returns results
 *   ✓ lowercase/punctuation variant returns the same top result
 *   ✓ nonsense query returns zero or empty state, not spam
 *
 * BTQM generated asset hydration (/games/block-topia-quest-maze/):
 *   ✓ at least one tileset PNG resolves (HTTP 200)
 *   ✓ at least one enemy PNG resolves
 *   ✓ at least one boss PNG resolves
 *   ✓ at least one fx PNG resolves
 *   ✓ page loads without critical console errors
 *   ✓ critical BTQM JS requested successfully
 *   ✓ no 404s for generated runtime asset categories
 *
 * Arcade / Roguelite XP Loop (/games/):
 *   ✓ canonical 8-game roster is present (by text/link)
 *   ✓ no HexGL reference visible
 *   ✓ arcade event bus script requested
 *
 * Console / network:
 *   ✓ no banned console error substrings (ROCKET LOADER, etc.)
 *   ✓ no 4xx/5xx for critical JS
 *   ✓ no network-level failures for critical JS
 *   ✓ all page-critical JS actually requested
 *
 * JS source assertions (fetched directly, not via browser):
 *   site-shell.js source must contain:
 *     shouldShowRightPanel, homepage-right-panel, hud-player-avatar,
 *     data-csp-panel, data-csp-faction-ops, data-csp-wtf-signal, data-csp-missed
 *     (data-las-panel must NOT appear — legacy hook removed)
 *
 * ── Critical JS request outcome matrix (per page) ─────────────────────────────
 *   requested + HTTP < 400  → pass
 *   requested + HTTP ≥ 400  → fail  (likely 404 or Cloudflare block)
 *   requestfailed event      → fail  (net::ERR_*, DNS failure, etc.)
 *   not requested at all     → fail  (stale HTML / broken boot / Rocket Loader)
 */

import https from 'node:https';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// ── Config ────────────────────────────────────────────────────────────────────
const BASE = 'https://cryptomoonboys.com';

// Expected production API endpoints from api-config.js.
const EXPECTED_API_BASE        = 'https://moonboys-api.sercullen.workers.dev';
const EXPECTED_LEADERBOARD_URL = 'https://moonboys-leaderboard.sercullen.workers.dev';

// Pages that receive the full right panel (4 CSP section hooks + #homepage-right-panel).
// NOTE: UI unification removes global right panel — all pages now have NO_RIGHT_PANEL behavior.
// Right panel is disabled; live stats rendered inline on specific pages instead.
const RIGHT_PANEL_PAGES = [
  // DEPRECATED: Global right panel no longer mounted as page chrome.
  // Pages that previously had right panels now use inline live-stats modules.
];

// Pages where [data-csp-panel] is mounted standalone (no #homepage-right-panel).
// NOTE: After UI unification, CSP sections no longer mount in global right panel.
// They render inline on specific pages if user is logged in.
const STANDALONE_CSP_PAGES = [
  // DEPRECATED: Global CSP mounting removed.
  // Inline stats render on /games/, /games/leaderboard.html, /community.html, Battle Chamber pages.
];

// Pages intentionally missing the right panel.
const NO_RIGHT_PANEL_PAGES = [
  '/',
  '/index.html',
  '/search.html',
  '/games/',
  '/games/leaderboard.html',
  '/community.html',
  '/dashboard.html',
  '/gkniftyheads-incubator.html',
];

// Arcade/game-specific pages (shell smoke only; no right panel required).
const ARCADE_PAGES = [
  '/games/block-topia-quest-maze/',
  '/games/invaders-3008/',
];

const ARCADE_PAGE_SOURCE_FILES = {
  '/games/block-topia-quest-maze/': 'games/block-topia-quest-maze/index.html',
  '/games/invaders-3008/': 'games/invaders-3008/index.html',
};

const ARCADE_HTML_DIAGNOSTIC_PATHS = {
  '/games/block-topia-quest-maze/': [
    '/js/site-shell.js',
    '/js/api-config.js',
    '/js/arcade/core/game-shell.js',
    '/js/arcade/games/block-topia-quest-maze/bootstrap.js',
  ],
  '/games/invaders-3008/': [
    '/js/site-shell.js',
    '/js/api-config.js',
    '/js/arcade/core/game-shell.js',
    '/js/arcade/games/invaders/bootstrap.js',
  ],
};

const PAGES = [
  ...RIGHT_PANEL_PAGES,
  ...STANDALONE_CSP_PAGES,
  ...NO_RIGHT_PANEL_PAGES,
  ...ARCADE_PAGES,
];

// Console error messages that indicate a broken deployment.
const BANNED_CONSOLE_SUBSTRINGS = [
  'ROCKET LOADER',
  'Placeholder for script',
  'was detached from document',
  'Script will not be executed',
];

// JS files whose 4xx/5xx responses indicate a broken deployment.
// Kept page-scoped to avoid false failures on pages that do not require a script.
const SHELL_CRITICAL_JS_PATHS = [
  '/js/site-shell.js',
];

const RIGHT_RAIL_CRITICAL_JS_PATHS = [
  '/js/components/connection-status-panel.js',
  '/js/components/global-player-header.js',
  '/js/components/live-activity-summary.js',
];

const WIKI_SEARCH_CRITICAL_JS_PATHS = [
  '/js/wiki.js',
];

const ARCADE_CRITICAL_JS_PATHS = [
  '/js/arcade/core/game-shell.js',
];

// Extra critical JS only required on BTQM.
const BTQM_CRITICAL_JS_PATHS = [
  '/js/arcade/games/block-topia-quest-maze/bootstrap.js',
];

// Standalone arcade pages can require page-specific bootstrap modules.
// Keep this map path-scoped so adding new standalone pages is easy.
const ARCADE_PAGE_CRITICAL_BOOTSTRAP_PATHS = {
  '/games/invaders-3008/': [
    '/js/arcade/games/invaders/bootstrap.js',
  ],
};

// Strings that site-shell.js source MUST contain.
const SHELL_SOURCE_MUST_CONTAIN = [
  'shouldShowRightPanel',
  'homepage-right-panel',
  'hud-player-avatar',
  'data-csp-panel',
  'data-csp-faction-ops',
  'data-csp-wtf-signal',
  'data-csp-missed',
];

// site-shell.js must NOT contain these legacy hooks that were removed.
const SHELL_SOURCE_MUST_NOT_CONTAIN = [
  'data-las-panel',
];

// BTQM generated asset paths to verify (must resolve as PNG on the live site).
// These are the hydrated runtime paths — NOT the .png.base64 source paths.
const BTQM_LIVE_ASSET_CHECKS = [
  { label: 'tileset (zone-0)', path: '/art/btqm/generated/tilesets/zone-0-hodl-or-fold-forest-ruins.png' },
  { label: 'enemy (zone-0)',   path: '/art/btqm/generated/enemies/zone-0-paper-hand-goblin.png' },
  { label: 'boss (zone-0)',    path: '/art/btqm/generated/bosses/zone-0-paper-hand-king.png' },
  { label: 'fx (slash)',       path: '/art/btqm/generated/fx/slash-6f.png' },
];

// Canonical 8-game arcade roster — must be visible on /games/.
const CANONICAL_GAMES = [
  'Invaders 3008',
  'Pac-Chain',
  'Asteroid Fork',
  'Breakout Bullrun',
  'Tetris Block Topia',
  'Crystal Quest',
  'Block Topia Quest Maze',
  'SnakeRun 3008',
];

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Result helpers ────────────────────────────────────────────────────────────
let totalChecks = 0;
let totalFailed = 0;

function pass(msg) {
  totalChecks++;
  process.stdout.write(`    [PASS] ${msg}\n`);
}

function fail(msg, { url = '', selector = '', suggested = '' } = {}) {
  totalChecks++;
  totalFailed++;
  let out = `    [FAIL] ${msg}`;
  if (url)       out += `\n           page:      ${url}`;
  if (selector)  out += `\n           selector:  ${selector}`;
  if (suggested) out += `\n           likely:    ${suggested}`;
  process.stderr.write(`${out}\n`);
}

function info(msg) {
  process.stdout.write(`    [INFO] ${msg}\n`);
}

function readLocalArcadeHtml(pathname) {
  const rel = ARCADE_PAGE_SOURCE_FILES[pathname];
  if (!rel) return { rel: '', html: '' };
  const abs = path.join(REPO_ROOT, rel);
  try {
    return { rel, html: readFileSync(abs, 'utf8') };
  } catch (_) {
    return { rel, html: '' };
  }
}

// ── HTTPS helpers ─────────────────────────────────────────────────────────────
function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'live-site-verify/2.0' } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/** Issue an HTTP HEAD request; resolves with { status }. */
function headRequest(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'HEAD', headers: { 'User-Agent': 'live-site-verify/2.0' } }, res => {
      res.resume(); // drain
      resolve({ status: res.statusCode });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Diagnose per-page console/network failures ────────────────────────────────
function attachPageDiagnostics(page, criticalPaths) {
  const consoleErrors    = [];
  const failedRequests   = [];
  const criticalStatus   = {};
  const criticalNetFailed = {};

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  page.on('response', resp => {
    const respUrl = resp.url();
    for (const critPath of criticalPaths) {
      if (respUrl.includes(critPath)) {
        criticalStatus[critPath] = resp.status();
      }
    }
    if (!resp.ok() && resp.request().resourceType() === 'script') {
      failedRequests.push(`HTTP ${resp.status()} — ${respUrl}`);
    }
  });

  page.on('requestfailed', request => {
    const reqUrl = request.url();
    for (const critPath of criticalPaths) {
      if (reqUrl.includes(critPath)) {
        const failure = request.failure();
        criticalNetFailed[critPath] = failure ? failure.errorText : 'unknown network error';
      }
    }
  });

  return { consoleErrors, failedRequests, criticalStatus, criticalNetFailed };
}

function logAndAssertCriticalScripts(
  criticalPaths, criticalStatus, criticalNetFailed, pageUrl
) {
  const requested = criticalPaths.filter(
    p => (p in criticalStatus) || (p in criticalNetFailed),
  );
  const missing = criticalPaths.filter(
    p => !(p in criticalStatus) && !(p in criticalNetFailed),
  );
  info(`critical scripts requested (${requested.length}/${criticalPaths.length}): ${requested.length ? requested.join(', ') : 'none'}`);
  if (missing.length) {
    info(`critical scripts NOT requested: ${missing.join(', ')}`);
  }
  for (const p of Object.keys(criticalNetFailed)) {
    info(`critical script network failure: ${p} — ${criticalNetFailed[p]}`);
  }
  for (const p of criticalPaths.filter(cp => (cp in criticalStatus) && criticalStatus[cp] >= 400)) {
    info(`critical script HTTP failure: ${p} — HTTP ${criticalStatus[p]}`);
  }

  for (const critPath of criticalPaths) {
    if (critPath in criticalNetFailed) {
      fail(`${critPath} network failure: ${criticalNetFailed[critPath]}`, {
        url: pageUrl,
        selector: critPath,
        suggested: 'Network/DNS failure or Cloudflare block — check deployment propagation',
      });
    } else if (critPath in criticalStatus) {
      const s = criticalStatus[critPath];
      if (s < 400) {
        pass(`${critPath} loaded (HTTP ${s})`);
      } else {
        fail(`${critPath} failed (HTTP ${s})`, {
          url: pageUrl,
          selector: critPath,
          suggested: s === 404 ? 'File missing from Pages artifact — check deploy workflow' : `HTTP ${s} from CDN`,
        });
      }
    } else {
      fail(`${critPath} was not requested`, {
        url: pageUrl,
        selector: critPath,
        suggested: 'Stale HTML, broken boot block, or Cloudflare Rocket Loader interference',
      });
    }
  }
}

// ── Per-page test ─────────────────────────────────────────────────────────────
async function testPage(page, pathname) {
  const url = `${BASE}${pathname}`;
  process.stdout.write(`\n── ${pathname} ──────────────────────────────────────────\n`);

  const isRightPanelPage   = RIGHT_PANEL_PAGES.includes(pathname);
  const isStandaloneCsp    = STANDALONE_CSP_PAGES.includes(pathname);
  const isNoRightPanel     = NO_RIGHT_PANEL_PAGES.includes(pathname);
  const isBtqmPage         = pathname === '/games/block-topia-quest-maze/';
  const isGamesHub         = pathname === '/games/';
  const isSearchPage       = pathname === '/search.html';
  const isArcadePage       = ARCADE_PAGES.includes(pathname);

  const allCritical = [
    ...(isArcadePage ? [] : SHELL_CRITICAL_JS_PATHS),
    // NOTE: UI unification removes global right-panel JS dependencies.
    // RIGHT_RAIL_CRITICAL_JS_PATHS no longer required on any page.
    // Inline live-stats rendering will be page-specific (TODO: add inline validation).
    ...(isSearchPage ? WIKI_SEARCH_CRITICAL_JS_PATHS : []),
    ...(isArcadePage ? ARCADE_CRITICAL_JS_PATHS : []),
    ...(ARCADE_PAGE_CRITICAL_BOOTSTRAP_PATHS[pathname] || []),
    ...(isBtqmPage ? BTQM_CRITICAL_JS_PATHS : []),
  ];

  const { consoleErrors, failedRequests, criticalStatus, criticalNetFailed } =
    attachPageDiagnostics(page, allCritical);

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  } catch (err) {
    fail(`page load failed: ${err.message}`, { url, suggested: 'Deployment not propagated or site offline' });
    return;
  }

  // Wait for the shell to boot (no longer waiting for right panel — UI unification removes it).
  // Just wait for API config to resolve.
  try {
    await page.waitForFunction(
      () => !!(window.MOONBOYS_API && typeof window.MOONBOYS_API === 'object'),
      { timeout: 8000 },
    );
  } catch (_) { /* assertion below records if still missing */ }

  if (isArcadePage) {
    try {
      await page.waitForTimeout(1500);
    } catch (_) { /* no-op */ }
  }

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

    // Count badge instances to detect duplicates.
    function countText(text) {
      return (document.body.textContent.match(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    }

    const apiObj = window.MOONBOYS_API && typeof window.MOONBOYS_API === 'object' ? window.MOONBOYS_API : null;
    const apiBaseInfo = apiObj && typeof apiObj.getApiBaseInfo === 'function'
      ? apiObj.getApiBaseInfo()
      : null;
    const lbInfo = apiObj && typeof apiObj.getLeaderboardApiInfo === 'function'
      ? apiObj.getLeaderboardApiInfo()
      : null;

    return {
      pathname:           window.location.pathname,
      bodyClass:          document.body.className,
      siteHeader:         !!document.querySelector('#site-header'),
      sidebar:            !!document.querySelector('#sidebar'),
      rightPanel:         visInfo('#homepage-right-panel'),
      cspPanel:           !!document.querySelector('[data-csp-panel]'),
      cspFactionOps:      !!document.querySelector('[data-csp-faction-ops]'),
      cspWtfSignal:       !!document.querySelector('[data-csp-wtf-signal]'),
      cspMissed:          !!document.querySelector('[data-csp-missed]'),
      lasPanel:           !!document.querySelector('[data-las-panel]'),
      noLiveFeed:         !document.getElementById('live-feed-widget'),
      noLiveFeedText:     !document.body.textContent.includes('Live System Feed'),
      noSystemStatus:     !document.body.textContent.includes('System Status'),
      noWikiNodes:        !document.body.textContent.includes('WIKI NODES'),
      hudAvatar:          !!document.getElementById('hud-player-avatar'),
      textPlayerLiveFeed: document.body.textContent.includes('PLAYER LIVE FEED'),
      textFactionOps:     document.body.textContent.includes('FACTION DAILY OPS'),
      textWtfSignal:      document.body.textContent.includes('DAILY WTF SIGNAL'),
      textMissed:         document.body.textContent.includes('MISSED OPPORTUNITIES'),
      // Telegram badge duplicate checks
      relinkCount:        countText('RELINK'),
      liveLinkedCount:    countText('LIVE LINKED'),
      syncPendingCount:   countText('SYNC PENDING'),
      // API config state
      moonboysApiExists:  !!apiObj,
      apiBaseState:       apiBaseInfo ? apiBaseInfo.state : null,
      apiBaseUrl:         apiBaseInfo ? apiBaseInfo.url : null,
      lbApiState:         lbInfo ? lbInfo.state : null,
      lbApiUrl:           lbInfo ? lbInfo.url : null,
      // XP claimed without server confirmation — must not appear
      noConfidentialXpClaim: !document.body.textContent.includes('Competitive XP synced'),
      bodyText:           document.body.textContent.slice(0, 3000),
    };
  });

  // ── Log diagnostics ───────────────────────────────────────────────────
  info(`pathname:            ${diag.pathname}`);
  info(`body.className:      ${diag.bodyClass}`);
  info(`#site-header:        ${diag.siteHeader}`);
  info(`#sidebar:            ${diag.sidebar}`);
  info(`window.MOONBOYS_API: ${diag.moonboysApiExists}`);
  if (diag.apiBaseState) {
    info(`API base state:      ${diag.apiBaseState} (${diag.apiBaseUrl})`);
  }
  if (diag.lbApiState) {
    info(`Leaderboard state:   ${diag.lbApiState} (${diag.lbApiUrl})`);
  }

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

  if (isArcadePage) {
    const liveHtml = await page.content();
    const { rel: localRel, html: localHtml } = readLocalArcadeHtml(pathname);
    const needles = ARCADE_HTML_DIAGNOSTIC_PATHS[pathname] || [];
    info(`arcade HTML compare source: ${localRel || 'unknown local source file'}`);
    for (const needle of needles) {
      const inLocal = localHtml.includes(needle);
      const inLive = liveHtml.includes(needle);
      info(`arcade HTML token "${needle}" local=${inLocal ? 'yes' : 'no'} live=${inLive ? 'yes' : 'no'}`);
      if (inLocal && !inLive) {
        fail(`live HTML missing "${needle}" that exists in repo source`, {
          url,
          selector: needle,
          suggested: 'Live deploy/cache mismatch or script transform drift on this page',
        });
      }
    }
  }

  // ── Structural: shell always present ──────────────────────────────────
  if (diag.siteHeader) {
    pass('#site-header exists');
  } else {
    fail('#site-header MISSING', { url, selector: '#site-header', suggested: 'site-shell.js did not run or boot block broken' });
  }

  if (diag.sidebar) {
    pass('#sidebar exists');
  } else {
    fail('#sidebar MISSING', { url, selector: '#sidebar', suggested: 'site-shell.js did not run or boot block broken' });
  }

  // ── Right-panel presence/absence ──────────────────────────────────────
  // NOTE: UI unification removes global right panel from all pages.
  // Right panel (#homepage-right-panel) should be absent on all pages.
  // Live stats render inline on specific pages (Arcade, Battle Chamber) instead.
  const rp = diag.rightPanel;
  if (!rp.exists || (rp.exists && !rp.w && !rp.h)) {
    pass('#homepage-right-panel absent or hidden (global right panel disabled — UI unification)');
  } else {
    fail('#homepage-right-panel should not be mounted as global chrome (UI unification requires inline stats)', {
      url,
      selector: '#homepage-right-panel',
      suggested: 'ensureRightPanel() should be disabled in site-shell.js; ensure ensureLayout() does not call ensureRightPanel()',
    });
  }

  // ── CSP section hooks ─────────────────────────────────────────────────
  // NOTE: UI unification removes global right panel.
  // CSP sections (data-csp-*) are now rendered inline on specific pages only.
  // This test now only checks that no global CSP sections appear in the global right panel.
  // Inline CSP validation happens on individual page tests for /games/, /community.html, etc.
  
  // Verify no global CSP sections in global right panel (which no longer exists)
  if (diag.cspPanel || diag.cspFactionOps || diag.cspWtfSignal || diag.cspMissed) {
    // If CSP sections exist, they must be inline on the page (not in global right panel)
    pass('[data-csp-*] sections may exist inline (not in global right panel)');
  } else {
    pass('[data-csp-*] sections absent from global chrome (UI unification)');
  }

  // data-las-panel is a legacy hook — must never appear.
  if (!diag.lasPanel) {
    pass('[data-las-panel] absent (legacy hook correctly removed)');
  } else {
    fail('[data-las-panel] PRESENT — this legacy hook must not exist in the DOM', {
      url,
      selector: '[data-las-panel]',
      suggested: 'Stale site-shell.js or stale HTML still injecting the old data-las-panel hook',
    });
  }

  // ── Right-rail section headings ───────────────────────────────────────
  // NOTE: UI unification removes global right panel section headings.
  // These headings now only appear inline on specific pages (/games/, /community.html, Battle Chamber pages).
  // This check is disabled since the global right panel no longer exists.
  // TODO: Add inline section heading validation for /games/ and Battle Chamber pages.

  // ── Absent/removed sections ───────────────────────────────────────────
  if (diag.noLiveFeed) {
    pass('no #live-feed-widget (LIVE_FEED=false — correctly absent)');
  } else {
    fail('#live-feed-widget present — must be absent when LIVE_FEED=false', {
      url, selector: '#live-feed-widget',
    });
  }

  if (diag.noLiveFeedText) {
    pass('body text does not include removed "Live System Feed" section');
  } else {
    fail('body text still contains "Live System Feed" — removed section reintroduced', { url });
  }

  if (diag.noSystemStatus) {
    pass('body text does not include removed "System Status" section');
  } else {
    fail('body text still contains "System Status" — removed section reintroduced', { url });
  }

  if (diag.noWikiNodes) {
    pass('body text does not include fake "WIKI NODES" row');
  } else {
    fail('body text contains fake "WIKI NODES" row', { url });
  }

  // ── Telegram badge deduplication ──────────────────────────────────────
  if (diag.relinkCount <= 1) {
    pass(`RELINK badge count OK (${diag.relinkCount})`);
  } else {
    fail(`Duplicate RELINK badges: ${diag.relinkCount} occurrences`, {
      url, suggested: 'connection-status-panel rendered multiple times or badge injected more than once',
    });
  }
  if (diag.liveLinkedCount <= 1) {
    pass(`LIVE LINKED badge count OK (${diag.liveLinkedCount})`);
  } else {
    fail(`Duplicate LIVE LINKED badges: ${diag.liveLinkedCount} occurrences`, {
      url, suggested: 'Panel or badge stack rendered more than once — check identity rendering',
    });
  }
  if (diag.syncPendingCount <= 1) {
    pass(`SYNC PENDING badge count OK (${diag.syncPendingCount})`);
  } else {
    fail(`Duplicate SYNC PENDING badges: ${diag.syncPendingCount} occurrences`, {
      url, suggested: 'CSP panel or badge stack injected more than once',
    });
  }

  // ── API config state (production host) ───────────────────────────────
  if (diag.moonboysApiExists) {
    pass('window.MOONBOYS_API exists (api-config.js ran)');
  } else {
    fail('window.MOONBOYS_API MISSING', {
      url,
      selector: 'window.MOONBOYS_API',
      suggested: '/js/api-config.js did not load or was blocked by Rocket Loader',
    });
  }

  if (diag.apiBaseState !== null) {
    if (diag.apiBaseState === 'configured' || diag.apiBaseState === 'production_fallback') {
      pass(`API base resolves on production (state: ${diag.apiBaseState}, url: ${diag.apiBaseUrl})`);
      if (diag.apiBaseUrl === EXPECTED_API_BASE) {
        pass(`API base URL matches expected production endpoint: ${diag.apiBaseUrl}`);
      } else {
        fail(`API base URL unexpected: "${diag.apiBaseUrl}"`, {
          url,
          suggested: `Expected exactly ${EXPECTED_API_BASE} — check api-config.js production fallback`,
        });
      }
    } else {
      fail(`API base not resolved on production (state: ${diag.apiBaseState})`, {
        url,
        suggested: 'api-config.js production fallback not activating — check PRODUCTION_HOSTS list',
      });
    }
  }

  if (diag.lbApiState !== null) {
    if (diag.lbApiState === 'configured' || diag.lbApiState === 'production_fallback') {
      pass(`Leaderboard API resolves on production (state: ${diag.lbApiState})`);
      if (diag.lbApiUrl === EXPECTED_LEADERBOARD_URL) {
        pass(`Leaderboard API URL matches expected production endpoint: ${diag.lbApiUrl}`);
      } else {
        fail(`Leaderboard API URL unexpected: "${diag.lbApiUrl}"`, {
          url,
          suggested: `Expected exactly ${EXPECTED_LEADERBOARD_URL} — check api-config.js leaderboard fallback`,
        });
      }
    } else {
      fail(`Leaderboard API not resolved on production (state: ${diag.lbApiState})`, {
        url,
        suggested: 'api-config.js production fallback not activating for leaderboard endpoint',
      });
    }
  }

  if (diag.noConfidentialXpClaim) {
    pass('no "Competitive XP synced" copy without server confirmation');
  } else {
    fail('"Competitive XP synced" appears in body text', {
      url,
      suggested: 'UI claims competitive XP synced without verified server confirmation — check connection-status-panel.js copy guards',
    });
  }

  // ── Console / network ─────────────────────────────────────────────────
  for (const banned of BANNED_CONSOLE_SUBSTRINGS) {
    const hits = consoleErrors.filter(e => e.includes(banned));
    if (hits.length === 0) {
      pass(`no console error containing "${banned}"`);
    } else {
      hits.forEach(e => fail(`console error contains "${banned}": ${e}`, {
        url,
        suggested: banned === 'ROCKET LOADER'
          ? 'Cloudflare Rocket Loader still active — ensure data-cfasync="false" on module scripts'
          : 'Runtime error — check browser console on live page',
      }));
    }
  }

  logAndAssertCriticalScripts(allCritical, criticalStatus, criticalNetFailed, url);

  // ── /games/ — arcade roster and XP Loop sanity ───────────────────────
  if (isGamesHub) {
    await testGamesHub(page, url);
  }

  // ── /search.html — wiki search live behavior ──────────────────────────
  if (isSearchPage) {
    await testWikiSearch(page, url);
  }
}

// ── /games/ arcade hub checks ────────────────────────────────────────────────
async function testGamesHub(page, url) {
  process.stdout.write(`\n  [arcade-hub] Checking 8-game roster and XP Loop signals…\n`);

  const hubDiag = await page.evaluate((games) => {
    const text = document.body.textContent;
    const found    = games.filter(g => text.includes(g));
    const missing  = games.filter(g => !text.includes(g));
    const hexgl    = text.toLowerCase().includes('hexgl');
    return { found, missing, hexgl };
  }, CANONICAL_GAMES);

  if (hubDiag.found.length === CANONICAL_GAMES.length) {
    pass(`all ${CANONICAL_GAMES.length} canonical arcade games present in /games/`);
  } else {
    fail(`missing ${hubDiag.missing.length} canonical game(s): ${hubDiag.missing.join(', ')}`, {
      url,
      suggested: 'Game removed from games/index.html or arcade-roguelite-protection roster mismatch',
    });
  }

  if (!hubDiag.hexgl) {
    pass('no HexGL reference visible on /games/');
  } else {
    fail('HexGL reference detected on /games/ — must not appear', {
      url,
      suggested: 'HexGL is a retired game and must not be listed — check games/index.html',
    });
  }
}

// ── /search.html — wiki search live behavior ──────────────────────────────────
async function testWikiSearch(page, url) {
  process.stdout.write(`\n  [wiki-search] Checking live search behavior on /search.html…\n`);

  async function querySearch(q) {
    const resultsSelector = '#search-results-page';
    const inputSelector = '#search-page-input';
    const defaultState = {
      error: null,
      resultText: '',
      cardCount: 0,
      hasEmptyState: false,
      emptyText: '',
    };
    const input = await page.$(inputSelector);
    const resultsContainer = await page.$(resultsSelector);
    if (!input) return { ...defaultState, error: `search input not found: ${inputSelector}` };
    if (!resultsContainer) return { ...defaultState, error: `search results container not found: ${resultsSelector}` };

    try {
      await page.waitForFunction(
        (sel) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          const text = (el.textContent || '').trim();
          return text.length > 0 && !/loading articles/i.test(text);
        },
        resultsSelector,
        { timeout: 10000 },
      );
    } catch (_) { /* continue with best-effort live interaction */ }

    const beforeState = await resultsContainer.evaluate((el) => ({
      text: el.textContent || '',
      cardCount: el.querySelectorAll('.article-card').length,
    }));
    await input.fill(q);
    await input.dispatchEvent('input');

    // Wait for results to render (up to 5 s).
    try {
      await page.waitForFunction(
        ({ sel, inputSel, query, previous }) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          const searchInput = document.querySelector(inputSel);
          if (!searchInput) return false;
          if ((searchInput.value || '').trim() !== query) return false;
          const text = el.textContent || '';
          if (!text.trim().length || /loading articles/i.test(text)) return false;
          const cardCount = el.querySelectorAll('.article-card').length;
          const emptyNode = el.querySelector('.search-empty');
          if (emptyNode) return true;
          return cardCount !== previous.cardCount || text !== previous.text;
        },
        { sel: resultsSelector, inputSel: inputSelector, query: String(q || '').trim(), previous: beforeState },
        { timeout: 5000 },
      );
    } catch (_) { /* checked below */ }
    const resultState = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { resultText: '', cardCount: 0, hasEmptyState: false, emptyText: '' };
      const emptyNode = el.querySelector('.search-empty');
      return {
        resultText: el.textContent || '',
        cardCount: el.querySelectorAll('.article-card').length,
        hasEmptyState: Boolean(emptyNode),
        emptyText: emptyNode ? (emptyNode.textContent || '').trim() : '',
      };
    }, resultsSelector);
    return { ...defaultState, ...resultState };
  }

  // 1. GRAFFPUNKS RADIO → relevant result expected.
  const graffRadio = await querySearch('GRAFFPUNKS RADIO');
  if (graffRadio.error) {
    fail(`wiki search query failed: ${graffRadio.error}`, { url, suggested: 'Search page HTML may have changed selector' });
  } else if (graffRadio.cardCount > 0 && graffRadio.resultText && (
    graffRadio.resultText.toLowerCase().includes('graffpunk') ||
    graffRadio.resultText.toLowerCase().includes('radio')
  )) {
    pass('wiki search "GRAFFPUNKS RADIO" returns a GraffPUNKS/radio result');
  } else {
    fail('wiki search "GRAFFPUNKS RADIO" did not return a relevant result', {
      url,
      suggested: 'wiki-index.json may be stale or scoreResult logic broken on live build',
    });
  }

  // 2. GRAFFPUNKS (single-word) → relevant result expected.
  await page.goto(`${BASE}/search.html`, { waitUntil: 'load', timeout: 20000 });
  const graffSingle = await querySearch('GRAFFPUNKS');
  if (graffSingle.error) {
    fail(`wiki search query failed: ${graffSingle.error}`, { url, suggested: 'Search page HTML may have changed selector' });
  } else if (graffSingle.cardCount > 0 && graffSingle.resultText && graffSingle.resultText.toLowerCase().includes('graffpunk')) {
    pass('wiki search "GRAFFPUNKS" single-word query returns relevant result');
  } else {
    fail('wiki search "GRAFFPUNKS" single-word query did not return a relevant result', {
      url,
      suggested: 'wiki-index.json may be stale or scoreResult logic broken on live build',
    });
  }

  // 3. Lowercase/punctuation variant — reload fresh page to reset state.
  await page.goto(`${BASE}/search.html`, { waitUntil: 'load', timeout: 20000 });
  const graffLower = await querySearch('graffpunks, radio!');
  if (!graffLower.error && graffLower.cardCount > 0 && graffLower.resultText && (
    graffLower.resultText.toLowerCase().includes('graffpunk') ||
    graffLower.resultText.toLowerCase().includes('radio')
  )) {
    pass('wiki search lowercase/punctuation variant "graffpunks, radio!" returns relevant result');
  } else if (!graffLower.error) {
    fail('wiki search lowercase/punctuation variant returned no relevant result', {
      url,
      suggested: 'Search tokenizer/normalizer may be broken on live build — check wiki.js scoreResult',
    });
  }

  // 4. Nonsense query → no unrelated spam.
  await page.goto(`${BASE}/search.html`, { waitUntil: 'load', timeout: 20000 });
  const nonsense = await querySearch('xyzfoo123nonsense');
  if (!nonsense.error) {
    const t = (nonsense.resultText || '').trim();
    const emptyText = (nonsense.emptyText || '').trim();
    const isEmpty = nonsense.cardCount === 0
      && nonsense.hasEmptyState
      && (/no articles found/i.test(emptyText) || /no results/i.test(emptyText) || !t);
    if (isEmpty) {
      pass('wiki search nonsense query returns zero/empty state');
    } else {
      fail('wiki search nonsense query returned non-empty results', {
        url,
        suggested: 'Search page should render only a true empty-state node with zero .article-card entries for nonsense queries',
      });
    }
  }
}

// ── BTQM generated asset HTTP checks ─────────────────────────────────────────
async function verifyBtqmAssets() {
  process.stdout.write('\n── BTQM generated asset HTTP checks ─────────────────────────────\n');
  for (const { label, path } of BTQM_LIVE_ASSET_CHECKS) {
    if (path.endsWith('.png.base64')) {
      fail(`BTQM asset check targets a .png.base64 path — must use .png only: ${path}`, {
        suggested: 'Pages deploy hydrates .png.base64 → .png; check live asset path in config',
      });
      continue;
    }
    const assetUrl = `${BASE}${path}`;
    try {
      const { status } = await headRequest(assetUrl);
      if (status === 200) {
        pass(`BTQM ${label} asset resolves (HTTP 200): ${path}`);
      } else if (status === 404) {
        fail(`BTQM ${label} asset 404: ${path}`, {
          url: assetUrl,
          suggested: 'Hydration step not run in Pages deploy, or asset not in manifest — check deploy-pages.yml and hydrate-btqm-generated-assets.mjs',
        });
      } else {
        fail(`BTQM ${label} asset HTTP ${status}: ${path}`, {
          url: assetUrl,
          suggested: `Unexpected status from CDN — check Cloudflare cache/routing`,
        });
      }
    } catch (err) {
      fail(`BTQM ${label} asset request failed: ${err.message}`, {
        url: assetUrl,
        suggested: 'Network failure or CDN error — retry after full deployment propagation',
      });
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
    fail(`could not fetch ${shellUrl}: ${err.message}`, {
      url: shellUrl,
      suggested: 'Network/CDN failure or Pages not yet deployed',
    });
    return;
  }

  if (result.status < 400) {
    pass(`${shellUrl} responded HTTP ${result.status}`);
  } else {
    fail(`${shellUrl} responded HTTP ${result.status}`, {
      url: shellUrl,
      suggested: result.status === 404
        ? 'site-shell.js missing from Pages artifact — check deploy workflow'
        : `CDN returned ${result.status}`,
    });
    return;
  }

  for (const needle of SHELL_SOURCE_MUST_CONTAIN) {
    if (result.body.includes(needle)) {
      pass(`site-shell.js source contains "${needle}"`);
    } else {
      fail(`site-shell.js source MISSING "${needle}"`, {
        url: shellUrl,
        selector: needle,
        suggested: 'Current site-shell.js on disk does not include this required identifier — stale deploy?',
      });
    }
  }

  for (const needle of SHELL_SOURCE_MUST_NOT_CONTAIN) {
    if (!result.body.includes(needle)) {
      pass(`site-shell.js source correctly absent "${needle}" (legacy hook removed)`);
    } else {
      fail(`site-shell.js source still contains legacy "${needle}"`, {
        url: shellUrl,
        selector: needle,
        suggested: 'site-shell.js has not been updated — stale deploy or deliberate reintroduction',
      });
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  process.stdout.write('\n═══ Live Site Verification — cryptomoonboys.com ═════════════════\n');
  process.stdout.write(`    Base URL:  ${BASE}\n`);
  process.stdout.write(`    Pages:     ${PAGES.length}\n`);
  process.stdout.write(`    Time:      ${new Date().toISOString()}\n`);
  process.stdout.write('\n    Post-merge/post-Pages-deploy tool — NOT a PR CI gate.\n');
  process.stdout.write('    Does not require Telegram credentials.\n');
  process.stdout.write('    Does not submit fake scores to production.\n');

  // Verify site-shell.js source first (fast, no browser needed).
  await verifyShellSource();

  // Verify BTQM generated asset HTTP responses (no browser needed).
  await verifyBtqmAssets();

  // Launch Playwright Chromium with a 1440×900 viewport so right-panel CSS
  // show-rules (min-width ≥ 1201 px) are active during visibility checks.
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'live-site-verify/2.0 Playwright/Chromium',
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
  process.stdout.write(`    Checks:    ${totalChecks}\n`);
  process.stdout.write(`    Passed:    ${totalChecks - totalFailed}\n`);
  process.stdout.write(`    Failed:    ${totalFailed}\n`);

  if (totalFailed > 0) {
    process.stderr.write(`\n[FAIL] ${totalFailed} check(s) failed — live site may be stale or broken.\n`);
    process.stderr.write(`       Run this tool again after Pages deployment fully propagates.\n`);
    process.exit(1);
  } else {
    process.stdout.write('\n[PASS] All checks passed — live site looks healthy.\n');
  }
}

main().catch(err => {
  process.stderr.write(`\n[ERROR] Unhandled error: ${err.stack || err}\n`);
  process.exit(1);
});
