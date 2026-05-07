# Moonboys API Worker

This worker owns the live Telegram, Arcade XP, faction, and Block Topia progression routes.

## Deploy

```sh
npm ci
npx wrangler d1 migrations apply wikicoms --remote --config workers/moonboys-api/wrangler.toml
npx wrangler deploy --config workers/moonboys-api/wrangler.toml
```

## Live route groups

- `GET /health`
- Telegram auth/link/profile/activity/status routes
- `POST /arcade/progression/sync`
- faction status/join/earn routes
- `POST /blocktopia/progression`
- `POST /blocktopia/progression/entry`
- `POST /blocktopia/progression/upgrade`
- `POST /blocktopia/progression/mini-game`
- `POST /blocktopia/progression/reset`

## Runtime rule

Keep this worker aligned with live routes only. Remove disabled, archived, or compatibility-only route families instead of documenting them.
