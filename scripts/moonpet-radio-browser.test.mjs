import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { chromium } from 'playwright';
import worker from '../workers/moonboys-api/deployment-entry.js';

// Exercise the production controller with native media playback and browser
// gesture restrictions. The local WAV replaces only the remote station.
const client = await fs.readFile('js/moonpet-mini-app.js', 'utf8');
const gameHtml = await fs.readFile('moonpet-game.html', 'utf8');
const productionAudio = gameHtml.match(/<audio id="moonpet-radio"[^>]*><\/audio>/)[0].replace('id="moonpet-radio"', 'id="stream"');
const preferences = client.slice(client.indexOf('  function readRadioPreference()'), client.indexOf('  // TEST-EXPORT: radioPlayback:start'));
const controller = client.split('// TEST-EXPORT: radioPlayback:start')[1].split('// TEST-EXPORT: radioPlayback:end')[0];
const animation = client.slice(client.indexOf('  function actionAnimationFamily('), client.indexOf('  function hatchArtTransitionActive('));
const toolsRenderer = client.slice(client.indexOf('  function renderCanvasTools()'), client.indexOf('  function closeUtility()'));
const listeners = client.slice(client.indexOf('  bindRadioGestureResume();'), client.indexOf('  function ensureAudio()'));
const samples = 22050;
const wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(samples, 24); wav.writeUInt32LE(samples * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i * 440 * 2 * Math.PI / samples) * 1000), 44 + i * 2);
let streams = 0;
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/tone.wav') { streams++; const send = () => { response.writeHead(200, { 'Content-Type': 'audio/wav' }); response.end(wav); }; if (url.searchParams.has('slow')) return setTimeout(send, 4500); return send(); }
  if (url.pathname === '/broken') { streams++; response.writeHead(503); return response.end('unavailable'); }
  response.setHeader('Content-Type', 'text/html');
  response.end(`<!doctype html><button id="normal">Open section</button><nav id="canvas-tools"><button id="radio" data-utility="radio">Radio<small>RADIO</small></button><button id="audio" data-utility="audio">Audio</button></nav><button id="dance" data-action="dance">Dance</button><button id="feed">Feed</button><output id="notice"></output><audio id="stream" preload="none" loop src="${url.searchParams.has('broken') ? '/broken' : url.searchParams.has('slow') ? '/tone.wav?slow=1' : '/tone.wav'}"></audio><script>
    var state = {}, radioPlayer = document.getElementById('stream');
    var radioRequestedOn = false, radioEnabled = false, radioRequestGeneration = 0, radioRetryNeedsLoad = false, radioNeedsGesture = false;
    function syncMoonpetScore() {} function haptic() {}
    var canvasTools = document.getElementById('canvas-tools'), audioEnabled = false;
    ${toolsRenderer}
    function tell(text) { document.getElementById('notice').textContent = text; }
    ${preferences}
    ${controller}
    var animationMode = 'idle', animationUntil = 0, actionSequence = 0, actionStartedAt = 0, sleepLatched = false;
    var reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches, reducedMotionAnimationTimer = 0;
    function drawWorld() {}
    ${animation}
    ${listeners}
    document.getElementById('dance').addEventListener('click', function () { startDanceRadio(); animateAction('dance', true, 3600); });
    document.getElementById('feed').addEventListener('click', function () { animateAction('feed', true, 2400); });
    window.danceState = () => ({ mode: animationMode, until: animationUntil, now: performance.now(), paused: radioPlayer.paused });
    document.getElementById('radio').addEventListener('click', toggleRadio);
    window.radioState = () => ({ enabled:radioEnabled, requested:radioRequestedOn, gesture:radioNeedsGesture, error:radioPlayer.error && radioPlayer.error.code });
    if (readRadioPreference()) setRadioEnabled(true, false);
  </script>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const launch = { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] };
if (process.env.CHROMIUM_EXECUTABLE_PATH) launch.executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
let browser;
const originalFetch = globalThis.fetch;
try {
  browser = await chromium.launch({ ...launch, args: [...launch.args, '--autoplay-policy=user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => localStorage.setItem('arcade_radio_on', 'false'));
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(() => radioState().gesture);
  assert.equal(await page.locator('#notice').textContent(), '', 'expected autoplay blocking stays quiet');
  assert.equal(await page.evaluate(() => localStorage.getItem('moonpet-radio-preference')), null, 'blocking must not become a saved Off preference');
  await page.locator('#normal').tap();
  await page.waitForFunction(() => radioState().enabled && document.getElementById('stream').currentTime > 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('moonpet-radio-preference')), 'on');
  await page.locator('#radio').tap();
  assert.equal(await page.evaluate(() => radioState().enabled), false);
  const beforeOffReload = streams;
  await page.reload(); await page.locator('#normal').tap();
  assert.equal(await page.evaluate(() => radioState().enabled || radioState().gesture || radioState().requested), false);
  assert.equal(streams, beforeOffReload, 'explicit Off survives reload and other taps without fetching audio');
  await page.locator('#radio').tap();
  await page.waitForFunction(() => radioState().enabled);
  assert.deepEqual(errors, []);
  await context.close();
  // A separate fresh context verifies the radio icon is not also consumed by
  // the global first-tap handler (which would toggle playback straight off).
  const direct = await browser.newContext(); const directPage = await direct.newPage();
  await directPage.goto(base); await directPage.waitForFunction(() => radioState().gesture);
  await directPage.locator('#radio').click(); await directPage.waitForFunction(() => radioState().enabled);
  await direct.close();
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const danceContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion });
    await danceContext.addInitScript(() => localStorage.setItem('moonpet-radio-preference', 'off'));
    const dancePage = await danceContext.newPage();
    const danceErrors = []; dancePage.on('pageerror', error => danceErrors.push(error.message));
    await dancePage.goto(base);
    await dancePage.locator('#dance').tap();
    await dancePage.waitForFunction(() => radioState().enabled && document.getElementById('stream').currentTime > 0);
    assert.equal(await dancePage.evaluate(() => localStorage.getItem('moonpet-radio-preference')), 'off', 'Dance playback must not save a manual On preference');
    assert.equal(await dancePage.evaluate(() => danceState().mode), 'dance');
    await dancePage.waitForFunction(() => !radioState().requested && danceState().paused);
    assert.ok(await dancePage.evaluate(() => danceState().now >= danceState().until), 'native playback stops at the real animation deadline');
    if (reducedMotion === 'reduce') await dancePage.waitForFunction(() => danceState().mode === 'idle');
    const beforeDanceReload = streams;
    await dancePage.reload(); await dancePage.locator('#normal').tap();
    assert.equal(await dancePage.evaluate(() => radioState().requested), false);
    assert.equal(streams, beforeDanceReload, 'temporary Dance audio does not restart on reload or an unrelated tap');
    await dancePage.locator('#dance').tap();
    await dancePage.waitForFunction(() => radioState().enabled);
    await dancePage.locator('#feed').tap();
    assert.equal(await dancePage.evaluate(() => danceState().paused && !radioState().requested), true, 'replacement pose stops the stream');
    await dancePage.locator('#dance').tap();
    await dancePage.waitForFunction(() => radioState().enabled);
    await dancePage.locator('#radio').tap(); // explicit Off releases the automatic timer
    await dancePage.locator('#radio').tap(); // explicit On owns playback after Dance
    await dancePage.waitForFunction(() => danceState().now >= danceState().until && radioState().enabled && !danceState().paused);
    assert.equal(await dancePage.evaluate(() => localStorage.getItem('moonpet-radio-preference')), 'on');
    assert.deepEqual(danceErrors, []);
    await danceContext.close();
  }
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const cold = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion });
    await cold.addInitScript(() => localStorage.setItem('moonpet-radio-preference', 'off'));
    const page = await cold.newPage(); await page.goto(base + '?slow=1');
    await page.locator('#dance').tap();
    await page.waitForFunction(() => danceState().now > 3800 && danceState().until === Infinity);
    assert.equal(await page.locator('#radio small').textContent(), 'LOADING', 'slow connection has visible feedback');
    assert.equal(await page.locator('#radio').getAttribute('aria-busy'), 'true');
    await page.waitForFunction(() => radioState().enabled && document.getElementById('stream').currentTime > 0);
    assert.ok(await page.evaluate(() => danceState().until - danceState().now > 3000), 'full audible pose begins after native media is ready');
    assert.equal(await page.locator('#radio small').textContent(), 'RADIO');
    await page.waitForFunction(() => !radioState().requested && danceState().paused);
    if (reducedMotion === 'reduce') await page.waitForFunction(() => danceState().mode === 'idle');
    assert.equal(await page.evaluate(() => localStorage.getItem('moonpet-radio-preference')), 'off');
    await cold.close();
  }
  console.log('Native cold-stream Dance passed: 4.5-second server setup, held pose, visible loading, full audible dance and reduced-motion completion.');
  console.log('Native Dance radio passed: mobile trusted tap, exact pose deadline, reduced motion, saved Off, interrupted pose and manual override.');
  await browser.close(); browser = null;
  // When a browser permits autoplay, audio starts with no synthetic user action.
  browser = await chromium.launch({ ...launch, args: [...launch.args, '--autoplay-policy=no-user-gesture-required'] });
  const allowed = await browser.newPage();
  await allowed.goto(base); await allowed.waitForFunction(() => radioState().enabled && document.getElementById('stream').currentTime > 0);
  const broken = await browser.newPage();
  await broken.goto(base + '?broken=1'); await broken.waitForFunction(() => radioState().error);
  await broken.locator('#radio').click();
  await broken.waitForFunction(() => document.getElementById('notice').textContent.includes('FORMAT / 4'));
  assert.equal(await broken.locator('#radio small').textContent(), 'RETRY', 'source failure stays visible on its control');
  assert.equal(await broken.evaluate(() => radioState().gesture), false, 'source errors are distinct from permission blocks');
  console.log('Native radio passed: permitted autoplay, mobile first tap, direct icon, remembered Off, source error diagnostics.');
  await browser.close(); browser = null;

  // Reproduce a strict mobile WebView: an HTTPS stream redirects to HTTP.
  // Disable Chrome's automatic media upgrades so desktop tolerance cannot hide it.
  browser = await chromium.launch({ ...launch, args: [...launch.args, '--disable-features=AutoupgradeMixedContent'] });
  const upstreamRequests = [];
  globalThis.fetch = async (url, options) => {
    upstreamRequests.push(url);
    assert.equal(options.redirect, 'manual');
    if (url === 'https://stream.radiojar.com/2qm1fc5kb') {
      return new Response(null, { status: 302, headers: { Location: 'http://n02.radiojar.com/2qm1fc5kb?rj-tok=fixture' } });
    }
    assert.equal(url, 'https://n02.radiojar.com/2qm1fc5kb?rj-tok=fixture');
    // Synthetic native audio avoids storing broadcast content or depending on
    // the station being online in CI. Live MP3 is checked separately.
    return new Response(wav, { headers: { 'Content-Type': 'audio/mpeg' } });
  };
  for (const legacy of [true, false]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const mediaRequests = [];
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (url === 'https://moonpet-radio.test/') {
        const audio = legacy ? productionAudio.replace(/src="[^"]+"/, 'src="https://stream.radiojar.com/2qm1fc5kb"') : productionAudio;
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><head><meta http-equiv="Content-Security-Policy" content="block-all-mixed-content"></head><body>
          <button id="radio" data-utility="radio">Radio</button><output id="notice"></output>${audio}<script>
          var state = {}, radioPlayer = document.getElementById('stream');
          var radioRequestedOn = false, radioEnabled = false, radioRequestGeneration = 0, radioRetryNeedsLoad = false, radioNeedsGesture = false;
          function syncMoonpetScore() {} function haptic() {} function renderCanvasTools() {}
          function tell(text) { document.getElementById('notice').textContent = text; }
          ${preferences}\n${controller}\n${listeners}
          document.getElementById('radio').addEventListener('click', toggleRadio);
          window.radioState = () => ({ enabled: radioEnabled, requested: radioRequestedOn, error: radioPlayer.error && radioPlayer.error.code });
          </script></body>` });
      }
      mediaRequests.push(url);
      if (url === 'https://stream.radiojar.com/2qm1fc5kb') {
        return route.fulfill({ status: 302, headers: { Location: 'http://n02.radiojar.com/2qm1fc5kb?rj-tok=fixture' } });
      }
      assert.equal(url, 'https://api.cryptomoonboys.com/radio/stream');
      const response = await worker.fetch(new Request(url), {}, {});
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
    });
    await page.goto('https://moonpet-radio.test/');
    await page.locator('#radio').tap();
    if (legacy) {
      await page.waitForFunction(() => radioState().error === 4);
      assert.match(await page.locator('#notice').textContent(), /FORMAT \/ 4/, 'reproduce the reported error on the old direct stream');
      assert.equal(upstreamRequests.length, 0);
    } else {
      await page.waitForFunction(() => radioState().enabled && document.getElementById('stream').currentTime > 0);
      assert.equal(await page.locator('#notice').textContent(), 'GRAFFPUNKS RADIO LIVE.');
      assert.deepEqual(mediaRequests, ['https://api.cryptomoonboys.com/radio/stream'], 'no Radiojar redirect reaches the mobile player');
      assert.deepEqual(upstreamRequests, ['https://stream.radiojar.com/2qm1fc5kb', 'https://n02.radiojar.com/2qm1fc5kb?rj-tok=fixture']);
      await page.locator('#radio').tap();
      assert.equal(await page.evaluate(() => radioState().enabled), false);
    }
    await context.close();
  }
  console.log('Secure mobile radio passed: old redirect reproduces FORMAT / 4; production source through deployed Worker handler plays and stops.');
} finally {
  globalThis.fetch = originalFetch;
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
