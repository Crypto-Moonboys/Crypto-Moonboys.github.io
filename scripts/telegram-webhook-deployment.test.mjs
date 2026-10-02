import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { buildWebhookSecretListInvocation, requireTelegramWebhookSecret } from './deploy-worker-with-provenance.mjs';

test('production secret preflight rejects missing, malformed and non-secret bindings', () => {
  for (const result of ['', 'null', '{}', '[]', '{invalid', JSON.stringify([{ name: 'TELEGRAM_BOT_TOKEN', type: 'secret_text' }]), JSON.stringify([{ name: 'TELEGRAM_WEBHOOK_SECRET', type: 'plain_text' }])]) {
    assert.throws(() => requireTelegramWebhookSecret(result), /requires Cloudflare secret TELEGRAM_WEBHOOK_SECRET/);
  }
  assert.doesNotThrow(() => requireTelegramWebhookSecret(JSON.stringify([{ name: 'TELEGRAM_WEBHOOK_SECRET', type: 'secret_text' }])));
});

test('production preflight reads secret names with portable, read-only Wrangler invocation', () => {
  assert.deepEqual(buildWebhookSecretListInvocation({ platform: 'linux' }), {
    command: 'npx', args: ['wrangler', 'secret', 'list', '--format', 'json'], windowsVerbatimArguments: false,
  });
  const windows = buildWebhookSecretListInvocation({ platform: 'win32', comspec: 'cmd.exe' });
  assert.equal(windows.command, 'cmd.exe');
  assert.deepEqual(windows.args, ['/d', '/s', '/c', '"npx wrangler secret list --format json"']);
});

test('production deployment requires the webhook secret before the Worker is deployed', () => {
  const source = fs.readFileSync(new URL('./deploy-worker-with-provenance.mjs', import.meta.url), 'utf8');
  const deploy = source.slice(source.indexOf('export function deployWorker('));
  assert.ok(deploy.indexOf('requireTelegramWebhookSecret(run(') < deploy.indexOf('const invocation = buildWranglerProcessInvocation'));
  const manifest = JSON.parse(fs.readFileSync(new URL('../workers/DEPLOY_STATUS.json', import.meta.url), 'utf8'));
  assert.ok(manifest['workers/moonboys-api'].required_secrets.includes('TELEGRAM_WEBHOOK_SECRET'));
});
