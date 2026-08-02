import assert from 'node:assert/strict';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
const url = `http://127.0.0.1:${port}/avatar-builder-test.html`;
const installedBrowser = process.platform === 'win32'
  ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ].find(existsSync)
  : undefined;
const browser = await chromium.launch({ headless: true, executablePath: installedBrowser });

async function openAt(viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('#avatar-frame[aria-busy="false"]').waitFor();
  return page;
}

try {
  const desktop = await openAt({ width: 1440, height: 900 });
  const desktopBoxes = await Promise.all(['.category-panel', '.preview-panel', '.selection-panel'].map((selector) => desktop.locator(selector).boundingBox()));
  const [left, preview, right] = desktopBoxes;
  assert(Math.abs(preview.width - preview.height) < 1, 'Desktop avatar must be square');
  assert(left.x + left.width <= preview.x, 'Desktop category controls must be left of the avatar');
  assert(right.x >= preview.x + preview.width, 'Desktop selected controls must be right of the avatar');
  assert(preview.height >= 850, `Desktop avatar should fill the available viewport height: ${JSON.stringify(preview)}`);
  const desktopCategory = await desktop.locator('.category-button').first().boundingBox();
  assert(desktopCategory.width >= 40 && desktopCategory.height >= 40, `Desktop category controls must retain usable hit targets: ${JSON.stringify(desktopCategory)}`);
  assert(await desktop.locator('.category-tabs').evaluate((tabs) => tabs.scrollWidth > tabs.clientWidth), 'Narrow desktop category controls should scroll horizontally');
  const desktopTrait = await desktop.locator('.trait-button').first().boundingBox();
  assert(desktopTrait.width >= 90, `Desktop trait cards must remain readable at 1440x900: ${JSON.stringify(desktopTrait)}`);

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
  await largeDesktop.close();

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
  await portrait.close();

  const landscape = await openAt({ width: 844, height: 390 });
  const landscapePreview = await landscape.locator('.preview-panel').boundingBox();
  const landscapeControls = await landscape.locator('.category-panel').boundingBox();
  assert(Math.abs(landscapePreview.width - landscapePreview.height) < 1, 'Landscape avatar must be square');
  assert(landscapePreview.height >= 373, 'Landscape avatar must fill available viewport height');
  assert(landscapeControls.x >= landscapePreview.x + landscapePreview.width, 'Landscape controls must sit beside avatar');
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
  await tabletLandscape.close();

  const rapid = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const [rapidFirst, rapidSecond] = hatTraits.slice(1, 3);
  await rapid.route('**/img/avatar-builder/layers/hat/**', async (route) => {
    const requestPath = new URL(route.request().url()).pathname;
    if (requestPath === rapidFirst.layer) await new Promise((resolve) => setTimeout(resolve, 75));
    if (requestPath === rapidSecond.layer) await new Promise((resolve) => setTimeout(resolve, 350));
    await route.continue();
  });
  await rapid.goto(url, { waitUntil: 'networkidle' });
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
  await missing.goto(url, { waitUntil: 'networkidle' });
  await missing.locator('#avatar-frame[aria-busy="false"]').waitFor();
  await missing.locator('#preview-fallback:visible').waitFor();
  assert.match(await missing.locator('#preview-fallback').textContent(), /could not load/);
  await missing.close();

  console.log('Avatar browser checks passed for responsive layouts, landscape pagination, rapid selection, interactions, and missing images.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
