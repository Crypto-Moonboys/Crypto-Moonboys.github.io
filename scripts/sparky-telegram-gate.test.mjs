/**
 * Static regression tests for the public SWARMSY -> Sparky Telegram gate.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFile(path.join(ROOT, rel), 'utf8');

let pass = 0;
let fail = 0;

async function test(label, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${label}`);
    pass++;
  } catch (error) {
    console.error(`  [FAIL] ${label}`);
    console.error(`         ${error.message}`);
    fail++;
  }
}

const swarmsyHtml = await read('swarmsy.html');
const sparkyHtml = await read('sparky.html');
const chatJs = await read('js/sparky-chat.js');
const browserCorpus = `${swarmsyHtml}\n${sparkyHtml}\n${chatJs}`;

console.log('\n[Sparky Telegram gate] Frontend/static assertions');

await test('/swarmsy.html contains visible /sparky.html CTA', () => {
  assert.match(
    swarmsyHtml,
    /<a\b(?=[^>]*\bhref="\/sparky\.html")(?=[^>]*\bclass="[^"]*\bswarmsy-action-card\b)[^>]*>[\s\S]*?<strong>\s*CHAT WITH SPARKY\s*<\/strong>[\s\S]*?<\/a>/,
    'SWARMSY hero CTA card must link to /sparky.html with the required text',
  );
});

await test('/swarmsy.html states Sparky requires Telegram login', () => {
  assert.ok(
    swarmsyHtml.includes('Sparky AI Chat requires Telegram login before messages can be sent.'),
    'SWARMSY page must tell users Sparky chat requires Telegram login',
  );
});

await test('/sparky.html unauthenticated state shows Telegram login required panel', () => {
  assert.ok(sparkyHtml.includes('data-sparky-login-panel'), 'missing Sparky login required panel');
  assert.ok(
    sparkyHtml.includes('Log in with Telegram to use Sparky AI Chat.'),
    'missing exact login-required panel copy',
  );
  assert.ok(sparkyHtml.includes('<code>/telegram/auth</code>'), 'panel must reference the existing Telegram login route');
});

await test('/sparky.html ships chat disabled until JS verifies Telegram auth', () => {
  assert.ok(sparkyHtml.includes('data-requires-telegram-auth="true"'), 'chat root must declare Telegram requirement');
  assert.match(sparkyHtml, /data-sparky-input[^>]*disabled/, 'message textarea must be disabled in static unauthenticated state');
  assert.match(sparkyHtml, /data-sparky-send[^>]*disabled/, 'send button must be disabled in static unauthenticated state');
});

await test('sparky-chat.js does not POST when Telegram auth is missing', () => {
  const missingAuthIndex = chatJs.indexOf('if (!telegramAuth)');
  const fetchIndex = chatJs.indexOf('fetch(endpoint');
  assert.ok(missingAuthIndex !== -1, 'missing-auth guard not found');
  assert.ok(fetchIndex !== -1, 'Sparky endpoint fetch not found');
  assert.ok(missingAuthIndex < fetchIndex, 'missing-auth guard must run before /public/npc-chat fetch');
  assert.ok(chatJs.includes('Telegram login required to use Sparky.'), 'missing required user-facing error message');
});

await test('sparky-chat.js sends signed Telegram auth proof for authenticated chat', () => {
  assert.ok(chatJs.includes('getFreshTelegramAuth'), 'chat client must use shared Telegram identity state');
  assert.ok(chatJs.includes('telegram_auth: telegramAuth'), 'chat client must include signed auth proof in the POST body');
});

await test('Browser code does not expose bridge/admin secrets', () => {
  const forbidden = [
    'SWARMSY_BRIDGE_TOKEN',
    'X-SWARMSY-BRIDGE-TOKEN',
    'swarmsy.cryptomoonboys.com/api/swarmsy/admin',
    'workspace_key',
    'workspaceKey',
    'private prompt',
  ];
  for (const needle of forbidden) {
    assert.ok(!browserCorpus.includes(needle), `browser code must not expose ${needle}`);
  }
});

console.log('\n─── Result ──────────────────────────────────────────────────────');
console.log(`  Passes   : ${pass}`);
console.log(`  Failures : ${fail}`);
console.log('─────────────────────────────────────────────────────────────────\n');

if (fail > 0) process.exit(1);
