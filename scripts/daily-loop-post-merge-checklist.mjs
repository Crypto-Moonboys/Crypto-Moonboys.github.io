#!/usr/bin/env node

const checklist = String.raw`
Daily Loop Post-Merge Checklist
===============================

1. Deploy Worker if needed
   - If the merged PR changed workers/moonboys-api/**, deploy the Worker.
   - If the PR changed only docs/tests/static HTML, Worker deploy may not be required.

2. Run offline smoke
   node scripts/daily-loop-live-smoke.test.mjs

3. Run optional live smoke
   PowerShell:
   $env:DAILY_LOOP_LIVE_BASE_URL='https://moonboys-api.sercullen.workers.dev'
   node scripts/daily-loop-live-smoke.test.mjs

   POSIX shell:
   DAILY_LOOP_LIVE_BASE_URL=https://moonboys-api.sercullen.workers.dev node scripts/daily-loop-live-smoke.test.mjs

4. Browser console checks
   Open the live homepage and run:
   typeof window.MOONBOYS_DAILY_LOOP === "object"
   typeof window.MOONBOYS_DAILY_LOOP.getState === "function"
   window.MOONBOYS_DAILY_LOOP.getState().then(console.log)

   Confirm:
   - fetch_status is ok.
   - utc_day exists.
   - source_status exists.
   - preview/query_failed/migration_pending/unavailable are not rendered as LIVE.

5. Telegram commands
   Run in the live bot:
   /daily
   /gkstatus
   /gkquests
   /gkfaction

   Confirm:
   - UTC day and reset countdown are shown.
   - preview/query_failed are not labelled LIVE.
   - live_empty is shown as no rows/activity/missions yet.
   - /daily does not double-award XP.
   - /gkquests does not invent fake missions.
   - /gkfaction does not fake faction or clout.

6. Debug route
   GET https://moonboys-api.sercullen.workers.dev/daily-loop/state?debug=1

   Expected keys only:
   - utc_day
   - seconds_until_reset
   - linked
   - source_status_summary
   - live_count
   - preview_count
   - unavailable_count
   - query_failed_count
   - migration_pending_count

   Must not expose telegram_auth, raw Telegram profile data, metadata_json, secrets, or private D1 row payloads.

7. Rollback steps if live breaks
   - Revert the last PR.
   - Deploy Worker again if Worker files changed.
   - Re-run live smoke.
   - Re-test homepage.
   - Re-test Telegram commands if Worker/Telegram files changed.
   - Add a note to the reverted PR explaining the live failure.
`;

console.log(checklist.trim());
