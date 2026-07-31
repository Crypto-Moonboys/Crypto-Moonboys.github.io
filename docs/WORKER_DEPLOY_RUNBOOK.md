# Worker Deploy Runbook

> **Always** consult `docs/WORKER_DEPLOY_TRUTH_MAP.md` and `workers/DEPLOY_STATUS.json` before deploying.
> Run `node scripts/worker-deploy-readiness-audit.mjs` to confirm readiness.

## Rule 1 — Only deploy Workers marked `live-deployable`

Workers with status `stub-blocked` in `DEPLOY_STATUS.json` **must not be deployed**.
Their `wrangler.toml` files contain placeholder KV namespace IDs (`YOUR_*_KV_ID`).
Wrangler may accept a direct command, but the Worker will fail at runtime when it tries to access a namespace that does not exist.

## Rule 2 — Use the provenance wrapper for tracked production Workers

Do not run a direct Wrangler production deploy for `moonboys-api`, `moonboys-leaderboard`, or `moonboys-anti-cheat`.

The approved wrapper:

- requires branch `main`;
- requires a clean working tree;
- refreshes `origin/main` immediately before approval;
- requires local `HEAD` to equal the freshly fetched remote commit;
- tags the Cloudflare Worker Version with the full repository commit.

An untagged direct deployment causes `/deployment-info` to fail closed with HTTP 503 and cannot be accepted as production evidence.

## Rule 3 — No VPS restart needed for Worker-only PRs

Cloudflare Workers are deployed independently of the Block Topia server (VPS/Node.js).
A Worker-only PR merge does **not** require a VPS restart unless server-side code under `server/block-topia/` also changed.

## Live-deployable Workers

Run approved production commands from the repository root.

### moonboys-api

```sh
node scripts/deploy-worker-with-provenance.mjs moonboys-api
```

Required secrets:

```sh
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_BOT_USERNAME
wrangler secret put ADMIN_TELEGRAM_IDS
wrangler secret put ADMIN_SECRET
wrangler secret put TELEGRAM_GROUP_CHAT_ID
wrangler secret put SWARMSY_BRIDGE_TOKEN
```

### moonboys-anti-cheat

```sh
node scripts/deploy-worker-with-provenance.mjs anti-cheat
```

Required secrets:

```sh
wrangler secret put ADMIN_SECRET
```

`ADMIN_SECRET` must match the value set in `moonboys-api`.

### moonboys-leaderboard

```sh
node scripts/deploy-worker-with-provenance.mjs leaderboard
```

Required secrets:

```sh
wrangler secret put TELEGRAM_BOT_TOKEN
```

The `LEADERBOARD` KV namespace ID must remain in sync with `workers/anti-cheat`.
Both Workers must reference `a621c334d9ac439ebaf5f35dd31dddd5`.

## Blocked Workers — do not deploy

| Worker folder | Reason |
|---|---|
| `workers/blocktopia-leaderboard` | Placeholder KV IDs: YOUR_DISTRICTS_KV_ID, YOUR_SEASONS_KV_ID, YOUR_CACHE_KV_ID |
| `workers/blocktopia-engagement` | Placeholder KV IDs: YOUR_COMMUNITY_FEED_KV_ID, YOUR_CACHE_KV_ID |
| `workers/blocktopia-district` | Placeholder KV IDs: YOUR_DISTRICTS_KV_ID, YOUR_NPC_MEMORY_KV_ID, YOUR_SEASONS_KV_ID, YOUR_CACHE_KV_ID |
| `workers/blocktopia-realtime` | Placeholder KV IDs: YOUR_COMMUNITY_FEED_KV_ID, YOUR_CACHE_KV_ID |

Do not deploy these Workers until their namespaces are provisioned and their configuration and deployment process are reviewed.

## Needs-setup Workers

| Worker folder | What to confirm before deploying |
|---|---|
| `workers/block-topia` | Confirm R2 bucket `crypto-moonboys-rpg-memory` exists in the live Cloudflare account and approve a deployment process |

## Pre-deploy checklist

Before running an approved production deployment:

- [ ] `node scripts/worker-deploy-readiness-audit.mjs` passes with no failures
- [ ] `npm test` passes
- [ ] Worker is listed as `"deploy": true` in `workers/DEPLOY_STATUS.json`
- [ ] All required secrets are set in Cloudflare
- [ ] D1/KV IDs in `wrangler.toml` match the live Cloudflare account
- [ ] Local branch is `main` with a clean working tree
- [ ] The provenance wrapper successfully refreshes and matches `origin/main`

## After deployment

1. Run the **Live Worker Provenance Verify** workflow with the deployed full commit SHA.
2. Confirm all three tracked `/deployment-info` endpoints report the expected repository commit.
3. Retain the successful workflow-run URL.
4. Update `deployments/production.json` through a reviewed evidence PR.

## Updating the truth map after provisioning bindings

When a new binding is provisioned:

1. Update `wrangler.toml` with real IDs.
2. Update `workers/DEPLOY_STATUS.json`.
3. Add or approve a provenance-capable deployment command before setting `deploy: true`.
4. Update `docs/WORKER_DEPLOY_TRUTH_MAP.md`.
5. Run `node scripts/worker-deploy-readiness-audit.mjs`.
6. Run `npm test`.
