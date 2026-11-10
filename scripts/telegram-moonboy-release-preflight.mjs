import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL(
  '../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const gateway = readFileSync(new URL(
  '../workers/moonboys-api/telegram/moonboy-message-gateway.js', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL(
  '../workers/moonboys-api/wrangler.toml', import.meta.url), 'utf8');

const checks = [
  ['production photos OFF', /TELEGRAM_MOONBOY_PHOTOS_ENABLED = "false"/.test(wrangler)],
  ['production mode OFF', /TELEGRAM_MOONBOY_MEDIA_MODE = "off"/.test(wrangler)],
  ['production message kinds empty', /TELEGRAM_MOONBOY_MESSAGE_KINDS = ""/.test(wrangler)],
  ['no paid Images binding', !/binding\s*=\s*"IMAGES"/.test(wrangler)],
  ['core command kind approved', /'games-pin', 'core-command'/.test(gateway)],
  ['pet notification kind approved', /'pet-notification'/.test(gateway)],
  ['request-scoped command routing present', /createTelegramCommandMediaContext\(env, update\)/.test(worker)],
  ['Games pin remains confirmed text infrastructure', /ensureTelegramGamesPinned\(unwrapTelegramBotToken\(botToken\)/.test(worker)],
  ['uncertain pet alert locks review', /VALUES \(\?,\?,'needs_review'\)/.test(worker)],
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  failed ||= !ok;
}
if (failed) process.exitCode = 1;
else console.log('PASS code is ready for a separately approved Images binding and private canary');
