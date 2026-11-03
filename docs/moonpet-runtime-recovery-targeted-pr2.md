# PR2 — MoonPet targeted runtime recovery source pruning

## Why this exists

The read-only Cloudflare D1 performance audit (27 October–3 November 2026)
reported a high-rows-read query beginning with `WITH run_candidates AS
MATERIALIZED`. Observed query analytics for that shape were approximately
**230 executions and 15.0 million rows read** (adaptive/sample-weighted,
not a direct exact row-count benchmark). This is the **full runtime source
discovery query**, not evidence that all callers use identical filters.

That same query serves two distinct workflows:

1. Background recovery with no filter, rotating through historic evidence
   from Standard/Daily runs, care, exploration, combat and seasonal bosses.
2. Targeted recovery after signed Telegram events, often specifying
   `run_id`, `event_key` and/or `action`.

PR2 improves the **targeted** path while preserving the critical background
recovery query and its cursor semantics. It does **not** claim to eliminate
the entire 15M-row-read historical hotspot. Further change to the full
background query requires an independently measured query-plan/fixture study.

## Change

- If `run_id` is present, push `r.run_id=?` into all four run source
  branches *before* join/union materialisation. The ID is always bound,
  never interpolated into SQL.
- When a target `action` is specified, add constant-false predicates
  (`AND 0`) to branches whose output action could never match:
  `run_step`, `run_extract`, `explore`, `run_boss`,
  `arena_complete/kaiju_win`. For ambiguous/new care activities, preserve
  the source scan, never assume that an unknown action is ineligible.
- A non-empty `run_id` always excludes the four non-run sources because
  those historically return `run_id=''` and were eliminated by the final
  predicate anyway.
- When neither `run_id` nor `action` is provided, the interpolated
  SQL retains the original eligible-source predicates and original bind
  order. The background recovery cursor and fairness/wraparound path
  are unchanged.
- Keep trimming, 132-character API prefix duplicate protection,
  owner/pet/season joins, old and archived pets, source event metadata,
  final anti-duplicate receipts, GROUP BY, ordering, limits, claim
  concurrency guards and reward settlement exactly as before.

## Expected effect and measurement limitations

- SQL statement count per targeted invocation remains **one**; this
  change avoids expensive irrelevant candidate source evaluation.
- The isolated run step path now restricts all four run branches to one
  run ID and makes the non-run candidate branches provably empty.
- An action-specific care attempt does not scan run, explore, boss or
  combat source families.
- A full unfiltered rotating recovery still scans all historic source
  families. This PR does not claim an overall D1 rows-read reduction
  until tested with live patterns on deployed production.

## Validation (required prior to merge)

```bat
node --test scripts/moonpet-runtime-targeted-pr2.test.mjs
node scripts/moonpet-specialist-settlement.test.mjs
node scripts/moonpet-progression-sync.test.mjs
node --test scripts/moonpet-recovery-profiling.test.mjs
node --test scripts/moonpet-recovery-projection.test.mjs
npm run ci:worker-api
node scripts/verify-d1-production-migrations.test.mjs
```

New targeted tests prove a specific run returns only its own saved source
with 120 unrelated accepted historical events, verify the generated SQL
has the correct selective predicates/bind slots, and assert unchanged
background SQL eligibility and cursor isolation. Existing settlement and
recovery tests must remain green for retroactive rewards, duplicate
protection, failures, and archived pets.

## Production release boundary

- No D1 migration, schema reset, XP/balance cleanup, payout changes, pet
  retirement or score reset.
- Do not disable BETA game features, weaken existing identity authority,
  erase historical receipt data, or change claim/reward policy.
- Do not merge or deploy before reviewed green tests.
- After an approved controlled Worker deployment, compare the frequency
  and D1 rows-read distribution of **filtered vs unfiltered**
  `run_candidates` queries over similar gameplay load. Use D1 query
  analytics and authenticated Telegram regression; don't infer wins
  from local synthetic milliseconds.
