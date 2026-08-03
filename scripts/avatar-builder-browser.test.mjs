import assert from 'node:assert/strict';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE_SIZE = 24;
const manifest = JSON.parse(await readFile(path.join(ROOT, 'data', 'avatar-builder-manifest.json'), 'utf8'));
const hatTraits = manifest.traits.filter((trait) => trait.category === 'hat');
const contentTypes = new Map([
  ['.css', 'text/css'], ['.html', 'text/html'], ['.js', 'text/javascript'], ['.json', 'application/json'],
  ['.mjs', 'text/javascript'], ['.svg', 'image/svg+xml'], ['.webp', 'image/webp'],
]);

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'avatar-builder-test.html' : pathname.replace(/^\/+/, '');
    const filePath = path.resolve(ROOT, relative);
    if (!filePath.startsWith(`${ROOT}${path.sep}`)) throw new Error('Invalid path');
    const metadata = await stat(filePath);
    if (!metadata.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'Content-Type': contentTypes.get(path.extname(filePath)) || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const origin = `http://127.0.0.1:${port}`;
const standaloneUrl = `${origin}/avatar-builder-test.html`;
const homepageUrl = `${origin}/index.html`;
const installedBrowser = process.platform === 'win32'
  ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ].find(existsSync)
  : undefined;
const browser = await chromium.launch({ headless: true, executablePath: installedBrowser });

async function openAt(viewport, url = standaloneUrl) {
  const page = await browser.newPage({ viewport });
  page.requestedUrls = [];
  page.on('request', (request) => page.requestedUrls.push(request.url()));
  await page.route('**/*', (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== origin) return route.abort();
    return route.continue();
  });
  await page.goto(url, { waitUntil: url === homepageUrl ? 'domcontentloaded' : 'networkidle' });
  await page.locator('#avatar-frame[aria-busy="false"]').waitFor();
  return page;
}

async function assertNoHorizontalPageOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert(dimensions.scrollWidth <= dimensions.clientWidth + 1, `${label}: page must not overflow horizontally: ${JSON.stringify(dimensions)}`);
}

async function assertHomepageLayout(page, label, mode) {
  const [builder, intro, categories, preview, selected] = await Promise.all([
    page.locator('.homepage-avatar-builder').boundingBox(),
    page.locator('.hero-intro').boundingBox(),
    page.locator('.category-panel').boundingBox(),
    page.locator('.preview-panel').boundingBox(),
    page.locator('.selection-panel').boundingBox(),
  ]);
  assert(builder.y < intro.y, `${label}: builder must appear before the mission section`);
  assert(Math.abs(preview.width - preview.height) < 1, `${label}: homepage avatar must remain square`);
  if (mode === 'desktop') {
    assert(categories.x + categories.width <= preview.x, `${label}: category controls must be left of the avatar`);
    assert(selected.x >= preview.x + preview.width, `${label}: selected controls must be right of the avatar`);
  } else if (mode === 'portrait') {
    assert(categories.y >= preview.y + preview.height - 1, `${label}: trait controls must sit below the avatar`);
    assert(selected.y >= categories.y + categories.height - 1, `${label}: selected controls must sit below trait controls`);
  } else {
    assert(categories.x >= preview.x + preview.width, `${label}: landscape controls must sit beside the avatar`);
  }
  await assertCategoryRow(page, `${label} homepage`, false);
  await assertNoHorizontalPageOverflow(page, `${label} homepage`);
}

