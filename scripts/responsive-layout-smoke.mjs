/**
 * responsive-layout-smoke.mjs
 *
 * Browser-based visual regression smoke test.  Uses Playwright Chromium to
 * verify that the page layout is correct at desktop and mobile viewports.
 *
 * Desktop 1440×900:
 *   /sam.html, /graph.html, /categories/index.html, /community.html,
 *   /games/pac-chain/, /games/, /games/leaderboard.html, /how-to-play.html, /search.html
 *
 * Mobile 390×844:
 *   /, /community.html, /categories/index.html, /games/pac-chain/,
 *   /games/, /games/leaderboard.html, /how-to-play.html, /search.html
 *
 * Additional checks:
 *   - Telegram sync CTA / incubator link on required pages
 *   - Category card readability (stacked, not crushed) at mobile
 *   - Sidebar incubator/Telegram link visible when open
 *   - Mobile hamburger nav open/close cycle
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

/**
 * runMobileNavTest(browser, port, path)
 *
 * Verifies the mobile hamburger/sidebar open-close cycle on a single page:
 *   1. #hamburger and #sidebar must exist
 *   2. Sidebar initially off-screen
 *   3. Click hamburger → body.sidebar-open, aria-expanded="true", sidebar on-screen
 *   4. Press Escape → body.sidebar-open removed, aria-expanded="false"
 */
