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

## Production fix

```sh
npx wrangler d1 execute wikicoms --file=workers/moonboys-api/migrations/012_wikicoms_schema_fix.sql --remote
npx wrangler deploy
```

## Block Topia progression

Block Topia progression schema is owned by migrations in `migrations/`.

The worker must not create or alter progression tables during player requests. If a progression route returns a schema error, apply the migrations instead of adding request-time schema patches.

`POST /blocktopia/progression` is the current frontend read path because it keeps the signed Telegram auth payload out of the URL. `GET /blocktopia/progression?telegram_auth=...` remains only as a compatibility fallback for old clients and logs `legacy_get_auth_query_used` when used.

## Block Topia covert network

The legacy covert route family is intentionally disabled inside the Cloudflare Worker runtime to keep deploy bundles self-contained and free of frontend `/games/` imports.

- `GET /blocktopia/covert` and `POST /blocktopia/covert` return `503` with `covert_worker_disabled`.
- Other `/blocktopia/covert*` paths return `404`.

This does not affect `/health`, `/sam/status`, Telegram routes, `/arcade/progression/sync`, or `/blocktopia/progression*`.

## Arcade progression sync idempotency

`POST /arcade/progression/sync` now uses server-side run claiming for `(telegram_id, client_run_id)` before awarding XP.

- First request claims the run and is the only request allowed to award XP.
- Duplicate/retry requests return `status: "duplicate"` with `xp_awarded: 0`.
- Schema for arcade sync tables is migration-owned (`014_shared_arcade_progression_sync.sql`), and runtime now requires tables to exist instead of creating fallback tables on live traffic.

Manual duplicate validation flow:

1. Submit the same signed `/arcade/progression/sync` payload twice with identical `client_run_id`.
2. First response should include `status: "accepted"` (or `rejected` by policy) and at most one XP award for that run.
3. Second response must include `status: "duplicate"` and `xp_awarded: 0`.
4. Confirm no additional XP delta on the second submission.

Historical Phase 1/2/3 covert notes (for reference only):

Phase 1 covert routes lived under the same verified Telegram progression model:

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

Phase 3 adds the first system-response layer without introducing SAM sweeps, district lockdowns, or a separate covert engine:

- `blocktopia_progression.network_heat` now persists player-level covert pressure, decays slowly, and is derived from active agents, agent heat, failures, sabotage tempo, repeated targeting, and exposed/captured states.
- `GET /blocktopia/covert/state` now returns structured `network_heat`, `sam_awareness`, `local_node_risk`, `district_instability_signals`, and `agent_risk_indicators` payloads for the frontend.
- Captured agents now use real-time `captured_until` cooldowns that scale with agent heat, network heat, and repeat captures.
- `POST /blocktopia/covert/reduce-heat`, `POST /blocktopia/covert/recovery-boost`, and `POST /blocktopia/covert/emergency-extract` provide limited gem-based pressure relief while keeping every action auditable through `blocktopia_progression_events`.
