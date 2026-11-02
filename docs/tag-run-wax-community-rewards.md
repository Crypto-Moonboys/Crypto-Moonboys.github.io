# TAG RUN — Telegram Street Cred and WAX community rewards (Phase 1)

Repository: `Crypto-Moonboys/Crypto-Moonboys.github.io`
Bot: `@WIKICOMSBOT`
Group: the existing `TELEGRAM_GROUP_CHAT_ID` supergroup
Starting token: **LFGK**, issued by **`kingsofgraff`** on WAX. Token identity: https://alcor.exchange/v/wax/terminal/lfgk-kingsofgraff

## What ships in Phase 1

TAG RUN is an additional, self-contained Telegram community rank system. It does **not** add Arcade XP, Pet XP, Moon Gold, website logins, XRP rewards, or blockchain transfers.

Members earn Street Cred from ordinary, authentic group text messages. They **do not need to link/sync a website account** to earn points: the webhook already supplies their authoritative Telegram ID. Only messages in the configured GKniftyHEADS group are eligible.

Scoring is bounded to prevent bot/rank farming:

- Meaningful **10+ character** comments: **10 points**. Must contain at least 8 letters/numbers and two separate words, not a command, forwarded message, repeated text, URL-only message or bot content.
- 45 seconds minimum between credited messages from the same user.
- Maximum **30 eligible comments per UTC day** per Telegram ID (300 base points/day).
- Genuine reply to a different member: **+2 points**.
- First qualifying comment of a day after an active previous UTC day: **+5 streak points**.
- Identical normalised content cannot be credited twice in 24 hours.
- Telegram update replay uses a unique `(chat_id,message_id)` receipt; repeat webhooks do not award twice.
- Only the configured Telegram supergroup contributes points. Private messages and channels never contribute.

The score/rank system uses the complete user-approved 29-rank ladder from **Newbie Tagger** (0) to **Graffiti King** (95,000). Weekly leaderboards reset by **Monday 00:00 UTC**; lifetime rank does not reset. Ranks/leaderboards are specific to TAG RUN, **not Arcade XP**.

## Member commands

| Command | Result |
|---|---|
| `/profile` | Lifetime Street Cred, rank, next threshold, current weekly points, streak and registered WAX wallet status |
| `/top` | Top 10 for the current UTC week |
| `/top all` | All-time Top 10 |
| `/rewards` | Selected WAX reward token, quantities, your weekly participation and previous review draft |
| `/help` or `/taghelp` | TAG RUN scoring, rank and reward instructions |
| `/rain` | In the group: prompts a private message. In the bot DM: `/rain waxaccount` registers a WAX account for future rewards (never an XRP wallet). |

The bot cannot currently prove that the Telegram user owns a WAX account. **All `/rain` registrations are PENDING verification**; this is not permission to withdraw/send tokens. Never ask for wallet private keys or seed phrases in Telegram.

Existing `/games`, `/daily`, `/gklink` and MoonPet commands remain handled by their preexisting code. The existing bot's private-chat `/help` remains unmodified (use `/taghelp` in DM).

## Reward configuration — admin-only, private bot chat

Only Telegram IDs listed in the Worker secret `ADMIN_TELEGRAM_IDS` can run these commands, and only in a **direct chat with the bot**:

1. `/tagtoken LFGK kingsofgraff` — resolve the on-chain token via WAX `get_currency_stats`, verify its precision, and select it for future reward weeks. Changing the token resets amounts and disables reward drafting. Supports any valid WAX fungible-token issuer/symbol pair, without code edits.
2. `/tagamount 10 10000` — example values only: ten LFGK per eligible member, maximum 10,000 LFGK drafted in any week. This command **disables** further reward drafting until reviewed/re-enabled.
3. `/tagbonus 5 3 2` — optional top-three multipliers (defaults 5×, 3×, 2×); resets enabled state.
4. `/tagstatus` — show contract, token, base/weekly budget, multipliers and current draft status.
5. `/tagenable` / `/tagdisable` — switch configured reward drafting on/off. No on-chain transfers occur even when enabled.

