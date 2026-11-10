# Telegram Moonboy artwork — final code coverage and release gate

Parent: #1726. Foundation: #1728. Transport: #1729. TAG RUN integration:
#1730. Cache and durable broad-send integration: #1732.

## Final code scope

This PR routes the remaining base Worker command replies through the shared,
fail-closed Moonboy media gateway without changing 150 command call sites. A
request-scoped token-compatible context carries the source Telegram message ID,
chat kind and per-reply sequence to the existing central `sendTelegramMessage`
helper. It is created per webhook invocation and is never stored in module
state, D1, logs or cache.

The `core-command` class includes `/daily`, `/games`, `/profile`, GK commands,
Moonpet text-only commands and text replies produced by legacy callback actions.
The stable seed is:

`core-command:<destination chat id>:<source Telegram message id>:<reply sequence>`

The existing scheduler-backed Moonpet needs notification is also integrated as
`pet-notification`. Its already-persisted scan revision identifies the claimed
logical attempt. If Telegram delivery is uncertain, the existing per-pet
delivery cursor is set to `needs_review`; the scheduler cannot retry it.
The scheduler upgrades its pre-send lease to a durable lock first, so even a D1
failure while saving `needs_review` cannot reopen an ambiguous delivery.

## Outgoing-message inventory

| Source | Result |
|---|---|
| Base Worker command and callback chat replies | `core-command` gateway |
| Private daily digest | `daily-digest` gateway from PR4 |
| Daily WTF and timed group announcements | `group-announcement` gateway from PR4 |
| TAG RUN commands, bulletins and rank notices | PR3 gateway classes |
| Moonpet scheduled needs notification | `pet-notification` gateway with durable uncertain lock |
| Existing pet/photo/animation/document sends | Unchanged; follow-up text attached to existing media is not intercepted |
| Persistent Games shortcut pin | Explicit text infrastructure exception; it requires confirmed `message_id` for pin/delete. The conversational `/games` reply is covered |
| `answerCallbackQuery` popups and chat-menu API calls | Telegram control operations, not chat messages |
| External Moonpet production-health alarm script | Explicit operational exception; it runs outside the Worker and has no Images binding |
| Messages over the 1,024-character photo caption limit | One unchanged text message; never split into duplicate-prone sends |

The Games pin deliberately remains text. Turning it into a photo would make a
timeout ambiguous before the bot receives the `message_id` needed to pin or
delete that exact shortcut. This does not leave `/games` uncovered: its normal
reply gets a Moonboy picture when the staged gate is enabled.

## Production gate

This PR does **not** provision Cloudflare Images, enable paid transformations,
deploy the Worker or send live media. Production remains:

```toml
TELEGRAM_MOONBOY_PHOTOS_ENABLED = "false"
TELEGRAM_MOONBOY_MEDIA_MODE = "off"
TELEGRAM_MOONBOY_MESSAGE_KINDS = ""
```

Run before merge:

```powershell
node --test scripts/telegram-moonboy-final-coverage.test.mjs
node scripts/telegram-moonboy-release-preflight.mjs
npm run ci:worker-api
```

After merge, release still requires the owner's separate approval to verify
Cloudflare Images billing/product access, add the binding, deploy with all media
flags OFF, run a private canary with one explicitly allowed message class,
inspect real JPEG alpha/quality and Telegram caption/topic behaviour, and only
then consider a gradual class-by-class rollout.
