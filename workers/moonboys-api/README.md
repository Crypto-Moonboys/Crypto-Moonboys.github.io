# Moonboys API Worker

This worker owns Telegram identity/community routes and the Block Topia progression endpoints.

## D1 deployment

The committed `wrangler.toml` deliberately uses a zero UUID for the `DB` binding so the live production D1 database ID is not stored in git.

Before deploying to production:

1. Create an uncommitted Wrangler config from `wrangler.toml` or generate one in CI.
2. Replace the production `database_id` with the real `wikicoms` D1 UUID from a secret store.
3. Apply pending D1 migrations before deploying Worker code that depends on them:

```sh
wrangler d1 migrations apply wikicoms --remote --env production
wrangler deploy --env production
```

Do not reintroduce the live D1 UUID into committed files.

## Block Topia progression

Block Topia progression schema is owned by migrations in `migrations/`.

The worker must not create or alter progression tables during player requests. If a progression route returns a schema error, apply the migrations instead of adding request-time schema patches.

`POST /blocktopia/progression` is the current frontend read path because it keeps the signed Telegram auth payload out of the URL. `GET /blocktopia/progression?telegram_auth=...` remains only as a compatibility fallback for old clients and logs `legacy_get_auth_query_used` when used.
