import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const SYNC = await readFile(path.join(ROOT, 'js/player-action-sync.js'), 'utf8');

async function setup() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('https://cryptomoonboys.com/sync-test*', route =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><main>sync</main></body></html>' }));
  const a = await context.newPage();
  const b = await context.newPage();
  await Promise.all([
    a.goto('https://cryptomoonboys.com/sync-test?a'),
    b.goto('https://cryptomoonboys.com/sync-test?b'),
  ]);
  for (const page of [a,b]) {
    await page.evaluate(() => {
      window.__accepted = [];
      window.__reconcile = [];
      window.__offline = [];
      window.__writes = 0;
      window.fetch = () => { window.__writes++; return Promise.reject(new Error('sync must not fetch')); };
      window.addEventListener('moonboys:player-action-accepted', event => {
        window.__accepted.push(event.detail);
      });
      window.addEventListener('moonboys:player-reconcile-needed', event => {
        window.__reconcile.push(event.detail);
      });
      window.addEventListener('moonboys:player-offline', event => {
        window.__offline.push(event.detail);
      });
    });
    await page.addScriptTag({ content: SYNC });
  }
  return { browser, context, a, b };
}

test('accepted Moonpet action broadcasts one sanitized invalidation to another tab', async () => {
  const f = await setup();
  try {
    await f.a.evaluate(() => {
      window.dispatchEvent(new CustomEvent('moonpet:action-accepted', {
        detail: {
          action: 'daily_completion_claim',
          pet_id: 'secret-pet',
          telegram_id: '123456',
          reward: { pet_xp: 25 },
          receipt_id: 'private-receipt',
          telegram_auth: { hash: 'secret' },
        },
      }));
    });
    await f.b.waitForFunction(() => window.__accepted.length === 1);
    const remote = await f.b.evaluate(() => window.__accepted[0]);
    assert.deepEqual(Object.keys(remote).sort(), ['event','remote','source','utc_day']);
    assert.equal(remote.source, 'moonpet');
    assert.equal(remote.event, 'moonpet:action-accepted');
    assert.equal(remote.remote, true);
    assert.doesNotMatch(JSON.stringify(remote), /secret|pet_id|telegram|reward|receipt|hash/u);
    assert.equal(await f.a.evaluate(() => window.__writes), 0);
    assert.equal(await f.b.evaluate(() => window.__writes), 0);
  } finally { await f.browser.close(); }
});

test('accepted-event bursts are deduped and never rebroadcast in a loop', async () => {
  const f = await setup();
  try {
    await f.a.evaluate(() => {
      for (let i=0;i<8;i++) {
        window.dispatchEvent(new CustomEvent('moonboys:score-updated', { detail: { score: 999+i, player: 'private' } }));
      }
    });
    await f.b.waitForFunction(() => window.__accepted.length === 1);
    await f.b.waitForTimeout(1100);
    assert.equal(await f.a.evaluate(() => window.__accepted.length), 1,
      'local listener receives one standard event after dedupe');
    assert.equal(await f.b.evaluate(() => window.__accepted.length), 1,
      'remote tab receives one invalidation, not an echo loop');

    await f.a.evaluate(() => {
      window.dispatchEvent(new CustomEvent('moonboys:score-updated', { detail: { score: 1001 } }));
    });
    await f.b.waitForFunction(() => window.__accepted.length === 2);
    assert.equal(await f.b.evaluate(() => window.__accepted.length), 2);
  } finally { await f.browser.close(); }
});

test('non-bubbling accepted Wiki mission events are normalized without carrying mission payload', async () => {
  const f = await setup();
  try {
    await f.a.evaluate(() => {
      document.dispatchEvent(new CustomEvent('moonboys:wiki-mission-complete', {
        detail: { page_id: 'secret-page', mission_id: 'private-mission', telegram_id: '123456' },
      }));
    });
    await f.b.waitForFunction(() => window.__accepted.length === 1);
    const event = await f.b.evaluate(() => window.__accepted[0]);
    assert.equal(event.source, 'wiki');
    assert.equal(event.event, 'moonboys:wiki-mission-complete');
    assert.doesNotMatch(JSON.stringify(event), /secret-page|private-mission|123456/u);
  } finally { await f.browser.close(); }
});

test('online/offline reconciliation is local read guidance only and creates no cross-tab accepted event', async () => {
  const f = await setup();
  try {
    await f.a.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
    });
    assert.equal(await f.a.evaluate(() => window.__offline.length), 1);
    assert.equal(await f.a.evaluate(() => window.__reconcile.length), 1);
    assert.equal(await f.b.evaluate(() => window.__accepted.length), 0);
    assert.equal(await f.a.evaluate(() => window.__writes), 0);
    assert.equal(await f.b.evaluate(() => window.__writes), 0);
  } finally { await f.browser.close(); }
});

test('only server-accepted source events are subscribed; rejected/progression-error signals do not invalidate', async () => {
  const f = await setup();
  try {
    await f.a.evaluate(() => {
      window.dispatchEvent(new CustomEvent('moonboys:progression-sync-error', { detail: { route:'/x', error:'rejected' } }));
      window.dispatchEvent(new CustomEvent('moonpet:action-rejected', { detail: { reason:'blocked' } }));
      window.dispatchEvent(new CustomEvent('moonboys:micro-notify', { detail: { message:'local only' } }));
    });
    await f.a.waitForTimeout(150);
    assert.equal(await f.a.evaluate(() => window.__accepted.length), 0);
    assert.equal(await f.b.evaluate(() => window.__accepted.length), 0);
  } finally { await f.browser.close(); }
});
