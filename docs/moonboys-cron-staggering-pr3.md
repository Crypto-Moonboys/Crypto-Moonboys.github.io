# PR3 — stagger Cloudflare scheduled jobs, preserve timed events

Tracking issue: #1705. Part of the PR1 (D1 preflight) → PR2 (MoonPet targeted recovery) → PR3 (scheduled work) sequence.

## Source baseline

Current Worker config executes a 5-minute cron, a 09:00 UTC daily digest, a 4-hour TAG RUN bulletin and a 00:10 UTC TAG RUN V2 daily participation capture. These describe **296 configured scheduled events per UTC day** in total: 288 + 1 + 6 + 1. The overlapping cron times can cause simultaneous D1 activity, but are not by themselves evidence of queue buildup. Cloudflare scheduled-invocation analytics did not return records in the prior audit; real invocation counts, D1 costs and errors must be measured post-deploy, not invented here.

The base Worker has exact string checks for the 5-minute timed-event and 09:00 digest cron expressions. PR3 intentionally **does not change those strings**. The daily 09:00 digest still overlaps the 5-minute timer and should only be moved in a later separately verified base-Worker refactor.

## Changed schedule and task ownership

| Work | Before | After |
|---|---|---|
| Timed announcements and Daily WTF checks (base Worker) | `*/5 * * * *` | unchanged |
| Daily Telegram digest (base Worker) | `0 9 * * *` | unchanged |
| TAG RUN bulletin (phase5) | `0 */4 * * *` | `3 */4 * * *` |
| TAG RUN V2 participation capture (phase5) | `10 0 * * *` | `12 0 * * *` |
| Expired GPS session cleanup (phase5) | on every cron | every 10 minutes of the 5-minute timed cron, fallback to every 5 if scheduledTime unavailable |
| TAG RUN pending rank-outbox drain (phase5) | on every cron | once per 5-minute tick; signed Telegram webhook immediate drain unchanged |
| V1 weekly reward **review draft** (currently OFF) | on every cron if enabled | once per day at 00:12 UTC, review only |

The 4-hour and V2 capture schedules now avoid the 5-minute boundary; 09:00 remains intentionally unchanged. Cleanup can be up to ten minutes later than actual expiry, within the owner's BETA flexibility. Under normal fixed schedules, wrapper cleanup checks fall from up to 296 to 144 per day. The change in actual D1 query/row counts depends on the underlying handlers, not just the number of scheduled calls.

## Invariants

- All game day/week/season resets and accepted-event UTC attribution remain authoritative in existing base Worker/gameplay code. Move *when* the V2 capture runs, not *which UTC day* it captures.
- Existing 5-minute Daily WTF opportunities and timed event eligibility, group announcements, the daily digest and their exactly-once/cooldown boundaries are **unchanged**.
- Cron tasks route by exact event.cron and are delegated to `baseWorker.scheduled(event,env,ctx)` exactly as before. `waitUntil` remains correctly attached.
- Never suppress failure reports or bypass pending-to-attempted CAS in rank announcements. The webhook immediate drain remains.
- No automatic reset, wipe, token payments, reward activation, database migration, schema changes, or cross-system pet/Arcade XP changes.
- TAG RUN V1 weekly rewards and TAG RUN V2 funded pool/draw/payout flags remain OFF in production.
- A missing scheduled timestamp triggers conservative 5-minute GPS cleanup, not an unbounded skip.

## Validation

Run locally from PR3 branch with Node 22.13+:

```bat
node --test scripts/moonboys-cron-stagger-pr3.test.mjs
node scripts/scheduled-task-isolation.test.mjs
node scripts/telegram-group-event-announcements.test.mjs
node scripts/daily-wtf-timed-events.test.mjs
node --test scripts/tag-run-community-rewards.test.mjs
node --test scripts/tag-run-v2-observation.test.mjs
npm run ci:worker-api
node scripts/verify-d1-production-migrations.test.mjs
```

The new test suite validates schedule parity with Wrangler, separate bulletin and capture dispatches, minute-based cleanup cadence, 00:00 UTC rollover, conservative missing-time fallback, enabled/disabled TAG RUN paths, review-only drafts, and unmodified base Worker scheduling delegation. The original timed-event and digest tests must stay green.

## Deployment boundary and monitoring

**Do not merge or deploy** until review and CI acceptance. No production change has been made.

After approval, deploy `moonboys-api` with the repo's provenance script, verify `/health` and `/deployment-info`, and watch first 00:12 capture and 04:03 bulletin, 5-minute timed event integrity, digest at 09:00, the TAG RUN read-only pilot, and D1 query counts. Verify all funded token switches are false. Compare 7-day normalized Worker and D1 analytics windows before/after rather than claiming estimated billing savings.
