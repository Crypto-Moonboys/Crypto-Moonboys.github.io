# TAG RUN V2 — Production payout ledger and Anchor custody boundary

**Source:** [master issue #1697](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/issues/1697). One existing Telegram community only, treasury `isthatajoint`. Owner declared personal control of this WAX account on 3 November 2026. That is not yet cryptographic custody proof or authorization for any specific outgoing token amount.

## This is production code, NOT another offline simulator

Migration `105_tag_run_v2_payout_execution.sql` adds a **real persistent** D1 payout cap and immutable payout-intent ledger to `wikicoms`. Unlike the prior PR1–PR6 disposable rehearsals, this schema is in the actual production migrations directory, canonical schema and migration-verification manifests.

`workers/moonboys-api/tag-run/v2-payout-executor.js` implements explicit methods to:

1. Create a **paused** daily 5% cap only with a reviewed approved token, a confirmed donation record and a `verified` historical snapshot whose exact spendable units reconcile: on-chain − allocated/unpaid − excluded. No head-balance-only funding.
2. Reserve a winner's exact asset amount and registered WAX receiving account against the cumulative cap and an **independent, operator-chosen per-transfer maximum** using a revision-checked CAS and **one D1.batch transaction**.
   - SQL now permits a new cap only with `paused=1`, empty last-intent key, zero committed/last-reserved units and revision zero. An active new-day cap must pass the overlap-protected UPDATE rather than an unchecked INSERT.
   - Each cap increase records `last_reserved_units` and must equal `OLD.committed_units + last_reserved_units` using SQLite recursive decimal-digit arithmetic, never floating point or a 64-bit INTEGER. The corresponding intent INSERT must match **both** `last_intent_key` and `last_reserved_units`. This rejects the under-consumption attack where an intent for 100 units had only spent 1 unit from its cap. The reviewed draw must be marked `reviewed` with reviewer metadata; mere `preview_only` or rejected draws cannot reserve tokens. A SQL BEFORE INSERT check binds a new intent to the cap's `last_intent_key`, avoiding the “CAS updated zero rows but insert still succeeds” failure. Duplicate slots/keys, direct UPDATE/DELETE, overbudget and `INSERT OR REPLACE` are rejected.
3. Reject overlapping active caps for the same token across UTC days while earlier reservations, uncertain sends or reconciliation reviews remain outstanding. A new day is NOT permission to double-spend the same inventory.
4. Re-check the token's approval and snapshot before signing; revalidate the receiver's WAX mainnet account **without requiring the recipient to sign or claim**.
5. Build an actual Antelope `transfer` action with `isthatajoint@tagrain`, exact token contract/symbol/precision, frozen `from`, `to`, quantity and an intent-identifying memo.
6. **Before** handing the transfer to a separately approved signer/broadcaster, atomically move the intent to `broadcast_unknown`, but only if the community pool is still `review_only`, this token's cap is **unpaused**, and the approved asset/verified snapshot **digest exactly equals the digest frozen in that intent** inside the same conditional UPDATE. This blocks concurrent `/poolpause`, token-cap pause and asset revocation during the receiver's asynchronous WAX RPC check. Even an RPC timeout never automatically retries that intent. The exact original action must be reconciled on chain before marking confirmed. A pause after an intent has already entered `broadcast_unknown` may not stop an in-flight signed transfer; a protected signer must also have its own emergency stop.
7. `v2-payout-chain-reconcile.js` independently corroborates the outbound action through two Hyperion indexers, chain ID and last irreversible block, then checks **the exact transaction ID**, contract, amount, destination, sender and memo against the frozen payout. A proof for another transaction ID, or a proof lacking its transaction ID, must never set the immutable `signed_tx_id` or leave the uncertain-transfer state. Two indexers are corroboration, not Merkle inclusion proof.

A separate positive `maxTransferUnits` parameter is **required** when
initializing any reviewed cap and may not exceed that asset's 5% daily budget.
It is immutable and checked again at SQL INSERT, so an administrator cannot
silently override the per-transfer spending ceiling with a large bundle.
No token-specific amount is guessed or automatically approved by this code.

## Anchor permission and signer — crucial distinction

Anchor is a wallet for **interactive local approvals**, not an unattended Cloudflare signing service. To automate transfers, the owner must create a **distinct restricted WAX authority key**, stored in an independent protected signer (or retain an explicit human approval step through Anchor). Never put your Anchor owner/active private key, recovery phrase, or new delegated private key into chat, GitHub, browser code, D1 or a public Worker binding.

WAX/Antelope supports a custom child permission and `linkauth` bindings for specific token-contract `transfer` actions. The proposed name here is `tagrain`. The owner must create the new permission using their own wallet, bind *each independently approved token contract* transfer action, verify the on-chain authority, and confirm revocation/emergency-response steps. A custom permission **does not by itself restrict destination or quantity**; the protected signer must independently enforce the immutable request, receiver, 5% limits and per-transfer caps. Using `isthatajoint@active` or `@owner` for a bot is **not acceptable**.

The new execution module is deliberately **NOT wired to any Telegram command, cron, public route or signing key**. The `signAndBroadcast` parameter is a privileged, external signer/broadcaster boundary, not an HTTP endpoint or an admin-supplied raw secret. `PAYOUT_EXECUTOR_AUTO_ENABLED=false`. The existing `v2-payout-policy.js` continues to have `PAYOUTS_IMPLEMENTED=false` while an independently protected signer remains unavailable. Do not describe the project as live-paying before this final signing boundary is installed and independently verified.

## Hard release gates

The new module requires ALL these values simultaneously before writes or signer handoff:
```text
TAG_RUN_ENABLED=true
TAG_RUN_WEEKLY_REWARDS_ENABLED=false
TAG_RUN_V2_OBSERVATION_ENABLED=false
TAG_RUN_V2_POOL_ENABLED=true
TAG_RUN_V2_DRAWS_ENABLED=true
TAG_RUN_V2_PAYOUTS_ENABLED=true
TAG_RUN_V2_EXECUTOR_RELEASE_APPROVED=true
TAG_RUN_V2_TIP_ACCOUNT=isthatajoint
```
**None of these funded switches are changed in this PR.** Live remains observation-only, pool paused, all five observed assets quarantined, with zero approved donations/verified cutoff snapshots/real reservations.

The release must **not** be authorized by flipping flags alone. Require proof of treasury control, approved contract identities and donation consent, immutable historical balance evidence, an approved draw and reviewed ledger, an independent payout signer with strict caller authentication, legal review of randomized token awards, WAX resource budget, transaction monitoring and emergency-pause/rollback operation.

## Deployment sequence — controlled, no blanket reset

1. On clean updated `main`, run new test suite and existing TAG RUN V1/V2 tests, migration verifier, and Worker API suite.
2. Take a **tested production D1 backup**, run schema migration 105 in an isolated copy first and check foreign keys; obtain explicit approval before applying it to remote `wikicoms`. The new tables are additive; migration 104 and existing MoonPet, Arcade XP, Telegram identity, V1 scores and wallet registrations must remain intact.
3. Apply migration 105 to remote only after audit and owner approval. New required-migration manifests will remain unverified until real remote migration evidence is captured.
4. Merge/compile Worker code only after review. Since no handler imports the new executor, merging does **not** activate payout attempts; no separate network credentials are installed by this PR.
5. Configure/verify `isthatajoint@tagrain` and secure signer outside GitHub, and complete the legal/funding approval gates. Review transfer amounts and user-selected destination; test an explicitly authorized minimal-amount WAX mainnet transfer (or first testnet) before allowing funded daily operation.
6. Verify irreversible WAX chain receipt, D1 ledger transition and no double-send under retries, timeouts, pauses and signer outages. Keep spending OFF until this passes. If the signer is unavailable, stop with a clear blocker rather than bypassing authorization.

## Regression coverage

`node --test scripts/tag-run-v2-payout-executor-pr9.test.mjs`

Tests use isolated Node `node:sqlite` loaded with actual migrations 103, 104, 105 and an in-memory D1-like transactional batch adapter. They cover: missing release flags, unapproved assets, missing donation, nonverified snapshots, wrong 5% cap, paused cap, verified/reviewed draw, duplicate CAS/intent rollback, exact recipient binding, cumulative cap, cross-day unresolved holds, foreign group, WAX mainnet destination recheck, UNKNOWN-first signer handoff, timeout without retry, independent finality/reconciliation, and no live signing credentials.

Run `npm run ci:worker-api` and the canonical D1 migration checks. Isolated SQLite parity does not substitute for real D1 concurrency, real Anchor signing or an actual WAX transfer test.

**Honest status:** The durable payout ledger, action-building, signer handoff interface and chain reconciliation are implemented in this PR. The protected signing service and real authorized payout launch are **not** implemented by this PR. No transfer is authorized or attempted.


### PR #1716 follow-up: direct SQL bypass regressions

Review feedback identified three production-critical bypasses. The regression
suite now rejects direct cap INSERT with `paused=0` or nonzero counters,
forged cap consumption that increments by less than a bundle's amount,
direct intent INSERT whose token amount differs from the exact reserved
increment, and changes to a verified snapshot digest during the awaited
recipient RPC. Large integer reservation increments above
`Number.MAX_SAFE_INTEGER` are tested without floating point. All three
cases **fail closed before calling a signer**. The canonical schema mirrors
the migration definition exactly. No remote D1 change, signer installation,
funding approval or chain transaction occurs during this PR review.

### Latest reconciliation and fixture hardening

The direct-SQL registered-wallet regression must set `last_reserved_units`
for the same amount as `committed_units` when constructing a legitimate cap
transition. This ensures the test reaches the wallet guard instead of failing
prematurely on the cap-accounting trigger. The chain confirmation fixture now
includes the requested transaction ID, with negative tests for unrelated and
missing IDs. A failed proof leaves the reservation `broadcast_unknown`, with
no `signed_tx_id` stored. The updated focused test file defines 30 tests;
syntax validation alone does not constitute a passing Node/Worker suite.


### Fixes for previously missed production-state findings (3 Nov 2026)

1. **Snapshot race during reservation:** the BEFORE INSERT intent guard now
   requires the exact `s.snapshot_digest=NEW.snapshot_digest` of the verified,
   approved asset snapshot. If the snapshot is replaced between the JS
   preflight and `D1.batch`, the intent insert aborts, rolling back the
   preceding cap increment in the same transaction. The regression mutates
   the snapshot immediately before executing the transactional batch and
   asserts zero intents and an unchanged cap.
2. **Reconciliation-review liveness:** SQL now allows only the narrow
   `reconciliation_review → confirmed` transition; it does **not** allow
   another `broadcast_unknown` transition or another signer call. The
   production `markIrreversiblyConfirmed` method accepts both
   `broadcast_unknown` and `reconciliation_review` as evidence-eligible
   states, but requires an independent irreversible WAX transfer proof with
   the exact transaction ID, contract, recipient, quantity, memo, block
   and chain before the conditional `confirmed` update. Repeated or
   incorrect proofs fail closed and the cap remains reserved until resolved.
3. **Revoked draw before signing:** the final single-statement D1 send lock
   now requires the associated draw to remain `reviewed`, including a
   nonempty `reviewed_by`. Any rejection or withdrawal of review metadata,
   including during the awaited receiving-wallet RPC, prevents the intent
   from becoming `broadcast_unknown` and blocks the signer callback.

The existing single-community and payout-off release gates are preserved.
Canonical `schema.sql` and migration 105 are synchronized. The focused
regression suite now defines **35 tests**; full Node/Worker CI and real D1
execution must still pass before merge. No production migration or
token transfer has been performed.
