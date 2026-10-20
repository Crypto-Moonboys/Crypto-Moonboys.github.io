import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../games/telegram/index.html', import.meta.url), 'utf8');
const deadRunHtml = fs.readFileSync(new URL('../games/dead-run/index.html', import.meta.url), 'utf8');
const workerSource = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const deadRunRelease = html.match(/href="\/games\/dead-run\/\?v=([^"]+)"/)?.[1];
const gameDestinationRelease = '20260903-games-shell-v8';
const launcherRelease = html.match(/<meta name="moonboys-mini-app-version" content="([^"]+)">/)?.[1];
const inlineLauncherScript = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].at(-1)?.[1];

assert.ok(deadRunRelease, 'Games launcher must link Dead Run with a cache-busting release token');
assert.equal(launcherRelease, '20261020-games-six-links-v1', 'Games launcher must publish the one-tap Mini App login release token');
assert.ok(inlineLauncherScript, 'Games launcher must include a body-end inline launcher controller');

const forbiddenScripts = [
  '/js/site-shell.js',
  '/js/wiki.js',
  '/js/core/daily-loop-state.js',
  '/js/components/global-player-header.js',
  '/js/components/live-activity-summary.js',
  '/js/components/connection-status-panel.js',
  '/js/components/telegram-sync-cta.js',
];

assert.ok(
  /<script data-cfasync="false" src="https:\/\/telegram\.org\/js\/telegram-web-app\.js\?63"><\/script>/.test(html),
  'Games launcher must load the pinned Telegram WebApp SDK with Cloudflare async disabled',
);

assert.ok(
  html.indexOf('window.Telegram.WebApp.ready()') === -1,
  'Games launcher must not call Telegram.WebApp.ready() from the head',
);
assert.ok(
  html.indexOf('telegramApp.ready()') > html.indexOf('</main>'),
  'Telegram ready() call must run after the launcher DOM exists',
);
assert.ok(
  html.indexOf("telegramApp.onEvent('viewportChanged'") < html.indexOf('telegramApp.ready()')
    && html.indexOf('telegramApp.ready()') < html.indexOf('telegramApp.expand()'),
  'Games launcher must register viewportChanged before ready() and expand()',
);

assert.ok(html.includes('class="page-standalone-tool is-initializing"'), 'Games launcher must start in an initializing state');
assert.ok(html.includes('aria-busy="true"'), 'Games launcher must expose initial busy state');
assert.ok(html.includes('Checking Telegram account...'), 'Games launcher must show account verification copy');
assert.ok(html.includes('<h1>Crypto Moonboys Games</h1>'), 'Games launcher must show a plain text title');
assert.match(html, /background:\s*#000\s*;/, 'Launcher must have a solid black background');
const bodyRule = html.match(/(?:^|\n)\s*body\s*\{([^}]*)\}/)?.[1] || '';
const cardRule = html.match(/(?:^|\n)\s*main\s*\{([^}]*)\}/)?.[1] || '';
const desktopMainRule = html.match(/body\.is-desktop-telegram main\s*\{([^}]*)\}/)?.[1] || '';
const navigationRule = html.match(/(?:^|\n)\s*nav a\s*\{([^}]*)\}/)?.[1] || '';
assert.match(bodyRule, /display:\s*flex;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;/,
  'All Telegram platforms must centre the black card in the available viewport');
assert.match(bodyRule, /min-height:\s*100dvh;/,
  'The black canvas must use the visible viewport height in Telegram');
for (const declaration of [
  'box-sizing: border-box;', 'width: 100%;', 'max-width: 1280px;',
  'min-height: min(100dvh, 720px);', 'margin: 0 auto;', 'background: #000;',
  'display: flex;', 'flex-direction: column;', 'align-items: center;',
  'justify-content: center;', 'text-align: center;',
]) {
  assert.ok(cardRule.includes(declaration), `Launcher black HD card must include ${declaration}`);
}
assert.match(navigationRule, /text-align:\s*center;/,
  'All six Games links must be centred');
assert.match(html, /nav\s*\{\s*width:\s*100%;\s*\}/,
  'Games link list must fit the available Telegram viewport');
for (const edge of ['top', 'right', 'bottom', 'left']) {
  assert.ok(desktopMainRule.includes(`padding-${edge}: calc(`),
    `Desktop fullscreen must reserve ${edge} padding`);
  assert.ok(desktopMainRule.includes(`var(--tg-safe-area-inset-${edge}, 0px)`),
    `Desktop fullscreen must honour Telegram's ${edge} safe area`);
  assert.ok(desktopMainRule.includes(`var(--tg-content-safe-area-inset-${edge}, 0px)`),
    `Desktop fullscreen must honour Telegram's ${edge} content safe area`);
}
assert.match(html, /#connectedAccount\s*\{\s*max-width:\s*100%;\s*overflow-wrap:\s*anywhere;\s*\}/,
  'Long Telegram display names must wrap without horizontal overflow');
