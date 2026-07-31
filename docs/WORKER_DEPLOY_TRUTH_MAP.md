# Worker Deploy Truth Map

> **Machine-readable source of truth:** `workers/DEPLOY_STATUS.json`
>
> **Guard script:** `node scripts/worker-deploy-readiness-audit.mjs`
>
> This document is the human-readable companion to `DEPLOY_STATUS.json`.
> Keep both in sync when bindings are provisioned and a Worker changes readiness state.

## Status legend

| Status | Meaning |
|---|---|
| `live-deployable` | Bindings and required secret names are configured. Use only the approved deployment command recorded below. |
| `needs-binding-setup` | No placeholder IDs, but one or more bindings or deployment requirements still need confirmation. |
| `stub-blocked` | Contains placeholder namespace IDs. **Do not deploy.** |

## Worker status table

| Worker | Folder | Status | Required bindings | Required secrets | Approved production command | Deploy now? | Notes |
|---|---|---|---|---|---|---|---|
| moonboys-api | `workers/moonboys-api` | ✅ `live-deployable` | D1: wikicoms | TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, ADMIN_TELEGRAM_IDS, ADMIN_SECRET, TELEGRAM_GROUP_CHAT_ID, SWARMSY_BRIDGE_TOKEN | `node scripts/deploy-worker-with-provenance.mjs moonboys-api` | Yes | Production API. The wrapper refreshes `origin/main` and tags the Worker Version with the repository commit. |
| moonboys-anti-cheat | `workers/anti-cheat` | ✅ `live-deployable` | KV: LEADERBOARD, D1: wikicoms | ADMIN_SECRET | `node scripts/deploy-worker-with-provenance.mjs anti-cheat` | Yes | ADMIN_SECRET must match moonboys-api. KV ID must stay aligned with leaderboard. |
| moonboys-leaderboard | `workers/leaderboard` | ✅ `live-deployable` | KV: LEADERBOARD, D1: wikicoms | TELEGRAM_BOT_TOKEN | `node scripts/deploy-worker-with-provenance.mjs leaderboard` | Yes | Shares the LEADERBOARD namespace with anti-cheat. |
| block-topia-score | `workers/block-topia` | ⚠️ `needs-binding-setup` | R2: R2_BUCKET | — | Not approved | No | Confirm the live R2 bucket and approve a provenance-capable deployment process first. |
| blocktopia-leaderboard | `workers/blocktopia-leaderboard` | 🚫 `stub-blocked` | KV: DISTRICTS, SEASONS, CACHE | ADMIN_SECRET, TELEGRAM_BOT_TOKEN | Blocked — no command | **No** | Placeholder KV IDs remain. |
| blocktopia-engagement | `workers/blocktopia-engagement` | 🚫 `stub-blocked` | KV: COMMUNITY_FEED, CACHE | ADMIN_SECRET | Blocked — no command | **No** | Placeholder KV IDs remain. |
| blocktopia-district | `workers/blocktopia-district` | 🚫 `stub-blocked` | KV: DISTRICTS, NPC_MEMORY, SEASONS, CACHE | ADMIN_SECRET | Blocked — no command | **No** | Placeholder KV IDs remain. |
| blocktopia-realtime | `workers/blocktopia-realtime` | 🚫 `stub-blocked` | KV: COMMUNITY_FEED, CACHE | ADMIN_SECRET | Blocked — no command | **No** | Placeholder KV IDs remain. |

## Production deployment rule

The three tracked live-deployable Workers must not be deployed through a direct Wrangler command. Their approved wrapper:

1. requires a clean local `main` checkout;
2. fetches the current remote `main` immediately before deployment;
3. requires local `HEAD` to equal that freshly fetched commit;
4. tags the Worker Version with the full repository commit;
5. enables `/deployment-info` to provide verifiable evidence.

## How to unblock a Worker

1. Provision and verify all required bindings.
2. Replace placeholder IDs in `wrangler.toml`.
3. Set required secrets without committing values.
4. Add a provenance-capable deployment entrypoint and approved wrapper command.
5. Update `workers/DEPLOY_STATUS.json`.
6. Update this table.
7. Run `node scripts/worker-deploy-readiness-audit.mjs`.
8. Run `npm test`.

## CI guards

The readiness and provenance checks fail when:

- a live-deployable Worker contains placeholder bindings;
- a tracked Worker does not use the provenance entrypoint;
- an approved deploy command bypasses the provenance wrapper;
- authoritative production documentation reintroduces a direct deploy command;
- the production manifest makes an unsupported `verified-live` claim.
