# Moonboys API Worker

This Worker owns the live Telegram, Arcade XP, faction and Block Topia progression routes.

## Production deploy

Run from the repository root on a clean, updated `main` checkout:

```sh
npm ci
node scripts/worker-deploy-readiness-audit.mjs
node scripts/deploy-worker-with-provenance.mjs moonboys-api
```

Do not bypass the provenance wrapper with a direct Wrangler production deploy. The wrapper refreshes `origin/main`, requires local `HEAD` to match it, and tags the Cloudflare Worker Version with the full repository commit used by `/deployment-info`.

## D1 migrations

Do not apply D1 migrations as part of an ordinary Worker deployment. Inspect the production migration state separately, apply only reviewed missing migrations, and retain evidence in `deployments/production.json`.

## Live route groups

- `GET /health`
- `GET /deployment-info`
- Telegram auth/link/profile/activity/status routes
- `POST /arcade/progression/sync`
- faction status/join/earn routes
- `POST /blocktopia/progression`
- `POST /blocktopia/progression/entry`
- `POST /blocktopia/progression/upgrade`
- `POST /blocktopia/progression/mini-game`
- `POST /blocktopia/progression/reset`

## Runtime rule

Keep this Worker aligned with live routes only. Remove disabled, archived or compatibility-only route families instead of documenting them.
