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

## Block Topia covert network

Phase 1 covert routes live under the same verified Telegram progression model:

- `POST /blocktopia/covert/create`
- `POST /blocktopia/covert/deploy`
- `POST /blocktopia/covert/extract`
- `GET /blocktopia/covert/state`

Each route verifies `telegram_auth`, scopes all reads and writes by the verified `telegram_id`, and rejects agent IDs or node IDs outside that user/canonical control grid. Infiltrator creation, deployment, and mid-operation extraction spend existing Block Topia gems. Due operations resolve during covert route access, write `blocktopia_progression_events` audit rows, and expose small node/district world-effect payloads for the existing Block Topia world layer.

Phase 2 extends the same route family without creating a parallel covert system:

- `POST /blocktopia/covert/create` accepts `agent_type` values `infiltrator`, `saboteur`, and `recruiter`.
- `POST /blocktopia/covert/revive` or `/recover` recovers captured agents for gems.
- `POST /blocktopia/covert/boost` buys a timed stealth boost and lowers current heat.
- `POST /blocktopia/covert/retask` or `/reroll` safely moves an active operation to another canonical node for gems.

Heat is stored per agent, rises from deployments, retasks, failures, captures, and higher-risk agent types, decays while idle/exposed, and feeds server-side success, exposure, and capture rolls. Operation rows store bounded world-pressure deltas so saboteur success can push node interference, recruiter success can add district support, and failures/captures can mark local risk without rewriting district, war, SAM, faction, score, leaderboard, or duel systems.
