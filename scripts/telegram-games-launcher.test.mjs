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

assert.match(
  html,
  /function\s+callTelegramReady\(\)\s*\{[\s\S]*try\s*\{[\s\S]*webApp\.ready\(\);[\s\S]*\}\s*catch\s*\(_\)\s*\{\}/,
  'Games launcher must call Telegram.WebApp.ready() safely',
);

assert.match(
  html,
  /function\s+callTelegramExpand\(\)\s*\{[\s\S]*try\s*\{[\s\S]*webApp\.expand\(\);[\s\S]*\}\s*catch\s*\(_\)\s*\{\}/,
  'Games launcher must call Telegram.WebApp.expand() safely',
);

assert.ok(
  html.indexOf('telegram-web-app.js') < html.indexOf('callTelegramReady();'),
  'Telegram SDK must be declared before ready() is called',
);

for (const script of forbiddenScripts) {
  assert.ok(!html.includes(script), `Games launcher must not load ${script}`);
}

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
assert.match(html, /webApp\.initData/, 'Games launcher must read initData from Telegram.WebApp.initData');
assert.match(html, /location\.hash[\s\S]*tgWebAppData/, 'Games launcher must read tgWebAppData from the URL hash');
assert.match(html, /sessionStorage\.getItem\(STORAGE_KEY\)/, 'Games launcher must read stored tgWebAppData fallback from sessionStorage');
assert.match(html, /sessionStorage\.setItem\(STORAGE_KEY,\s*value\)/, 'Games launcher must persist tgWebAppData into sessionStorage');
assert.match(html, /url\.origin\s*!==\s*location\.origin/, 'Games launcher must only mutate same-origin links');
assert.match(html, /hash\.set\('tgWebAppData',\s*data\)/, 'Games launcher must append tgWebAppData into internal link hashes');
assert.match(html, /querySelectorAll\('\[data-mini-link\]'\)/, 'Games launcher must apply Telegram data preservation to card links');

assert.ok(
  html.includes('Open from the bot Games button for saved/ranked play.'),
  'Games launcher must show fallback copy when Telegram initData is unavailable',
);
assert.ok(
  html.includes('/games/telegram/?v=20260901-games-shell'),
  'Games launcher must include cache-busting deployment guidance',
);

console.log('telegram-games-launcher.test.mjs passed');
