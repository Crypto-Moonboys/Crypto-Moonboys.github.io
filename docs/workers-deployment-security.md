# Workers deployment security notes

This repo commits only **safe defaults** for Workers. Environment-specific IDs and secret values must be configured outside source control.

## Never commit

- Real D1 `database_id` values
- Real KV `id` / `preview_id` values
- R2 bucket names used in production
- Secret values (bot tokens, admin secrets, API keys)

## Per-environment config required (`dev`, `staging`, `production`)

Configure these in each worker `wrangler.toml` under `[env.<name>]`:

- `workers/moonboys-api/wrangler.toml`
  - `[[env.<name>.d1_databases]]` for `DB`
- `workers/leaderboard/wrangler.toml`
  - `[[env.<name>.kv_namespaces]]` for `LEADERBOARD`
  - `[[env.<name>.d1_databases]]` for `DB`
- `workers/anti-cheat/wrangler.toml`
  - `[[env.<name>.kv_namespaces]]` for `LEADERBOARD`
  - `[[env.<name>.d1_databases]]` for `DB`
- `workers/block-topia/wrangler.toml`
  - `[[env.<name>.r2_buckets]]` for `R2_BUCKET`

## Required secrets (Wrangler secret store)

Set with `wrangler secret put <NAME>` in each deployed environment:

- `workers/moonboys-api`
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_BOT_USERNAME`
  - `ADMIN_TELEGRAM_IDS`
  - `ADMIN_SECRET`
  - `ANTI_CHEAT_WORKER_URL`
- `workers/anti-cheat`
  - `ADMIN_SECRET`
- `workers/blocktopia-district`
  - `ADMIN_SECRET`

## Quick deploy checklist

1. Populate all `[env.<name>]` binding IDs/names for target environment.
2. Set required secrets through Wrangler (never in git).
3. Run `wrangler deploy --env <name>`.