All amounts are converted to **integer smallest-token units** using precision read from WAX; no floating-point on-chain quantities. Program configuration snapshots with each week's draft so a later change of token or quantity does not rewrite historical reward plans.

## Weekly rewards: what is and is not implemented

After an eligible week closes, the existing five-minute Worker cron can produce one idempotent **review-only** ledger draft for the preceding Monday–Sunday UTC week.

Every eligible active member receives the base allocation; the ranked top three receive their configured multipliers. If more than 1,000 members are eligible, or the required total would exceed the administrator's weekly budget, **no partial plan is created**. The system stops for admin review rather than silently excluding members or exceeding the ceiling.

The immutable draft captures the symbol, issuing contract, precision, user Telegram ID, rank, points, amount, and pending WAX account registration. It is explicitly marked `review_only`. No private key, transaction signing, transfer calls, token custody, claim link or automatic payment exists in this PR.

**A separate authorised payout release** is required to enable real tokens. Before that release, require: verified treasury WAX account, an action-limited signer with strict spending controls, wallet ownership challenges for recipients, on-chain balance/precision checks, per-batch approval, idempotent transaction IDs, failed-send reconciliation, eligibility review and explicit weekly budgeting. A bot token is not a WAX wallet signer.

## Deployment sequence (do not skip)

1. Review and merge the PR after CI and signed Telegram webhook/browser testing. **Do not deploy automatically from this PR.**
2. Check that migration `103_tag_run_street_cred_rewards.sql` is not already applied; use approved D1 migration runbook to apply to the production `wikicoms` binding once. Verify the expected tables/indexes through read-only D1 queries. Do **not** reset any live database or shared game tables.
3. Confirm `TELEGRAM_WEBHOOK_SECRET` matches the Telegram `setWebhook.secret_token` and the bot receives `message` updates. Telegram bots need group administrator status or group Privacy Mode disabled through BotFather to observe normal chat text. The bot must be in the intended supergroup and `TELEGRAM_GROUP_CHAT_ID` must exactly match it.
4. Deploy `moonboys-api` via the repository's provenance deployment wrapper, not direct unverified Wrangler.
5. Only after step 2–4, intentionally change `TAG_RUN_ENABLED` to `"true"` in the reviewed Worker release. It is `"false"` by default. Test scoring, anti-spam, retries and `/profile`, `/top`, `/rewards`, `/rain` against the real Telegram group.
6. Configure token and desired budget in an **admin DM**. The `TAG_RUN_WEEKLY_REWARDS_ENABLED` Worker switch remains **`"false"`** until an explicitly approved reward-drafting pilot. Enabling it produces only review drafts, never transfers.
7. Inspect the plan rows and pending WAX accounts before considering a separate on-chain payment PR.

## Privacy and security

- Only the configured Telegram group is scored, after the existing server-side Telegram webhook secret check.
- No client-supplied Telegram identity is accepted from the website; no website sync is required for Street Cred.
- User text is processed transiently. The message ledger stores **SHA-256 content hashes**, points, timestamps and a public Telegram display name, **not raw message bodies**.
- Wallet account names are public WAX identifiers but collected **only through private bot messages**.
- No custodial credentials or WAX private keys belong in source code, D1 records, logs, member messages or bot commands.
- Enabling recording should be announced to group members alongside the scoring and data-retention policy. A separate retention/privacy decision is required before live launch.

## Tests

`node --test scripts/tag-run-community-rewards.test.mjs`

This suite covers the rank thresholds, Monday UTC boundaries, eligibility, duplicate update and comment rejection, 45-second cooldown, daily 30-message cap, streak/reply bonus, private WAX account registration, admin guards, on-chain token precision parsing via a mocked WAX RPC, amount/budget parsing, weekly plan idempotency, review-only allocation and over-budget fail-closed behavior.

Full CI and signed Telegram production validation are not established by this PR alone.
