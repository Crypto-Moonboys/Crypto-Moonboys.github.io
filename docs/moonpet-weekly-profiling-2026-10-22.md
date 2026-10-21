# MoonPet weekly recovery profiling follow-up — 2026-10-22

## Decision

Profiling-only fallback. No safe optimisation has been demonstrated. There is no
claim of faster production responses. Main at start: `10bc427ab0fdd24a149e32d88a1cdb972fd9bc17`
(merged #1597), verified through GitHub. No merge or deployment authorised.

GK supplied three authenticated production loads of 1,671 / 2,005 / 1,774 ms;
weekly settlement 610–862 ms, projection 648–1,101 ms, recovery 769–1,006 ms,
ownership verification 21–23 ms. These are supplied observations, not live
measurements made during this task. Nested spans must not be summed.

## Audit and retained dependencies

- `weekly-boss-recovery.js` already excludes completed finish markers and joins
  historical pet/slot/source tuples before applying the bounded cursor. Its
  finish callback repairs several different records; payment is not proof of
  completed progression. No redundant read was proved safe to remove.
- `journey-recovery.js` repairs source evidence before scanning daily then weekly
  awards. The weekly queue waits for incomplete source reconstruction to avoid
  freezing a later qualification day. Its eligibility query does not replace
  finalizer authority checks: live actions and overlapping requests can change
  receipts and crests between selection and award.
- `weekly-journey.js` reads the existing crest before award and again afterwards.
  The latter verifies the actual winning insert during a duplicate/concurrent
  award. Reusing the earlier snapshot would be incorrect.
- The full builder already shares identity, runtime and combat-eligibility
  promises. Journey summary depends on the roster; Kaiju hydration can mutate;
  lifetime finalization and runtime initialization are not read-only queries.
  Optional Home reads intentionally retain isolation. Final ownership, account,
  selected-pet, economy and source-period verification remain necessary.

## Instrumentation

Add separate allowlisted spans for boss victory recovery, Journey source repair,
daily Journey awards and weekly Journey awards. Each reports `sql_statements`
and `d1_calls`; full projection reports the same counters. Counts include
submitted failed attempts. A batch is one binding call and N statements.
They do not measure internal network retries or D1 SQL execution duration.
Only numbers are added; no SQL, parameters, account/pet IDs or raw errors.
Counters and proxies are local to one span. Calls keep their original receiver,
order, arguments and results; batch submission unwraps the original statements.
No cache, query rewrite, batching, ownership bypass or timeout change.
Existing swallowed recovery failures retain their existing semantics: completed
means the stage returned, not that every pending reward was successfully repaired.

## Fixed-time comparison

Same SQLite fixture, 2026-10-21 12:00 UTC, injected 10 ms per binding call.
These are modelled local timings, not production results. Raw reports are
`moonpet-pr2-before.json` and `moonpet-pr2-after.json` beside this report.

| Path / fixture | SQL before → after | Calls before → after | Local ms before → after |
| --- | --- | --- | --- |
| builder / warm | 167 → 167 | 138 → 138 | 831 → 813 |
| builder / three_pets | 175 → 175 | 146 → 146 | 821 → 821 |
| builder / recovery | 264 → 264 | 190 → 190 | 1627 → 1632 |
| builder / core | 42 → 42 | 33 → 33 | 349 → 340 |
| authenticated_http / warm | 168 → 168 | 139 → 139 | 869 → 874 |
| authenticated_http / three_pets | 176 → 176 | 147 → 147 | 861 → 855 |
| authenticated_http / recovery | 265 → 265 | 191 → 191 | 1659 → 1648 |
| authenticated_http / core | 43 → 43 | 34 → 34 | 358 → 359 |

All eight scenarios retain identical statement and call counts. Timing variation
is noise, not an optimisation. Existing recovery fixture seeds five accepted
care sources; additional tests use twenty sources with one/three pets and verify
persisted wallet/objective/mark/crest parity across retries. This is not yet a
realistic multi-period boss/award backlog benchmark or complete response parity
proof. That evidence remains outstanding before a reward-path optimisation.

## Verification and limitations

- Focused profiling/performance suite: 17 passed.
- Existing recovery/Journey/ownership/weekly selection: 107 passed.
- `git diff --check`: passed.
- Complete `npm run ci:worker-api`: attempted, blocked at website-auth esbuild
  compilation by sandbox filesystem access (`Cannot read directory ../../../..:
  Access is denied`); not reported as passing. GitHub CI must pass before release.
- Cloudflare connector is disconnected; current Cloudflare references and private
  production timings could not be retrieved. No live recovery or canary was run.
- UTC/ownership week, archived history, concurrent retries and settlement cases
  have existing regression coverage, but a new exhaustive before/after fixture
  matrix for all requested combinations has not been demonstrated.
- Codex review must complete on the PR; any findings must be resolved before merge.

## Follow-up and release hold

After GK approval and passing CI/review, deploy only `moonboys-api` using
`node scripts/deploy-worker-with-provenance.mjs moonboys-api`. Verify full deployed
commit and run two authenticated production canaries with action `none`.
Compare the four sibling recovery stages and full projection counts/durations,
without adding their parent spans. No D1 migration is needed.

Use the dominant child span to build a fixed-time multi-period fixture with
active/archived pets, interrupted awards and concurrent requests. Require full
response/persisted reward parity and a measured call reduction before removing
any eligibility/source/final-account check. If statements are few but elapsed
high, investigate D1 execution/query plans via approved private diagnostics;
do not add a cache or parallelise settlement writes based on elapsed time alone.

## PR review correction

The original twenty-feed tests prove source repair and retry stability only:
they do not qualify for a daily/weekly award. Added two timing-enabled signed
HTTP cases with three accepted daily objectives, all five qualifying weekly
objectives (including distinct check-in dates), and an unfinished historical
boss victory. Both start with no mark, Journey crest or boss finish marker,
assert creation and original pet/season/day/week attribution after one request,
and compare reward/receipt/memory/specialist records plus wallet values after
two retries. Cases cover an active original pet and an archived original pet
on a three-pet account with a different selected pet. No automatic currency
claim is introduced. Five profiling tests pass. Existing source-contract test
now requires delegation through the measured DB wrapper, fixing Worker/API CI's
stale `projectPetMiniAppState(db, ...)` assertion.
