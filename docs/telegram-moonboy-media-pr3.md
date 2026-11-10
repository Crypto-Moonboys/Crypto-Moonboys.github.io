# Telegram Moonboy artwork — PR3 send-path coverage and private canary

Parent: #1726. Composer: #1728 (merged). Transport: #1729 (merged).

## PR3 scope: real send sites, still OFF by default

Adds `workers/moonboys-api/telegram/moonboy-message-gateway.js` and wires the
existing **TAG RUN-owned outbound text-only paths** through it:

| Message type | Source | PR3 routing |
|---|---|---|
| TAG RUN group/private commands, including the V2 /pool and /rain command responses | `tag-run/handler.js` `messageReply()` shared `send` closure | Integrated; private canary or explicit official-group opt-in only |
| Four-hour TAG RUN bulletin | `postTagRunGroupBulletin()` | Integrated; preserves `TELEGRAM_GROUP_THREAD_ID` |
| TAG RUN rank-up notice | `sendRankAnnouncement()` / durable CAS outbox | Integrated; 'uncertain' preserves `needs_review` and never creates a second text send |

Each composed Moonboy draws **one real static WebP asset from every homepage
builder category**, bottom-to-top, using PR1. PR2 sends the resulting bounded
640px JPEG and original caption where safe. Existing media messages are not
intercepted or replaced.

## Explicit inventory of remaining bot send paths

PR3 does **not** claim full all-bot coverage. Unwired paths identified:

| Source | Message class | Reason not silently changed by PR3 |
|---|---|---|
| `workers/moonboys-api/worker.js` base handler (large monolith) | Core Telegram commands such as /daily, /games, /profile; private daily digest; timed game notices and daily group summaries | Different existing send/receipt authority; requires a separate targeted adapter and test validation before switching |
| `workers/moonboys-api/telegram-games-pin.js` | Games menu message, subsequently pinned | Existing pin-message ID and idempotency must be preserved |
| `scripts/moonpet-production-health-alert.mjs` | Operational/admin alarm | Keep high-priority alerts text-only until a separately approved opt-in |
| Already-image-bearing bot messages (wherever sent) | Existing photos/media | **Never wrap or replace existing artwork** |
| `workers/moonboys-api/telegram-chat-menu-cleanup.js`, `telegram-group-membership.js` | Menu / membership API methods | Not outbound user-facing messages |

The base Worker is very large and its full send-site inventory is **not
claimed complete** here. Before marking #1726 fully delivered, search all
`sendMessage`, `sendPhoto`, `sendAnimation`, `sendDocument` and
bot API helpers inside the base Worker and confirm owner and media semantics
for each. Do not bypass user identity, daily-WTF dedupe or gameplay receipts.

## Runtime control and cost gates

Production `wrangler.toml` intentionally sets:

```toml
TELEGRAM_MOONBOY_PHOTOS_ENABLED = "false"
TELEGRAM_MOONBOY_MEDIA_MODE = "off"
```

The Images binding is **NOT provisioned** by PR3. While OFF, TAG RUN still
calls its exact existing `sendMessage` fetch, including the same JSON
payload and thread routing; there are **no extra manifest/asset fetches or paid
transformations**.

For a later *separately approved* **private DM canary**:
- Provision an Images binding (`env.IMAGES`) only after cost approval;
- Set `TELEGRAM_MOONBOY_PHOTOS_ENABLED=true`,
  `TELEGRAM_MOONBOY_MEDIA_MODE=canary`,
  `TELEGRAM_MOONBOY_CANARY_CHAT_ID=<approved private Telegram numeric chat ID>`;
- Only the exact private recipient receives attached art for TAG RUN commands;
  no bulletin or group message can be changed in canary mode.

For later *explicitly approved group-only rollout*, `group` mode requires the
destination chat ID to match existing `TELEGRAM_GROUP_CHAT_ID`, plus the
feature flag and Images binding. No all-chats mode exists in PR3.

## Safety and duplicate policy

- No valid binding, incorrect mode/ID, missing flag, unsupported message class,
  or long caption (over 1024 UTF-16 units): use the existing text-only route.
- Missing/broken manifest/layer, image decode/transform failure, or size limit
  **before contacting Telegram**: existing text-only route.
- Once PR2 photo transport begins, an uncertain fetch/timeout/5xx/429/malformed
  Telegram acknowledgement is **terminal**. No automatic fallback text.
- TAG RUN rank CAS still owns exactly-once acceptance and transition to
  `needs_review` for uncertainty; neither Street Cred nor payouts are changed.
- Image seed is deterministic for the logical Telegram update, rank receipt or
  4-hour bulletin cycle. Seed never contains message content, registered WAX
  destination, secrets or wallet credentials.
- No `D1` migration, no job/cron change, no pet or Arcade XP modification,
  no payment logic or signer change.

## Focused checks on branch

```powershell
cd D:\GITHUB\Crypto-Moonboys.github.io
git fetch origin
git switch --track origin/feature/telegram-moonboy-message-coverage-pr3-20261110
node --test scripts/telegram-moonboy-message-coverage-pr3.test.mjs
node --test scripts/telegram-moonboy-portrait-pr1.test.mjs
node --test scripts/telegram-moonboy-photo-transport-pr2.test.mjs
node --test scripts/tag-run-community-rewards.test.mjs
node --test scripts/tag-run-v2-observation.test.mjs
npm run ci:worker-api
echo $LASTEXITCODE
```

Mock validation checks the live handler and outbound request selection: OFF
sends one old-style text message, private canary composes and sends a photo,
wrong chat cannot activate, group bulletin preserves topic, rank receipt CAS
is retained, uncertain upload cannot be double-sent.

**NOT proven by mocked tests:** real Cloudflare Images binding image
composition/colour-alpha parity, Telegram live sendPhoto permission and actual
private-canary display. Do not enable, merge or deploy without owner sign-off.

## Remaining release work

PR4 should add a stored image/file-ID cache and cover the base Worker
senders, including Telegram daily digest and timed-event announcements, with
their own idempotency and screenshot proof. Owner must explicitly approve
billable Images binding enablement and each rollout mode. The parent issue
stays open until all controlled text-only messages are covered.
