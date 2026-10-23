import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../admin-tools.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../js/admin-blocktopia-tools.js', import.meta.url), 'utf8');

test('admin tools includes the standard site shell without a naked empty placeholder', () => {
  assert.match(html, /<link rel="stylesheet" href="\/css\/wiki\.css">/);
  assert.match(html, /<body class="page-admin page-standard-shell">/);
  assert.match(html, /<main id="content" role="main">/);
  assert.match(html, /src="\/js\/site-shell\.js"/);
  assert.match(html, /src="\/js\/admin-blocktopia-tools\.js"/);
  assert.doesNotMatch(html, /<div class="admin-page"><\/div>/);
});

test('every admin script DOM dependency exists as exactly one element', () => {
  const ids = [
    'access-state', 'refresh-auth-state', 'admin-panel',
    'arcade-grant-form', 'admin-telegram-username', 'admin-telegram-id',
    'arcade-target-telegram-id', 'arcade-grant-xp', 'arcade-grant-reason',
    'arcade-result-state', 'arcade-result-json',
    'bt-grant-form', 'bt-target-telegram-id', 'bt-grant-xp', 'bt-grant-reason',
    'bt-result-state', 'bt-result-json',
  ];
  for (const id of ids) {
    assert.match(script, new RegExp("getElementById\\('"+id+"'\\)"));
    const matches = html.match(new RegExp('id="'+id+'"', 'g')) || [];
    assert.equal(matches.length, 1, id + ' must appear exactly once');
  }
});

test('grants remain hidden until verified API admin access and use signed Telegram identity', () => {
  assert.match(html, /id="admin-panel" class="hidden"/);
  assert.match(script, /accessPayload\.admin_allowlisted/);
  assert.match(script, /postJson\('\/admin\/blocktopia\/access'/);
  assert.match(script, /telegram_auth: telegramAuth/);
  assert.match(script, /postJson\('\/admin\/arcade\/grant-xp'/);
  assert.match(script, /postJson\('\/admin\/blocktopia\/grant-xp'/);
  assert.doesNotMatch(html, /X-Admin-Secret|admin-secret/i);
  assert.match(html, /Arcade XP counts towards the 5,000 XP/);
});
