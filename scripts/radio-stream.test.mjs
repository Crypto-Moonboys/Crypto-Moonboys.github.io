import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../workers/moonboys-api/deployment-entry.js';
import { handleRadioStream } from '../workers/moonboys-api/routes/radio-stream.js';

const entry = 'https://stream.radiojar.com/2qm1fc5kb';
const relay = 'https://moonboys-api.sercullen.workers.dev/radio/stream';
const request = (url = relay, options = {}) => new Request(url, options);
const redirect = location => new Response(null, { status: 302, headers: { Location: location } });
const audio = () => new Response(new Uint8Array([255, 251, 144, 100]), { headers: { 'Content-Type': 'audio/mpeg' } });

test('deployed radio route upgrades redirects and streams without D1 or client credentials', async t => {
  const calls = [];
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array([255, 251])); },
    cancel() { cancelled = true; },
  });
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1) return redirect('http://n02.radiojar.com/2qm1fc5kb?rj-ttl=5&rj-tok=fixture');
    return new Response(body, { headers: { 'Content-Type': 'audio/mpeg', 'Set-Cookie': 'upstream=private' } });
  });
  const response = await worker.fetch(request(relay + '?url=https://evil.example', {
    headers: { Origin: 'https://cryptomoonboys.com', Authorization: 'private', Cookie: 'private=1', Range: 'bytes=0-1', 'Icy-MetaData': '1' },
  }), { DB: new Proxy({}, { get() { throw new Error('Radio must not access D1'); } }) }, {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'audio/mpeg');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://cryptomoonboys.com');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Location'), null);
  assert.equal(response.headers.get('Set-Cookie'), null);
  assert.deepEqual(calls.map(call => call.url), [entry, 'https://n02.radiojar.com/2qm1fc5kb?rj-ttl=5&rj-tok=fixture']);
  for (const call of calls) {
    assert.equal(call.init.redirect, 'manual');
    assert.deepEqual(call.init.headers, { Accept: 'audio/mpeg', 'Accept-Encoding': 'identity' });
  }
  const reader = response.body.getReader();
  assert.deepEqual((await reader.read()).value, new Uint8Array([255, 251]), 'respond before the endless stream closes');
  await reader.cancel();
  assert.equal(cancelled, true, 'disconnect must cancel the upstream stream');
});

test('relative and repeated node redirects preserve the station and stay HTTPS', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    calls.push(url);
    if (calls.length === 1) return redirect('http://n0a.radiojar.com:80/2qm1fc5kb?rj-tok=one');
    if (calls.length === 2) return redirect('/2qm1fc5kb?rj-tok=two');
    return audio();
  });
  assert.equal((await handleRadioStream(request())).status, 200);
  assert.deepEqual(calls.slice(1), ['https://n0a.radiojar.com/2qm1fc5kb?rj-tok=one', 'https://n0a.radiojar.com/2qm1fc5kb?rj-tok=two']);
});

for (const location of [
  'https://evil.example/2qm1fc5kb', 'https://n02.radiojar.com.evil.example/2qm1fc5kb',
  'https://n02.radiojar.com/another-station', 'https://user:pass@n02.radiojar.com/2qm1fc5kb',
  'https://n02.radiojar.com:8443/2qm1fc5kb', 'file:///2qm1fc5kb',
]) {
  test(`reject unexpected radio redirect: ${location}`, async t => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => { calls++; return redirect(location); });
    const response = await handleRadioStream(request());
    assert.equal(response.status, 502);
    assert.equal(calls, 1);
    assert.equal(response.headers.get('Location'), null);
  });
}

test('redirect loops are bounded and response bodies released', async t => {
  let calls = 0, cancellations = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response(new ReadableStream({ cancel() { cancellations++; } }), {
      status: 302, headers: { Location: 'http://n02.radiojar.com/2qm1fc5kb' },
    });
  });
  assert.equal((await handleRadioStream(request())).status, 502);
  assert.equal(calls, 5);
  assert.equal(cancellations, 5);
});

test('reject HTML, failed upstreams and missing redirect locations; retry starts fresh', async t => {
  for (const failure of [new Response('<html>down</html>'), new Response(null, { status: 503 }), new Response(null, { status: 302 })]) {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async url => { assert.equal(url, entry); return ++calls === 1 ? failure : audio(); });
    const failed = await handleRadioStream(request());
    assert.equal(failed.status, 502);
    assert.equal(failed.headers.get('Cache-Control'), 'no-store');
    assert.equal((await handleRadioStream(request())).status, 200);
    t.mock.restoreAll();
  }
});

test('network failure is a retryable 502 and an aborted request cancels connection setup', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('network'); });
  assert.equal((await handleRadioStream(request())).status, 502);
  t.mock.restoreAll();
  const controller = new AbortController();
  let upstreamSignal;
  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    upstreamSignal = signal;
    signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
  }));
  const response = handleRadioStream(request(relay, { signal: controller.signal }));
  controller.abort();
  assert.equal((await response).status, 502);
  assert.equal(upstreamSignal.aborted, true);
});

test('only GET streams and OPTIONS never opens an upstream connection', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not fetch'); });
  assert.equal((await worker.fetch(request(relay, { method: 'POST' }), {}, {})).status, 405);
  assert.equal((await worker.fetch(request(relay, { method: 'HEAD' }), {}, {})).status, 405);
  assert.equal((await worker.fetch(request(relay, { method: 'OPTIONS' }), {}, {})).status, 204);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('setup timeout cancels a stalled connection but never cuts off a live broadcast', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
  }));
  const pending = handleRadioStream(request());
  t.mock.timers.tick(30000);
  assert.equal((await pending).status, 502);
  let upstreamSignal;
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
    upstreamSignal = signal;
    return audio();
  });
  const playing = await handleRadioStream(request());
  t.mock.timers.tick(60000);
  assert.equal(upstreamSignal.aborted, false);
  assert.equal(playing.status, 200);
  assert.equal((await playing.arrayBuffer()).byteLength, 4);
});
