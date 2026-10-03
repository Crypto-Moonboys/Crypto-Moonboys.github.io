# Moonpet post-PR #1421 fixes — 2 October 2026

Baseline: `fdff2c96e54e4de74a9b7f807da7411bff644558` on `main`, after
PR #1421. Read `AGENT_EDITING_RULES.md` and the Moonpet source of truth before
editing. This implements the five confirmed gameplay defects and two maintenance
findings from the subsequent audit.

## Confirmed defects and fixes

| Defect | Resulting behavior | Regression coverage |
| --- | --- | --- |
| Earned account season tiers were locked when every owned pet was a replacement egg. | An owned selected egg can claim fixed currencies from an earned original-quarter tier. The atomic payout rechecks owner, pet, phase, season and eligibility. No egg decay, needs, lifecycle, streak or XP changes. Hatched pets retain the existing claim-time evolution Style bonus. | Actual deletion to one, two and three replacement eggs; current/old quarter, concurrency, duplicates, switches, hatch/delete interleavings, rollback, forged claims and unchanged progression. |
| A failed Play Options download removed all decisions from a saved Standard/Daily Run, and Refresh could not retry it. | Dependent run controls stay locked with a saved-run/retry message. Refresh retries the versioned script and then authoritative state. Successful recovery restores decisions without replaying Start or another mutation. | Real Chromium with no run, saved Standard Run and saved Daily Run; two failed downloads, successful retry, unchanged run count, no automatic action and no page error. |
| A Kaiju card read before expiry could commit after the 20-minute deadline and renew the table. | Card locks, category initialization and Telegram join/CPU transitions enforce the existing idle deadline inside their guarded writes. Exactly at the deadline retains the existing rule; later new input fails. Both saved pre-expiry cards can still finish interrupted settlement afterward. | Signed local HTTP and real SQLite before/at/after expiry, delayed writes, multiplayer, unsaved writes, interrupted completion, replay; Telegram join/CPU boundaries and response assertions. |
| Legacy Weekly Boss backfill picked an unrelated early account attack and assigned it to the winning pet, granting progress in the wrong qualification week. | Only the attack joined to the exact saved victory key, owner, pet, ownership season, boss and week can be backfilled. Earlier account attempts remain unassigned. Existing incorrect backfills/objectives remain stored but cannot authorize new Journey progress. | Multiple attempts/pets, retained incorrect backfill, original qualification week, foreign/missing/inconsistent sources, pet switches and repeat recovery. |
| Correct legacy Weekly Boss backfills could not produce victory memory or finish recovery, leaving deletion blocked. | Memory and bounded recovery accept a proven winning backfill. They restore proven Journey evidence, memory, achievements, base specialist progress and Crest using existing source keys and periods. A saved finish receipt releases the corresponding blocker only after successful follow-ups. | Older-week recovery with another of three pets selected; currency/backfill/memory/finish interruptions, real SQLite aborted/no-op writes, exact-once settlement and deletion after completion. |
| The general Finale documentation incorrectly grouped its seasonal XP with Daily Completion's award-day quarter. | The summary now distinguishes Daily Completion from Finale's saved competition quarter, including late claims. No Finale payout policy changed. | Existing Finale/rollover and progression suites. |
| The standalone Kaiju contract test compared the leaderboard roster with obsolete literal game keys and was absent from CI. | It checks Kaiju membership and uniqueness in the current canonical roster and runs in Arcade CI. | Standalone contract test and full Arcade domain. |

## Legacy equipment and audit policy

A saved legacy winning attack proves the pet's victory and base boss specialist
award. Account attack rows do **not** prove equipment worn at the time. Recovery
uses an explicit empty equipment snapshot, never today's equipped gear or an
invented equipment bonus. It keeps the existing deterministic material drop,
source key and caps.

The existing `telegram_pet_system_events.payload_json` finish receipt records
`equipment_evidence: "unavailable"`, `audit_reason: "legacy_equipment_unavailable"`
and `base_specialist_recovered: true`. Explore shows the limitation for the
selected source pet. Missing or conflicting victory evidence cannot manufacture
completion and retains its deletion blocker for audit. Historical attempts,
backfills, objectives, ownership and paid rewards are not rewritten or deleted.

## Validation

Run with Node 24, installed project dependencies and Chromium. Browser checks in
this workspace use the explicit environment below; CI can use its configured
Playwright browser paths instead.

