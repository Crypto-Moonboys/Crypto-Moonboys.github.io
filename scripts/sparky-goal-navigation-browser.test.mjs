import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
// Keep the real page, styles and shared header; isolate unrelated API/auth scripts.
const scripts = ['js/sparky-creator-activities.js', 'js/creator-memory.js', 'js/creator-memory-studio.js', 'js/sparky-gpt-app.js', 'js/site-shell.js'];
const html = read('gpt-users.html')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, tag => {
    const src = tag.match(/\bsrc="([^"]+)"/)?.[1];
    return src && scripts.includes(new URL(src, 'http://creator.test').pathname.slice(1)) ? tag : '';
  });
const resources = new Map([
  ['/graffiti-kings-creative-guide.html', { body: read('graffiti-kings-creative-guide.html'), contentType: 'text/html' }],
  ['/gpt-users.html', { body: html, contentType: 'text/html' }],
  ['/gpt-users-legacy.html', { body: html.replace('id="gpt-launch"', '').replace('id="gpt-launch-title" tabindex="-1"', 'id="gpt-launch-title"'), contentType: 'text/html' }],
  ['/css/wiki.css', { body: read('css/wiki.css'), contentType: 'text/css' }],
  ...scripts.map(path => ['/' + path, { body: read(path), contentType: 'text/javascript' }]),
]);
const goals = [
  ['website', 'Build my first website'],
  ['wiki', 'Build my own lore wiki'],
  ['moonboy', 'Build a Moonboy or PFP'],
  ['stickers', 'Make stickers'],
  ['world', 'Build an original fictional universe'],
  ['do-it', 'You choose — do it for me'],
];
const activities = JSON.parse(read('scripts/fixtures/sparky-creator-goal-hashes.json')).activities;

function destinationVisible() {
  const heading = document.getElementById('gpt-launch-title').getBoundingClientRect();
  const header = document.getElementById('site-header').getBoundingClientRect();
  const action = document.getElementById('gpt-open-link').getBoundingClientRect();
  return heading.top >= header.bottom && action.top >= header.bottom && action.bottom <= innerHeight;
}

async function checkDestination(page, title) {
  assert.equal(await page.locator('#gpt-choice').textContent(), 'Selected: ' + title);
  if (await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    assert.ok(await page.evaluate(destinationVisible), 'reduced motion must jump without animation');
  }
  await page.waitForFunction(destinationVisible, null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => document.activeElement.id), 'gpt-launch-title');
  const prompt = await page.locator('#gpt-prompt-preview').inputValue();
  assert.ok(prompt.startsWith(title + '.\n\n'));
  assert.equal(new URL(await page.locator('#gpt-open-link').getAttribute('href')).searchParams.get('q'), prompt);
  assert.ok(prompt.endsWith(await page.evaluate(() => window.SPARKY_CREATOR_APP.contextPrompt)));
}

async function checkCategory(page, group) {
  assert.equal(await page.locator('.gpt-group[open]').count(), 1, 'opening a section closes the previous section');
  const id = await group.getAttribute('id');
  await page.waitForFunction(id => {
    const section = document.getElementById(id);
    const heading = section.querySelector('summary').getBoundingClientRect();
    const firstActivity = section.querySelector('[data-activity]').getBoundingClientRect();
    const header = document.getElementById('site-header').getBoundingClientRect();
    return section.open && heading.top >= header.bottom && heading.bottom < innerHeight && firstActivity.top < innerHeight;
  }, id);
  assert.ok(await group.locator('summary').evaluate(heading => document.activeElement === heading), 'section heading keeps keyboard focus');
}

