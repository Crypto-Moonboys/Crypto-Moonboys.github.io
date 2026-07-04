#!/usr/bin/env node

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (err) {
  console.error('[swarmsy-component-render-audit] Missing Playwright dependency.');
  console.error('Install dependencies with npm install before running this browser audit.');
  console.error(`Original error: ${err?.code || err?.message || err}`);
  process.exit(1);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, '.tmp-render-pr917');
const ROUTES = [
  '/swarmsy.html',
  '/about.html',
  '/index.html',
  '/games/',
  '/community.html',
];

const MIME = new Map([
  ['.html', 'text/html'],
  ['.css', 'text/css'],
  ['.js', 'application/javascript'],
  ['.json', 'application/json'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
]);

function serveStatic() {
  const server = http.createServer((req, res) => {
    try {
      const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = pathname.replace(/^\/+/, '') || 'index.html';
      let filePath = path.resolve(ROOT, rel);
      if (!filePath.toLowerCase().startsWith(ROOT.toLowerCase())) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
      });
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err?.stack || err));
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (err) {
    if (process.platform === 'win32') {
      return chromium.launch({ channel: 'msedge', headless: true });
    }
    throw err;
  }
}

function routeToFilename(route) {
  const clean = route.replace(/^\/|\/$/g, '') || 'index.html';
  return clean.replace(/\//g, '__') + '.png';
}

function summarizeBox(box) {
  if (!box) return null;
  return {
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const server = await serveStatic();
const port = server.address().port;
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
const failures = [];
const results = [];

function fail(route, message) {
  failures.push(`${route} - ${message}`);
}

for (const route of ROUTES) {
  await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(450);
  const screenshot = path.join(OUT_DIR, routeToFilename(route));
  await page.screenshot({ path: screenshot, fullPage: true });

  const audit = await page.evaluate(() => {
    function metrics(selector) {
      const el = document.querySelector(selector);
      if (!el) return null;
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return {
        selector,
        display: style.display,
        borderTopWidth: parseFloat(style.borderTopWidth),
        backgroundColor: style.backgroundColor,
        borderRadius: parseFloat(style.borderTopLeftRadius),
        paddingTop: parseFloat(style.paddingTop),
        paddingLeft: parseFloat(style.paddingLeft),
        color: style.color,
        box,
      };
    }

    return {
      viewportWidth: window.innerWidth,
      oldLinks: /retro-16bit-theme\.css|swarmsy-visual-authority\.css|Press Start 2P/i.test(document.documentElement.outerHTML),
      retroClass: !!document.querySelector('[class*="retro"]'),
      content: metrics('#content'),
      swarmsyPage: metrics('.swarmsy-page'),
      swarmsyHero: metrics('.swarmsy-hero'),
      swarmsyHeroInner: metrics('.swarmsy-hero-inner'),
      swarmsyActionGrid: metrics('.swarmsy-action-grid'),
      swarmsyGrid: metrics('.swarmsy-grid'),
      swarmsyActionCard: metrics('.swarmsy-action-card'),
      swarmsyCard: metrics('.swarmsy-card'),
      swarmsySection: metrics('.swarmsy-section'),
      swarmsyPill: metrics('.swarmsy-pill'),
      categoryCard: metrics('.category-card'),
      gameOrArticleCard: metrics('.game-card, .article-list-item, .article-card'),
      communityPanel: metrics('.page-community .section, .bc-why-list li, .bc-join-card, .bc-perk-card'),
    };
  });

  if (audit.oldLinks) fail(route, 'old retro/authority/font links returned');
  if (audit.retroClass) fail(route, 'retro class returned');

  if (route === '/swarmsy.html' || route === '/about.html') {
    for (const [name, data] of [
      ['#content', audit.content],
      ['.swarmsy-page', audit.swarmsyPage],
      ['.swarmsy-hero', audit.swarmsyHero],
    ]) {
      if (!data) {
        fail(route, `${name} missing from rendered page`);
        continue;
      }
      if (Math.abs(data.box.width - audit.viewportWidth) > 2) {
        fail(route, `${name} must span the viewport width, got ${Math.round(data.box.width)} of ${audit.viewportWidth}`);
      }
    }
    if (audit.swarmsyHero && audit.swarmsyHero.borderRadius !== 0) {
      fail(route, '.swarmsy-hero must be full-bleed with 0 route border radius');
    }
    if (!audit.swarmsyHeroInner) {
      fail(route, '.swarmsy-hero-inner missing from rendered page');
    } else if (audit.swarmsyHeroInner.box.width > 1102) {
      fail(route, `.swarmsy-hero-inner must keep readable width, got ${Math.round(audit.swarmsyHeroInner.box.width)}`);
    }

    for (const [name, data] of [
      ['.swarmsy-action-card', audit.swarmsyActionCard],
      ['.swarmsy-card', audit.swarmsyCard],
      ['.swarmsy-section', audit.swarmsySection],
      ['.swarmsy-pill', audit.swarmsyPill],
    ]) {
      if (!data) {
        fail(route, `${name} missing from rendered page`);
        continue;
      }
      if (name === '.swarmsy-action-card' && !['grid', 'flex', 'inline-flex'].includes(data.display)) {
        fail(route, `${name} must render as grid/flex card`);
      }
      if (data.borderTopWidth < 1) fail(route, `${name} must have visible border`);
      if (data.backgroundColor === 'rgba(0, 0, 0, 0)' || data.backgroundColor === 'transparent') {
        fail(route, `${name} must have background`);
      }
      if (data.borderRadius < 14) fail(route, `${name} border-radius must be >= 14px`);
      if (data.paddingTop < 8 || data.paddingLeft < 8) fail(route, `${name} must have padding`);
    }

    for (const [name, data] of [
      ['.swarmsy-action-grid', audit.swarmsyActionGrid],
      ['.swarmsy-grid', audit.swarmsyGrid],
    ]) {
      if (!data) {
        fail(route, `${name} missing from rendered page`);
      } else if (data.display !== 'grid') {
        fail(route, `${name} must use CSS grid`);
      }
    }
  }

  if (route === '/index.html' && audit.categoryCard) {
    if (audit.categoryCard.borderTopWidth < 1 || audit.categoryCard.borderRadius < 14 || audit.categoryCard.paddingTop < 8) {
      fail(route, 'category cards look flattened');
    }
  }
  if (route === '/games/' && audit.gameOrArticleCard) {
    if (audit.gameOrArticleCard.borderTopWidth < 1 || audit.gameOrArticleCard.borderRadius < 14 || audit.gameOrArticleCard.paddingTop < 8) {
      fail(route, 'game/article cards look flattened');
    }
  }
  if (route === '/community.html' && audit.communityPanel) {
    if (audit.communityPanel.borderTopWidth < 1 || audit.communityPanel.borderRadius < 14 || audit.communityPanel.paddingTop < 8) {
      fail(route, 'community sections/cards look flattened');
    }
  }

  results.push({
    route,
    screenshot,
    swarmsyActionCard: audit.swarmsyActionCard ? summarizeBox(audit.swarmsyActionCard.box) : null,
    swarmsyCard: audit.swarmsyCard ? summarizeBox(audit.swarmsyCard.box) : null,
    swarmsySection: audit.swarmsySection ? summarizeBox(audit.swarmsySection.box) : null,
    swarmsyPill: audit.swarmsyPill ? summarizeBox(audit.swarmsyPill.box) : null,
  });
}

await browser.close();
server.close();

console.log('\n--- SWARMSY Component Render Audit ---');
for (const result of results) {
  console.log(`  [SHOT] ${result.route} -> ${path.relative(ROOT, result.screenshot).replace(/\\/g, '/')}`);
}

if (failures.length) {
  for (const failure of failures) {
    console.error(`  [FAIL] ${failure}`);
  }
  console.error(`\nSWARMSY component render audit FAILED: ${failures.length} failure(s)\n`);
  process.exit(1);
}

console.log(`  [PASS] ${ROUTES.length} pages render SWARMSY components as cards, grids, pills, and glass sections`);
console.log('\nSWARMSY component render audit passed.\n');
