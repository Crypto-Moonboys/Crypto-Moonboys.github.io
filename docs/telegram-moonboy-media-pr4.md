# Telegram Moonboy artwork — PR4 cache and durable broad-send integration

Parent: #1726. Foundation: #1728. Transport: #1729. TAG RUN integration: #1730.

## Scope

PR4 adds a bounded Workers Cache API layer and routes two high-volume base
Worker message classes through the existing fail-closed Moonboy gateway:

| Message class | Stable logical seed | Existing receipt authority |
|---|---|---|
| Private daily digest | `daily-digest:<telegram chat id>:<UTC day>:0` | `telegram_daily_digest_log` |
| Timed Daily WTF and daily group announcements | `group-announcement:<official group id>:<announcement_key>:0` | `telegram_group_announcement_log` |

No Images binding is provisioned and all production controls remain OFF. Existing
text-only output is byte-for-byte unchanged while the gate is disabled, the new
message-class allowlist is empty, the caption exceeds 1,024 UTF-16 units, cache
or composition fails before Telegram, or Cloudflare Images is unavailable.

## Cache layers

The cache key contains only the validated public logical seed and cache version.
It never contains message text, WAX details, bot tokens or credentials.

1. A confirmed Telegram `file_id` is preferred. Reuse sends a JSON
   `sendPhoto` request and performs no manifest/layer fetch, Images transform,
   or JPEG upload.
2. Otherwise a bounded 640×640 JPEG (maximum 500,000 bytes) may be reused.
3. On a full miss, PR1 composes from the nine homepage builder layers. The JPEG
   is cached, and a successful Telegram response stores its confirmed
   `file_id`.

Cache API reads/writes are best effort. Missing, corrupt, oversized or
unavailable cache entries never drop the original text message. Entries use a
30-day edge TTL; Telegram remains the authority for whether a cached
`file_id` is accepted.

## Durable uncertainty rules

A photo timeout, 429/5xx, unreadable response or malformed acknowledgement is
not safe to retry.

- Daily digest receipt becomes `needs_review`. Normal and forced digest claims
  cannot reclaim `sent` or `needs_review`.
- Group announcement receipt becomes `needs_review`. The existing claim query
  retries only `failed` or stale `pending/sending`, so an uncertain photo is
  never duplicated.
- A definitive Telegram photo rejection may fall back once to the exact
  existing text message.
- A pre-send cache/render failure uses the exact legacy text path.
- Messages over Telegram's 1,024-character photo-caption limit remain one
  text-only message; PR4 does not split a durable message into two sends.

Telemetry logs message class, outcome, cache source, render byte count,
file-ID reuse, method and duration. It deliberately omits chat/member IDs,
seeds, message bodies, wallet information and credentials.

## Staged controls

All gates are required:

```toml
TELEGRAM_MOONBOY_PHOTOS_ENABLED = "true"
TELEGRAM_MOONBOY_MEDIA_MODE = "canary" # or separately approved "group"
TELEGRAM_MOONBOY_MESSAGE_KINDS = "daily-digest" # comma-separated
```

Private canary still requires the exact
`TELEGRAM_MOONBOY_CANARY_CHAT_ID`. Group rollout still requires the exact
official `TELEGRAM_GROUP_CHAT_ID`. PR4 introduces no all-chat mode.

Production in this PR remains:

```toml
TELEGRAM_MOONBOY_PHOTOS_ENABLED = "false"
TELEGRAM_MOONBOY_MEDIA_MODE = "off"
TELEGRAM_MOONBOY_MESSAGE_KINDS = ""
```

## Explicitly not switched by PR4

- Core command replies remain text-only except TAG RUN paths already integrated
  by PR3. Converting every command requires passing explicit request identity
  through the large command dispatcher; no module-global request context is
  introduced.
- The Games shortcut pin remains text-only. Its send → pin → delete lifecycle
  needs a dedicated receipt before an uncertain photo upload can be made safe.
- Existing photo/animation/document messages are unchanged.
- Moonpet production health alerts remain text-only operational alarms.
- No D1 migration, KV binding, Images binding, scoring, XP, wallet, payout,
  signer, cron or authentication change is included.

The parent issue stays open until these remaining controlled text-only paths and
the private/live release rehearsal are completed.

## Required verification

```powershell
node --test scripts/telegram-moonboy-cache-rollout-pr4.test.mjs
node --test scripts/telegram-moonboy-message-coverage-pr3.test.mjs
node --test scripts/telegram-moonboy-photo-transport-pr2.test.mjs
node --test scripts/telegram-moonboy-portrait-pr1.test.mjs
node scripts/telegram-daily-digest-and-missed-perks.test.mjs
node scripts/telegram-group-event-announcements.test.mjs
npm run ci:worker-api
```

Real Cloudflare Images codec/alpha output, cache-colo behaviour, Telegram
`file_id` reuse and live canary display remain release checks. They are not
claimed by mocked tests. Do not provision billable Images, deploy, enable a
message class or send live media without separate owner approval.
