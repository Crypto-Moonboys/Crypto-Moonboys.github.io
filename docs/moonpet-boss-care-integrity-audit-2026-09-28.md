# Moonpet boss and care integrity audit — 28 September 2026

Base: merged PR #1350, `1ff2fc2fc96787c8bf9714a4770ebc07071801ee`.
The live `/deployment-info` endpoint returned that commit during this audit.
This audit uses source inspection, SQLite fault injection, browser regression
tests and public read-only checks. No production player account was modified.

## Reproduced faults and fixes

1. Weekly Boss main rewards could be marked paid before the victory memory,
   specialist XP or Crest finished. Each of those three interrupted writes was
   reproduced. Authenticated state now repairs source-backed victories, including
   archived pets, and writes a separate completion marker only after finishing
   progression. Main currency/Pet/Community rewards are not replayed by this repair.
2. Weekly Boss specialist retries used today's allowance rather than the original
   accepted action day. Repair now uses the original pet, season and day. New
   source-backed memory recovery preserves the original victory timestamp and can
   restore an earlier first-boss record. Archived victors also regain the matching
   achievement progress. Ordinary memory writes retain their active-pet gate.
3. Mini App care, jobs and Daily Cache could lose specialist progression after a
   failed write unless the exact original request was retried. These accepted
   receipts now enter the existing bounded recovery queue. New Telegram commands
   persist their precise specialist key alongside the primary receipt.
4. An API replay of successful Mini App care, job or cache receipts could grant a
   second specialist award under an API key. Tests observed 16 instead of 8 Care
   XP, 28 instead of 14 Job XP, and 16 instead of 8 cache Bond XP. Post-processing
   now uses the committed source identity instead of inventing a retry key.

No reward amounts, targets, cooldowns or daily caps changed. Repairing specialist
XP does not add another primary event or increase public Pet/Community XP again.

## Gameplay and display coverage

| Area | Audited behavior |
| --- | --- |
| Care and activities | All care routes, special-action restrictions, cooldowns, jobs, cache, saved timed claims and pet ownership |
| Seven daily missions and bounties | Server-derived progress, qualifying routes, UTC reset, bounty claims; no separate all-seven completion bonus exists |
| Daily Journey | Three of five objectives award a Growth Mark; source evidence and idempotent recovery |
| Weekly Journey | All five objectives award a Crest, preserving threshold dates and weekly qualification |
| Official Daily Run | One account attempt per UTC day, ten rooms and Alley King; failure, extraction and saved boss settlement |
| Standard Run / Contracts / Practice | Standard extraction and 100-room ending; six/ten-room Contracts, choices and boss rewards; repeatable local Practice |
| Districts / stories / raids | Saved choices, mastery, recurring stories, raid victory claims, eligibility and daily limits |
| Weekly Boss | Attempts, main reward, victory memory, specialist XP, achievements, Crest and retry/refresh completion |
| Season | Tier claims; final evolution plus 60 qualified Marks and 10 Crests; there is no separate season-final boss |
| Gear / economy / combat | Existing shop, trade, crafting, inventory, Arena and Kaiju authority and settlement suites |
| Public ranks / activity | Daily, weekly, seasonal and all-time Pet ranks, source-pet display, Community XP separation, refresh and outage behavior |

Browser tests exercised all six Mini App screens at 390×844 and 360×640, and
public leaderboard periods/activity at 360, 390 and 1280px. This is regression
coverage, not a claim that every production user's stored data was inspected.

## Graph relationship

The wiki graph reads `js/graph-data.json` and `js/entity-graph-lite.json`, generated
from canonical wiki data. The Arcade leaderboard passes its selected Arcade row
to `setPlayerState`. Neither graph consumes Moonpet Pet XP or specialist XP.
The live graph/Pets verifier passed with 327 wiki nodes and 1,629 graph edges.
The publishing gate crossed its 20-hour freshness threshold during CI. Running
the canonical publishing generator refreshed only the matching `verified_at`
stamps in the full and mobile graph files; node/edge contents did not change.
There is no artificial Moonpet-to-graph connection.

## Verification and limits

- `scripts/moonpet-progression-sync.test.mjs`: 54 SQLite tests, including 15 new
  cases for the faults above, archived victory dates, interrupted completion
  markers, failed achievement authority/memory reads, unbacked candidates ahead of recoverable victories, and command keys.
- Worker regression suite passed, covering daily/weekly/season progression,
  ownership, reward settlement, public synchronization and game options.
- Full `npm test` and final CI status are recorded in the PR.
- The first local full run exposed an existing avatar browser-test race: it read
  the live region before the scheduled announcement frame. The test now waits
  for the expected announcement and retains the original assertion; no avatar
  runtime behavior changed.
- `node scripts/live-graph-pets-verify.mjs` passed against production.

Weekly victory repair handles up to 20 source-backed records per refresh. The
existing specialist queue handles up to 20 awards per invocation. Large backlogs
can need more than one refresh. Missing/ambiguous historical evidence is not
guessed. Old Telegram command records without a persisted specialist key are not
re-keyed. Existing oversized API-key duplicate protection remains in place.
Already-paid historical duplicate XP is not automatically clawed back.

## Release

Worker runtime change: deploy `moonboys-api` from clean merged main using
`node scripts/deploy-worker-with-provenance.mjs moonboys-api`.
Pages automatically publishes the refreshed graph verification stamps on merge.
No D1 migration, frontend cache bump or VPS restart is needed.
After deployment, verify the commit at `/deployment-info`, reopen the Mini App,
and check progression plus the public leaderboard/activity.

Backup: `codex/backup-moonpet-integrity-20260928-022200`.
Sandbox: `codex/sandbox-moonpet-integrity-20260928-022200`.
GK approval is required before final merge or production deployment.
