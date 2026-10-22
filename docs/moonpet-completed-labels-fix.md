# MP-A02: show saved completion consistently

Main 3dedb1725 renders completed mission rows as [OK] and earned achievements as [UNLOCKED], without the requested ✅ Completed label. The signed fixture contains both completed and incomplete missions, so this mismatch is reproducible without inventing progress.

This presentation-only fix adds the label to existing completed mission/step/objective flags, earned achievements, settled Journey rewards, claimed daily caches and season tiers, completed bounties, won finales, saved completed contract counts and complete menu-status entries. Gameplay predicates are unchanged. Menu labels additionally require explicit saved success: completed contracts, completed/extracted daily runs, or saved boss victories; generic terminal entries also include failed attempts and cannot establish success. Ready rewards retain their claim actions and pending wording; waiting, recovery, incomplete and unavailable records gain no completion marker. The 7/7 ready label describes the completed checklist, not reward payment.

## Reproduction and correctness evidence

~~~sh
node --test scripts/moonpet-completed-labels.test.mjs
node scripts/moonpet-player-loop-browser.test.mjs
node scripts/ci-domain-runner.mjs worker-api
node scripts/ci-domain-runner.mjs visual
~~~

The original three focused tests fail against main and pass with the fix. A fourth regression uses the real menu projection for successful, failed, active and unknown contract/daily endings plus saved boss victories; all four pass. They render real signed Worker mission state, compare completed/incomplete markers against saved flags, preserve the source state and database balances, reject markers on non-complete status entries, and retain unpaid 7/7 claim controls. The existing desktop/mobile player-loop test now checks seven saved completed mission rows, the 7/7 bonus panel and saved Finale Victor achievement.

Complete local Worker/API CI: 165 commands passed. Complete local visual CI: 35 commands passed. The review correction additionally passes all 22 completion/menu tests; latest-head CI and review are recorded on the PR. No test timeout was increased.

This is a correctness/presentation fix with no loading-performance claim: output strings and the read-only menu success-label guard change in the game runtime; no Worker, SQL, request, reward predicate or economy changes. The full-state latency target remains MP-A03 in the sandbox audit register.

Deployment: static frontend release only, after GK approval. No Worker deployment, D1 migration or VPS restart. No production test, deployment or merge performed.
