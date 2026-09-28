// Radiojar's HTTPS entry point can redirect to HTTP nodes. Keep those redirects
// server-side and upgrade each hop; mobile WebViews must only receive HTTPS MP3.
const STATION_URL = 'https://stream.radiojar.com/2qm1fc5kb';
const MAX_REDIRECTS = 4;
const HEADER_TIMEOUT_MS = 30000;

function secureStationUrl(location, base) {
  const url = new URL(location, base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || (url.port && url.port !== '80' && url.port !== '443')
      || !(url.hostname === 'stream.radiojar.com' || /^n[0-9a-f]{2}\.radiojar\.com$/.test(url.hostname))
      || url.pathname !== '/2qm1fc5kb') {
    throw new Error('Unexpected radio redirect');
  }
  url.protocol = 'https:';
  url.port = '';
  url.hash = '';
  return url.href;
}

export async function handleRadioStream(request, corsHeaders = {}) {
  const headers = { ...corsHeaders, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (request.method !== 'GET') {
    return new Response('Use GET for the live radio stream.', { status: 405, headers: { ...headers, Allow: 'GET, OPTIONS' } });
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) abort();
  // Limit connection setup, not the lifetime of a successful live stream.
  const timer = setTimeout(abort, HEADER_TIMEOUT_MS);
  let upstream;
  try {
    let url = STATION_URL;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      upstream = await fetch(url, {
        redirect: 'manual', signal: controller.signal,
        // Never forward client cookies, credentials, Range or ICY metadata flags.
        headers: { Accept: 'audio/mpeg', 'Accept-Encoding': 'identity' },
      });
      if ([301, 302, 303, 307, 308].includes(upstream.status)) {
        await upstream.body?.cancel();
        if (redirects === MAX_REDIRECTS || !upstream.headers.get('Location')) throw new Error('Radio redirect limit');
        url = secureStationUrl(upstream.headers.get('Location'), url);
        continue;
      }
      if (upstream.status !== 200 || !upstream.body
          || upstream.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'audio/mpeg') {
        throw new Error('Radio stream unavailable');
      }
      // Pass the body through without buffering an unbounded live broadcast.
      // Downstream disconnect/cancellation propagates to the upstream body.
      return new Response(upstream.body, { headers: { ...headers, 'Content-Type': 'audio/mpeg' } });
    }
  } catch (_) {
    await upstream?.body?.cancel().catch(() => {});
    controller.abort();
    return new Response('Radio temporarily unavailable. Tap the radio icon to retry.', {
      status: 502, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '5' },
    });
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
  }
}
