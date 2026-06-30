# Daily Loop Live Verification And Rollback

This guide closes the daily-loop rollout workstream:

- #854 - Worker daily-loop authority
- #857 - frontend singleton and right-rail precedence
- #858 - shell boot rollout
- #859 - Telegram commands synced to daily-loop
- #860 - smoke checks and debug diagnostics

Use this after merging future daily-loop PRs so changes can be deployed, verified live, and reverted quickly if the live site breaks.

## Standard Workflow

1. Codex creates a focused PR.
2. Codex runs the required tests and reports the exact results.
3. User checks Codex Review comments before merge.
4. Merge only if tests and review comments are clean.
5. Deploy the Worker if the PR changed `workers/moonboys-api/**`.
6. Run offline and live daily-loop smoke checks.
7. Test the homepage singleton and right rail in a browser.
8. Test Telegram daily/status commands manually.
9. Revert fast if live behavior breaks.

## Required Post-Merge Commands

Run the offline smoke first:

```powershell
node scripts/daily-loop-live-smoke.test.mjs
```

Run the live smoke against the deployed Worker:

```powershell
$env:DAILY_LOOP_LIVE_BASE_URL='https://moonboys-api.sercullen.workers.dev'
node scripts/daily-loop-live-smoke.test.mjs
```

Expected live smoke result:

- `GET /daily-loop/state` returns HTTP 200.
- `ok` is `true`.
- `utc_day` exists.
- `next_utc_reset_at` exists.
- `seconds_until_reset` is numeric.
- `source_status` exists.
- Every `source_status.*.state` is one of:
  - `live`
  - `live_empty`
  - `preview`
  - `migration_pending`
  - `query_failed`
  - `unavailable`

## Browser Console Checks

Open the live homepage and run:

```js
typeof window.MOONBOYS_DAILY_LOOP === "object"
typeof window.MOONBOYS_DAILY_LOOP.getState === "function"
window.MOONBOYS_DAILY_LOOP.getState().then(console.log)
```

Expected browser result:

- The singleton exists.
- `getState()` returns `fetch_status: "ok"`.
- `utc_day` exists.
- `source_status` exists.
- The right rail does not render `preview`, `query_failed`, `migration_pending`, or `unavailable` states as `LIVE`.

## Manual Telegram Checks

Run these commands in the live bot:

```text
/daily
/gkstatus
/gkquests
/gkfaction
```

Expected Telegram result:

- UTC day is shown.
- Reset countdown is shown.
- `preview` is not labelled `LIVE`.
- `query_failed` is not labelled `LIVE`.
- `live_empty` is shown as no rows, activity, or missions yet.
- `/daily` does not double-award XP.
- `/gkquests` does not invent fake missions.
- `/gkfaction` does not fake faction or clout.

## Debug Check

GET:

```text
https://moonboys-api.sercullen.workers.dev/daily-loop/state?debug=1
```

Expected debug keys only:

- `utc_day`
- `seconds_until_reset`
- `linked`
- `source_status_summary`
- `live_count`
- `preview_count`
- `unavailable_count`
- `query_failed_count`
- `migration_pending_count`

The debug response must not expose:

- `telegram_auth`
- raw Telegram profile data
- `metadata_json`
- secrets
- private D1 row payloads

## Fast Rollback Plan

If live breaks:

1. Revert the last PR.
2. Deploy the Worker again if Worker files changed.
3. Re-run the live smoke.
4. Re-test the homepage singleton and right rail.
5. Re-test Telegram commands if Worker or Telegram files changed.
6. Add a note to the reverted PR explaining the live failure.

## Worker Deploy Rule

Deploy the Worker after merge if the PR changes:

```text
workers/moonboys-api/**
```

Worker deploy may not be required if the PR changes only:

- docs
- tests
- static HTML
- non-Worker frontend assets

When in doubt, check whether the live Worker URL needs the changed code before deciding to skip deploy.

## Red Flags

Stop and fix or revert if any of these happen:

- Codex Review leaves unresolved P1 or P2 comments.
- `npm test` fails.
- Daily-loop live smoke fails.
- Debug route leaks private fields.
- Homepage is missing `window.MOONBOYS_DAILY_LOOP`.
- Telegram commands error.
- `/daily` double-awards XP.
- Any fake `LIVE` label appears.
- `source_status` stays `query_failed` after deploy and recheck.
