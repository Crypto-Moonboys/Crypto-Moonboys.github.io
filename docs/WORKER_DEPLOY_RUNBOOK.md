# Worker Deploy Runbook

> **Always** consult `docs/WORKER_DEPLOY_TRUTH_MAP.md` and `workers/DEPLOY_STATUS.json` before deploying.
> Run `node scripts/worker-deploy-readiness-audit.mjs` to confirm readiness.

## Rule 1 — Only deploy Workers marked `live-deployable`

Workers with status `stub-blocked` in `DEPLOY_STATUS.json` **must not be deployed**.
Their `wrangler.toml` files contain placeholder KV namespace IDs (`YOUR_*_KV_ID`).
Wrangler will accept the deploy command without error, but the Worker will fail at runtime
when it tries to access a KV namespace that does not exist.

**This wastes time, causes confusion, and does not change anything in Cloudflare.**

## Rule 2 — No VPS restart needed for Worker-only PRs

Cloudflare Workers are deployed independently of the Block Topia server (VPS/Node.js).
A Worker-only PR merge does **not** require a VPS restart unless server-side code
(`server/block-topia/`) was also changed.

## Currently live Workers

### moonboys-api

```
cd workers/moonboys-api && npx wrangler deploy
```

Required secrets (must be set in Cloudflare Workers dashboard or via CLI before first deploy):

```
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_BOT_USERNAME
wrangler secret put ADMIN_TELEGRAM_IDS
wrangler secret put ADMIN_SECRET
wrangler secret put TELEGRAM_GROUP_CHAT_ID
```

### moonboys-anti-cheat

```
cd workers/anti-cheat && npx wrangler deploy
```

Required secrets:

```
wrangler secret put ADMIN_SECRET
```

> ⚠️ `ADMIN_SECRET` must match the value set in `moonboys-api`.

### moonboys-leaderboard

```
cd workers/leaderboard && npx wrangler deploy
```

Required secrets:

```
wrangler secret put TELEGRAM_BOT_TOKEN
```

> ⚠️ The `LEADERBOARD` KV namespace ID must remain in sync with `workers/anti-cheat`.
> Both workers must reference `a621c334d9ac439ebaf5f35dd31dddd5`.
> Verify both `wrangler.toml` files before deploying either Worker.

## Blocked Workers — do not deploy

| Worker folder | Reason |
|---|---|
| `workers/blocktopia-leaderboard` | Placeholder KV IDs: YOUR_DISTRICTS_KV_ID, YOUR_SEASONS_KV_ID, YOUR_CACHE_KV_ID |
| `workers/blocktopia-engagement` | Placeholder KV IDs: YOUR_COMMUNITY_FEED_KV_ID, YOUR_CACHE_KV_ID |
| `workers/blocktopia-district` | Placeholder KV IDs: YOUR_DISTRICTS_KV_ID, YOUR_NPC_MEMORY_KV_ID, YOUR_SEASONS_KV_ID, YOUR_CACHE_KV_ID |
| `workers/blocktopia-realtime` | Placeholder KV IDs: YOUR_COMMUNITY_FEED_KV_ID, YOUR_CACHE_KV_ID |

Attempting to deploy these Workers will not cause a Wrangler error, but the resulting
deployed Worker will fail at runtime. Do not deploy them until their KV namespaces
have been provisioned and their `wrangler.toml` IDs have been replaced.

## Needs-setup Workers

| Worker folder | What to confirm before deploying |
|---|---|
| `workers/block-topia` | Confirm R2 bucket `crypto-moonboys-rpg-memory` exists in the live Cloudflare account |

## Pre-deploy checklist

Before running any `wrangler deploy`:

- [ ] `node scripts/worker-deploy-readiness-audit.mjs` passes with no failures
- [ ] `npm test` passes
- [ ] Worker is listed as `"deploy": true` in `workers/DEPLOY_STATUS.json`
- [ ] All required secrets are set in Cloudflare via `wrangler secret put`
- [ ] D1/KV IDs in `wrangler.toml` match the live Cloudflare account

## Updating the truth map after provisioning bindings

When you provision a new KV namespace and replace `YOUR_*_KV_ID` placeholders:

1. Update `wrangler.toml` with real IDs.
2. Update `workers/DEPLOY_STATUS.json`: set `"status": "live-deployable"`, `"deploy": true`, remove `"reason"`.
3. Update the table in `docs/WORKER_DEPLOY_TRUTH_MAP.md`.
4. Run `node scripts/worker-deploy-readiness-audit.mjs` — should now show the Worker as deployable.
5. Run `npm test` — must pass.
