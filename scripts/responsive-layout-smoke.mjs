/**
 * responsive-layout-smoke.mjs
 *
 * Browser-based visual regression smoke test.  Uses Playwright Chromium to
 * verify that the page layout is correct at desktop and mobile viewports:
 *
 *   Desktop 1440×900:  /sam.html, /graph.html, /categories/index.html, /games/pac-chain/
 *   Mobile  390×844:   /, /games/pac-chain/
 *
 * Run with:  node scripts/responsive-layout-smoke.mjs
 */

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, extname, dirname, resolve as resolvePath, normalize, sep } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolvePath(join(__dirname, '..'));
// Port 0 lets the OS pick a free port automatically.
// Set RESPONSIVE_LAYOUT_SMOKE_PORT to force a specific port (e.g. in CI).
const PORT      = Number(process.env.RESPONSIVE_LAYOUT_SMOKE_PORT) || 0;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.json': 'application/json',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.ico':  'image/x-icon',
};

// ── Local static server ──────────────────────────────────────────────────────

const server = createServer((req, res) => {
  // Normalise path: strip query string, resolve '..' components, strip leading slash.
  const rawPath = (req.url || '/').split('?')[0];
  // normalize() collapses '..' and '.' sequences
  const normalised = normalize(rawPath).replace(/\\/g, '/');
  let rel = normalised.startsWith('/') ? normalised.slice(1) : normalised;
  if (!rel || rel === '.') rel = 'index.html';
  else if (!extname(rel)) rel = rel.replace(/\/?$/, '/index.html');

  // Resolve to an absolute path and enforce it is within ROOT
  const full = resolvePath(ROOT, rel);
  if (!full.startsWith(ROOT + sep) && full !== ROOT) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (existsSync(full)) {
    res.writeHead(200, { 'Content-Type': MIME[extname(full)] || 'text/plain' });
    res.end(readFileSync(full));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// ── Test helpers ─────────────────────────────────────────────────────────────

function info(msg) { process.stdout.write('  ' + msg + '\n'); }

async function getMetrics(page) {
  return page.evaluate(() => {
    const vw  = window.innerWidth;
    const vh  = window.innerHeight;
    const docSW  = document.documentElement.scrollWidth;
    const bodySW = document.body.scrollWidth;

    const bb = (sel) => {
      const el = typeof sel === 'string'
        ? (sel.startsWith('#') ? document.getElementById(sel.slice(1)) : document.querySelector(sel))
        : null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      return { w: Math.round(r.width), right: Math.round(r.right), display: cs.display,
               maxWidth: cs.maxWidth, position: cs.position };
    };

    // Check for visible persistent floating cards with no close button
    const floatingCards = Array.from(document.querySelectorAll(
      '.arcade-retention-toast, #arcade-retention-mission-chip, .pc-overlay:not(.hidden)'
    )).filter(el => {
      const cs = window.getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    });

    const floatingWithoutClose = floatingCards.filter(card => {
      return !card.querySelector('[aria-label="Close"], .art-close, .pc-modal-close');
    });

    return {
      vw, vh, docSW, bodySW,
      hOverflow: docSW > vw + 2,
      layout:    bb('#layout'),
      mainWrapper: bb('#main-wrapper'),
      content:   bb('#content'),
      header:    bb('#site-header'),
      rightPanel: bb('#homepage-right-panel'),
      hero:      bb('.home-hero'),
      floatingWithoutCloseCount: floatingWithoutClose.length,
      floatingWithoutCloseLabels: floatingWithoutClose.map(el => el.className),

      // Check for cards/boxes using clip-path (chamfered corners).
      // Only count elements that are genuinely visible: not display:none, not
      // visibility:hidden, not opacity:0, and with a non-zero bounding box that
      // intersects the viewport.
      clipPathCards: Array.from(document.querySelectorAll(
        '.category-card, .article-card, .retro-hud-box, .retro-info-panel, .home-widget, ' +
        '.launch-cta-primary, .launch-cta-secondary, .launch-route, .retro-panel, .page-hero, ' +
        '.sidebar-section, .csp-panel, .las-panel, .lb-tab, .lb-table-outer, ' +
        '.lb-faction, .lb-linked-identity, .lb-presence-btn, .lb-bd-row, ' +
        '.lb-graph-wrap, .article-list-item, .dash-section, .sam-panel, ' +
        '#lb-refresh-btn, #lb-breakdown-panel, #lb-graph-reset, .home-hero'
      )).filter(el => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
        const bb = el.getBoundingClientRect();
        if (bb.width <= 0 || bb.height <= 0) return false;
        // Must intersect the viewport
        if (bb.bottom < 0 || bb.top > window.innerHeight || bb.right < 0 || bb.left > window.innerWidth) return false;
        return style.clipPath && style.clipPath !== 'none';
      }).length,
    };
  });
}

// ── Assertions ────────────────────────────────────────────────────────────────

const failures = [];

function assert(cond, label) {
  if (cond) {
    info(`  ✓ ${label}`);
  } else {
    info(`  ✗ ${label}`);
    failures.push(label);
  }
}

async function runPage(browser, path, vw, vh, label, screenshotDir, port) {
  const ctx  = await browser.newContext({ viewport: { width: vw, height: vh } });
  const page = await ctx.newPage();

  // Block external requests to speed up tests and avoid flakiness
  await page.route('**', (route) => {
    const url = route.request().url();
    if (url.startsWith(`http://localhost:${port}`)) route.continue();
    else route.fulfill({ status: 200, body: '' });
  });

  await page.goto(`http://localhost:${port}${path}`, { timeout: 20000, waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  const m = await getMetrics(page);

  info('');
  info(`── ${label} ${vw}×${vh} ${path} ──`);
  info(`   docScrollW=${m.docSW} bodyScrollW=${m.bodySW} vw=${m.vw}`);
  if (m.layout)     info(`   #layout:       w=${m.layout.w} display=${m.layout.display}`);
  if (m.mainWrapper) info(`   #main-wrapper: w=${m.mainWrapper.w}`);
  if (m.content)    info(`   #content:      w=${m.content.w} maxWidth=${m.content.maxWidth}`);
  if (m.rightPanel) info(`   #right-panel:  display=${m.rightPanel.display}`);
  if (m.hero)       info(`   .home-hero:    w=${m.hero.w} right=${m.hero.right}`);

  // ── No horizontal scroll ───────────────────────────────────────────────────
  assert(!m.hOverflow,
    `${label}: no horizontal overflow (docScrollW=${m.docSW} ≤ vw=${m.vw}+2)`);

  assert(m.bodySW <= m.vw + 2,
    `${label}: body no overflow (bodySW=${m.bodySW} ≤ vw=${m.vw}+2)`);

  // ── Header fits viewport ───────────────────────────────────────────────────
  if (m.header) {
    assert(m.header.w <= m.vw + 2,
      `${label}: header fits viewport (header.w=${m.header.w} ≤ vw=${m.vw})`);
  }

  // ── Main-wrapper expands properly ─────────────────────────────────────────
  if (m.mainWrapper && m.rightPanel && m.rightPanel.display === 'none') {
    // No right panel — main-wrapper should cover most of the non-sidebar space
    const sidebar = 260;
    const expected = m.vw - sidebar;
    assert(m.mainWrapper.w >= expected * 0.85,
      `${label}: main-wrapper fills available width (no right panel): ${m.mainWrapper.w} ≥ ${Math.round(expected * 0.85)}`);
  }

  // ── Content fills main-wrapper ────────────────────────────────────────────
  if (m.content && m.mainWrapper) {
    assert(m.content.w >= m.mainWrapper.w * 0.95,
      `${label}: #content fills #main-wrapper (content=${m.content.w} ≥ mw*0.95=${Math.round(m.mainWrapper.w * 0.95)})`);
  }

  // ── Mobile: main-wrapper must be full-width ───────────────────────────────
  if (vw <= 900 && m.mainWrapper) {
    assert(m.mainWrapper.w >= m.vw * 0.95,
      `${label}: mobile main-wrapper fills viewport (${m.mainWrapper.w} ≥ ${Math.round(m.vw * 0.95)})`);
  }

  // ── Hero panel stays within viewport ─────────────────────────────────────
  if (m.hero) {
    assert(m.hero.right <= m.vw + 4,
      `${label}: .home-hero right edge within viewport (${m.hero.right} ≤ ${m.vw}+4)`);
  }

  // ── No visible persistent floating cards without a close button ───────────
  assert(m.floatingWithoutCloseCount === 0,
    `${label}: all visible floating cards have a close button (found ${m.floatingWithoutCloseCount} without)`);

  // ── Cards must not have clip-path (no chamfered/polygon corners) ──────────
  if (m.clipPathCards !== undefined) {
    assert(m.clipPathCards === 0,
      `${label}: no visible cards use clip-path (found ${m.clipPathCards} with clip-path)`);
  }

  // ── Take screenshot when failures exist (best-effort, requires SCREENSHOT_DIR) ──
  if (screenshotDir && failures.length > 0) {
    const safeName = label.replace(/[^a-z0-9]/gi, '_') + '_' + vw + 'x' + vh + '.png';
    try {
      mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({ path: join(screenshotDir, safeName), fullPage: false });
    } catch (_) { /* screenshot is best-effort */ }
  }

  await ctx.close();
  return m;
}

// ── Mobile navigation test ────────────────────────────────────────────────────

async function runMobileNavTest(browser, port) {
  info('');
  info('── mobile nav test 390×844 / ──');

  const ctx  = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  await page.route('**', (route) => {
    const url = route.request().url();
    if (url.startsWith(`http://localhost:${port}`)) route.continue();
    else route.fulfill({ status: 200, body: '' });
  });

  await page.goto(`http://localhost:${port}/`, { timeout: 20000, waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  // ── Hamburger must be visible ──────────────────────────────────────────────
  const hamburger = page.locator('#hamburger');
  const hamVisible = await hamburger.isVisible().catch(() => false);
  assert(hamVisible, 'mobile nav: hamburger is visible');

  // ── aria-expanded starts false ────────────────────────────────────────────
  const ariaExpandedInit = await hamburger.getAttribute('aria-expanded').catch(() => null);
  assert(ariaExpandedInit === 'false',
    `mobile nav: hamburger aria-expanded="false" before open (got "${ariaExpandedInit}")`);

  // ── Sidebar starts off-screen ──────────────────────────────────────────────
  const sidebarInitBB = await page.evaluate(() => {
    const s = document.getElementById('sidebar');
    if (!s) return null;
    const bb = s.getBoundingClientRect();
    return { left: bb.left, right: bb.right };
  });
  // The sidebar should be off-screen to the left (right edge at or below epsilon).
  const SIDEBAR_OFFSCREEN_EPSILON = 1;
  assert(sidebarInitBB && sidebarInitBB.right <= SIDEBAR_OFFSCREEN_EPSILON,
    `mobile nav: sidebar starts off-screen (right=${sidebarInitBB ? sidebarInitBB.right : 'null'})`);

  // ── Click hamburger — sidebar must open ───────────────────────────────────
  await hamburger.click();
  await page.waitForTimeout(400);

  const afterOpen = await page.evaluate(() => {
    const s = document.getElementById('sidebar');
    const h = document.getElementById('hamburger');
    if (!s || !h) return { error: 'elements missing' };
    const bb = s.getBoundingClientRect();
    const firstLink = s.querySelector('a');
    const firstLinkBB = firstLink ? firstLink.getBoundingClientRect() : null;
    return {
      sidebarHasOpen: s.classList.contains('open'),
      sidebarOnScreen: bb.right > 0 && bb.left < window.innerWidth,
      sidebarLeft: bb.left,
      sidebarRight: bb.right,
      ariaExpanded: h.getAttribute('aria-expanded'),
      firstLinkVisible: firstLinkBB ? (firstLinkBB.width > 0 && firstLinkBB.height > 0) : false,
      firstLinkLeft: firstLinkBB ? firstLinkBB.left : -1,
    };
  });

  assert(afterOpen.sidebarHasOpen === true,
    'mobile nav: sidebar has .open class after hamburger click');
  assert(afterOpen.sidebarOnScreen === true,
    `mobile nav: sidebar is on-screen after click (left=${afterOpen.sidebarLeft} right=${afterOpen.sidebarRight})`);
  assert(afterOpen.ariaExpanded === 'true',
    `mobile nav: hamburger aria-expanded="true" after open (got "${afterOpen.ariaExpanded}")`);
  assert(afterOpen.firstLinkVisible === true,
    'mobile nav: first sidebar nav link is visible after open');
  assert(afterOpen.firstLinkLeft >= 0,
    `mobile nav: first nav link starts within viewport (left=${afterOpen.firstLinkLeft})`);

  // ── Press Escape — sidebar must close ─────────────────────────────────────
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  const afterEscape = await page.evaluate(() => {
    const s = document.getElementById('sidebar');
    const h = document.getElementById('hamburger');
    if (!s || !h) return { error: 'elements missing' };
    return {
      sidebarHasOpen: s.classList.contains('open'),
      ariaExpanded: h.getAttribute('aria-expanded'),
    };
  });

  assert(afterEscape.sidebarHasOpen === false,
    'mobile nav: sidebar .open removed after Escape');
  assert(afterEscape.ariaExpanded === 'false',
    `mobile nav: hamburger aria-expanded="false" after Escape (got "${afterEscape.ariaExpanded}")`);

  await ctx.close();
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const screenshotDir = process.env.SCREENSHOT_DIR || null;
  console.log('\nResponsive layout smoke tests\n');

  return new Promise((resolve) => {
    // Fail cleanly if the server cannot bind (e.g. EADDRINUSE on a fixed port).
    // Remove the error listener once listen succeeds so only one path resolves.
    const onServerError = (err) => {
      console.error('Server error:', err.message);
      resolve(1);
    };
    server.once('error', onServerError);

    server.listen(PORT, async () => {
      // Bind succeeded — no longer need the error-before-listen handler
      server.removeListener('error', onServerError);

      const actualPort = server.address().port;
      const browser = await chromium.launch();

      // Desktop 1440×900
      const desktopPages = [
        '/sam.html',
        '/graph.html',
        '/categories/index.html',
        '/games/pac-chain/',
        '/search.html',
        '/games/',
      ];
      for (const p of desktopPages) {
        await runPage(browser, p, 1440, 900, 'desktop', screenshotDir, actualPort);
      }

      // Also check at 1920×1080 to validate no empty right gutter
      for (const p of ['/sam.html', '/graph.html']) {
        await runPage(browser, p, 1920, 1080, 'desktop-wide', screenshotDir, actualPort);
      }

      // Mobile 390×844
      const mobilePages = ['/', '/games/pac-chain/', '/search.html'];
      for (const p of mobilePages) {
        await runPage(browser, p, 390, 844, 'mobile', screenshotDir, actualPort);
      }

      // Mobile navigation test (hamburger open/close)
      await runMobileNavTest(browser, actualPort);

      await browser.close();
      server.close();

      console.log('');
      if (failures.length === 0) {
        console.log('Responsive layout smoke tests passed ✅');
        resolve(0);
      } else {
        console.log(`Responsive layout smoke tests FAILED ❌\n${failures.length} assertion(s) failed:`);
        for (const f of failures) console.log('  • ' + f);
        resolve(1);
      }
    });
  });
}

main().then((code) => process.exit(code));
