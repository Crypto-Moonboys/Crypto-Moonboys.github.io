# TAG RUN V2 — 1% daily policy v2 (not activated)

Owner decision (2026-11-05): allocate **1% per UTC day of each specifically
approved fungible token's eligible spendable balance in `isthatajoint`**.
This is not 1% of issued supply, and does not imply equal fiat value.

The amount is calculated independently per chain+contract+symbol+precision:
`floor((observed_onchain_units - unpaid_reserved_units - excluded_units) / 100)`
using BigInt. Dust below 100 base units yields zero; it does not increase the
pool or authorize special rounding. Only approved, verified, non-spam tokens
can enter a draw. Street Cred weighting, random pot-luck token assignment,
historical participation fairness and rollover are unchanged.

The rate remains **1% unless the owner explicitly approves a later increase**.
Do not silently increase it with wallet growth or historical rate constants.

## Historical compatibility

Migration **104** created `daily_bps=500` and snapshot
`five_percent_units`. Existing rows are historical policy-v1/5% evidence,
not prospective 1% claims. Migration **105** created the original
guarded payout ledger. Do not edit already-applied migrations or reinterpret
old digests. Migration **106** is additive and introduces:

- `active_daily_bps=100`, `active_policy_version=2` on config. The old
  `daily_bps=500` remains a frozen legacy constraint, not the effective rate.
- `reward_policy_bps` and `daily_reward_units` on snapshots; old rows
  default to policy 500 and zero new-policy budget.
- `reward_policy_bps` on draws and caps; old rows default to policy 500.
- Reissued cap and intent insertion guards, and separate activation/immutability
  triggers. New cap/intent writes must match policy 100, and old 500 caps cannot
  become active under the new 1% policy.

The old `five_percent_units` name remains in D1 to preserve history;
new policy-v2 records use `daily_reward_units` as the **only** effective
new-policy cap and set the legacy column to `0` (not a 5% calculation).
New snapshot set commitments use domain `tag-run-v2:snapshot-set:v2` and
require policy 100; the v1 hash verifier is retained only for historical audit.

## Deployment/release gates

This PR must **not** be merged, migrated or deployed merely because static
edits or mocked tests pass. Confirm a byte-identical D1 backup, rehearse
106 on a disposable clone containing representative legacy snapshots/draws/
caps/intents, verify foreign keys and old digests, run full Worker tests and
review all new SQL triggers. V1 scoring must remain intact. Deploy/release
requires separately authorized D1 migration and Worker rollout.

V2 funded draws, wallet key setup, WAX transfers, authority changes and
production payouts **remain OFF**. A verified 1% snapshot or matching code
hash cannot authorize payouts by itself.

## Local test commands

```powershell
node --test scripts/tag-run-v2-one-percent-policy.test.mjs
node --test scripts/tag-run-v2-snapshot-commitment.test.mjs
node --test scripts/tag-run-v2-community-pot.test.mjs
node --test scripts/tag-run-v2-payout-executor-pr9.test.mjs
node --test scripts/tag-run-v2-payout-dry-run.test.mjs
npm run ci:worker-api
```