assert.doesNotMatch(html, /gradient\(|box-shadow|text-shadow|<canvas|<img\b|class="marquee"|class="control-deck"/i, 'Launcher must have no decorative effects or heavyweight visual components');
assert.equal((html.match(/<nav\b/g) || []).length, 1, 'Launcher must have a single plain links menu');
assert.equal((html.match(/<nav[\s\S]*?<\/nav>/g) || [])[0]?.match(/<a\s/g)?.length, 6, 'Launcher must show six text links');
assert.match(html, /body\.is-initializing nav a[\s\S]*pointer-events:\s*none/, 'Launcher links must disable pointer events while initializing');
assert.match(html, /FALLBACK_READY_MS\s*=\s*1200/, 'Games launcher must include a 1200ms viewport fallback');
assert.match(html, /window\.location\.assign\(buildDestination\(link\)\)/, 'Games launcher must navigate once through window.location.assign()');
assert.match(html, /window\.addEventListener\('pageshow'/, 'Games launcher must restore navigation state on pageshow');
assert.match(html, /sessionStorage\.setItem\(INIT_DATA_STORAGE_KEY, initData\)/, 'Games launcher must store initData in sessionStorage inside a guarded path');
assert.match(html, /destination\.hash = 'tgWebAppData=' \+ encodeURIComponent\(cachedInitData\)/, 'Games launcher must append initData only to the URL fragment');
assert.doesNotMatch(inlineLauncherScript, /console\.(?:log|warn|error|info)|searchParams\.(?:set|append)\(['"]tgWebAppData['"]/, 'Games launcher must not log initData or place it in query parameters');

assert.match(html, /class="[^"]*\bpage-standalone-tool\b[^"]*"/, 'Games launcher must remain a standalone tool page');

for (const script of forbiddenScripts) {
  assert.ok(!html.includes(script), `Games launcher must not load ${script}`);
}

const externalScripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
assert.deepEqual(externalScripts, ['https://telegram.org/js/telegram-web-app.js?63'], 'Games launcher must not load external JS except the Telegram SDK');

assert.ok(!/<link\b[^>]*rel=["']stylesheet["']/i.test(html), 'Games launcher must not load external CSS files');
assert.ok(!/<script\b[^>]*type=["']module["']/i.test(html), 'Games launcher must not use module scripts');
assert.ok(
  /<link\b(?=[^>]*\brel=["']icon["'])(?=[^>]*\bhref=["']\/favicon\.png["'])(?=[^>]*\btype=["']image\/png["'])[^>]*>/i.test(html),
  'Games launcher must include the standardized PNG favicon tag',
);
assert.ok(!/<img\b/i.test(html), 'Games launcher must not load inline image elements');
assert.ok(!/localStorage/i.test(html), 'Games launcher must not depend on localStorage');
assert.ok(!/src=["'][^"']*(?:arcade|site-shell|wiki)[^"']*bundle[^"']*["']/i.test(html), 'Games launcher must not load full arcade/site bundles');
assert.ok(!/geolocation|getCurrentPosition|watchPosition/i.test(html), 'Games launcher must not request GPS/location');
assert.ok(!/dead-run[^"']*(?:bootstrap|runtime|logic)\.js/i.test(html), 'Games launcher must not start Dead Run logic');

const launcherDestinations = [
  ['MOONBOY HOME', '/my-moonboy.html'],
  ['Moonpet OS', '/moonpet-game.html?v=20261012-home-e4-rooms-v1'],
  ['DEAD RUN', `/games/dead-run/?v=${deadRunRelease}`],
  ['ALLCITY RUNNER', '/games/nbg-london/'],
  ['FULL ARCADE', `/games/?v=${gameDestinationRelease}`],
  ['BATTLE CHAMBER', `/community.html?v=${gameDestinationRelease}`],
];

for (const [label, href] of launcherDestinations) {
  assert.ok(html.includes(label), `Games launcher must contain ${label} text link`);
  assert.ok(html.includes(`href="${href}`), `Games launcher must link ${label} to ${href}`);
  if (!['MOONBOY HOME', 'ALLCITY RUNNER'].includes(label)) assert.ok(new URL(href, 'https://cryptomoonboys.com').searchParams.has('v'), `${label} game destination must be cache-busted`);
}

assert.ok(
  !html.includes('href="/games/dead-run/"'),
  'Games launcher must not link Dead Run without a release version',
);

const deadRunAssetUrls = [...deadRunHtml.matchAll(/<(?:link|script)\b[^>]*(?:href|src)="([^"]+)"[^>]*>/gi)]
  .map((match) => match[1])
  .filter((url) => url.startsWith('styles.css') || url.startsWith('/js/api-config.js') || url.startsWith('app.js'));

assert.deepEqual(
  deadRunAssetUrls,
  [
    `styles.css?v=${deadRunRelease}`,
    `/js/api-config.js?v=${deadRunRelease}`,
    `app.js?v=${deadRunRelease}`,
  ],
  'Dead Run must load local CSS/JS assets with the same release token as the launcher',
);

for (const url of deadRunAssetUrls) {
  const version = new URL(url, 'https://cryptomoonboys.com/games/dead-run/').searchParams.get('v');
  assert.equal(version, deadRunRelease, `Dead Run asset ${url} must match the launcher release token`);
}

assert.match(html, /window\.Telegram\s*&&\s*window\.Telegram\.WebApp/, 'Games launcher must read Telegram.WebApp safely');
assert.doesNotMatch(html, /<p>\s*<small>\/games\/telegram\//i,
  'Games launcher must not display its own Mini App URL at the bottom');
assert.match(html, /href="\/games\/nbg-london\/"[^>]*>ALLCITY RUNNER<\/a>/,
  'Games launcher must link directly to ALLCITY RUNNER');
assert.match(html, /href="\/my-moonboy\.html"[^>]*>MOONBOY HOME<\/a>/,
  'Games launcher must link directly to MOONBOY HOME');
assert.ok(
  workerSource.includes(`const TELEGRAM_GAMES_MENU_URL = \`\${SITE_URL}/games/telegram/?v=${launcherRelease}\`;`),
  'Worker Telegram menu URL must publish the same launcher release token shown by the launcher',
);

class FakeClassList {
  constructor(initial = '') {
    this.values = new Set(initial.split(/\s+/).filter(Boolean));
  }
  add(name) {
    this.values.add(name);
  }
  remove(name) {
    this.values.delete(name);
  }
  toggle(name, force) {
    if (force) this.add(name);
    else this.remove(name);
  }
  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement {
  constructor(attrs = {}) {
    this.attrs = new Map(Object.entries(attrs));
    this.listeners = new Map();
    this.classList = new FakeClassList(attrs.class || '');
    this.textContent = '';
  }
  getAttribute(name) {
    return this.attrs.get(name) || null;
  }
  setAttribute(name, value) {
    this.attrs.set(name, String(value));
  }
  removeAttribute(name) {
    this.attrs.delete(name);
  }
  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }
  dispatch(type) {
    const handler = this.listeners.get(type);
    if (handler) handler({ currentTarget: this, preventDefault() { this.defaultPrevented = true; } });
  }
}

async function runLauncher({ initData = 'user=%7B%22id%22%3A123%7D', hash = '', search = '?v=20260902-games-shell-v6&startapp=arcade', storedInitData = '', existingSessionId = '', rejectLogin = false, loginFailureStatus = 503, loginFailureCode = '', lostCookie = false, stalled = false, holdLogout = false, telegramPlatform = 'android', fullscreenSupported = true, fullscreenThrows = false, alreadyFullscreen = false } = {}) {
  const calls = [];
  const timers = [];
  const viewportHandlers = [];
  const pageHandlers = new Map();
  const body = new FakeElement({ class: 'page-standalone-tool is-initializing', 'aria-busy': 'true' });
  const root = new FakeElement({ id: 'launcherRoot', 'aria-busy': 'true' });
  const status = new FakeElement({ id: 'launchStatus' });
  const connectButton = new FakeElement({ id: 'connectTelegram' });
  const accountLabel = new FakeElement({ id: 'connectedAccount' });
  const logoutButton = new FakeElement({ id: 'logoutTelegram' });
  const requests = [];
  const links = launcherDestinations.map(([, href]) => new FakeElement({ href, 'aria-disabled': 'true', tabindex: '-1' }));
  const assigned = [];
  const storage = new Map(storedInitData ? [['moonboys.telegram.initData', storedInitData]] : []);
  const location = {
    origin: 'https://cryptomoonboys.com',
    search,
    hash,
    assign(url) {
      assigned.push(url);
    },
  };
  const document = {
    body,
    getElementById(id) {
      calls.push(`getElementById:${id}`);
      if (id === 'launcherRoot') return root;
      if (id === 'launchStatus') return status;
      if (id === 'connectTelegram') return connectButton;
      if (id === 'connectedAccount') return accountLabel;
      if (id === 'logoutTelegram') return logoutButton;
      return null;
    },
    querySelectorAll(selector) {
      calls.push(`querySelectorAll:${selector}`);
      return selector === 'nav a[href]' ? links : [];
    },
  };
  const window = {
    document,
    Telegram: {
      WebApp: {
        initData,
        platform: telegramPlatform,
        isFullscreen: alreadyFullscreen,
        isVersionAtLeast(version) {
          calls.push('isVersionAtLeast:' + version);
          return fullscreenSupported;
        },
        requestFullscreen() {
          calls.push('requestFullscreen');
          if (fullscreenThrows) throw new Error('UNSUPPORTED');
        },
        onEvent(name, handler) {
          calls.push(`onEvent:${name}`);
          if (name === 'viewportChanged') viewportHandlers.push(handler);
        },
        ready() {
          calls.push('ready');
        },
        expand() {
          calls.push('expand');
        },
        close() {
          calls.push('close');
        },
      },
    },
    location,
    sessionStorage: {
      setItem(key, value) {
        storage.set(key, value);
      },
      getItem(key) {
        return storage.get(key) || '';
      },
      removeItem(key) {
        storage.delete(key);
      },
    },
    setTimeout(handler, ms) {
      timers.push({ handler, ms, cleared: false });
      return timers.length - 1;
    },
    clearTimeout(id) {
      if (timers[id]) timers[id].cleared = true;
    },
    addEventListener(type, handler) {
      pageHandlers.set(type, handler);
    },
  };

  let sessionId = existingSessionId;
  let denyNextLogin = rejectLogin;
  let finishPendingLogout = null;
  const jsonResponse = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
  const fetch = (url, options = {}) => {
    requests.push({ url, options });
    assert.equal(options.credentials, 'include', 'Website session requests always include cookies');
    assert.equal(options.cache, 'no-store', 'Website session credentials must not be cached');
    assert.ok(options.signal, 'Every credential request has an abort signal');
    if (stalled) return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });
    if (url.endsWith('/mini-app-session')) {
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['Content-Type'], 'application/json');
      const signed = JSON.parse(options.body).init_data;
      const params = new URLSearchParams(signed);
      let id = '123';
      try { id = String(JSON.parse(params.get('user')).id); } catch {}
      if (denyNextLogin) return Promise.resolve(jsonResponse(loginFailureStatus, { error: loginFailureCode || (loginFailureStatus === 503 ? 'website_login_unavailable' : 'mini_app_auth_expired') }));
      if (sessionId && sessionId !== id) return Promise.resolve(jsonResponse(409, { error: 'logout_before_switching_accounts' }));
      sessionId = id;
      return Promise.resolve(jsonResponse(200, {
        linked: true, source: 'telegram_mini_app', telegram_id: id, display_name: 'Test', csrf_token: 'signed-csrf',
        telegram_auth: { id, hash: 's1_signed' },
      }));
    }
    if (url.endsWith('/session')) {
      if (!sessionId || lostCookie) return Promise.resolve(jsonResponse(401, { error: 'website_session_expired' }));
      return Promise.resolve(jsonResponse(200, {
        linked: true, telegram_id: sessionId, display_name: 'Test', csrf_token: 'signed-csrf',
        telegram_auth: { id: sessionId, hash: 's1_signed' },
      }));
    }
    if (url.endsWith('/logout')) {
      if (options.method === 'POST') {
        assert.equal(options.headers['X-Moonboys-CSRF'], 'signed-csrf');
        if (holdLogout) return new Promise(resolve => {
          finishPendingLogout = () => { sessionId = ''; resolve(jsonResponse(200, { ok: true })); };
        });
        sessionId = '';
        return Promise.resolve(jsonResponse(200, { ok: true }));
      }
      return Promise.resolve(jsonResponse(200, { ok: true, csrf_token: sessionId ? 'signed-csrf' : null }));
    }
    throw new Error('Unexpected auth route: ' + url);
  };
  vm.runInNewContext(inlineLauncherScript, {
    window,
    document,
    URL,
    URLSearchParams,
    Array,
    Boolean,
    String,
    fetch,
    AbortController,
  });
  for (let i = 0; i < 48; i++) await Promise.resolve();

  return { assigned, body, calls, links, pageHandlers, root, status, storage, timers, viewportHandlers, requests, connectButton, logoutButton, accountLabel, setLoginDenied: value => { denyNextLogin = value; }, finishLogout: () => { assert.ok(finishPendingLogout, 'Logout must have an in-flight request'); finishPendingLogout(); } };
}

async function settle() {
  for (let i = 0; i < 48; i++) await Promise.resolve();
}

{
  const harness = await runLauncher();
  assert.ok(harness.calls.indexOf('querySelectorAll:nav a[href]') < harness.calls.indexOf('ready'), 'ready() must not be called before launcher links are discovered');
  assert.deepEqual(harness.calls.slice(harness.calls.indexOf('onEvent:viewportChanged'), harness.calls.indexOf('expand') + 1), ['onEvent:viewportChanged', 'ready', 'expand'], 'Telegram setup must register viewportChanged before ready() and expand()');
  for (const link of harness.links) {
    assert.equal(link.getAttribute('aria-disabled'), 'true', 'Links must remain disabled before a stable viewport');
  }
  harness.viewportHandlers[0]({ isStateStable: false });
  harness.links[0].dispatch('click');
  assert.equal(harness.assigned.length, 0, 'Unstable viewport events must not enable launcher navigation');
}

{
  const harness = await runLauncher();
  harness.viewportHandlers[0]({ isStateStable: true });
  assert.equal(harness.body.getAttribute('aria-busy'), 'false', 'Stable viewport must clear busy state');
  assert.equal(harness.status.textContent, 'Account verified. Select a game.', 'Stable viewport shows verified account after successful session check');
  assert.equal(harness.timers.find(timer => timer.ms === 1200).cleared, true, 'Stable viewport must clear its own fallback timer');
  assert.equal(harness.links[2].getAttribute('aria-disabled'), null, 'isStateStable=true must enable navigation links');
  harness.links[2].dispatch('click');
  harness.links[3].dispatch('click');
  assert.equal(harness.assigned.length, 1, 'Multiple rapid taps must trigger exactly one navigation');
  const assignedUrl = new URL(harness.assigned[0]);
  assert.equal(assignedUrl.origin, 'https://cryptomoonboys.com', 'Launcher navigation must resolve to same-origin HTTPS');
  assert.equal(assignedUrl.pathname, '/games/dead-run/', 'Dead Run tap must resolve the selected destination');
  assert.equal(assignedUrl.searchParams.get('v'), deadRunRelease, 'Destination cache-busting token must be preserved');
  assert.equal(assignedUrl.searchParams.get('startapp'), 'arcade', 'Launcher query string must be preserved');
  assert.equal(assignedUrl.searchParams.has('tgWebAppData'), false, 'Telegram initData must not be copied into destination query parameters');
  assert.equal(assignedUrl.hash, `#tgWebAppData=${encodeURIComponent('user=%7B%22id%22%3A123%7D')}`, 'Telegram initData must be retained in the URL fragment');
}

{
  const hashInitData = 'query_id=hash-only&user=%7B%22id%22%3A456%7D&auth_date=' + Math.floor(Date.now() / 1000);
  const harness = await runLauncher({ initData: '', hash: `#tgWebAppData=${encodeURIComponent(hashInitData)}` });
  assert.equal(harness.storage.get('moonboys.telegram.initData'), hashInitData, 'Hash tgWebAppData fallback must be stored in sessionStorage');
  harness.timers.find(timer => timer.ms === 1200).handler();
  assert.equal(harness.links[0].getAttribute('aria-disabled'), null, 'Fallback timeout must enable navigation when no viewport event arrives');
  harness.links[0].dispatch('click');
  assert.equal(new URL(harness.assigned[0]).hash, `#tgWebAppData=${encodeURIComponent(hashInitData)}`, 'Hash tgWebAppData fallback must be retained in the destination fragment');
  assert.ok(harness.timers.some(timer => timer.ms === 1200), 'Fallback timeout must wait 1200ms');
}

{
  const leakedQueryInitData = 'query_id=legacy-query&user=%7B%22id%22%3A789%7D';
  const harness = await runLauncher({
    initData: 'user=%7B%22id%22%3A123%7D',
    search: `?v=20260902-games-shell-v6&tgWebAppData=${encodeURIComponent(leakedQueryInitData)}&startapp=arcade`,
  });
  harness.viewportHandlers[0]({ isStateStable: true });
  harness.links[2].dispatch('click');
  const assignedUrl = new URL(harness.assigned[0]);
  assert.equal(assignedUrl.searchParams.has('tgWebAppData'), false, 'Legacy query tgWebAppData must be stripped from destination query parameters');
  assert.equal(assignedUrl.searchParams.get('startapp'), 'arcade', 'Non-auth launcher query parameters must still be preserved');
}

for (const storedInitData of [
  'auth_date=' + (Math.floor(Date.now() / 1000) - 3700),
  'auth_date=' + (Math.floor(Date.now() / 1000) + 600),
  'user=%7B%22id%22%3A123%7D',
]) {
  const harness = await runLauncher({ initData: '', storedInitData });
  harness.viewportHandlers[0]({ isStateStable: true });
  harness.links[0].dispatch('click');
  assert.equal(harness.assigned.length, 0, 'Stale or undated data cannot unlock navigation');
  assert.equal(harness.storage.has('moonboys.telegram.initData'), false, 'Unusable inherited data must be removed from session storage');
}

{
  const storedInitData = 'auth_date=' + Math.floor(Date.now() / 1000) + '&user=%7B%22id%22%3A123%7D';
  const harness = await runLauncher({ initData: '', storedInitData });
  harness.viewportHandlers[0]({ isStateStable: true });
  harness.links[0].dispatch('click');
  assert.equal(new URL(harness.assigned[0]).hash, '#tgWebAppData=' + encodeURIComponent(storedInitData), 'Fresh session data remains available for Worker verification');
}

{
  const staleData = 'auth_date=' + (Math.floor(Date.now() / 1000) - 3700);
  const harness = await runLauncher({ initData: '', hash: '#tgWebAppData=' + encodeURIComponent(staleData), storedInitData: staleData });
  harness.viewportHandlers[0]({ isStateStable: true });
  harness.links[0].dispatch('click');
  assert.equal(harness.assigned.length, 0, 'Stale inherited hash data cannot unlock navigation');
}

{
  const currentSdkData = 'auth_date=' + Math.floor(Date.now() / 1000) + '&user=%7B%22id%22%3A456%7D';
  const staleData = 'auth_date=' + (Math.floor(Date.now() / 1000) - 3700);
  const harness = await runLauncher({ initData: currentSdkData, hash: '#tgWebAppData=' + encodeURIComponent(staleData), storedInitData: staleData });
  harness.viewportHandlers[0]({ isStateStable: true });
  harness.links[0].dispatch('click');
  assert.equal(new URL(harness.assigned[0]).hash, '#tgWebAppData=' + encodeURIComponent(currentSdkData), 'Current Telegram SDK identity takes priority over inherited browser data');
}

{
  const contaminatedDestinationInitData = 'query_id=destination-query&user=%7B%22id%22%3A987%7D';
  const harness = await runLauncher();
  harness.links[0].setAttribute('href', `/my-moonboy.html?tgWebAppData=${encodeURIComponent(contaminatedDestinationInitData)}`);
  harness.viewportHandlers[0]({ isStateStable: true });
  harness.links[0].dispatch('click');
  const assignedUrl = new URL(harness.assigned[0]);
  assert.equal(assignedUrl.pathname, '/my-moonboy.html', 'Contaminated destination test must still open My Moonboy');
  assert.equal(assignedUrl.searchParams.has('tgWebAppData'), false, 'Destination-owned tgWebAppData must be stripped from query parameters');
  assert.equal(assignedUrl.hash, `#tgWebAppData=${encodeURIComponent('user=%7B%22id%22%3A123%7D')}`, 'Sanitized destinations must still receive current initData in the fragment');
}

{
  const harness = await runLauncher();
  harness.viewportHandlers[0]({ isStateStable: true });
  harness.links[5].dispatch('click');
  assert.equal(harness.links[5].getAttribute('aria-disabled'), 'true', 'Navigation start must disable links');
  harness.pageHandlers.get('pageshow')();
  await settle();
  assert.equal(harness.links[5].getAttribute('aria-disabled'), null, 'pageshow must restore enabled links after browser history return');
}


{
  const harness = await runLauncher({ existingSessionId: '999' });
  assert.equal(harness.links[0].getAttribute('aria-disabled'), 'true', 'Different cookie account never unlocks a Mini App');
  assert.match(harness.status.textContent, /Another Telegram account/);
  await settle();
  assert.equal(harness.logoutButton.hidden, false, 'Account mismatch exposes a CSRF-protected logout');
  harness.logoutButton.dispatch('click');
  await settle();
  assert.equal(harness.links[0].getAttribute('aria-disabled'), 'true', 'Logout does not unlock games');
  assert.ok(harness.requests.some(x => x.url.endsWith('/logout') && x.options.method === 'POST'));
}

{
  const harness = await runLauncher({ rejectLogin: true });
  assert.equal(harness.links[0].getAttribute('aria-disabled'), 'true', 'Denied signature cannot unlock games');
  assert.equal(harness.connectButton.hidden, false, 'Denied sign-in shows Retry');
}

{
  const harness = await runLauncher({ lostCookie: true });
  assert.equal(harness.links[0].getAttribute('aria-disabled'), 'true', 'Ignored Set-Cookie must not count as a website session');
  assert.match(harness.status.textContent, /close and reopen/i,
    'Consumed proof with lost website cookie requires a fresh Telegram launch');
  assert.equal(harness.accountLabel.hidden, true);
  assert.equal(harness.connectButton.textContent, 'Close Mini App',
    'Never offer a retry that reposts an already-consumed signature');
  const initialExchanges = harness.requests.filter(x => x.url.endsWith('/mini-app-session')).length;
  assert.equal(initialExchanges, 1);
  harness.pageHandlers.get('pageshow')();
  await settle();
  harness.connectButton.dispatch('click');
  await settle();
  assert.equal(harness.requests.filter(x => x.url.endsWith('/mini-app-session')).length, initialExchanges,
    'History restore or clicking recovery cannot replay consumed initData');
  assert.ok(harness.calls.includes('close'), 'Recovery closes Telegram Mini App for fresh signed launch');
  assert.equal(harness.links[0].getAttribute('aria-disabled'), 'true');
}

{
  const harness = await runLauncher({ initData: '', existingSessionId: '123' });
  harness.viewportHandlers[0]({ isStateStable: true });
  assert.equal(harness.links[0].getAttribute('aria-disabled'), null, 'Ordinary browser can restore a valid cookie session');
  assert.equal(harness.requests.filter(x => x.url.endsWith('/mini-app-session')).length, 0);
}

{
  const harness = await runLauncher({ initData: '' });
  harness.connectButton.dispatch('click');
  assert.match(harness.assigned[0], /^https:\/\/api\.cryptomoonboys\.com\/telegram\/website\/start\?/);
}

{
  const harness = await runLauncher();
  harness.viewportHandlers[0]({ isStateStable: true });
  assert.equal(harness.accountLabel.hidden, false, 'Initial verified account is visible');
  harness.setLoginDenied(true);
  harness.pageHandlers.get('pageshow')();
  await settle();
  assert.equal(harness.links[0].getAttribute('aria-disabled'), 'true', 'Revalidation failure revokes game navigation');
  assert.equal(harness.accountLabel.hidden, true, 'Revalidation failure clears stale connected identity');
  assert.equal(harness.connectButton.hidden, false, 'Revalidation failure restores Retry');
  harness.setLoginDenied(false);
  harness.connectButton.dispatch('click');
  await settle();
  assert.equal(harness.links[0].getAttribute('aria-disabled'), null, 'Retry restores navigation only after verified recovery');
}

{
  const harness = await runLauncher({ stalled: true });
  harness.viewportHandlers[0]({ isStateStable: true });
  assert.equal(harness.links[0].getAttribute('aria-disabled'), 'true');
  const deadline = harness.timers.find(t => t.ms === 8000);
  assert.ok(deadline, 'Login has an eight-second abort deadline');
  deadline.handler();
  await settle();
  assert.equal(harness.connectButton.disabled, false, 'Timeout releases retry button');
  assert.equal(harness.links[0].getAttribute('aria-disabled'), 'true');
  assert.match(harness.status.textContent, /timed out/i);
}


{
  const harness = await runLauncher({ rejectLogin: true });
  const failureCopy = harness.status.textContent;
  assert.match(failureCopy, /website_login_unavailable/, 'Original transient authentication error is visible');
  harness.timers.find(timer => timer.ms === 1200).handler();
  assert.equal(harness.status.textContent, failureCopy, 'Viewport fallback must not overwrite authentication failure');
  assert.equal(harness.links[0].getAttribute('aria-disabled'), 'true');
  assert.equal(harness.connectButton.hidden, false, 'Retry remains visible after fallback');
}

for (const loginFailureStatus of [401, 503]) {
  const harness = await runLauncher({ existingSessionId: '123', rejectLogin: true, loginFailureStatus });
  assert.equal(harness.links[0].getAttribute('aria-disabled'), 'true');
  assert.equal(harness.connectButton.hidden, false, 'Login retry remains available');
  assert.equal(harness.logoutButton.hidden, false, 'Website cookie allows logout after any authentication failure');
  assert.ok(harness.requests.some(x => x.url.endsWith('/logout') && !x.options.method), 'Failure probes cookie-bound logout CSRF');
  assert.match(harness.status.textContent, loginFailureStatus === 503 ? /website_login_unavailable/ : /close and reopen/i,
    'Logout recovery must preserve the actionable login failure message');
  assert.equal(harness.connectButton.textContent, loginFailureStatus === 503 ? 'Retry connection' : 'Close Mini App',
    'Transient errors permit Retry; terminal proof errors require a new launch');
  harness.logoutButton.dispatch('click');
  await settle();
  assert.equal(harness.links[0].getAttribute('aria-disabled'), 'true', 'Recovery logout never unlocks games');
}

{
  const harness = await runLauncher({ holdLogout: true });
  harness.viewportHandlers[0]({ isStateStable: true });
  assert.equal(harness.links[0].getAttribute('aria-disabled'), null, 'Confirmed sign-in initially unlocks games');
  harness.logoutButton.dispatch('click');
  await settle();
  assert.equal(harness.status.textContent, 'Signing out...');
  assert.equal(harness.links[0].getAttribute('aria-disabled'), 'true', 'Logout locks links immediately');
  harness.links[0].dispatch('click');
  assert.equal(harness.assigned.length, 0, 'Click during pending logout must not navigate');
  harness.pageHandlers.get('pageshow')();
  await settle();
  assert.equal(harness.links[0].getAttribute('aria-disabled'), 'true', 'pageshow cannot re-enable links mid-logout');
  harness.viewportHandlers[0]({ isStateStable: true });
  harness.links[1].dispatch('click');
  assert.equal(harness.assigned.length, 0, 'Viewport stabilization cannot navigate mid-logout');
  harness.finishLogout();
  await settle();
  assert.equal(harness.links[0].getAttribute('aria-disabled'), 'true');
  assert.equal(harness.accountLabel.hidden, true, 'Successful logout removes old connected account');
  assert.equal(harness.connectButton.hidden, false, 'Successful logout restores login control');
}


for (const loginFailureCode of ['mini_app_auth_expired', 'mini_app_auth_replayed', 'mini_app_auth_rejected', 'mini_app_auth_duplicate_field']) {
  const harness = await runLauncher({ rejectLogin: true, loginFailureStatus: 401, loginFailureCode });
  harness.viewportHandlers[0]({ isStateStable: true });
  assert.match(harness.status.textContent, /close and reopen/i, 'Unusable signed evidence must require reopening Telegram');
  assert.equal(harness.connectButton.textContent, 'Close Mini App');
  assert.equal(harness.links[0].getAttribute('aria-disabled'), 'true');
  const before = harness.requests.filter(request => request.url.endsWith('/mini-app-session')).length;
  harness.pageHandlers.get('pageshow')();
  await settle();
  harness.connectButton.dispatch('click');
  await settle();
  assert.equal(harness.requests.filter(request => request.url.endsWith('/mini-app-session')).length, before,
    'Terminal signed launch must never be resent after restore or recovery click');
  assert.ok(harness.calls.includes('close'), 'Terminal proof recovery closes the Mini App');
}

{
  const harness = await runLauncher();
  harness.viewportHandlers[0]({ isStateStable: true });
  const originalExchanges = harness.requests.filter(request => request.url.endsWith('/mini-app-session')).length;
  assert.equal(originalExchanges, 1);
  harness.logoutButton.dispatch('click');
  await settle();
  assert.match(harness.status.textContent, /Signed out.*Close and reopen/i);
  assert.equal(harness.connectButton.textContent, 'Close Mini App', 'Logout cannot reuse the consumed signed launch proof');
  assert.equal(harness.links[0].getAttribute('aria-disabled'), 'true');
  harness.pageHandlers.get('pageshow')();
  await settle();
  harness.connectButton.dispatch('click');
  await settle();
  assert.equal(harness.requests.filter(request => request.url.endsWith('/mini-app-session')).length, originalExchanges,
    'Confirmed logout must not automatically resubmit the consumed login proof');
  assert.ok(harness.calls.includes('close'), 'Signed-out Mini App prompts a fresh Telegram launch');
}

{
  const harness = await runLauncher({ initData: '', existingSessionId: '123' });
  harness.logoutButton.dispatch('click');
  await settle();
  assert.equal(harness.connectButton.textContent, 'Log in with Telegram',
    'Ordinary browser can use standard website login after logout');
  harness.connectButton.dispatch('click');
  assert.match(harness.assigned[0], /\/telegram\/website\/start\?/);
}



{
  // Telegram Desktop can position fullscreen Mini Apps in a visually clipped
  // right-hand pane even on one monitor. Do not request fullscreen on load.
  const desktop = await runLauncher({ telegramPlatform: 'tdesktop' });
  assert.equal(desktop.body.classList.contains('is-desktop-telegram'), true,
    'Telegram Desktop retains the centred layout and safe-area padding');
  assert.ok(!desktop.calls.includes('requestFullscreen'),
    'Desktop bootstrap must not trigger host fullscreen');
  assert.equal(desktop.calls.filter(item => item === 'expand').length, 1,
    'Telegram normal expand operation remains available');
  assert.equal(desktop.status.textContent, 'Account verified. Select a game.',
    'Removing forced fullscreen must not affect verified login');
  desktop.viewportHandlers[0]({ isStateStable: true });
  desktop.links[0].dispatch('click');
  assert.equal(desktop.assigned.length, 1, 'Game navigation continues to work');

  const mac = await runLauncher({ telegramPlatform: 'macos' });
  assert.ok(mac.body.classList.contains('is-desktop-telegram'), 'macOS keeps centred layout');
  assert.ok(!mac.calls.includes('requestFullscreen'), 'macOS also avoids fullscreen on load');
  const alreadyFullscreen = await runLauncher({ telegramPlatform: 'tdesktop', alreadyFullscreen: true });
  assert.ok(!alreadyFullscreen.calls.includes('requestFullscreen'),
    'An already-fullscreen window must not receive another fullscreen request');
  const mobile = await runLauncher({ telegramPlatform: 'android' });
  assert.ok(!mobile.calls.includes('requestFullscreen'), 'Android presentation stays unchanged');
  assert.ok(!mobile.body.classList.contains('is-desktop-telegram'), 'Android keeps full-width layout');
  const ios = await runLauncher({ telegramPlatform: 'ios' });
  assert.ok(!ios.calls.includes('requestFullscreen'), 'iOS presentation stays unchanged');
  assert.ok(!ios.body.classList.contains('is-desktop-telegram'), 'iOS keeps full-width layout');
}

console.log('telegram-games-launcher.test.mjs passed');