```sh
npm run ci:worker-api
npm run ci:arcade
npm run ci:wiki
npm run ci:wax
PLAYWRIGHT_BROWSERS_PATH=/tmp/moonpet-playwright CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run ci:visual

node scripts/moonpet-earned-season-egg-rewards.test.mjs
node scripts/moonpet-kaiju-deadlines.test.mjs
node scripts/moonpet-weekly-boss-legacy-recovery.test.mjs
PLAYWRIGHT_BROWSERS_PATH=/tmp/moonpet-playwright CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node scripts/moonpet-player-loop-browser.test.mjs

node scripts/generate-wiki-index.js
node scripts/apply-wiki-search-synonyms.mjs
node scripts/generate-sitemap.js
git diff --check
```

The three new authority suites are registered in Worker API CI. The dependency
retry/egg claim browser cases are part of the existing full player-loop suite.
The Daily Moon Run SQLite fixture now loads the existing migration 048, matching
production's account boss evidence tables used by shared Journey validation.

Initial validation completed on 3 October 2026: all five domains exited 0,
**193/193 registered commands passed** (Worker API 113, Arcade 24, Wiki 24,
WAX 17, Visual 15). The three new suites passed 8 egg reward, 16 Kaiju deadline
and 14 legacy boss recovery tests. The standalone player-loop browser command
also passed. `npm test` itself was not the invocation; each equivalent domain
command above was run separately. Index generation and `git diff --check` passed.

Worker API covers action synchronization, public rankings/quests/progression, daily and
weekly Journeys/bosses, combat, completion/Finale, season rewards, deletion,
reward recovery, webhook authentication and notification settings. Visual
includes the six-screen player loop at 390×844 and 360×640.

## Review follow-up — 3 October 2026

New legacy winning events copy the exact account attack's `created_at`. Memory
recovery independently validates and reads that timestamp for existing exact
backfills too; stored events retain their historical timestamps. An earlier
proven victory takes its correct place before a later boss memory. Missing,
invalid or failed timestamp reads cannot substitute recovery time or mark an
unfinished victory complete. Committed currency remains paid and retryable.

The Kaiju suite now covers category initialization for both open and selecting
tables before, exactly at, after and across the deadline. Late writes leave
category, roll and `updated_at` unchanged. Repeated hydration of a saved category
does not renew its TTL. Real SQLite ignored/aborted category writes retain the
old TTL and retry without payout. The production category guard is unchanged;
its existing helper is exposed only through the test hook object.

Follow-up validation: `npm run ci:worker-api` passed all 113 registered commands.
`node scripts/moonpet-kaiju-deadlines.test.mjs` passed 26 tests and
`node scripts/moonpet-weekly-boss-legacy-recovery.test.mjs` passed 19 tests.
`node --check workers/moonboys-api/pets/moonpet-identity.js`,
`node --check workers/moonboys-api/pets/weekly-boss-evidence.js` and
`git diff --check` passed. The timestamp regression failed before the fix for
both new and existing backfills; all new assertions pass afterward.
No public asset, migration or configuration change is required by this follow-up.

## Release requirements

- No new D1 migration or schema change is required. Existing production migration
  verification and registered migrations through 089 remain required.
- No new Cloudflare secret or binding is introduced. Retain the existing
  `TELEGRAM_WEBHOOK_SECRET` Worker secret and authenticated Telegram registration;
  follow the webhook security/deployment runbook and readiness checks. Never put
  that secret in source, Wrangler variables, logs or PR text.
- Release the Worker and public Mini App together using the established release
  process. The Mini App JS and Telegram launch URL cache version is
  `20261002-ending-recovery-v3`.
- Wiki index and sitemap generation ran; reapplying the existing search synonyms
  preserves the committed index. The generated outputs are unchanged.
- Validate saved/old rewards, a legacy victory recovery, missing-helper Refresh
  and Kaiju expiry with an authorized post-release canary. No production canary
  or mutation was run for this PR.

Pet XP/evolution remain lifetime progression. Daily, weekly and quarterly scores
remain separate competition measures. The 1,000 Arcade XP entry gate, three
current spaces, permanent pets, purchased spaces and reward history remain
owned. Planned Breeding is not exposed as gameplay.

**No historical ownership or reward data is deleted. No production deployment,
merge, production database write or Telegram message was performed.** The audit's
read-only deployment-info request was blocked by the environment proxy, so these
results verify repository code and local reproductions, not the deployed SHA or
historical prevalence in production.
