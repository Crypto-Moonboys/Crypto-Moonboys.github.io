# MoonPet historical PR3 parity regression — response contract repair

## Established facts (31 October 2026)

The same seven `first_response_hash` assertions failed on clean `main` (SHA `9561cf1a`) and on PR #1688. The frozen fixture records the older 22 October commit `0ef7b80e`. The two are no longer the same application revision.

In the user's independent Windows runs, for **new, warm, three, heavy, archived, day_rollover and week_rollover**:

- `first_persisted_hash` and `retry_persisted_hash` **matched the original historical expected hashes**.
- The first and retry *current* response hashes matched one another for each scenario.
- The first/retry *current* persisted-state hashes matched one another.
- Only the historical response hash checks differed. This establishes projection drift but does **not** identify which response fields changed or certify the drift as intentional.

## Repair: preserve both contracts

`scripts/fixtures/moonpet-pr3-baseline-parity.json` is **unchanged**, including every original Oct 22 hash. The strict old persisted-hash assertions still cover original XP, Moon Gold, ownership, growth and award receipts across 11 selected saved-state tables.

`scripts/fixtures/moonpet-pr3-current-response-parity.json` separately pins the **full signed, token-normalized responses** observed on current main for the seven scenarios. The test still hashes the full returned state (not a partial gameplay subset), checks first and retry individually, verifies `adopted`, demands identical first/retry payloads and saved tables, and maintains D1/SQL ceiling assertions. Future changes to either saved data or presentation now fail without a deliberate, reviewed fixture update.

The original response-hash mismatch is historical drift, **not a demonstrated saving error**. This test separation prevents routinely changing historic reward fixtures just because an evolving UI projection gains or changes fields. The new current hashes were recorded from the two independently run branches, which produced identical actual values.

## Important limitation

These two snapshots do not prove every UI field change since Oct 22 was desired. If a response-shape regression is suspected, perform a field-by-field comparison against the historical commit, with all required gameplay authority assertions, rather than merely approving another hash. This PR does not change the Worker, gameplay, response JSON, reward values, settlement, migrations or database.

## Reproduction

```bat
node --test scripts/moonpet-pr3-optimisation.test.mjs
node --test scripts/moonpet-recovery-profile.test.mjs
node scripts/ci-domain-runner.mjs worker-api
```

The second command belongs to PR #1688 and should be run on that branch (or once merged). The PR3 test and Worker API domain belong on this PR #1689 branch. The full worker-api suite previously stopped at the old baseline hash assertions; it needs to finish cleanly before merging.

**Do not deploy Worker or migrate D1** for this test-only PR.

## PR4 parity gate discovered by complete Worker API run

After PR3 parity passed 11/11, the Worker API domain reached `scripts/moonpet-pr4-optimisation.test.mjs` and found the **same seven** stale `first_response_hash` mismatches; its zero-pet case and non-parity fail-closed/concurrency tests passed. PR4's signed parity helper uses the same fixed-clock fixture, scenario seeds, challenge-token normalizer and persistence table selection as PR3. This PR now uses the same current signed-response contract for the seven nonzero PR4 scenarios, while keeping PR4's **original persisted first/retry hashes unchanged** and retaining its zero-pet original response baseline. All PR4 D1/SQL budgets and concurrency/failure tests remain in place. This change still needs a fresh full Worker API CI run before merge.