async function assertCategoryRow(page, label, pageScrollbarHidden = true) {
  const categoryLayout = await page.locator('.category-tabs').evaluate((tabs) => {
    const buttons = [...tabs.querySelectorAll('.category-button')];
    const visibleButtons = buttons.filter((button) => {
      const style = getComputedStyle(button);
      const box = button.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0;
    });
    const buttonBoxes = visibleButtons.map((button) => button.getBoundingClientRect());
    const iconBoxes = visibleButtons.map((button) => button.querySelector('svg').getBoundingClientRect());
    return {
      buttonCount: buttons.length,
      visibleButtonCount: visibleButtons.length,
      rowTops: buttonBoxes.map((box) => box.top),
      buttonWidths: buttonBoxes.map((box) => box.width),
      iconWidths: iconBoxes.map((box) => box.width),
      scrollWidth: tabs.scrollWidth,
      clientWidth: tabs.clientWidth,
      overflowX: getComputedStyle(tabs).overflowX,
      bodyScrollbarWidth: getComputedStyle(document.body).scrollbarWidth,
      htmlScrollbarWidth: getComputedStyle(document.documentElement).scrollbarWidth,
    };
  });

  assert.equal(categoryLayout.buttonCount, 9, `${label}: category row must contain exactly nine buttons`);
  assert.equal(categoryLayout.visibleButtonCount, 9, `${label}: all nine category buttons must be visible`);
  assert(categoryLayout.scrollWidth <= categoryLayout.clientWidth + 1, `${label}: category row must not overflow horizontally: ${JSON.stringify(categoryLayout)}`);
  assert(Math.max(...categoryLayout.rowTops) - Math.min(...categoryLayout.rowTops) <= 1, `${label}: category buttons must remain on one row: ${JSON.stringify(categoryLayout)}`);
  assert.equal(categoryLayout.overflowX, 'visible', `${label}: category row must not be a horizontal scroll container`);
  if (pageScrollbarHidden) {
    assert.equal(categoryLayout.bodyScrollbarWidth, 'none', `${label}: standalone page scrollbar chrome must remain hidden`);
    assert.equal(categoryLayout.htmlScrollbarWidth, 'none', `${label}: standalone root scrollbar chrome must remain hidden`);
  } else {
    assert.notEqual(categoryLayout.bodyScrollbarWidth, 'none', `${label}: homepage scrollbar chrome must not be hidden by builder CSS`);
    assert.notEqual(categoryLayout.htmlScrollbarWidth, 'none', `${label}: homepage root scrollbar chrome must not be hidden by builder CSS`);
  }
  assert(Math.max(...categoryLayout.buttonWidths) <= 42.5, `${label}: category buttons must not exceed 42px: ${JSON.stringify(categoryLayout)}`);
  assert(Math.min(...categoryLayout.buttonWidths) > 0, `${label}: category buttons must retain a visible hit area: ${JSON.stringify(categoryLayout)}`);
  assert(Math.min(...categoryLayout.iconWidths) >= 12.5 && Math.max(...categoryLayout.iconWidths) <= 20.5, `${label}: category icons must scale between 13px and 20px: ${JSON.stringify(categoryLayout)}`);
}

async function assertHiddenVerticalScroller(page, selector, label) {
  const locator = page.locator(selector);
  const originalStyle = await locator.getAttribute('style');
  await locator.evaluate((element) => {
    element.style.height = '80px';
    element.style.maxHeight = '80px';
    element.scrollTop = 0;
  });
  await locator.hover();
  await page.mouse.wheel(0, 160);
  await page.waitForTimeout(50);
  const result = await locator.evaluate((element) => ({
    clientHeight: element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
    scrollbarWidth: getComputedStyle(element).scrollbarWidth,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }));
  await locator.evaluate((element, savedStyle) => {
    if (savedStyle === null) element.removeAttribute('style');
    else element.setAttribute('style', savedStyle);
  }, originalStyle);

  assert.equal(result.overflowY, 'auto', `${label}: vertical overflow must remain automatic`);
  assert.equal(result.scrollbarWidth, 'none', `${label}: scrollbar chrome must remain hidden`);
  assert(result.scrollHeight > result.clientHeight, `${label}: test fixture must overflow vertically: ${JSON.stringify(result)}`);
  assert(result.scrollTop > 0, `${label}: mouse-wheel scrolling must still move the container: ${JSON.stringify(result)}`);
}