async function runMobileNavTest(browser, port, path) {
  info('');
  info(`── mobile nav test 390×844 ${path} ──`);

  const ctx  = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  await page.route('**', (route) => {
    const url = route.request().url();
    if (url.startsWith(`http://localhost:${port}`)) route.continue();
    else route.fulfill({ status: 200, body: '' });
  });

  await page.goto(`http://localhost:${port}${path}`, { timeout: 20000, waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  const label = `mobile nav [${path}]`;

  // ── #hamburger and #sidebar must exist (early-return on missing) ──────────
  const hamburger = page.locator('#hamburger');
  const hamExists = await hamburger.count().catch(() => 0);
  const sidebarExists = await page.evaluate(() => !!document.getElementById('sidebar'));
  assert(hamExists > 0, `${label}: #hamburger exists`);
  assert(sidebarExists, `${label}: #sidebar exists`);
  if (!hamExists || !sidebarExists) { await ctx.close(); return; }

  // ── Hamburger must be visible ──────────────────────────────────────────────
  const hamVisible = await hamburger.isVisible().catch(() => false);
  assert(hamVisible, `${label}: #hamburger is visible`);

  // ── aria-expanded starts false ────────────────────────────────────────────
  const ariaExpandedInit = await hamburger.getAttribute('aria-expanded').catch(() => null);
  assert(ariaExpandedInit === 'false',
    `${label}: aria-expanded="false" before open (got "${ariaExpandedInit}")`);

  // ── Sidebar starts off-screen ──────────────────────────────────────────────
  const sidebarInitBB = await page.evaluate(() => {
    const s = document.getElementById('sidebar');
    if (!s) return null;
    const bb = s.getBoundingClientRect();
    return { left: bb.left, right: bb.right };
  });
  const SIDEBAR_OFFSCREEN_EPSILON = 1;
  assert(sidebarInitBB && sidebarInitBB.right <= SIDEBAR_OFFSCREEN_EPSILON,
    `${label}: sidebar starts off-screen (right=${sidebarInitBB ? sidebarInitBB.right : 'null'})`);

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
      bodyHasSidebarOpen: document.body.classList.contains('sidebar-open'),
      sidebarOnScreen: bb.right > 0 && bb.left < window.innerWidth,
      sidebarLeft: bb.left,
      sidebarRight: bb.right,
      ariaExpanded: h.getAttribute('aria-expanded'),
      firstLinkVisible: firstLinkBB ? (firstLinkBB.width > 0 && firstLinkBB.height > 0) : false,
      firstLinkLeft: firstLinkBB ? firstLinkBB.left : -1,
    };
  });

  assert(afterOpen.bodyHasSidebarOpen === true,
    `${label}: body.sidebar-open set after hamburger click`);
  assert(afterOpen.sidebarOnScreen === true,
    `${label}: sidebar on-screen after click (left=${afterOpen.sidebarLeft} right=${afterOpen.sidebarRight})`);
  assert(afterOpen.ariaExpanded === 'true',
    `${label}: aria-expanded="true" after open (got "${afterOpen.ariaExpanded}")`);
  assert(afterOpen.firstLinkVisible === true,
    `${label}: first sidebar nav link visible after open`);
  assert(afterOpen.firstLinkLeft >= 0,
    `${label}: first nav link within viewport (left=${afterOpen.firstLinkLeft})`);

  // ── Press Escape — sidebar must close ─────────────────────────────────────
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  const afterEscape = await page.evaluate(() => {
    const s = document.getElementById('sidebar');
    const h = document.getElementById('hamburger');
    if (!s || !h) return { error: 'elements missing' };
    const bb = s.getBoundingClientRect();
    return {
      bodyHasSidebarOpen: document.body.classList.contains('sidebar-open'),
      sidebarOffScreen: bb.right <= 1,
      ariaExpanded: h.getAttribute('aria-expanded'),
    };
  });

  assert(afterEscape.bodyHasSidebarOpen === false,
    `${label}: body.sidebar-open removed after Escape`);
  assert(afterEscape.sidebarOffScreen === true,
    `${label}: sidebar off-screen after Escape`);
  assert(afterEscape.ariaExpanded === 'false',
    `${label}: aria-expanded="false" after Escape (got "${afterEscape.ariaExpanded}")`);

  // ── Script-order assertions (static DOM check) ────────────────────────────
  const scriptCheck = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    const srcs = scripts.map(s => ({ src: s.getAttribute('src'), cfasync: s.getAttribute('data-cfasync') }));
    const shellIdx  = srcs.findIndex(s => /\/js\/site-shell\.js/.test(s.src));
    const wikiIdx   = srcs.findIndex(s => /\/js\/wiki\.js/.test(s.src));
    const wikiCf    = wikiIdx !== -1 ? srcs[wikiIdx].cfasync : null;
    return {
      hasShell: shellIdx !== -1,
      hasWiki:  wikiIdx  !== -1,
      shellBeforeWiki: shellIdx !== -1 && wikiIdx !== -1 && shellIdx < wikiIdx,
      wikiHasCfasync: wikiCf === 'false',
    };
  });

  if (scriptCheck.hasShell && scriptCheck.hasWiki) {
    assert(scriptCheck.shellBeforeWiki,
      `${label}: site-shell.js appears before wiki.js in script list`);
  }
  if (scriptCheck.hasWiki) {
    assert(scriptCheck.wikiHasCfasync,
      `${label}: wiki.js has data-cfasync="false"`);
  }

  await ctx.close();
}

// ── Telegram sync CTA / incubator link check ──────────────────────────────
/**
 * runTelegramSyncCheck(browser, port, path)
 *
 * Verifies that a page has a VISIBLE, user-facing Telegram sync entry point.
 *
 * Pass criteria (one must be true):
 *   a) A rendered .tg-sync-cta element is visible:
 *        display !== none, visibility !== hidden, opacity !== 0,
 *        bounding box width > 0, height > 0, intersects viewport.
 *   OR
 *   b) An <a href="/gkniftyheads-incubator.html"> is visible with the same
 *      criteria.
 *
 * A bare [data-tg-sync-cta] mount point without a rendered child is NOT a pass.
 */
