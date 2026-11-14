# Telegram Worker outbound connectivity probe — 14 November 2026

## Why this exists

Production `GET /telegram/group-membership` returns HTTP 503 with both `diagnostic.membership=transport_timeout` and `diagnostic.bot_identity=transport_timeout`. The two calls use the same Telegram hostname and five-second timeout, so the error does not establish whether the problem is Telegram-specific connectivity, broader Worker outbound networking or slow authenticated Bot API responses.

## What the new route does

`GET https://api.cryptomoonboys.com/telegram/connectivity` with `Origin: https://cryptomoonboys.com` makes **two fixed, tokenless, GET requests**:

- `telegram_public`: `https://api.telegram.org/`
- `external_control`: `https://example.com/`

It uses a 6.5-second timeout per request and does not follow redirects. Any HTTP response (including 301/403/404) proves that the Worker reached an HTTP server; it does **not** prove the Bot API accepts authentication or that membership is valid.

It returns only `outcome` (`http_response`, `timeout` or `network_error`), a coarse HTTP status class and bounded duration. No response body, Telegram token, user ID, group ID, raw exception, arbitrary URL or request input is returned or logged. The route is GET-only and requires the same allowed website Origin as the existing public readiness route. Note: Origin alone is not authentication, so the route should be kept temporary and monitored for request abuse.

**No automatic fallback to a different Telegram endpoint, no relaxed gate, no token rotation and no change to Telegram membership semantics.** The diagnostic result always includes `membership_verified:false` and is not used by the Pages rollout gate.

## Interpretation

| Telegram public | Control | Interpretation |
| --- | --- | --- |
| `timeout` / `network_error` | `http_response` | Telegram-specific outbound routing, connectivity or latency is likely |
| `timeout` / `network_error` | `timeout` / `network_error` | Broader Worker outbound connectivity or transient network problem is possible |
| `http_response` | `http_response` | General connectivity works; investigate authenticated Bot API path, request timeout and Telegram endpoint behavior |
| `http_response` | `timeout` | Control failure alone does not establish Telegram failure |

A successful public Telegram request is **not** sufficient to clear the original 503. The readiness endpoint must still return `200` and `bot_admin:true`.

## Tests

```bat
node --test scripts/telegram-egress-connectivity.test.mjs
node --test scripts/nbg-telegram-group-membership.test.mjs
node --test scripts/verify-nbg-group-gate-worker.test.mjs
npm run ci:worker-api
```

After review, merge and **separately approved** `moonboys-api` deployment, run:

```bat
curl.exe -i -sS --max-time 25 -H "Origin: https://cryptomoonboys.com" -H "Accept: application/json" "https://api.cryptomoonboys.com/telegram/connectivity"
```

The route's result distinguishes outbound transport behavior but cannot identify Telegram's internal reasons for refusing or delaying a request. Compare it with the unchanged membership readiness endpoint.

## Deployment boundaries

The existing `node scripts/deploy-worker-with-provenance.mjs moonboys-api` deploys the **entire Worker**, including unrelated Moonpet, Telegram and reward features. Do not automatically deploy as part of this PR. Verify the checkout and production safeguards first. Do not merge the unrelated Moonpet draft PR or change any production reward flags.
