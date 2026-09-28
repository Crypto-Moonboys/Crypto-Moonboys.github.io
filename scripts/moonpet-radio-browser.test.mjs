import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { chromium } from 'playwright';

// Exercise the production controller with native media playback and browser
// gesture restrictions. The local WAV replaces only the remote station.
const client = await fs.readFile('js/moonpet-mini-app.js', 'utf8');
const preferences = client.slice(client.indexOf('  function readRadioPreference()'), client.indexOf('  // TEST-EXPORT: radioPlayback:start'));
const controller = client.split('// TEST-EXPORT: radioPlayback:start')[1].split('// TEST-EXPORT: radioPlayback:end')[0];
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
  if (url.pathname === '/tone.wav') { streams++; response.writeHead(200, { 'Content-Type': 'audio/wav' }); return response.end(wav); }
  if (url.pathname === '/broken') { streams++; response.writeHead(503); return response.end('unavailable'); }
  response.setHeader('Content-Type', 'text/html');
  response.end(`<!doctype html><button id="normal">Open section</button><button id="radio" data-utility="radio">Radio</button><button id="audio" data-utility="audio">Audio</button><output id="notice"></output><audio id="stream" preload="none" loop src="${url.searchParams.has('broken') ? '/broken' : '/tone.wav'}"></audio><script>
    var state = {}, radioPlayer = document.getElementById('stream');
    var radioRequestedOn = false, radioEnabled = false, radioRequestGeneration = 0, radioRetryNeedsLoad = false, radioNeedsGesture = false;
    function syncMoonpetScore() {} function haptic() {}
    function renderCanvasTools() { document.getElementById('radio').dataset.enabled = String(radioEnabled); }
    function tell(text) { document.getElementById('notice').textContent = text; }
    ${preferences}
    ${controller}
    ${listeners}
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
  await browser.close(); browser = null;
  // When a browser permits autoplay, audio starts with no synthetic user action.
  browser = await chromium.launch({ ...launch, args: [...launch.args, '--autoplay-policy=no-user-gesture-required'] });
  const allowed = await browser.newPage();
  await allowed.goto(base); await allowed.waitForFunction(() => radioState().enabled && document.getElementById('stream').currentTime > 0);
  const broken = await browser.newPage();
  await broken.goto(base + '?broken=1'); await broken.waitForFunction(() => radioState().error);
  await broken.locator('#radio').click();
  await broken.waitForFunction(() => document.getElementById('notice').textContent.includes('FORMAT / 4'));
  assert.equal(await broken.evaluate(() => radioState().gesture), false, 'source errors are distinct from permission blocks');
  console.log('Native radio passed: permitted autoplay, mobile first tap, direct icon, remembered Off, source error diagnostics.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
