import assert from 'node:assert/strict';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
  await landscape.close();

  const tabletLandscape = await openAt({ width: 1024, height: 768 });
  const tabletPreview = await tabletLandscape.locator('.preview-panel').boundingBox();
  const tabletControls = await tabletLandscape.locator('.category-panel').boundingBox();
  assert(Math.abs(tabletPreview.width - tabletPreview.height) < 1, 'Tablet landscape avatar must be square');
  assert(tabletPreview.height >= 750, 'Tablet landscape avatar must fill available viewport height');
  assert(tabletControls.x >= tabletPreview.x + tabletPreview.width, 'Tablet landscape controls must sit beside avatar');
  await tabletLandscape.close();

  const missing = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await missing.route('**/img/avatar-builder/layers/body/**', (route) => route.abort());
  await missing.goto(url, { waitUntil: 'networkidle' });
  await missing.locator('#avatar-frame[aria-busy="false"]').waitFor();
  await missing.locator('#preview-fallback:visible').waitFor();
  assert.match(await missing.locator('#preview-fallback').textContent(), /could not load/);
  await missing.close();

  console.log('Avatar browser checks passed for desktop, portrait, landscape, interactions, and missing images.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
