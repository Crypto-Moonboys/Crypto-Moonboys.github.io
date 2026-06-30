# Daily Loop Smoke Checks

## What It Is

The UTC Daily Loop authority is the Worker-owned `/daily-loop/state` contract. It is the shared source for the website singleton, right rail, and Telegram daily/status command readouts.

The endpoint is intentionally an aggregator. Frontend widgets should consume `window.MOONBOYS_DAILY_LOOP` instead of calling `/daily-loop/state` independently.

## Offline Smoke Check

Run the offline-safe smoke checks without secrets:

```bash
node scripts/daily-loop-live-smoke.test.mjs
```

The default mode uses mock D1 behavior and static source checks. It confirms the route wiring, state contract keys, source status keys, compact debug summary, and Telegram fallback wording.

The smoke check is included in `npm test` and should pass in CI without live credentials.

## Optional Live Smoke Check

Set `DAILY_LOOP_LIVE_BASE_URL` to a deployed Worker base URL to run the anonymous live GET check:

```bash
DAILY_LOOP_LIVE_BASE_URL=https://your-worker.example.com node scripts/daily-loop-live-smoke.test.mjs
```

Live mode only checks anonymous `GET /daily-loop/state`. It does not require Telegram auth and does not attempt linked-user state.

## Source Status States

- `live`: Worker/D1 or confirmed API state returned live data.
- `live_empty`: the live subsystem is reachable, but there are no rows or no activity yet.
- `preview`: deterministic server schedule or preview state, not persisted live data.
- `migration_pending`: one or more expected D1 tables are missing.
- `query_failed`: the data query failed and should not be described as live.
- `unavailable`: the subsystem is unavailable.

## Debug Summary

`GET /daily-loop/state?debug=1` includes a compact `debug` object:

- `utc_day`
- `seconds_until_reset`
- `linked`
- `source_status_summary`
- `live_count`
- `preview_count`
- `unavailable_count`
- `query_failed_count`
- `migration_pending_count`

The debug summary must not expose Telegram auth payloads, raw user profile data, private metadata JSON, or secrets.

## After Deploy

1. Open the homepage.
2. Confirm `window.MOONBOYS_DAILY_LOOP` exists.
3. Confirm `GET /daily-loop/state` returns `ok: true`.
4. Confirm the right rail does not show `preview`, `query_failed`, `migration_pending`, or `unavailable` as `LIVE`.
5. Run Telegram `/daily`.
6. Run Telegram `/gkstatus`.
7. Run Telegram `/gkquests`.
8. Run Telegram `/gkfaction`.
