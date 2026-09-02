import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../games/telegram/index.html', import.meta.url), 'utf8');

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
  html.includes('https://telegram.org/js/telegram-web-app.js'),
  'Games launcher must load the Telegram WebApp SDK early',
);

assert.ok(
  /<script src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"><\/script>[\s\S]*try\s*\{[\s\S]*window\.Telegram\.WebApp\.ready\(\);[\s\S]*window\.Telegram\.WebApp\.expand\(\);[\s\S]*\}\s*catch\s*\(_\)\s*\{\}/.test(html),
  'Games launcher must call Telegram.WebApp.ready() and expand() immediately in the head',
);

assert.ok(
  html.indexOf('window.Telegram.WebApp.ready();') < html.indexOf('</head>'),
  'Telegram ready() call must stay in the document head',
);

assert.ok(
  html.includes('class="page-standalone-tool"'),
  'Games launcher must remain a standalone tool page',
);

for (const script of forbiddenScripts) {
  assert.ok(!html.includes(script), `Games launcher must not load ${script}`);
}

const externalScripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
assert.deepEqual(externalScripts, ['https://telegram.org/js/telegram-web-app.js'], 'Games launcher must not load external JS except the Telegram SDK');

assert.ok(!/<link\b[^>]*rel=["']stylesheet["']/i.test(html), 'Games launcher must not load external CSS files');
assert.ok(!/<script\b[^>]*type=["']module["']/i.test(html), 'Games launcher must not use module scripts');
assert.ok(!/<img\b|rel=["']icon["']/i.test(html), 'Games launcher must not load images');
assert.ok(!/localStorage/i.test(html), 'Games launcher must not depend on localStorage');
assert.ok(!/src=["'][^"']*(?:arcade|site-shell|wiki)[^"']*bundle[^"']*["']/i.test(html), 'Games launcher must not load full arcade/site bundles');
assert.ok(!/location\.(?:assign|replace)|window\.location\s*=/.test(html), 'Games launcher must not auto-redirect on load');
assert.ok(!/geolocation|getCurrentPosition|watchPosition/i.test(html), 'Games launcher must not request GPS/location');
assert.ok(!/dead-run[^"']*(?:bootstrap|runtime|logic)\.js/i.test(html), 'Games launcher must not start Dead Run logic');

for (const [label, href] of [
  ['Moonpet OS', '/moonpet-game.html'],
  ['Dead Run', '/games/dead-run/'],
  ['Battle Chamber', '/community.html'],
  ['NBG London Runner', '/games/nbg-london/'],
  ['Full Arcade', '/games/'],
]) {
  assert.ok(html.includes(label), `Games launcher must contain ${label} card copy`);
  assert.ok(html.includes(`href="${href}`), `Games launcher must link ${label} to ${href}`);
}

assert.match(html, /window\.Telegram\s*&&\s*window\.Telegram\.WebApp/, 'Games launcher must read Telegram.WebApp safely');
assert.match(html, /window\.Telegram\.WebApp\.initData/, 'Games launcher must read initData from Telegram.WebApp.initData');
assert.match(html, /location\.hash[\s\S]*tgWebAppData/, 'Games launcher must read tgWebAppData from the URL hash');
assert.match(html, /try\s*\{\s*sessionStorage\.setItem\('moonboys_tg_web_app_data',\s*tgWebAppData\);\s*\}\s*catch\s*\(_\)\s*\{\}/, 'Games launcher must persist tgWebAppData into sessionStorage inside try/catch');
assert.match(html, /url\.origin\s*!==\s*location\.origin/, 'Games launcher must only mutate same-origin links');
assert.match(html, /hash\.set\('tgWebAppData',\s*tgWebAppData\)/, 'Games launcher must append tgWebAppData into internal link hashes');
assert.match(html, /querySelectorAll\('\[data-mini-link\]'\)/, 'Games launcher must apply Telegram data preservation to card links');

assert.ok(
  html.includes('Telegram SDK detected. initData length: '),
  'Games launcher must include the temporary Telegram SDK diagnostic line',
);
assert.ok(
  html.includes('/games/telegram/?v=20260902-games-shell-v2'),
  'Games launcher must include cache-busting deployment guidance',
);

console.log('telegram-games-launcher.test.mjs passed');
