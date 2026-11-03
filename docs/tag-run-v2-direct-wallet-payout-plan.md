# TAG RUN V2 — direct-to-registered-WAX-account payout planning

## Approved player experience

Each member registers a receiving WAX account once using private `/rain accountname`.
The account must exist on WAX mainnet. The member does **not** need a wallet
login, signature or per-reward claim to select a receiving destination.
An eligible, independently authorized future reward would be transferred
directly to that selected account by the treasury operator's payout service.

A valid account name proves **existence, not ownership**. Users must be
warned that choosing the wrong account may permanently route a transfer
to somebody else. Registration changes must invalidate **unexecuted**
destination-locked payout approvals.

## What this PR actually implements

`v2-direct-wallet-plan.js` is an offline, deterministic, read-only
manifest generator built from an existing `previewCommunityDraw` output.

- Per-asset `availableUnits` must equal `balanceUnits - reservedUnits -
  excludedUnits` exactly, with reservations and exclusions no larger than
  the chain balance. Only then may the allowance equal 5% of those available
  integer base units, using `BigInt`, never floating-point balances.
  A fabricated preview cannot inflate both availability and the daily budget.
- Every bundle must have a unique (asset, index) slot, positive base units,
  a valid Telegram ID, a valid day and a recognized ticket class.
- Total hypothetical allocations for an asset must not exceed its budget.
- Recipients are matched to **user-selected** WAX accounts, without demanding
  any wallet signature. Missing or stale chain-account checks are blockers.
- The plan assigns stable hash identifiers to hypothetical award slots
  (not spend authorities), and returns non-executable rows and explicit
  missing-destination counts.
- No D1 query, mutation, token custody action, transaction signing or
  broadcast function is imported or invoked.
- The output has `status='simulation_only'`, `executable=false` and
  `transferAttempted=false` regardless of input.

This does not prove that a token actually belongs to the Community Pot,
that a wallet balance is donated, or that a historical WAX snapshot is final.
An ordinary `previewCommunityDraw` preview is **not** a prize obligation,
custody proof, authorization, payable intent, token debt or reservation.

## Requirements for any separately approved funded release

1. Verify out-of-band control of `isthatajoint` and document the sender's
   WAX permissions, spending limits, signer custody and emergency pause.
   **Never place a signing key in ChatGPT, Telegram, GitHub or browser JS.**
2. Independently reconcile eligible inbound chain transfers, donated intent,
   refundable/non-donation funds, contract, precision and irreversible block
   evidence. Existing positive wallet balances are not automatically donated.
3. Require immutable, final snapshots with all excluded or already-reserved
   amounts subtracted before any 5% calculation. Aggregate amounts across
   all recipients and tokens using exact integer base units.
4. Obtain documented jurisdiction-specific legal, tax and promotion-policy
   review before promising token prizes or publishing prize terms.
5. Re-check recipient existence and bind the currently selected Telegram
   destination, token, amount and operator approval to the final payment
   intent. A user change to `/rain` must not redirect a previously locked
   or already transmitted payment.
6. Design a separate D1 migration for immutable payout intents, account
   registration version/destination fingerprint, per-asset reservations,
   ledger reconciliation, unique idempotency keys, transaction IDs,
   irreversible confirmation, ambiguous/failed state and controlled retries.
7. Build a separately reviewed limited treasury transfer worker using
   protected signer permissions and explicit **independent authorization**.
   An enabled flag alone must never release funds. Simulate and verify a
   disposable/small dry run with all payment flags OFF before launch.

## Production defaults unchanged

```toml
TAG_RUN_ENABLED = "true"
TAG_RUN_WEEKLY_REWARDS_ENABLED = "false"
TAG_RUN_V2_OBSERVATION_ENABLED = "true"
TAG_RUN_V2_POOL_ENABLED = "false"
TAG_RUN_V2_DRAWS_ENABLED = "false"
TAG_RUN_V2_PAYOUTS_ENABLED = "false"
```

The pool remains `paused`, and token identities remain quarantined unless
independently approved. No migration, transfer path, signing, wallet custody
operation, score reset or LIVE payment authorization is part of this PR.

## Local verification before merge

```bat
node --test scripts/tag-run-v2-direct-wallet-plan.test.mjs
node --test scripts/tag-run-v2-payout-policy.test.mjs
node --test scripts/tag-run-v2-community-pot.test.mjs
node --test scripts/tag-run-v2-observation.test.mjs
npm run ci:worker-api
node scripts/verify-d1-production-migrations.test.mjs
```

The tests assert reproducible manifest IDs; exact 5% budget aggregation;
bad balances, forged statuses, unknown assets, malformed recipients, duplicate
slots and stale chain checks fail closed; and no transfers can execute.
The code is intentionally not wired into the Telegram production command
path. It prepares the next development stage without implying readiness for
funded operations.
