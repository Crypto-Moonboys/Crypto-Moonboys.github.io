import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const homepageContract = JSON.parse(await readFile(path.join(root, 'scripts/fixtures/homepage-approved-contract.json'), 'utf8'));
const output = process.env.HERO_SCREENSHOT_DIR || path.join(root, 'test-artifacts', 'homepage-hero-verification');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    assert.ok(file.startsWith(root + path.sep));
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  await mkdir(output, { recursive: true });
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    // Keep real local scripts, CSS and artwork; avoid third-party video/API traffic.
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.locator('#build-moonboy').waitFor();
    await page.evaluate(() => document.fonts.ready);
    // The featured video is now first; the cityscape hero image was removed.
    await page.locator('main > .home-video').first().waitFor();
    assert.equal(await page.locator('main .home-neon-cityscape').count(), 0,
      'The retired cityscape hero must not return above the approved video');
    // Load lazy artwork through its normal viewport trigger before checking
    // natural dimensions; decode alone does not start an offscreen lazy load.
    for (const image of await page.locator('#home-top-message > img').all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(image => image.decode());
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const reducedMotion of ['no-preference', 'reduce']) {
      await page.emulateMedia({ reducedMotion });
      const result = await page.evaluate(() => {
        const duplicate = document.getElementById('home-top-message');
        const builder = document.getElementById('build-moonboy');
        const mission = document.getElementById('how-it-works');
        const props = ['font-family', 'font-size', 'font-weight', 'line-height', 'color', 'background', 'text-shadow', 'animation', 'padding', 'margin', 'border', 'border-radius', 'outline', 'box-shadow', 'letter-spacing', 'text-transform', 'text-align', 'width', 'max-width', 'opacity', 'display', 'visibility'];
        // Sample both animations at the same phase without changing their CSS.
        document.querySelectorAll('.hero-pulse-line').forEach(e => e.getAnimations().forEach(a => { a.pause(); a.currentTime = 2250; }));
        const styles = section => [section, section.firstElementChild, section.querySelector('h1'), section.querySelector('.hero-secondary-heading'), section.querySelector('p')].map(e => Object.fromEntries(props.map(p => [p, getComputedStyle(e).getPropertyValue(p)])));
        const video = document.querySelector('main > .home-video');
        const gallery = document.querySelector('main > .home-art-strip');
        const gallerySets = [...gallery.querySelectorAll('.home-art-strip-set')];
        const videoRect = video.getBoundingClientRect();
        const artwork = [...duplicate.querySelectorAll(':scope > img')];
        const fontPx = selector => {
          const element = document.querySelector(selector);
          return element ? Number.parseFloat(getComputedStyle(element).fontSize) : NaN;
        };
        const typography = {
          hero: fontPx('#home-top-message > .simple-wrap:first-child > h1'),
          secondary: fontPx('#home-top-message .hero-secondary-heading'),
          pulse: fontPx('#home-top-message > .simple-wrap:first-child > .hero-pulse-line'),
          missionTitle: fontPx('#home-core-mission-title'),
          missionBody: fontPx('.home-core-mission > p'),
          sectionTitle: fontPx('#open-creative-academy-title'),
          sectionBody: fontPx('#open-creative-academy .history-blurb p:not(.history-lead)'),
          sectionLead: fontPx('#open-creative-academy .history-lead'),
          subsection: fontPx('.history-blurb h3'),
          finalTitle: fontPx('.simple-final h2'),
        };
        return {
          topStyles: styles(duplicate),
          typography,
          messages: {
            topHeading: duplicate.firstElementChild.querySelector('h1').textContent,
            topPulse: duplicate.firstElementChild.querySelector('p').textContent,
            secondaryHeading: duplicate.firstElementChild.querySelector('.hero-secondary-heading').textContent,
          },
          first: document.querySelector('main').firstElementChild === video,
          followsVideo: duplicate.previousElementSibling === video,
          videoFullWidth: videoRect.width === innerWidth && Math.abs(videoRect.height - videoRect.width * 9 / 16) < 1,
          videoSource: video.querySelector('iframe').getAttribute('src'),
          builderFollowsMissionText: duplicate.nextElementSibling === gallery && gallery.nextElementSibling === builder,
          galleryLoop: gallerySets.length === 2 && gallerySets[1].getAttribute('aria-hidden') === 'true' &&
            gallerySets.every(set => set.querySelectorAll('img').length === 9) &&
            JSON.stringify([...gallerySets[0].querySelectorAll('img')].map(img => img.getAttribute('src'))) ===
              JSON.stringify([...gallerySets[1].querySelectorAll('img')].map(img => img.getAttribute('src'))),
          builderBeforeAcademy: builder?.nextElementSibling === mission,
          directHomepage: !document.querySelector('.build-moonboy-hero') &&
            !document.querySelector('a[href="/enter.html"]') &&
            !document.querySelector('#cm-bad-days-intro') &&
            !document.querySelector('script[src*="first-visit-intro"]'),
          noObsoleteCta: !document.querySelector('.homepage-build-cta'),
          noRemovedCopy: !document.body.textContent.includes('GET READY #PLAYERONE') &&
            !document.body.textContent.includes('We Collaborate We Create We Inspire'),
          inlineStyles: duplicate.firstElementChild.querySelectorAll('[style]').length + Number(duplicate.hasAttribute('style')),
          noOverflow: document.documentElement.scrollWidth === innerWidth && [duplicate].every(s => [...s.querySelectorAll('h1,p')].every(e => e.scrollWidth <= e.clientWidth)),
          artworkSources: artwork.map(image => image.getAttribute('src')),
          artworkNaturalHeight: artwork.length === 2 && artwork.every(image => {
            const r = image.getBoundingClientRect();
            return image.naturalWidth > 0 && r.width === innerWidth && Math.abs(r.height - r.width * image.naturalHeight / image.naturalWidth) < 1;
          }),
        };
      });
      const text = html => html.replace(/<[^>]*>/g, '');
      assert.deepEqual(result.messages, {
        topHeading: text(homepageContract.top_heading_html), topPulse: text(homepageContract.top_pulse_html),
        secondaryHeading: text(homepageContract.top_secondary_heading_html),
      }, width + 'px distinct approved messages');
      for (const key of ['first', 'followsVideo', 'videoFullWidth', 'builderFollowsMissionText', 'builderBeforeAcademy', 'directHomepage', 'noObsoleteCta', 'noRemovedCopy', 'noOverflow', 'galleryLoop', 'artworkNaturalHeight']) assert.equal(result[key], true, width + 'px ' + key);
      assert.equal(result.videoSource, 'https://www.youtube.com/embed/pyvZa_USoNc?rel=0');
      assert.deepEqual(result.artworkSources, ['/art/WAXP%20Pop%20Culture%20vs%20Meme%20Mayhem.jpg', '/img/BUILD%20A%20CRYPTO%20MOONBOY%20ONLINE.jpg']);
      assert.equal(result.inlineStyles, 0);
      assert.equal(result.topStyles[0].background.startsWith('rgba(0, 0, 0, 0)'), true, 'No section panel');
      assert.equal(result.topStyles[2].background.startsWith('rgba(0, 0, 0, 0)'), true, 'No heading panel');
      assert.equal(result.topStyles[2].border.startsWith('0px'), true, 'No heading border');
      assert.equal(result.topStyles[3].color, 'rgb(243, 189, 37)', 'Second headline stays gold');
      const type = result.typography;
      assert(Object.values(type).every(Number.isFinite), width + 'px typography selectors must resolve');
      assert(type.hero > type.secondary && type.secondary > type.sectionTitle,
        width + 'px hero > supporting headline > section title');
      assert(Math.abs(type.missionTitle - type.sectionTitle) < 0.5 &&
        Math.abs(type.sectionTitle - type.finalTitle) < 0.5,
        width + 'px all main section headings must share one responsive size');
      assert(Math.abs(type.missionBody - type.sectionBody) < 0.5,
        width + 'px body copy must match across mission and academy');
      assert(type.sectionTitle > type.subsection && type.subsection > type.sectionLead &&
        type.sectionLead >= type.missionBody && type.pulse > type.missionBody,
        width + 'px headings, lead copy, animated line and body copy form a clear hierarchy');
      assert(type.missionBody >= 18 && type.sectionBody >= 18,
        width + 'px main content must remain comfortably readable');
      assert.ok(result.topStyles[4].animation.includes(reducedMotion === 'reduce' ? 'none' : 'heroPulse'));
      if (reducedMotion === 'no-preference') {
        for (const [name, selector] of [['top', '#home-top-message']]) {
          await page.locator(selector).screenshot({ path: path.join(output, width + '-' + name + '.png') });
        }
      }
      console.log(width + 'px / ' + reducedMotion + ': style, text, placement, visibility, overflow and image checks passed');
    }
    await page.close();
  }
  // First and returning visitors land on the homepage directly. The old
  // splash URL is a noindex redirect, not a separate artwork experience.
  const visitorContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const visitor = await visitorContext.newPage();
  await visitor.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await visitor.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  assert.equal(visitor.url(), origin + '/', 'First-time visitor arrives at homepage');
  assert.equal(await visitor.locator('#cm-bad-days-intro').count(), 0, 'No automatic splash overlay');
  await visitor.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await visitor.locator('#cm-bad-days-intro').count(), 0, 'Returning visitor still sees homepage');
  await visitor.goto(origin + '/enter.html', { waitUntil: 'domcontentloaded' });
  await visitor.waitForURL(origin + '/');
  assert.equal(await visitor.locator('.build-moonboy-hero').count(), 0, 'Legacy splash never renders artwork');
  await visitor.goto(origin + '/my-moonboy.html', { waitUntil: 'domcontentloaded' });
  assert.equal(await visitor.locator('#bad-days-artwork img').count(), 5, 'Five panels now live on My Moonboy');
  await visitorContext.close();
  console.log('First visit, return visit, legacy redirect and moved artwork checks passed');
  console.log('Screenshots: ' + output);
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
