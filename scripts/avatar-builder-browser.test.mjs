import assert from 'node:assert/strict';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE_SIZE = 24;
const DOWNLOAD_DISCLAIMER = 'A download is not ownership of a Moonboy. For fun only.';
const OLD_DOWNLOAD_HELPER = 'Downloads the avatar exactly as shown.';
const manifest = JSON.parse(await readFile(path.join(ROOT, 'data', 'avatar-builder-manifest.json'), 'utf8'));
const hatTraits = manifest.traits.filter((trait) => trait.category === 'hat');
const animatedTraits = manifest.traits.filter((trait) => trait.kind === 'animated');
const phaseTwoAnimatedTraits = animatedTraits.slice(3);
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

async function openExportPage(url = standaloneUrl) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    window.__exportCanvasCount = 0;
    window.__exportDraws = [];
    window.__exportMimeType = null;
    const createElement = Document.prototype.createElement;
    Document.prototype.createElement = function patchedCreateElement(tagName, ...args) {
      const element = createElement.call(this, tagName, ...args);
      if (String(tagName).toLowerCase() !== 'canvas') return element;
      window.__exportCanvasCount += 1;
      const getContext = element.getContext.bind(element);
      element.getContext = (...contextArgs) => {
        const context = getContext(...contextArgs);
        if (context && !context.__exportObserved) {
          context.__exportObserved = true;
          const drawImage = context.drawImage.bind(context);
          context.drawImage = (image, ...drawArgs) => {
            window.__exportDraws.push(image.dataset?.renderer
              ? `canvas:${image.dataset.renderer}`
              : (image.getAttribute('src') || image.src));
            return drawImage(image, ...drawArgs);
          };
        }
        return context;
      };
      const toBlob = element.toBlob.bind(element);
      element.toBlob = (callback, type, ...blobArgs) => {
        window.__exportMimeType = type;
        return toBlob(callback, type, ...blobArgs);
      };
      return element;
    };
  });
  await page.route('**/*', (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== origin) return route.abort();
    return route.continue();
  });
  await page.goto(url, { waitUntil: url === homepageUrl ? 'domcontentloaded' : 'networkidle' });
  await page.locator('#avatar-frame[aria-busy="false"]').waitFor();
  return page;
}

async function selectTrait(page, traitId) {
  await page.locator('[data-category="background"]').click();
  for (let pageIndex = 0; pageIndex < 5; pageIndex += 1) {
    const trait = page.locator(`[data-trait="${traitId}"]`);
    if (await trait.count()) {
      await trait.click();
      await page.locator('#avatar-frame[aria-busy="false"]').waitFor();
      return;
    }
    const next = page.locator('[data-page="next"]');
    if (await next.isDisabled()) break;
    await next.click();
  }
  throw new Error(`Trait was not found in the picker: ${traitId}`);
}

async function renderedStackSize(page) {
  const imageLayers = await page.locator('.avatar-layer').count();
  const animatedLayer = await page.locator('.animated-background-canvas:not([hidden])').count();
  return imageLayers + animatedLayer;
}

async function downloadAndInspect(page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#download-png').click(),
  ]);
  const bytes = await readFile(await download.path());
  const metadata = await sharp(bytes).metadata();
  assert.match(download.suggestedFilename(), /^crypto-moonboy-\d{8}-\d{6}\.png$/, 'Download must use the timestamped PNG filename');
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'Download must have a PNG signature');
  assert.equal(metadata.format, 'png', 'Downloaded image MIME format must be PNG');
  assert.equal(metadata.width, 1000, 'Downloaded image width must be 1000 pixels');
  assert.equal(metadata.height, 1000, 'Downloaded image height must be 1000 pixels');
  return { bytes, metadata };
}
async function assertNoHorizontalPageOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert(dimensions.scrollWidth <= dimensions.clientWidth + 1, `${label}: page must not overflow horizontally: ${JSON.stringify(dimensions)}`);
}