try {
  const homepageDesktop = await openAt({ width: 1440, height: 900 }, homepageUrl);
  const missionHeading = await homepageDesktop.locator('.hero-intro h1').textContent();
  assert.equal(missionHeading, 'Now you have something worth shouting about.We make sure people remember it.', 'Homepage mission heading must remain unchanged');
  assert(await homepageDesktop.locator('.homepage-avatar-builder').evaluate((builder) => Boolean(builder.compareDocumentPosition(document.querySelector('.hero-intro')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'Builder must precede .hero-intro in the homepage DOM');
  const homepageScroll = await homepageDesktop.evaluate(() => ({
    bodyOverflowY: getComputedStyle(document.body).overflowY,
    pageOverflowY: getComputedStyle(document.documentElement).overflowY,
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    background: getComputedStyle(document.body).backgroundColor,
  }));
  assert.notEqual(homepageScroll.bodyOverflowY, 'hidden', `Homepage body must remain vertically scrollable: ${JSON.stringify(homepageScroll)}`);
  assert(homepageScroll.scrollHeight > homepageScroll.viewportHeight, `Homepage must continue below the builder: ${JSON.stringify(homepageScroll)}`);
  assert.equal(homepageScroll.background, 'rgb(0, 0, 0)', 'Builder CSS must not replace the homepage background');
  await assertHomepageLayout(homepageDesktop, '1440x900', 'desktop');

  const homepageLayerRequests = homepageDesktop.requestedUrls.filter((requestUrl) => requestUrl.includes('/img/avatar-builder/layers/'));
  const homepageThumbnailRequests = homepageDesktop.requestedUrls.filter((requestUrl) => requestUrl.includes('/img/avatar-builder/thumbnails/'));
  assert(homepageLayerRequests.length > 0 && homepageLayerRequests.length <= 9, `Homepage initial load must request only default full-size layers: ${homepageLayerRequests.length}`);
  assert(homepageThumbnailRequests.length <= PAGE_SIZE, `Homepage initial load must request at most one visible page of lazy thumbnails: ${homepageThumbnailRequests.length}`);
  assert(!homepageDesktop.requestedUrls.some((requestUrl) => requestUrl.includes('/img/CRYPTO-MOONBOYS-OG-TRAITS/')), 'Homepage must not request original 4000x4000 trait sources');

  const homepageInitialSources = await homepageDesktop.locator('.avatar-layer').evaluateAll((images) => images.map((image) => image.getAttribute('src')));
  await homepageDesktop.locator('#randomize').click();
  await homepageDesktop.locator('#avatar-frame[aria-busy="false"]').waitFor();
  assert.equal(await homepageDesktop.locator('.avatar-layer').count(), 9, 'Homepage Randomize must render a complete stack');
  await homepageDesktop.locator('#reset').click();
  await homepageDesktop.locator('#avatar-frame[aria-busy="false"]').waitFor();
  assert.deepEqual(await homepageDesktop.locator('.avatar-layer').evaluateAll((images) => images.map((image) => image.getAttribute('src'))), homepageInitialSources, 'Homepage Reset must restore defaults');
  await homepageDesktop.locator('#clear-all').click();
  await homepageDesktop.locator('#avatar-frame[aria-busy="false"]').waitFor();
  assert.equal(await homepageDesktop.locator('.avatar-layer').count(), 2, 'Homepage Clear All must preserve required layers');
  await homepageDesktop.close();

  for (const [width, height] of [[2560, 1440], [1920, 1080]]) {
    const page = await openAt({ width, height }, homepageUrl);
    await assertHomepageLayout(page, `${width}x${height}`, 'desktop');
    await page.close();
  }

  const homepageTablet = await openAt({ width: 1024, height: 768 }, homepageUrl);
  await assertHomepageLayout(homepageTablet, '1024x768', 'landscape');
  await homepageTablet.close();

  const homepageLandscape = await openAt({ width: 844, height: 390 }, homepageUrl);
  await assertHomepageLayout(homepageLandscape, '844x390', 'landscape');
  await homepageLandscape.close();

  for (const [width, height] of [[390, 844], [320, 568]]) {
    const page = await openAt({ width, height }, homepageUrl);
    await assertHomepageLayout(page, `${width}x${height}`, 'portrait');
    assert.equal(Math.round((await page.locator('.preview-panel').boundingBox()).width), width, `${width}x${height}: portrait preview must fill the viewport width`);
    await page.close();
  }

  const liveBuilderSources = await Promise.all([
    readFile(path.join(ROOT, 'index.html'), 'utf8'),
    readFile(path.join(ROOT, 'avatar-builder-test.html'), 'utf8'),
    readFile(path.join(ROOT, 'css', 'avatar-builder-test.css'), 'utf8'),
    readFile(path.join(ROOT, 'js', 'avatar-builder-test.js'), 'utf8'),
    readFile(path.join(ROOT, 'data', 'avatar-builder-manifest.json'), 'utf8'),
  ]);
  assert(!liveBuilderSources.some((source) => source.includes('img/CRYPTO-MOONBOYS-OG-TRAITS/')), 'Live builder files must not reference original 4000x4000 trait sources');

  const desktop = await openAt({ width: 1440, height: 900 });
  const desktopBoxes = await Promise.all(['.category-panel', '.preview-panel', '.selection-panel'].map((selector) => desktop.locator(selector).boundingBox()));
  const [left, preview, right] = desktopBoxes;
  assert(Math.abs(preview.width - preview.height) < 1, 'Desktop avatar must be square');
  assert(left.x + left.width <= preview.x, 'Desktop category controls must be left of the avatar');
  assert(right.x >= preview.x + preview.width, 'Desktop selected controls must be right of the avatar');
  assert(preview.height >= 850, `Desktop avatar should fill the available viewport height: ${JSON.stringify(preview)}`);
  await assertCategoryRow(desktop, '1440x900');
  const desktopCategory = await desktop.locator('.category-button').first().boundingBox();
  assert(desktopCategory.width > 0 && desktopCategory.height > 0, `Desktop category controls must retain visible hit targets: ${JSON.stringify(desktopCategory)}`);
  const desktopTrait = await desktop.locator('.trait-button').first().boundingBox();
  assert(desktopTrait.width >= 90, `Desktop trait cards must remain readable at 1440x900: ${JSON.stringify(desktopTrait)}`);
  await assertHiddenVerticalScroller(desktop, '.trait-grid', 'Trait grid');
  await assertHiddenVerticalScroller(desktop, '.selected-list', 'Selected traits');

  const initialSources = await desktop.locator('.avatar-layer').evaluateAll((images) => images.map((image) => image.getAttribute('src')));
  await desktop.locator('#randomize').click();
  await desktop.locator('#avatar-frame[aria-busy="false"]').waitFor();
  assert.equal(await desktop.locator('.avatar-layer').count(), 9, 'Randomize must render a complete stack');
  await desktop.locator('#reset').click();
  await desktop.locator('#avatar-frame[aria-busy="false"]').waitFor();
  assert.deepEqual(await desktop.locator('.avatar-layer').evaluateAll((images) => images.map((image) => image.getAttribute('src'))), initialSources, 'Reset must restore defaults');
  await desktop.locator('#clear-all').click();
  await desktop.locator('#avatar-frame[aria-busy="false"]').waitFor();
  assert.equal(await desktop.locator('.avatar-layer').count(), 2, 'Clear All must preserve only required layers');
  await desktop.close();

  const largeDesktop = await openAt({ width: 2560, height: 1440 });
  const largeBoxes = await Promise.all(['.category-panel', '.preview-panel', '.selection-panel'].map((selector) => largeDesktop.locator(selector).boundingBox()));
  const [largeLeft, largePreview, largeRight] = largeBoxes;
  assert(Math.abs(largePreview.width - largePreview.height) < 1, 'Large desktop avatar must be square');
  assert(largePreview.height >= 1407, 'Large desktop avatar must fill the available viewport height without a 1000px cap');
  assert(largeLeft.x + largeLeft.width <= largePreview.x, 'Large desktop category controls must stay left of the avatar');
  assert(largeRight.x >= largePreview.x + largePreview.width, 'Large desktop selected controls must stay right of the avatar');
  await assertCategoryRow(largeDesktop, '2560x1440');
  await largeDesktop.close();

  const fullHd = await openAt({ width: 1920, height: 1080 });
  await assertCategoryRow(fullHd, '1920x1080');
  await fullHd.close();

  const nearSquare = await openAt({ width: 1440, height: 1024 });
  const nearSquarePreview = await nearSquare.locator('.preview-panel').boundingBox();
  const nearSquareControls = await nearSquare.locator('.category-panel').boundingBox();
  assert(Math.abs(nearSquarePreview.width - nearSquarePreview.height) < 1, 'Near-square desktop avatar must remain square');
  assert(nearSquarePreview.height >= 1007, 'Near-square desktop avatar must fill the available viewport height');
  assert(nearSquareControls.x >= nearSquarePreview.x + nearSquarePreview.width, 'Near-square controls must stay beside the avatar without overflow');
  assert(nearSquareControls.x + nearSquareControls.width <= 1440, 'Near-square controls must remain inside the viewport');
  await nearSquare.close();

  const portrait = await openAt({ width: 390, height: 844 });
  const portraitPreview = await portrait.locator('.preview-panel').boundingBox();
  const portraitControls = await portrait.locator('.category-panel').boundingBox();
  assert(Math.abs(portraitPreview.width - portraitPreview.height) < 1, 'Portrait avatar must be square');
  assert.equal(Math.round(portraitPreview.width), 390, 'Portrait avatar must fill viewport width');
  assert(portraitControls.y >= portraitPreview.y + portraitPreview.height - 1, 'Portrait controls must sit below avatar');
  await assertCategoryRow(portrait, '390x844');
  await portrait.close();

  const smallPhone = await openAt({ width: 320, height: 568 });
  await assertCategoryRow(smallPhone, '320x568');
  await smallPhone.close();

  const landscape = await openAt({ width: 844, height: 390 });
  const landscapePreview = await landscape.locator('.preview-panel').boundingBox();
  const landscapeControls = await landscape.locator('.category-panel').boundingBox();
  assert(Math.abs(landscapePreview.width - landscapePreview.height) < 1, 'Landscape avatar must be square');
  assert(landscapePreview.height >= 373, 'Landscape avatar must fill available viewport height');
  assert(landscapeControls.x >= landscapePreview.x + landscapePreview.width, 'Landscape controls must sit beside avatar');
  await assertCategoryRow(landscape, '844x390');
  await landscape.locator('[data-category="hat"]').click();
  await landscape.locator('.pagination').waitFor({ state: 'visible' });
  assert.equal((await landscape.locator('.page-label').textContent()).trim(), '1 / 10', 'Landscape Hat tray must expose pagination');
  await landscape.locator('[data-page="next"]').click();
  const pageTwoTrait = landscape.locator('.trait-button').first();
  const pageTwoTraitId = await pageTwoTrait.getAttribute('data-trait');
  assert(hatTraits.findIndex((trait) => trait.id === pageTwoTraitId) >= 24, 'Landscape page two must expose a Hat beyond index 24');
  await pageTwoTrait.click();
  await landscape.locator('#avatar-frame[aria-busy="false"]').waitFor();
  assert.equal(await landscape.locator(`[data-trait="${pageTwoTraitId}"]`).getAttribute('aria-pressed'), 'true', 'Landscape must allow selecting a Hat beyond page one');
  await landscape.close();

  const tabletLandscape = await openAt({ width: 1024, height: 768 });
  const tabletPreview = await tabletLandscape.locator('.preview-panel').boundingBox();
  const tabletControls = await tabletLandscape.locator('.category-panel').boundingBox();
  assert(Math.abs(tabletPreview.width - tabletPreview.height) < 1, 'Tablet landscape avatar must be square');
  assert(tabletPreview.height >= 750, 'Tablet landscape avatar must fill available viewport height');
  assert(tabletControls.x >= tabletPreview.x + tabletPreview.width, 'Tablet landscape controls must sit beside avatar');
  await assertCategoryRow(tabletLandscape, '1024x768');
  await tabletLandscape.close();

  const rapid = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const [rapidFirst, rapidSecond] = hatTraits.slice(1, 3);
  await rapid.route('**/img/avatar-builder/layers/hat/**', async (route) => {
    const requestPath = new URL(route.request().url()).pathname;
    if (requestPath === rapidFirst.layer) await new Promise((resolve) => setTimeout(resolve, 75));
    if (requestPath === rapidSecond.layer) await new Promise((resolve) => setTimeout(resolve, 350));
    await route.continue();
  });
  await rapid.goto(standaloneUrl, { waitUntil: 'networkidle' });
  await rapid.locator('#avatar-frame[aria-busy="false"]').waitFor();
  await rapid.locator('[data-category="hat"]').click();
  await rapid.locator(`[data-trait="${rapidFirst.id}"]`).dispatchEvent('click');
  await rapid.locator(`[data-trait="${rapidSecond.id}"]`).dispatchEvent('click');
  await rapid.waitForTimeout(150);
  assert.equal(await rapid.locator('#avatar-frame').getAttribute('aria-busy'), 'true', 'A stale layer callback must not mark the newer render complete');
  await rapid.locator('#avatar-frame[aria-busy="false"]').waitFor();
  assert.equal(await rapid.locator(`.avatar-layer[src="${rapidSecond.layer}"]`).count(), 1, 'Rapid selection must keep the newest layer');
  await rapid.close();

  const missing = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await missing.route('**/img/avatar-builder/layers/body/**', (route) => route.abort());
  await missing.goto(standaloneUrl, { waitUntil: 'networkidle' });
  await missing.locator('#avatar-frame[aria-busy="false"]').waitFor();
  await missing.locator('#preview-fallback:visible').waitFor();
  assert.match(await missing.locator('#preview-fallback').textContent(), /could not load/);
  await missing.close();

  console.log('Avatar browser checks passed for homepage integration, responsive layouts, request limits, interaction parity, landscape pagination, rapid selection, and missing images.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
