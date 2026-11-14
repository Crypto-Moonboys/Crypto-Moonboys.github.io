# Diagnose Moonboys Telegram group-membership 503 (14 November 2026)

**Status:** Diagnostic-only change. No token changes, no group-ID changes, no reward/game logic changes, no automatic deployment. Keep the Pages preflight **fail-closed**.

## Confirmed incident

- GitHub Pages push run [43617577974](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/actions/runs/43617577974), both attempts, failed at **Verify NBG Telegram group gate API before Pages rollout**. The earlier NBG course check passed; artifact preparation and deployment were skipped.
- `GET https://api.cryptomoonboys.com/telegram/group-membership` with the allowed `Origin: https://cryptomoonboys.com` returned HTTP 503 and `{"ok":false,"error":"telegram_group_membership_unavailable","bot_username":null}`. The bot owner reports the locally tested BotFather token works and WIKICOMSBOT remains an administrator.
- Cloudflare lists a `moonboys-api` deployment tagged from Git commit `3745a5d2d7d6` (13 Nov 2026). The latest GitHub `main` is newer, but the deployed revision already contains the same `telegram-group-membership.js` and `worker-phase5-final.js` Git blobs. A deployment timestamp mismatch by itself does not establish the cause.
- The old handler mapped a `fetch` failure, bot API 400/401/403/429/5xx, invalid JSON and missing Telegram `result` to a single generic 503. Its separate `getMe` function silently returned null, making `bot_username:null` ambiguous.
- The live Worker still has the D1 binding and secret **names** `TELEGRAM_BOT_TOKEN` and `TELEGRAM_GROUP_CHAT_ID`. Cloudflare cannot disclose the secret **values** through this diagnosis; correct binding names do not prove secret validity.

## What this PR changes

1. The existing GET readiness probe now returns a strictly bounded `diagnostic` object **only when the Telegram group lookup fails**. The existing `ok:false`, generic `error`, 503 status and `bot_username` fields are unchanged.
2. The two checks are classified independently:
   - `diagnostic.membership` — `getChatMember` for the **bot itself**, against the configured group.
   - `diagnostic.bot_identity` — `getMe` for the same bot token.
3. The authenticated POST membership API retains its original generic 503 response. Only a safe category is recorded in Worker logs on failure. No user IDs, group IDs, Telegram descriptions or tokens are logged.
4. The Pages verifier still requires **HTTP 200** and the identical full readiness contract: `ok=true`, `configured=true`, `bot_admin=true`, `native_init_data=true`, `all_games_gate_version>=1` and `group=@gkniftyheads`. On failure its CI message adds a **validated, allowlisted** status/category summary. Unknown/untrusted response text is never interpolated into Actions logs.
5. The handler does not make additional Telegram API calls. It reuses the existing two GET requests and the POST lookup already executed by production.

## Interpreting categories

| Category | Meaning and next investigation |
| --- | --- |
| `bot_token_rejected` | Telegram returned 401. Check whether the **Cloudflare secret value** matches the valid BotFather token; do not paste the token into logs or PRs |
| `group_lookup_rejected` | Telegram returned a recognizable 400 invalid/missing-chat error. Verify the configured `TELEGRAM_GROUP_CHAT_ID` and group membership without exposing IDs |
| `member_lookup_rejected` | Telegram rejected the member ID (usually 400). Check scope and server attribution; never grant membership on rejection |
| `telegram_forbidden` | Telegram 403. Check bot rights, group restrictions or API authorization |
| `telegram_rate_limited` | Telegram 429. Inspect request volume and Telegram retry limits; don't bypass the preflight |
| `telegram_service_unavailable` | Telegram upstream 5xx |
| `transport_timeout` | Worker fetch timeout/abort; investigate outbound connectivity and Telegram latency |
| `transport_unavailable` | Worker fetch threw a non-timeout network/transport exception. Investigate Worker-to-Telegram egress, DNS/TLS, rate limiting or transient network failures |
| `telegram_bad_request`, `telegram_http_failure` | Upstream HTTP rejection without a uniquely identifiable group/member error |
| `telegram_response_invalid`, `telegram_result_missing` | Telegram did not supply a valid expected JSON success/result |
| `ok` | That one upstream call succeeded; it does **not** override any separate failure |

If **both** `membership` and `bot_identity` are `transport_unavailable` or `transport_timeout`, a **shared Worker-to-Telegram network issue** is a more likely explanation than a bad chat ID. If `bot_identity=ok` and `membership=group_lookup_rejected`, investigate the group lookup/configuration. If both are `bot_token_rejected`, compare the Worker token with BotFather securely.

No public endpoint exposes an upstream URL containing the bot token or raw Telegram `description`. The code maps descriptions only through local allowlisted regexes.

## Tests and controlled release

Run on this PR branch:

```bat
node --test scripts/nbg-telegram-group-membership.test.mjs
node --test scripts/verify-nbg-group-gate-worker.test.mjs
npm run seo:test
```

This PR requires code review before merge. The only way for the new diagnostic fields to appear in a **live** 503 response is for the updated `moonboys-api` Worker to be deployed in a separately approved, provenance-pinned release. Updating GitHub Pages **alone** will not update the Worker.

After an approved Worker release, check the public readiness endpoint without secrets:

```bat
curl.exe -i --max-time 15 -H "Origin: https://cryptomoonboys.com" -H "Accept: application/json" "https://api.cryptomoonboys.com/telegram/group-membership"
```

A failed HTTP 503 response will now have a small field like:

```json
{"ok":false,"error":"telegram_group_membership_unavailable","bot_username":null,
 "diagnostic":{"membership":"transport_unavailable","bot_identity":"transport_unavailable"}}
```

*This is illustrative, not a claim that the live failure is a network error.* Inspect the **actual** categories before changing secrets or routing. The deploy must remain blocked until Telegram verifies both configuration and bot administrator status.

**Production release safety:** `scripts/deploy-worker-with-provenance.mjs moonboys-api` deploys the entire `moonboys-api` Worker and all current main-branch runtime flags. Because the Worker also handles Moonpet, Telegram, Tag Run and token reward features, **do not run that command automatically** as part of this diagnostic PR. Obtain separate production release approval and review existing secret/migration prerequisites first.

No D1 migration, payout flag changes, game behavior modifications, credentials, membership bypasses or live Worker deployment are included here.