async function assertDownloadDisclaimer(page, label, shouldWrap = false) {
  const helper = page.locator('.download-helper');
  assert.equal(await helper.count(), 1, `${label}: builder must include one download disclaimer`);
  assert.equal((await helper.textContent()).trim(), DOWNLOAD_DISCLAIMER, `${label}: download disclaimer must use the approved copy`);
  assert.equal(await page.getByText(OLD_DOWNLOAD_HELPER, { exact: true }).count(), 0, `${label}: old download helper copy must not appear`);

  const layout = await helper.evaluate((element) => {
    const style = getComputedStyle(element);
    const actionStyle = getComputedStyle(document.querySelector('.main-actions .action'));
    const box = element.getBoundingClientRect();
    return {
      clientWidth: element.clientWidth,
      fontSize: Number.parseFloat(style.fontSize),
      actionFontSize: Number.parseFloat(actionStyle.fontSize),
      height: box.height,
      lineHeight: Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2,
      scrollWidth: element.scrollWidth,
      textAlign: style.textAlign,
      visibility: style.visibility,
    };
  });

  assert.equal(layout.visibility, 'visible', `${label}: download disclaimer must remain visible`);
  assert.equal(layout.textAlign, 'center', `${label}: download disclaimer must remain centered`);
  assert(layout.fontSize < layout.actionFontSize, `${label}: download disclaimer must remain smaller than action buttons`);
  assert(layout.scrollWidth <= layout.clientWidth + 1, `${label}: download disclaimer must not overflow horizontally: ${JSON.stringify(layout)}`);
  if (shouldWrap) assert(layout.height > layout.lineHeight + 1, `${label}: download disclaimer must wrap cleanly: ${JSON.stringify(layout)}`);
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
  assert.equal(await homepageDesktop.locator('#download-png').count(), 1, 'Homepage builder must include one Download PNG button');
  assert.equal(await homepageDesktop.locator('#download-png').getAttribute('aria-label'), 'Download avatar as PNG', 'Homepage download button must have a clear accessible label');
  await assertDownloadDisclaimer(homepageDesktop, 'Homepage builder');
  assert.equal(await homepageDesktop.locator('#reset').count(), 0, 'Homepage builder must not include a Reset button');
  assert.deepEqual(await homepageDesktop.locator('.main-actions .action').evaluateAll((buttons) => buttons.map((button) => button.id)), ['randomize', 'download-png', 'clear-all'], 'Homepage actions must use the simplified order');

  const homepageLayerRequests = homepageDesktop.requestedUrls.filter((requestUrl) => requestUrl.includes('/img/avatar-builder/layers/'));
  const homepageThumbnailRequests = homepageDesktop.requestedUrls.filter((requestUrl) => requestUrl.includes('/img/avatar-builder/thumbnails/'));
  assert(homepageLayerRequests.length > 0 && homepageLayerRequests.length <= 9, `Homepage initial load must request only default full-size layers: ${homepageLayerRequests.length}`);
  assert(homepageThumbnailRequests.length <= PAGE_SIZE, `Homepage initial load must request at most one visible page of lazy thumbnails: ${homepageThumbnailRequests.length}`);
  assert(!homepageDesktop.requestedUrls.some((requestUrl) => requestUrl.includes('/img/CRYPTO-MOONBOYS-OG-TRAITS/')), 'Homepage must not request original 4000x4000 trait sources');

  await homepageDesktop.locator('#randomize').click();
  await homepageDesktop.locator('#avatar-frame[aria-busy="false"]').waitFor();
  assert.equal(await renderedStackSize(homepageDesktop), 9, 'Homepage Randomize must render a complete stack');
  await homepageDesktop.locator('#clear-all').click();
  await homepageDesktop.locator('#avatar-frame[aria-busy="false"]').waitFor();
  assert.equal(await renderedStackSize(homepageDesktop), 2, 'Homepage Clear All must preserve required layers for static or animated backgrounds');
  await selectTrait(homepageDesktop, 'background-matrix-rain');
  await homepageDesktop.locator('.animated-background-canvas:not([hidden])').waitFor();
  assert.equal(await homepageDesktop.locator('.animated-background-canvas').getAttribute('data-renderer'), 'matrix-rain', 'Homepage must run animated backgrounds through the shared builder');
  await homepageDesktop.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await homepageDesktop.waitForFunction(() => document.querySelector('.animated-background-canvas')?.dataset.rendererState === 'paused');
  await homepageDesktop.locator('.homepage-avatar-builder').evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await homepageDesktop.waitForFunction(() => ['resumed', 'started'].includes(document.querySelector('.animated-background-canvas')?.dataset.rendererState));
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
    if (width === 320) await assertDownloadDisclaimer(page, '320x568 homepage builder', true);
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
  const sharedBuilderSource = liveBuilderSources[3];
  assert(!sharedBuilderSource.includes(OLD_DOWNLOAD_HELPER), 'Shared builder source must not contain the old download helper copy');
  assert(sharedBuilderSource.includes(DOWNLOAD_DISCLAIMER), 'Shared builder source must contain the approved download disclaimer');

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

  await desktop.locator('#randomize').click();
  await desktop.locator('#avatar-frame[aria-busy="false"]').waitFor();
  assert.equal(await renderedStackSize(desktop), 9, 'Randomize must render a complete stack');
  assert.equal(await desktop.locator('#reset').count(), 0, 'Standalone builder must not include a Reset button');
  assert.deepEqual(await desktop.locator('.main-actions .action').evaluateAll((buttons) => buttons.map((button) => button.id)), ['randomize', 'download-png', 'clear-all'], 'Standalone actions must use the simplified order');
  const actionMetrics = await desktop.locator('.main-actions').evaluate((container) => ({
    containerWidth: container.getBoundingClientRect().width,
    buttons: [...container.querySelectorAll('.action')].map((button) => {
      const style = getComputedStyle(button);
      const box = button.getBoundingClientRect();
      return { height: box.height, width: box.width, fontSize: style.fontSize, paddingLeft: style.paddingLeft };
    }),
  }));
  assert(actionMetrics.buttons.every((button) => button.height < 44), `Avatar actions must be shorter than the former large buttons: ${JSON.stringify(actionMetrics)}`);
  assert(actionMetrics.buttons.every((button) => button.width < actionMetrics.containerWidth), `No avatar action may span the full action area: ${JSON.stringify(actionMetrics)}`);
  assert(actionMetrics.buttons.every((button) => parseFloat(button.fontSize) <= 12 && parseFloat(button.paddingLeft) <= 9), `Avatar actions must use compact text and padding: ${JSON.stringify(actionMetrics)}`);
  await desktop.locator('#clear-all').click();
  await desktop.locator('#avatar-frame[aria-busy="false"]').waitFor();
  assert.equal(await desktop.locator('.avatar-layer').count(), 2, 'Clear All must preserve only required layers');
  await desktop.close();

  const animated = await openAt({ width: 1440, height: 900 });
  await animated.evaluate(() => {
    window.__avatarBackgroundEvents = [];
    document.querySelector('.animated-background-canvas').addEventListener('avatar-background-lifecycle', (event) => {
      window.__avatarBackgroundEvents.push({ ...event.detail });
    });
  });
  await selectTrait(animated, 'background-matrix-rain');
  assert.equal(await animated.locator('.animated-background-canvas').getAttribute('data-renderer'), 'matrix-rain');
  assert.equal(await animated.locator('.animated-background-canvas').getAttribute('data-active-renderer-count'), '1', 'Selecting Matrix Rain must start exactly one renderer');
  assert.equal(await animated.locator('.avatar-layer').count(), 8, 'Animated background canvas must replace only the static background image layer');
  assert.match(await animated.locator('.selected-list').textContent(), /Matrix Rain/, 'Animated selection must appear in the selected trait stack');
  assert(animated.requestedUrls.some((url) => url.endsWith('/js/avatar-backgrounds/matrix-rain.js')), 'Matrix renderer module must load on selection');
  assert(animatedTraits.slice(1).every((trait) => !animated.requestedUrls.some((url) => url.endsWith(`/js/avatar-backgrounds/${trait.renderer}.js`))), 'Unselected renderer modules must remain lazy');

  for (const trait of animatedTraits.slice(1)) await selectTrait(animated, trait.id);
  const lifecycle = await animated.evaluate(() => window.__avatarBackgroundEvents);
  for (let index = 1; index < animatedTraits.length; index += 1) {
    const previous = animatedTraits[index - 1].renderer;
    const current = animatedTraits[index].renderer;
    const destroyed = lifecycle.findIndex((event) => event.renderer === previous && event.action === 'destroyed');
    const started = lifecycle.findIndex((event) => event.renderer === current && event.action === 'started');
    assert(destroyed >= 0 && started > destroyed, `${current} must destroy ${previous} before starting`);
  }
  assert(animatedTraits.every((trait) => animated.requestedUrls.some((url) => url.endsWith(`/js/avatar-backgrounds/${trait.renderer}.js`))), 'Every renderer module must resolve and start successfully');
  assert.equal(await animated.locator('.animated-background-canvas').getAttribute('data-active-renderer-count'), '1', 'Only one renderer loop may remain active after switching');

  await animated.evaluate(() => {
    window.__testVisibilityState = 'hidden';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__testVisibilityState });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await animated.waitForFunction(() => document.querySelector('.animated-background-canvas')?.dataset.rendererState === 'paused');
  await animated.evaluate(() => {
    window.__testVisibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await animated.waitForFunction(() => document.querySelector('.animated-background-canvas')?.dataset.rendererState === 'resumed');

  const finalRenderer = animatedTraits.at(-1).renderer;
  const finalStartsBeforeRestore = (await animated.evaluate(() => window.__avatarBackgroundEvents))
    .filter((event) => event.renderer === finalRenderer && event.action === 'started').length;
  await animated.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await animated.waitForFunction(() => document.querySelector('.animated-background-canvas')?.hidden === true);
  await animated.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await animated.waitForFunction(() => document.querySelector('.animated-background-canvas')?.dataset.rendererState === 'started');
  const finalStartsAfterRestore = (await animated.evaluate(() => window.__avatarBackgroundEvents))
    .filter((event) => event.renderer === finalRenderer && event.action === 'started').length;
  assert.equal(finalStartsAfterRestore, finalStartsBeforeRestore + 1, 'bfcache pageshow must recreate the selected animated renderer');
  assert.equal(await animated.locator('.animated-background-canvas').getAttribute('data-active-renderer-count'), '1', 'bfcache restoration must leave exactly one renderer active');

  await selectTrait(animated, manifest.categories.find((category) => category.id === 'background').defaultTraitId);
  assert.equal(await animated.locator('.animated-background-canvas').isHidden(), true, 'Switching to a static background must hide the animated canvas');
  assert.equal(await animated.locator('.avatar-layer').count(), 9, 'Switching to static must restore the background image layer');
  assert((await animated.evaluate(() => window.__avatarBackgroundEvents)).some((event) => event.renderer === finalRenderer && event.action === 'destroyed'), 'Switching to static must destroy the active Phase 2 renderer');
  await animated.close();

  const failedAnimated = await openAt({ width: 1440, height: 900 });
  await selectTrait(failedAnimated, 'background-matrix-rain');
  await failedAnimated.route('**/js/avatar-backgrounds/neon-pulse.js', (route) => route.abort());
  await selectTrait(failedAnimated, 'background-neon-pulse');
  assert.equal(await failedAnimated.locator('.animated-background-canvas').getAttribute('data-renderer'), 'matrix-rain', 'Renderer load failure must restore the previous working background');
  assert.match(await failedAnimated.locator('#live-region').textContent(), /previous background was restored/i, 'Renderer load failure must be announced accessibly');
  await failedAnimated.close();

  const reduced = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await reduced.emulateMedia({ reducedMotion: 'reduce' });
  await reduced.goto(standaloneUrl, { waitUntil: 'networkidle' });
  await reduced.locator('#avatar-frame[aria-busy="false"]').waitFor();
  await selectTrait(reduced, 'background-matrix-rain');
  assert.equal(await reduced.locator('.animated-background-canvas').getAttribute('data-renderer-state'), 'static', 'Reduced motion must render a static frame without a continuous loop');
  await assertNoHorizontalPageOverflow(reduced, 'Reduced-motion animated background');
  const reducedDownload = await downloadAndInspect(reduced);
  const reducedPixels = await sharp(reducedDownload.bytes).ensureAlpha().raw().toBuffer();
  let reducedBackgroundIsOpaque = true;
  for (let index = 3; index < reducedPixels.length; index += 4) {
    if (reducedPixels[index] !== 255) {
      reducedBackgroundIsOpaque = false;
      break;
    }
  }
  assert.equal(reducedBackgroundIsOpaque, true, 'Matrix Rain reduced-motion PNG must have an opaque background');
  for (const trait of phaseTwoAnimatedTraits) {
    await selectTrait(reduced, trait.id);
    assert.equal(await reduced.locator('.animated-background-canvas').getAttribute('data-renderer-state'), 'static', `${trait.name} must render one reduced-motion frame`);
    const snapshot = await downloadAndInspect(reduced);
    assert(snapshot.bytes.length > 1000, `${trait.name} must export a non-empty 1000x1000 PNG snapshot`);
  }
  await reduced.close();

  const animatedExport = await openExportPage();
  await selectTrait(animatedExport, 'background-neon-pulse');
  await downloadAndInspect(animatedExport);
  const animatedDraws = await animatedExport.evaluate(() => window.__exportDraws);
  assert.equal(animatedDraws.length, 10, 'Animated export must freeze one frame, then draw it beneath eight character layers');
  assert.deepEqual(animatedDraws.slice(0, 2), ['canvas:neon-pulse', 'canvas:neon-pulse'], 'Animated export must copy and then draw the frozen frame');
  assert(animatedDraws.slice(2).every((source) => source.includes('/img/avatar-builder/layers/')), 'Character image layers must be drawn above the animated frame');
  assert.equal(await animatedExport.evaluate(() => window.__exportCanvasCount), 2, 'Animated export must use one frozen-frame canvas and one final export canvas');
  await animatedExport.close();

  const frozenExport = await openExportPage();
  await selectTrait(frozenExport, 'background-matrix-rain');
  const frozenSources = await frozenExport.locator('.avatar-layer').evaluateAll((images) => images.map((image) => image.getAttribute('src')));
  const delayedFrozenSource = frozenSources[0];
  await frozenExport.route(`**${delayedFrozenSource}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.continue();
  });
  const frozenDownload = frozenExport.waitForEvent('download');
  await frozenExport.locator('#download-png').click();
  await frozenExport.locator('#download-png[disabled]').waitFor();
  await selectTrait(frozenExport, 'background-neon-pulse');
  await frozenDownload;
  await frozenExport.locator('#download-png:not([disabled])').waitFor();
  const frozenDraws = await frozenExport.evaluate(() => window.__exportDraws);
  assert.deepEqual(frozenDraws.slice(0, 2), ['canvas:matrix-rain', 'canvas:matrix-rain'], 'Export must keep the frame captured before a background switch');
  assert.deepEqual(frozenDraws.slice(2), frozenSources, 'Export must keep the character stack captured before a background switch');
  assert.equal(await frozenExport.locator('.animated-background-canvas').getAttribute('data-renderer'), 'neon-pulse', 'Test fixture must switch the live preview while export is waiting');
  await frozenExport.close();

  const fullExport = await openExportPage();
  assert.equal(await fullExport.locator('#download-png').count(), 1, 'Standalone builder must include one Download PNG button');
  await assertDownloadDisclaimer(fullExport, 'Standalone builder');
  const fullSources = await fullExport.locator('.avatar-layer').evaluateAll((images) => images.map((image) => image.getAttribute('src')));
  assert.equal(fullSources.length, 9, 'Full export fixture must contain all nine selected layers');
  await downloadAndInspect(fullExport);
  const fullExportState = await fullExport.evaluate(() => ({
    canvasCount: window.__exportCanvasCount,
    draws: window.__exportDraws,
    mimeType: window.__exportMimeType,
  }));
  assert.equal(fullExportState.canvasCount, 1, 'Full export must use one temporary canvas');
  assert.deepEqual(fullExportState.draws, fullSources, 'Full export draw order must match the visible manifest-ordered stack');
  assert.equal(fullExportState.mimeType, 'image/png', 'Canvas export must request image/png');
  assert(fullExportState.draws.every((source) => source.includes('/img/avatar-builder/layers/')), 'Export must use full-size layer paths');
  assert(!fullExportState.draws.some((source) => source.includes('/thumbnails/') || source.includes('/img/CRYPTO-MOONBOYS-OG-TRAITS/')), 'Export must never use thumbnails or original 4000x4000 sources');
  assert.equal(await fullExport.locator('#download-png').isEnabled(), true, 'Download button must re-enable after success');
  assert.match(await fullExport.locator('#live-region').textContent(), /download ready/i, 'Successful export must be announced in the ARIA live region');
  await fullExport.close();

  const partialExport = await openExportPage();
  await partialExport.locator('#clear-all').click();
  const requiredSources = await partialExport.locator('.avatar-layer').evaluateAll((images) => images.map((image) => image.getAttribute('src')));
  assert.equal(requiredSources.length, 2, 'Clear All export fixture must preserve only required selected layers');
  await downloadAndInspect(partialExport);
  assert.deepEqual(await partialExport.evaluate(() => window.__exportDraws), requiredSources, 'Clear All export must contain only required visible layers');
  await partialExport.close();

  const manualPartialExport = await openExportPage();
  const removableCategories = await manualPartialExport.locator('.selected-item .icon-button:not([disabled])').evaluateAll((buttons) => buttons.slice(0, 3).map((button) => button.dataset.remove));
  for (const category of removableCategories) await manualPartialExport.locator(`[data-remove="${category}"]`).click();
  const manualSources = await manualPartialExport.locator('.avatar-layer').evaluateAll((images) => images.map((image) => image.getAttribute('src')));
  assert.equal(manualSources.length, 6, 'Manual partial export fixture must retain six visible layers');
  await downloadAndInspect(manualPartialExport);
  assert.deepEqual(await manualPartialExport.evaluate(() => window.__exportDraws), manualSources, 'Manual partial export must omit only the cleared optional layers');
  await manualPartialExport.close();

  const snapshotExport = await openExportPage();
  const snapshotSources = await snapshotExport.locator('.avatar-layer').evaluateAll((images) => images.map((image) => image.getAttribute('src')));
  const delayedOptionalSource = snapshotSources[2];
  await snapshotExport.route(`**${delayedOptionalSource}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });
  const snapshotDownload = snapshotExport.waitForEvent('download');
  await snapshotExport.evaluate(() => {
    const button = document.querySelector('#download-png');
    button.click();
    button.click();
  });
  assert.equal(await snapshotExport.locator('#download-png').isDisabled(), true, 'Download button must disable while export is preparing');
  await snapshotExport.locator('.selected-item .icon-button:not([disabled])').first().click();
  await snapshotDownload;
  await snapshotExport.locator('#download-png:not([disabled])').waitFor();
  const snapshotState = await snapshotExport.evaluate(() => ({ canvasCount: window.__exportCanvasCount, draws: window.__exportDraws }));
  assert.equal(snapshotState.canvasCount, 1, 'Duplicate clicks must not start duplicate export jobs');
  assert.deepEqual(snapshotState.draws, snapshotSources, 'Trait changes after export starts must not alter the exported snapshot');
  await snapshotExport.close();

  const failedExport = await openExportPage();
  const failedSource = await failedExport.locator('.avatar-layer').nth(1).getAttribute('src');
  await failedExport.evaluate((source) => {
    const srcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true,
      get() { return srcDescriptor.get.call(this); },
      set(value) {
        if (value === source && !this.isConnected) {
          queueMicrotask(() => this.onerror?.(new Event('error')));
          return;
        }
        srcDescriptor.set.call(this, value);
      },
    });
  }, failedSource);
  let failedDownloadCount = 0;
  failedExport.on('download', () => { failedDownloadCount += 1; });
  await failedExport.locator('#download-png').click();
  await failedExport.locator('#download-png:not([disabled])').waitFor();
  await failedExport.waitForTimeout(100);
  assert.equal(failedDownloadCount, 0, 'Failed image loading must not produce a partial download');
  assert.match(await failedExport.locator('#live-region').textContent(), /could not be loaded for export/i, 'Export failure must be announced accessibly');
  assert.equal(await failedExport.locator('#download-png').isEnabled(), true, 'Download button must re-enable after export failure');
  await failedExport.close();

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
  await assertDownloadDisclaimer(smallPhone, '320x568 standalone builder', true);
  await assertNoHorizontalPageOverflow(smallPhone, '320x568 standalone builder');
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

  console.log('Avatar browser checks passed for homepage integration, responsive layouts, animated background lifecycle, reduced motion, PNG export, request limits, interaction parity, and failure recovery.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