let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
  for (const width of [1440, 390]) {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      const page = await browser.newPage({ viewport: { width, height: 960 }, reducedMotion });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const testStartup = width === 1440 && reducedMotion === 'reduce';
      let releaseApp;
      const appReady = new Promise(resolve => { releaseApp = resolve; });
      let holdApp = testStartup;
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (holdApp && url.pathname === '/js/sparky-gpt-app.js') await appReady;
        const resource = resources.get(url.pathname);
        return resource ? route.fulfill(resource) : route.abort();
      });
      await page.goto('http://creator.test/gpt-users.html', { waitUntil: 'commit' });
      if (testStartup) {
        await page.locator('[data-feature="website"]').waitFor({ state: 'visible' });
        for (const [id] of goals) assert.equal(await page.locator(`[data-feature="${id}"]`).isEnabled(), false, 'loading goals must not accept inert clicks');
        assert.equal(await page.locator('#gpt-search').isEnabled(), false);
        assert.equal(await page.locator('#gpt-copy-prompt').isEnabled(), false);
        assert.equal(await page.locator('#gpt-search-count').textContent(), 'Loading creative activities…');
        holdApp = false;
        releaseApp();
      }
      await page.waitForFunction(() => document.querySelectorAll('[data-activity]').length === 107 && !document.querySelector('[data-feature="website"]').disabled);
      await page.waitForLoadState('load');
      assert.equal(await page.locator('#gpt-context-link').getAttribute('href'), '/graffiti-kings-creative-guide.html');
      for (const [id] of goals) assert.equal(await page.locator(`[data-feature="${id}"]`).isEnabled(), true);
      assert.equal(await page.locator('#gpt-search').isEnabled(), true);
      assert.equal(await page.locator('#gpt-copy-prompt').isEnabled(), true);
      assert.equal(await page.locator('[data-activity]').count(), 107);
      assert.equal(await page.evaluate(() => window.scrollY), 0, 'initial rendering must not jump');
      await page.locator('#gpt-search').fill('no-such-activity');
      assert.equal(await page.locator('[data-activity]').count(), 0);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'gpt-search', 'typing must keep search focus');
      for (const [id, title] of goals) {
        await page.locator(`[data-feature="${id}"]`).click();
        await checkDestination(page, title);
        assert.equal(await page.locator('#gpt-search').inputValue(), '');
        assert.equal(await page.locator('[data-activity][aria-pressed="true"]').getAttribute('data-activity'), id);
        // Clicking again scrolls back to the same message without needing a new hash.
        await page.locator(`[data-feature="${id}"]`).click();
        await checkDestination(page, title);
      }
      const websiteGroup = page.locator('.gpt-group').filter({ has: page.locator('[data-activity="website"]') });
      // Keyboard activation of a section must reveal it and close the old section too.
      await websiteGroup.locator('summary').press('Enter');
      await checkCategory(page, websiteGroup);
      await page.locator('[data-activity="website"]').click();
      await checkDestination(page, goals[0][1]);
      if (width === 1440 && reducedMotion === 'reduce') {
        // Exercise every real directory button against the independent title fixture.
        assert.equal(await page.locator('.gpt-group').count(), 12);
        assert.equal(activities.length, 107);
        const visitedSections = new Set();
        for (const { id, title } of activities) {
          const group = page.locator('.gpt-group').filter({ has: page.locator(`[data-activity="${id}"]`) });
          if (!await group.evaluate(section => section.open)) {
            await group.locator('summary').click();
            await checkCategory(page, group);
          }
          visitedSections.add(await group.getAttribute('id'));
          await page.locator(`[data-activity="${id}"]`).click();
          await checkDestination(page, title);
          assert.equal(await page.locator('[data-activity][aria-pressed="true"]').getAttribute('data-activity'), id);
        }
        assert.equal(visitedSections.size, 12, 'all section headings and their activities are covered');
      }
      // A taller header must not hide the destination at mobile/text-expanded sizes.
      await page.locator('#site-header').evaluate(header => { header.style.minHeight = '240px'; });
      await page.locator('[data-feature="website"]').click();
      await checkDestination(page, goals[0][1]);
      if (testStartup) {
        await page.goto('http://creator.test/gpt-users-legacy.html');
        await page.locator('[data-feature="wiki"]').click();
        await checkDestination(page, goals[1][1]);
      }
      assert.deepEqual(errors, [], `${width}/${reducedMotion}: no runtime errors`);
      await page.close();
    }
    // Crawlers and users without JavaScript receive the complete creative brief.
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 960 } });
    const brief = await context.newPage();
    await brief.route('**/*', route => {
      const resource = resources.get(new URL(route.request().url()).pathname);
      return resource ? route.fulfill(resource) : route.abort();
    });
    await brief.goto('http://creator.test/graffiti-kings-creative-guide.html');
    assert.ok(await brief.locator('h1').isVisible());
    assert.equal(await brief.locator('#activities h3').count(), 12);
    assert.match(await brief.locator('#voice').innerText(), /Plain language can still be sharp/);
    assert.match(await brief.locator('#worlds').innerText(), /preserve the source's grit/);
    assert.match(await brief.locator('#identity').innerText(), /One striking image and one line may be enough/);
    assert.match(await brief.locator('#shock').innerText(), /one message, one recognisable mark/);
    assert.match(await brief.locator('#swarm').innerText(), /does not run a 24\/7 bot service/);
    for (const id of ['shock', 'streets', 'swarm']) {
      // Test each native link from the guide entrance, avoiding a race between
      // the previous smooth jump and scrolling back to the offscreen contents.
      await brief.goto('http://creator.test/graffiti-kings-creative-guide.html');
      await brief.locator(`nav a[href="#${id}"]`).click();
      await brief.waitForURL(`http://creator.test/graffiti-kings-creative-guide.html#${id}`);
      assert.equal(new URL(brief.url()).hash, '#' + id);
      // Poll from Node: page-side animation-frame callbacks are disabled in
      // this context, but browser geometry remains readable via Playwright.
      let heading;
      for (let attempt = 0; attempt < 50; attempt++) {
        heading = await brief.locator(`#${id} h2`).boundingBox();
        if (heading && heading.y >= 0 && heading.y + heading.height <= 960) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.ok(heading && heading.y >= 0 && heading.y + heading.height <= 960,
        `${width}/${id}: native jump must show the heading, actual box ${JSON.stringify(heading)}`);
    }
    assert.ok(await brief.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'creative guide fits mobile and desktop');
    await context.close();
  }
  console.log('Creator goal navigation passed: all 12 section headings, keyboard activation, real versioned script tags, delayed startup, legacy cached markup, desktop/mobile, all six goals, all 107 activities, repeat selection, header clearance, focus, reduced motion and prompt parity.');
} finally {
  await browser?.close();
}
