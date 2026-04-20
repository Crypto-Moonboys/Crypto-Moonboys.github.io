# Moonboys API Worker

This worker owns Telegram identity/community routes and the Block Topia progression endpoints.

## D1 deployment

The committed `wrangler.toml` contains the live `wikicoms` D1 binding used by the deployed Moonboys workers.

Before deploying to production:

1. Apply pending D1 migrations before deploying Worker code that depends on them.
2. Deploy the worker with the committed `DB` binding intact.

```sh
wrangler d1 migrations apply wikicoms --remote
wrangler deploy
```

## Block Topia progression

Block Topia progression schema is owned by migrations in `migrations/`.

The worker must not create or alter progression tables during player requests. If a progression route returns a schema error, apply the migrations instead of adding request-time schema patches.

`POST /blocktopia/progression` is the current frontend read path because it keeps the signed Telegram auth payload out of the URL. `GET /blocktopia/progression?telegram_auth=...` remains only as a compatibility fallback for old clients and logs `legacy_get_auth_query_used` when used.