async function runTelegramSyncCheck(browser, port, pagePath) {
  info('');
  info(`── tg-sync check 390×844 ${pagePath} ──`);

  const ctx  = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  await page.route('**', (route) => {
    const url = route.request().url();
    if (url.startsWith(`http://localhost:${port}`)) route.continue();
    else route.fulfill({ status: 200, body: '' });
  });

  await page.goto(`http://localhost:${port}${pagePath}`, { timeout: 20000, waitUntil: 'networkidle' });

  // If a mount point exists, wait briefly for the component script to render it.
  const hasMountPoint = await page.evaluate(() => !!document.querySelector('[data-tg-sync-cta]'));
  if (hasMountPoint) {
    // Give the sync CTA component script time to mount its HTML into the placeholder
    await page.waitForTimeout(600);
  } else {
    await page.waitForTimeout(200);
  }

  const label = `tg-sync [${pagePath}]`;

  /**
   * isElementStrictlyVisible(el) — comprehensive visibility check:
   *   - display !== none
   *   - visibility !== hidden
   *   - opacity !== 0
   *   - bounding box width > 0
   *   - bounding box height > 0
   *   - top < window.innerHeight  (top of element is above bottom of viewport)
   *   - bottom > 0                (bottom of element is below top of viewport)
   */
  const check = await page.evaluate(() => {
    function isElementStrictlyVisible(el) {
      if (!el) return false;
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none')      return false;
      if (cs.visibility === 'hidden') return false;
      if (parseFloat(cs.opacity) === 0) return false;
      const bb = el.getBoundingClientRect();
      if (bb.width <= 0 || bb.height <= 0) return false;
      if (bb.top >= window.innerHeight)     return false;
      if (bb.bottom <= 0)                   return false;
      return true;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Check .tg-sync-cta (rendered CTA banner)
    const ctaEl = document.querySelector('.tg-sync-cta');
    const ctaVisible = isElementStrictlyVisible(ctaEl);
    const ctaBB = ctaEl ? ctaEl.getBoundingClientRect() : null;

    // Check the primary Link Telegram button inside the CTA
    const ctaBtn = document.querySelector('.tg-sync-cta-btn');
    const ctaBtnHref   = ctaBtn ? ctaBtn.getAttribute('href') : null;
    const ctaBtnTarget = ctaBtn ? ctaBtn.getAttribute('target') : null;
    const ctaBtnRel    = ctaBtn ? (ctaBtn.getAttribute('rel') || '') : null;
    const ctaBtnVisible = isElementStrictlyVisible(ctaBtn);

    // Check any <a href="/gkniftyheads-incubator.html"> visible link
    const links = Array.from(document.querySelectorAll('a[href="/gkniftyheads-incubator.html"]'));
    let hasVisibleLink = false;
    let visibleLinkBB = null;
    for (const link of links) {
      if (isElementStrictlyVisible(link)) {
        hasVisibleLink = true;
        visibleLinkBB = link.getBoundingClientRect();
        break;
      }
    }

    return {
      vw, vh,
      ctaVisible,
      ctaBB: ctaBB ? { w: Math.round(ctaBB.width), h: Math.round(ctaBB.height), top: Math.round(ctaBB.top) } : null,
      visibleLink: hasVisibleLink,
      visibleLinkBB: visibleLinkBB ? { w: Math.round(visibleLinkBB.width), h: Math.round(visibleLinkBB.height), top: Math.round(visibleLinkBB.top) } : null,
      // Primary CTA button info
      ctaBtnHref, ctaBtnTarget, ctaBtnRel, ctaBtnVisible,
      // Diagnostic info
      hasMountPoint: !!document.querySelector('[data-tg-sync-cta]'),
      mountPointHasChildren: (() => { const mp = document.querySelector('[data-tg-sync-cta]'); return mp ? mp.children.length > 0 : false; })(),
    };
  });

  info(`  vw=${check.vw} vh=${check.vh} ctaVisible=${check.ctaVisible} visibleLink=${check.visibleLink}`);
  if (check.ctaBB) info(`  .tg-sync-cta: ${check.ctaBB.w}×${check.ctaBB.h} top=${check.ctaBB.top}`);
  if (check.visibleLinkBB) info(`  a[incubator]: ${check.visibleLinkBB.w}×${check.visibleLinkBB.h} top=${check.visibleLinkBB.top}`);
  info(`  mountPoint=${check.hasMountPoint} mountHasChildren=${check.mountPointHasChildren}`);
  if (check.ctaBtnHref !== null) info(`  .tg-sync-cta-btn: href=${check.ctaBtnHref} target=${check.ctaBtnTarget} rel=${check.ctaBtnRel} visible=${check.ctaBtnVisible}`);

  assert(check.ctaVisible || check.visibleLink,
    `${label}: visible Telegram sync CTA (.tg-sync-cta) or visible incubator link must exist with non-zero bounding box (ctaVisible=${check.ctaVisible} visibleLink=${check.visibleLink})`);

  // If the CTA rendered and the button is present, assert bot URL + security attrs
  if (check.ctaVisible && check.ctaBtnHref !== null) {
    assert(check.ctaBtnHref === 'https://t.me/WIKICOMSBOT',
      `${label}: .tg-sync-cta-btn href must be https://t.me/WIKICOMSBOT (got ${check.ctaBtnHref})`);
    assert(check.ctaBtnTarget === '_blank',
      `${label}: .tg-sync-cta-btn must have target="_blank" (got ${check.ctaBtnTarget})`);
    assert(check.ctaBtnRel && check.ctaBtnRel.includes('noopener'),
      `${label}: .tg-sync-cta-btn rel must include noopener (got ${check.ctaBtnRel})`);
    assert(check.ctaBtnVisible,
      `${label}: .tg-sync-cta-btn must be visible and clickable`);
  }

  await ctx.close();
}

// ── Category card readability check ───────────────────────────────────────
/**
 * runCategoryCardCheck(browser, port)
 *
 * At 390×844, verifies that /categories/index.html shows category cards in a
 * stacked readable layout:
 *   - Card width is close to viewport width (not squeezed into two columns)
 *   - Icon is above (or at same y-start as) text — not beside it
 *   - Card text div width is wide enough to be readable (>= 200px)
 *   - No card forces the icon and text into a horizontal row so narrow
 *     that text can only be read one character per line
 */
async function runCategoryCardCheck(browser, port) {
  info('');
  info(`── category card check 390×844 /categories/index.html ──`);

  const ctx  = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  await page.route('**', (route) => {
    const url = route.request().url();
    if (url.startsWith(`http://localhost:${port}`)) route.continue();
    else route.fulfill({ status: 200, body: '' });
  });

  await page.goto(`http://localhost:${port}/categories/index.html`, { timeout: 20000, waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  const label = 'category-cards [/categories/index.html]';

  const m = await page.evaluate(() => {
    const vw = window.innerWidth;
    const cards = Array.from(document.querySelectorAll('.category-card'));
    return {
      vw,
      count: cards.length,
      // Check first few visible cards
      cards: cards.slice(0, 4).map(el => {
        const bb   = el.getBoundingClientRect();
        const cs   = window.getComputedStyle(el);
        const icon = el.querySelector('.cat-icon');
        const textDiv = icon ? icon.nextElementSibling : el.querySelector('div');
        const iconBB  = icon ? icon.getBoundingClientRect() : null;
        const textBB  = textDiv ? textDiv.getBoundingClientRect() : null;
        return {
          w:        Math.round(bb.width),
          right:    Math.round(bb.right),
          flexDir:  cs.flexDirection,
          iconBottom: iconBB ? Math.round(iconBB.bottom) : null,
          textTop:    textBB ? Math.round(textBB.top)    : null,
          textW:      textBB ? Math.round(textBB.width)  : null,
        };
      }),
    };
  });

  if (m.count === 0) {
    info(`${label}: no .category-card elements found, skipping checks`);
    await ctx.close();
    return;
  }

  // Each card should be at least 280px wide (≥72% of 390px viewport)
  for (let i = 0; i < m.cards.length; i++) {
    const c = m.cards[i];
    assert(c.w >= 280,
      `${label}: card[${i}] width ${c.w}px ≥ 280px (readable, not crushed)`);
    assert(c.right <= m.vw + 4,
      `${label}: card[${i}] right edge ${c.right} ≤ vw ${m.vw}+4 (no overflow)`);
    // Icon must be above (or same row start as) text — not to the left with
    // text crushed into a narrow column.
    // In a stacked layout: iconBottom ≤ textTop + small epsilon
    // In a horizontal layout with very narrow text: textW would be tiny.
    if (c.textW !== null) {
      assert(c.textW >= 200,
        `${label}: card[${i}] text div width ${c.textW}px ≥ 200px (not single-column letters)`);
    }
    if (c.iconBottom !== null && c.textTop !== null) {
      // Icon bottom should be at or before the text block's vertical centre
      // (stacked) OR text should have a reasonable width (not crushed horizontal)
      const iconAboveText = c.iconBottom <= c.textTop + 8;
      const textReadable  = c.textW !== null && c.textW >= 200;
      assert(iconAboveText || textReadable,
        `${label}: card[${i}] icon is above text or text has readable width (iconBottom=${c.iconBottom} textTop=${c.textTop} textW=${c.textW})`);
    }
  }

  await ctx.close();
}

// ── Sidebar incubator link check (when sidebar is open) ───────────────────
/**
 * runSidebarIncubatorCheck(browser, port)
 *
 * Opens the mobile sidebar and verifies that a link to
 * /gkniftyheads-incubator.html is visible/clickable inside it.
 */
async function runSidebarIncubatorCheck(browser, port) {
  info('');
  info(`── sidebar incubator check 390×844 / ──`);

  const ctx  = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  await page.route('**', (route) => {
    const url = route.request().url();
    if (url.startsWith(`http://localhost:${port}`)) route.continue();
    else route.fulfill({ status: 200, body: '' });
  });

  await page.goto(`http://localhost:${port}/`, { timeout: 20000, waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  const label = 'sidebar-incubator [/]';

  const hamburger = page.locator('#hamburger');
  const hamExists = await hamburger.count().catch(() => 0);
  assert(hamExists > 0, `${label}: #hamburger exists`);
  if (!hamExists) { await ctx.close(); return; }

  await hamburger.click();
  await page.waitForTimeout(400);

  const incubatorLink = await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return { exists: false, visible: false, text: '', left: -1, top: -1, bottom: -1 };
    const link = sidebar.querySelector('a[href="/gkniftyheads-incubator.html"]');
    if (!link) return { exists: false, visible: false, text: '', left: -1, top: -1, bottom: -1 };
    const bb  = link.getBoundingClientRect();
    const cs  = window.getComputedStyle(link);
    const vw  = window.innerWidth;
    const vh  = window.innerHeight;
    return {
      exists:  true,
      visible: (
        cs.display !== 'none' &&
        cs.visibility !== 'hidden' &&
        parseFloat(cs.opacity) !== 0 &&
        bb.width > 0 && bb.height > 0 &&
        bb.left >= 0 && bb.left < vw &&
        bb.top  >= 0 && bb.bottom <= vh
      ),
      text:   link.textContent.trim(),
      left:   Math.round(bb.left),
      top:    Math.round(bb.top),
      bottom: Math.round(bb.bottom),
    };
  });

  assert(incubatorLink.exists,
    `${label}: sidebar has a[href="/gkniftyheads-incubator.html"]`);
  assert(incubatorLink.visible,
    `${label}: sidebar incubator link is visible within viewport (left=${incubatorLink.left}px top=${incubatorLink.top}px bottom=${incubatorLink.bottom}px)`);

  await ctx.close();
}

// ── Community page mobile overflow check ─────────────────────────────────────
/**
 * runCommunityMobileOverflowCheck(browser, port)
 *
 * At 390×844, verifies that /community.html has no horizontal overflow.
 * Asserts:
 *   - document.documentElement.scrollWidth <= window.innerWidth + 2
 *   - document.body.scrollWidth <= window.innerWidth + 2
 *   - #content fits within viewport
 *   - .page-hero and .section elements fit within viewport
 *   - "BATTLE CHAMBER" heading does not exceed viewport width
 *   - No visible panel's right edge exceeds viewport width
 *
 * Also verifies at 1440×900 desktop: no horizontal overflow.
 */
async function runCommunityMobileOverflowCheck(browser, port) {
  // ── mobile 390×844 ──
  info('');
  info('── community mobile overflow check 390×844 /community.html ──');

  const mCtx  = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mPage = await mCtx.newPage();
  await mPage.route('**', (route) => {
    const url = route.request().url();
    if (url.startsWith(`http://localhost:${port}`)) route.continue();
    else route.fulfill({ status: 200, body: '' });
  });
  await mPage.goto(`http://localhost:${port}/community.html`, { timeout: 20000, waitUntil: 'networkidle' });
  await mPage.waitForTimeout(600);

  const mob = await mPage.evaluate(() => {
    const vw = window.innerWidth;
    const scrollW = document.documentElement.scrollWidth;
    const bodyScrollW = document.body.scrollWidth;

    // Check #content
    const content = document.getElementById('content');
    const contentBB = content ? content.getBoundingClientRect() : null;

    // Check .page-hero
    const hero = document.querySelector('.page-hero');
    const heroBB = hero ? hero.getBoundingClientRect() : null;

    // Check heading
    const h1 = document.querySelector('.page-hero h1');
    const h1BB = h1 ? h1.getBoundingClientRect() : null;

    // Check all .section panels
    const sections = Array.from(document.querySelectorAll('.section'));
    const sectionOverflow = sections.filter(s => s.getBoundingClientRect().right > vw + 2);

    // Check community cards/grids
    const panels = Array.from(document.querySelectorAll('.community-card, .community-grid, .community-hero-grid'));
    const panelOverflow = panels.filter(p => {
      const bb = p.getBoundingClientRect();
      return bb.right > vw + 2;
    }).map(p => ({
      cls: p.className.slice(0, 60),
      right: Math.round(p.getBoundingClientRect().right),
      width: Math.round(p.getBoundingClientRect().width),
    }));

    return {
      vw, scrollW, bodyScrollW,
      contentRight: contentBB ? Math.round(contentBB.right) : null,
      contentWidth: contentBB ? Math.round(contentBB.width) : null,
      heroRight: heroBB ? Math.round(heroBB.right) : null,
      heroWidth: heroBB ? Math.round(heroBB.width) : null,
      h1Right: h1BB ? Math.round(h1BB.right) : null,
      h1Width: h1BB ? Math.round(h1BB.width) : null,
      sectionOverflowCount: sectionOverflow.length,
      panelOverflow,
    };
  });

  info(`  vw=${mob.vw} scrollW=${mob.scrollW} bodyScrollW=${mob.bodyScrollW}`);
  info(`  #content: right=${mob.contentRight} w=${mob.contentWidth}`);
  info(`  .page-hero: right=${mob.heroRight} w=${mob.heroWidth}`);
  info(`  h1: right=${mob.h1Right} w=${mob.h1Width}`);
  if (mob.panelOverflow.length) info(`  overflowing panels: ${JSON.stringify(mob.panelOverflow)}`);

  assert(mob.scrollW <= mob.vw + 2,
    `community mobile: document scrollWidth ${mob.scrollW} ≤ viewport ${mob.vw} + 2 (no horizontal overflow)`);
  assert(mob.bodyScrollW <= mob.vw + 2,
    `community mobile: body scrollWidth ${mob.bodyScrollW} ≤ viewport ${mob.vw} + 2 (no horizontal overflow)`);
  if (mob.contentRight !== null) {
    assert(mob.contentRight <= mob.vw + 2,
      `community mobile: #content right edge ${mob.contentRight} ≤ viewport ${mob.vw} + 2`);
  }
  if (mob.heroWidth !== null) {
    assert(mob.heroWidth <= mob.vw,
      `community mobile: .page-hero width ${mob.heroWidth} ≤ viewport ${mob.vw}`);
  }
  if (mob.h1Width !== null) {
    assert(mob.h1Width <= mob.vw,
      `community mobile: .page-hero h1 width ${mob.h1Width} ≤ viewport ${mob.vw} (heading wraps safely)`);
  }
  assert(mob.sectionOverflowCount === 0,
    `community mobile: all .section panels fit viewport (${mob.sectionOverflowCount} overflow)`);
  assert(mob.panelOverflow.length === 0,
    `community mobile: all community panels fit viewport (${mob.panelOverflow.length} overflow: ${JSON.stringify(mob.panelOverflow)})`);

  await mCtx.close();

  // ── desktop 1440×900 ──
  info('');
  info('── community desktop overflow check 1440×900 /community.html ──');

  const dCtx  = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dPage = await dCtx.newPage();
  await dPage.route('**', (route) => {
    const url = route.request().url();
    if (url.startsWith(`http://localhost:${port}`)) route.continue();
    else route.fulfill({ status: 200, body: '' });
  });
  await dPage.goto(`http://localhost:${port}/community.html`, { timeout: 20000, waitUntil: 'networkidle' });
  await dPage.waitForTimeout(400);

  const desk = await dPage.evaluate(() => ({
    vw: window.innerWidth,
    scrollW: document.documentElement.scrollWidth,
    bodyScrollW: document.body.scrollWidth,
  }));

  info(`  vw=${desk.vw} scrollW=${desk.scrollW} bodyScrollW=${desk.bodyScrollW}`);

  assert(desk.scrollW <= desk.vw + 2,
    `community desktop: document scrollWidth ${desk.scrollW} ≤ viewport ${desk.vw} + 2 (no horizontal overflow)`);
  assert(desk.bodyScrollW <= desk.vw + 2,
    `community desktop: body scrollWidth ${desk.bodyScrollW} ≤ viewport ${desk.vw} + 2 (no horizontal overflow)`);

  await dCtx.close();
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
        '/community.html',
        '/games/pac-chain/',
        '/games/',
        '/games/leaderboard.html',
        '/how-to-play.html',
        '/search.html',
      ];
      for (const p of desktopPages) {
        await runPage(browser, p, 1440, 900, 'desktop', screenshotDir, actualPort);
      }

      // Also check at 1920×1080 to validate no empty right gutter
      for (const p of ['/sam.html', '/graph.html']) {
        await runPage(browser, p, 1920, 1080, 'desktop-wide', screenshotDir, actualPort);
      }

      // Mobile 390×844 — layout checks
      const mobilePages = [
        '/',
        '/community.html',
        '/categories/index.html',
        '/games/pac-chain/',
        '/games/',
        '/games/leaderboard.html',
        '/how-to-play.html',
        '/search.html',
      ];
      for (const p of mobilePages) {
        await runPage(browser, p, 390, 844, 'mobile', screenshotDir, actualPort);
      }

      // Mobile navigation test (hamburger open/close) — all canonical pages
      const mobileNavPages = [
        '/',
        '/index.html',
        '/search.html',
        '/categories/concepts.html',
        '/community.html',
        '/games/',
        '/games/pac-chain/',
        '/games/leaderboard.html',
        '/sam.html',
        '/graph.html',
      ];
      for (const p of mobileNavPages) {
        await runMobileNavTest(browser, actualPort, p);
      }

      // Telegram sync CTA / incubator link — required pages
      const tgSyncPages = [
        '/community.html',
        '/games/',
        '/games/leaderboard.html',
        '/how-to-play.html',
        '/games/pac-chain/',
        '/games/invaders-3008/',
        '/games/block-topia-quest-maze/',
      ];
      for (const p of tgSyncPages) {
        await runTelegramSyncCheck(browser, actualPort, p);
      }

      // Category card readability at mobile
      await runCategoryCardCheck(browser, actualPort);

      // Sidebar incubator link
      await runSidebarIncubatorCheck(browser, actualPort);

      // Community page mobile overflow (no horizontal overflow at 390×844 or 1440×900)
      await runCommunityMobileOverflowCheck(browser, actualPort);

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
