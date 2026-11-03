# TAG RUN V2 — Production payout ledger and Anchor custody boundary

**Source:** [master issue #1697](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/issues/1697). One existing Telegram community only, treasury `isthatajoint`. Owner declared personal control of this WAX account on 3 November 2026. That is not yet cryptographic custody proof or authorization for any specific outgoing token amount.

## This is production code, NOT another offline simulator

Migration `105_tag_run_v2_payout_execution.sql` adds a **real persistent** D1 payout cap and immutable payout-intent ledger to `wikicoms`. Unlike the prior PR1–PR6 disposable rehearsals, this schema is in the actual production migrations directory, canonical schema and migration-verification manifests.

`workers/moonboys-api/tag-run/v2-payout-executor.js` implements explicit methods to:

1. Create a **paused** daily 5% cap only with a reviewed approved token, a confirmed donation record and a `verified` historical snapshot whose exact spendable units reconcile: on-chain − allocated/unpaid − excluded. No head-balance-only funding.
2. Reserve a winner's exact asset amount and registered WAX receiving account against the cumulative cap using a revision-checked CAS and **one D1.batch transaction**. The reviewed draw must be marked `reviewed` with reviewer metadata; mere `preview_only` or rejected draws cannot reserve tokens. A SQL BEFORE INSERT check binds a new intent to the cap's `last_intent_key`, avoiding the “CAS updated zero rows but insert still succeeds” failure. Duplicate slots/keys, direct UPDATE/DELETE, overbudget and `INSERT OR REPLACE` are rejected.
3. Reject overlapping active caps for the same token across UTC days while earlier reservations, uncertain sends or reconciliation reviews remain outstanding. A new day is NOT permission to double-spend the same inventory.
4. Re-check the token's approval and snapshot before signing; revalidate the receiver's WAX mainnet account **without requiring the recipient to sign or claim**.
5. Build an actual Antelope `transfer` action with `isthatajoint@tagrain`, exact token contract/symbol/precision, frozen `from`, `to`, quantity and an intent-identifying memo.
6. **Before** handing the transfer to a separately approved signer/broadcaster, atomically move the intent to `broadcast_unknown`. Even an RPC timeout never automatically retries that intent. The exact original action must be reconciled on chain before marking confirmed.
7. `v2-payout-chain-reconcile.js` independently corroborates the outbound action through two Hyperion indexers, chain ID and last irreversible block, then checks contract, amount, destination, sender and memo against the frozen payout. Two indexers are corroboration, not Merkle inclusion proof.

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
