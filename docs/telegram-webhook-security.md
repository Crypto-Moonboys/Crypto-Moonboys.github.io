# Telegram webhook authentication and deployment

`POST /telegram/webhook` requires Telegram's
`X-Telegram-Bot-Api-Secret-Token` header, matching the Cloudflare Worker secret
`TELEGRAM_WEBHOOK_SECRET`. This is a new dedicated random secret, separate from
`TELEGRAM_BOT_TOKEN`, `ADMIN_SECRET` and the pet-only bot API secret.

The production wrapper verifies the header before cloning/parsing an update,
repairing equipment or recovering rewards. The base handler independently checks
it before parsing, refreshing a Telegram profile or executing a bot command.
Missing/invalid configuration returns 503; a missing/incorrect header returns
401. Comparison uses fixed-size SHA-256 digests and Workers' native
`crypto.subtle.timingSafeEqual`, with a complete fixed-length digest comparison
for other WebCrypto runtimes. Verification failures never authorize an update.
Verified updates retain the existing Telegram acknowledgment behavior.

## Required setup before the approved production deployment

This procedure changes the production Worker secret and Telegram webhook
registration. Run it only during an explicitly approved production change. This
PR does not run it or deploy production. No D1 migration is needed for webhook
authentication.

1. Generate and retain a cryptographically random secret in an approved password
   manager: at least 32 random bytes encoded as hexadecimal or URL-safe base64.
   Telegram accepts 1–256 characters from `A-Z`, `a-z`, `0-9`, `_` and `-`.
   Do not paste values into source, Wrangler `[vars]`, chat, shell command-line
   arguments, recorded terminals or logs. Disable terminal/session recording.
2. From the repository root, with Cloudflare CLI authentication already available,
   run the following exact command. It prompts privately for the new secret and
   existing BotFather token; the secret is piped to Wrangler on stdin. The same
   value goes to Telegram's `setWebhook` API as `secret_token`. Neither token is
   printed, put in a file, passed as a process argument or exported in the shell.

```sh
python3 - <<'PY'
import getpass
import json
import re
import subprocess
import urllib.request

webhook_url = 'https://moonboys-api.sercullen.workers.dev/telegram/webhook'
secret = getpass.getpass('New TELEGRAM_WEBHOOK_SECRET (from password manager): ')
bot_token = getpass.getpass('Existing TELEGRAM_BOT_TOKEN: ')
if not re.fullmatch(r'[A-Za-z0-9_-]{32,256}', secret) or not bot_token:
    raise SystemExit('Invalid secret format or missing bot token; nothing changed.')

try:
    subprocess.run([
        'npx', 'wrangler', 'secret', 'put', 'TELEGRAM_WEBHOOK_SECRET',
        '--config', 'workers/moonboys-api/wrangler.toml',
    ], input=secret + '\n', text=True, check=True)
except Exception:
    raise SystemExit('Cloudflare secret setup failed; do not deploy.')

def telegram(method, payload):
    request = urllib.request.Request(
        'https://api.telegram.org/bot' + bot_token + '/' + method,
        data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
    except Exception:
        raise SystemExit('Telegram configuration request failed; do not deploy. Retry setup using the same saved secret.')
    if result.get('ok') is not True:
        raise SystemExit('Telegram did not accept configuration; do not deploy.')
    return result.get('result')

if telegram('setWebhook', {
    'url': webhook_url,
    'secret_token': secret,
    'drop_pending_updates': False,
}) is not True:
    raise SystemExit('Telegram registration was not confirmed; do not deploy.')
info = telegram('getWebhookInfo', {})
if not isinstance(info, dict) or info.get('url') != webhook_url:
    raise SystemExit('Telegram webhook URL was not confirmed; do not deploy.')
print('Cloudflare secret saved; Telegram accepted matching secret_token and webhook URL. No queued updates dropped.')
PY
```

3. Run `node scripts/worker-deploy-readiness-audit.mjs`. The required secret name
   appears in `workers/DEPLOY_STATUS.json`, and the audit forbids storing its
   value in Wrangler configuration. The approved production wrapper also runs
   `npx wrangler secret list --format json` in `workers/moonboys-api` and requires
   a `TELEGRAM_WEBHOOK_SECRET` secret binding before deploying. A failed lookup
   blocks deployment. Secret listing returns names/types, never values.
4. Follow [the production runbook](WORKER_DEPLOY_RUNBOOK.md) only after setup and
   deployment approval. Verify a real Telegram command after deployment and
   confirm webhook delivery has no new authentication failures.

Registering with `secret_token` before deploying the new gate works with the
previous handler and avoids rejecting legitimate updates during initial rollout.
Later secret rotation briefly rejects deliveries between the two configuration
changes; Telegram retries them. Do not delete the webhook, drop queued updates,
or temporarily remove authentication to work around configuration errors.
`getWebhookInfo` does not reveal the secret or whether a secret was configured;
the successful `setWebhook` request is the registration evidence. The preflight
can verify the Cloudflare binding but cannot infer Telegram's hidden value.

## Regression checks

```sh
node scripts/telegram-webhook-auth.test.mjs
node scripts/telegram-webhook-deployment.test.mjs
node scripts/worker-deploy-readiness-audit.test.mjs
node scripts/worker-deploy-readiness-audit.mjs
```

Tests cover both the direct and deployed handlers, including forged profile and
admin commands, equipment reads, reward callbacks, malformed bodies, absent or
incorrect secrets, native timing-safe comparison and verification failures.
Denied requests perform no parsing, D1 calls or Telegram sends. A correct secret
permits the expected profile update and command response. Existing ownership,
gameplay and reward records are retained; authentication deletes no data.
