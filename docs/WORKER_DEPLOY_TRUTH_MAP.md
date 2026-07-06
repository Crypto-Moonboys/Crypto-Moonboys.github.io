# Worker Deploy Truth Map

> **Machine-readable source of truth:** `workers/DEPLOY_STATUS.json`
>
> **Guard script:** `node scripts/worker-deploy-readiness-audit.mjs`
>
> This document is the human-readable companion to `DEPLOY_STATUS.json`.
> Keep both in sync when KV bindings are provisioned and a Worker moves from `stub-blocked` to `live-deployable`.

## Status legend

| Status | Meaning |
|---|---|
| `live-deployable` | All bindings and secrets are configured. Safe to run `npx wrangler deploy`. |
| `needs-binding-setup` | No placeholder IDs, but one or more bindings need to be verified or confirmed against the live Cloudflare account before a first deploy. |
| `stub-blocked` | Contains `YOUR_*` placeholder KV namespace IDs. **Do not deploy.** Wrangler will accept the deploy command but the Worker will fail at runtime. |

## Worker status table

| Worker | Folder | Status | Required bindings | Required secrets | Safe deploy command | Deploy now? | Notes |
|---|---|---|---|---|---|---|---|
| moonboys-api | `workers/moonboys-api` | ✅ `live-deployable` | D1: wikicoms | TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, ADMIN_TELEGRAM_IDS, ADMIN_SECRET, TELEGRAM_GROUP_CHAT_ID, SWARMSY_BRIDGE_TOKEN | `cd workers/moonboys-api && npx wrangler deploy` | Yes | Production API. Telegram bot webhooks, admin grant routes, D1-backed user state, Sparky NPC chat bridge. |
| moonboys-anti-cheat | `workers/anti-cheat` | ✅ `live-deployable` | KV: LEADERBOARD (shared with leaderboard worker), D1: wikicoms | ADMIN_SECRET | `cd workers/anti-cheat && npx wrangler deploy` | Yes | ADMIN_SECRET must match moonboys-api. KV ID must stay in sync with workers/leaderboard. |
| moonboys-leaderboard | `workers/leaderboard` | ✅ `live-deployable` | KV: LEADERBOARD (shared with anti-cheat worker), D1: wikicoms | TELEGRAM_BOT_TOKEN | `cd workers/leaderboard && npx wrangler deploy` | Yes | Shares LEADERBOARD KV namespace with anti-cheat. Both must reference the same KV ID. |
| block-topia-score | `workers/block-topia` | ⚠️ `needs-binding-setup` | R2: R2_BUCKET (bucket_name must be confirmed) | — | `cd workers/block-topia && npx wrangler deploy` | No | No placeholder IDs present. Confirm R2 bucket_name against live Cloudflare account before first deploy. |
| blocktopia-leaderboard | `workers/blocktopia-leaderboard` | 🚫 `stub-blocked` | KV: DISTRICTS, SEASONS, CACHE | ADMIN_SECRET, TELEGRAM_BOT_TOKEN | `cd workers/blocktopia-leaderboard && npx wrangler deploy` | **No** | Placeholder KV IDs: YOUR_DISTRICTS_KV_ID, YOUR_SEASONS_KV_ID, YOUR_CACHE_KV_ID. |
| blocktopia-engagement | `workers/blocktopia-engagement` | 🚫 `stub-blocked` | KV: COMMUNITY_FEED, CACHE | ADMIN_SECRET | `cd workers/blocktopia-engagement && npx wrangler deploy` | **No** | Placeholder KV IDs: YOUR_COMMUNITY_FEED_KV_ID, YOUR_CACHE_KV_ID. |
| blocktopia-district | `workers/blocktopia-district` | 🚫 `stub-blocked` | KV: DISTRICTS, NPC_MEMORY, SEASONS, CACHE | ADMIN_SECRET | `cd workers/blocktopia-district && npx wrangler deploy` | **No** | Placeholder KV IDs: YOUR_DISTRICTS_KV_ID, YOUR_NPC_MEMORY_KV_ID, YOUR_SEASONS_KV_ID, YOUR_CACHE_KV_ID. |
| blocktopia-realtime | `workers/blocktopia-realtime` | 🚫 `stub-blocked` | KV: COMMUNITY_FEED, CACHE | ADMIN_SECRET | `cd workers/blocktopia-realtime && npx wrangler deploy` | **No** | Placeholder KV IDs: YOUR_COMMUNITY_FEED_KV_ID, YOUR_CACHE_KV_ID. |

## How to unblock a stub Worker

1. Create the required KV namespaces:
   ```
   wrangler kv:namespace create <BINDING_NAME>
   ```
   Note the returned namespace ID.

2. Replace each `YOUR_*_KV_ID` in the Worker's `wrangler.toml` with the real namespace ID (both `id` and `preview_id` fields).

3. Set required secrets:
   ```
   wrangler secret put ADMIN_SECRET
   ```

4. Update `workers/DEPLOY_STATUS.json`: change `"status"` to `"live-deployable"`, `"deploy"` to `true`, and remove the `"reason"` field.

5. Update the table in this file accordingly.

6. Run `node scripts/worker-deploy-readiness-audit.mjs` to confirm the Worker passes the readiness check.

7. Run `npm test` to confirm no drift.

## CI guard

`scripts/worker-deploy-readiness-audit.mjs` is wired into `npm test`. It will:

- Fail if any Worker listed as `live-deployable` in `DEPLOY_STATUS.json` still contains `YOUR_*` placeholder KV IDs.
- Pass (with a clear BLOCKED notice) for Workers marked `stub-blocked`.
- Print a full summary of deployable, blocked, and missing-binding Workers.
