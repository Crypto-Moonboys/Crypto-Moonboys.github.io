import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../games/telegram/index.html', import.meta.url), 'utf8');
const deadRunHtml = fs.readFileSync(new URL('../games/dead-run/index.html', import.meta.url), 'utf8');
const workerSource = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const deadRunRelease = html.match(/href="\/games\/dead-run\/\?v=([^"]+)"/)?.[1];
const launcherRelease = html.match(/<meta name="moonboys-mini-app-version" content="([^"]+)">/)?.[1];
const inlineLauncherScript = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].at(-1)?.[1];

assert.ok(deadRunRelease, 'Games launcher must link Dead Run with a cache-busting release token');
assert.equal(launcherRelease, '20260903-games-shell-v7', 'Games launcher must publish the v7 arcade shell release token');
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
assert.ok(html.includes('Preparing games...'), 'Games launcher must show initialization copy');
assert.ok(html.includes('28 BIT ARCADE'), 'Games launcher must show the arcade shell marquee');
assert.ok(html.includes('Select game cartridge'), 'Games launcher must show arcade game-selection copy');
assert.match(html, /body\.is-initializing nav a[\s\S]*pointer-events:none/, 'Launcher links must disable pointer events while initializing');
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
  ['Moonpet OS', '/moonpet-game.html?v=20260814-moonpet-aaa-pass'],
  ['Dead Run', `/games/dead-run/?v=${deadRunRelease}`],
  ['Battle Chamber', `/community.html?v=${launcherRelease}`],
  ['NBG London Runner', `/games/nbg-london/?v=${launcherRelease}`],
  ['Full Arcade', `/games/?v=${launcherRelease}`],
];

for (const [label, href] of launcherDestinations) {
  assert.ok(html.includes(label), `Games launcher must contain ${label} card copy`);
  assert.ok(html.includes(`href="${href}`), `Games launcher must link ${label} to ${href}`);
  assert.ok(new URL(href, 'https://cryptomoonboys.com').searchParams.has('v'), `${label} destination must be cache-busted`);
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
assert.ok(
  html.includes(`/games/telegram/?v=${launcherRelease}`),
  'Games launcher must include cache-busting deployment guidance',
);
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

function runLauncher({ initData = 'user=%7B%22id%22%3A123%7D', hash = '', search = '?v=20260902-games-shell-v6&startapp=arcade' } = {}) {
  const calls = [];
  const timers = [];
  const viewportHandlers = [];
  const pageHandlers = new Map();
  const body = new FakeElement({ class: 'page-standalone-tool is-initializing', 'aria-busy': 'true' });
  const root = new FakeElement({ id: 'launcherRoot', 'aria-busy': 'true' });
  const status = new FakeElement({ id: 'launchStatus' });
  const links = launcherDestinations.map(([, href]) => new FakeElement({ href, 'aria-disabled': 'true', tabindex: '-1' }));
  const assigned = [];
  const storage = new Map();
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

  vm.runInNewContext(inlineLauncherScript, {
    window,
    document,
    URL,
    URLSearchParams,
    Array,
    Boolean,
    String,
  });

  return { assigned, body, calls, links, pageHandlers, root, status, storage, timers, viewportHandlers };
}

{
  const harness = runLauncher();
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
  const harness = runLauncher();
  harness.viewportHandlers[0]({ isStateStable: true });
  assert.equal(harness.body.getAttribute('aria-busy'), 'false', 'Stable viewport must clear busy state');
  assert.equal(harness.status.textContent, 'Launcher loaded.', 'Stable viewport must show loaded copy');
  assert.equal(harness.timers[0].cleared, true, 'Stable viewport must clear fallback timer id 0 via an explicit null check');
  assert.equal(harness.links[1].getAttribute('aria-disabled'), null, 'isStateStable=true must enable navigation links');
  harness.links[1].dispatch('click');
  harness.links[2].dispatch('click');
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
  const hashInitData = 'query_id=hash-only&user=%7B%22id%22%3A456%7D';
  const harness = runLauncher({ initData: '', hash: `#tgWebAppData=${encodeURIComponent(hashInitData)}` });
  assert.equal(harness.storage.get('moonboys.telegram.initData'), hashInitData, 'Hash tgWebAppData fallback must be stored in sessionStorage');
  harness.timers[0].handler();
  assert.equal(harness.links[0].getAttribute('aria-disabled'), null, 'Fallback timeout must enable navigation when no viewport event arrives');
  harness.links[0].dispatch('click');
  assert.equal(new URL(harness.assigned[0]).hash, `#tgWebAppData=${encodeURIComponent(hashInitData)}`, 'Hash tgWebAppData fallback must be retained in the destination fragment');
  assert.equal(harness.timers[0].ms, 1200, 'Fallback timeout must wait 1200ms');
}

{
  const leakedQueryInitData = 'query_id=legacy-query&user=%7B%22id%22%3A789%7D';
  const harness = runLauncher({
    initData: '',
    search: `?v=20260902-games-shell-v6&tgWebAppData=${encodeURIComponent(leakedQueryInitData)}&startapp=arcade`,
  });
  harness.viewportHandlers[0]({ isStateStable: true });
  harness.links[2].dispatch('click');
  const assignedUrl = new URL(harness.assigned[0]);
  assert.equal(assignedUrl.searchParams.has('tgWebAppData'), false, 'Legacy query tgWebAppData must be stripped from destination query parameters');
  assert.equal(assignedUrl.searchParams.get('startapp'), 'arcade', 'Non-auth launcher query parameters must still be preserved');
}

{
  const contaminatedDestinationInitData = 'query_id=destination-query&user=%7B%22id%22%3A987%7D';
  const harness = runLauncher();
  harness.links[3].setAttribute('href', `/games/nbg-london/?v=${launcherRelease}&tgWebAppData=${encodeURIComponent(contaminatedDestinationInitData)}`);
  harness.viewportHandlers[0]({ isStateStable: true });
  harness.links[3].dispatch('click');
  const assignedUrl = new URL(harness.assigned[0]);
  assert.equal(assignedUrl.pathname, '/games/nbg-london/', 'Contaminated destination test must still open the selected game');
  assert.equal(assignedUrl.searchParams.has('tgWebAppData'), false, 'Destination-owned tgWebAppData must be stripped from query parameters');
  assert.equal(assignedUrl.hash, `#tgWebAppData=${encodeURIComponent('user=%7B%22id%22%3A123%7D')}`, 'Sanitized destinations must still receive current initData in the fragment');
}

{
  const harness = runLauncher();
  harness.viewportHandlers[0]({ isStateStable: true });
  harness.links[4].dispatch('click');
  assert.equal(harness.links[4].getAttribute('aria-disabled'), 'true', 'Navigation start must disable links');
  harness.pageHandlers.get('pageshow')();
  assert.equal(harness.links[4].getAttribute('aria-disabled'), null, 'pageshow must restore enabled links after browser history return');
}

console.log('telegram-games-launcher.test.mjs passed');
