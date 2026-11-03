# TAG RUN V2 — registered WAX account direct-pay route (preparation only)

## Product decision

Players earn Street Cred by taking part in the Telegram group. They can register a
**WAX account name** by private DM to WIKICOMSBOT with `/rain accountname`.
Players **do not have to log into a WAX wallet for each future claim**. If a
funded, independently approved payout system is later released, it should send
to the **verified registered WAX account** automatically. Telegram message
identity plus a typed account name is **not** proof that the member controls
that WAX account. The existing registration sets `verification_status=pending`.

Use `/rainstatus` in a private bot DM to inspect a registered destination.
Changing registration resets verification to pending. Never request seed phrases
or private keys in Telegram. A future ownership proof must sign a single-use,
time-limited challenge bound to the Telegram identity, account, and intended
payout purpose; validate the WAX authority chain and prevent replay. Until
implemented, **no registered wallet is payout eligible just by registration**.

## What was implemented

- The code-level policy `v2-payout-policy.js` states the recipient route:
  `telegram_registered_wax_account`.
- A pure preflight checks identity, WAX account validity, separately attested
  ownership proof, custody, donor consent, approved token, irreversible snapshot,
  legal review, spending approval, duplicate-proof reconciliation and locked
  allocation. Its output is **always blocked** because there is no signer or
  transaction broadcaster. This is deliberately NOT a production executor.
- `/rainstatus` is private-only. Existing `/rain` and its pending verification
  semantics remain unchanged. A future verified marker must not be inferred
  solely from a `tag_run_wallets` DB value.
- Tests are registered in the Worker API CI suite.

## Independent prerequisites before any live funded launch

1. **Custody authorization:** Confirm control of `isthatajoint` by an
   out-of-band, non-spending challenge signed with its active WAX authority;
   verify permissions, any multisig restrictions, and current treasury policy.
   No private key should ever be sent to ChatGPT, GitHub, Telegram or a public log.
2. **Provenance and consent:** Establish and publish a token-by-token donation
   policy and proof that eligible inbound deposits were knowingly donated for
   the stated programme. Legacy account inventory is **not** automatically a
   donation. Quarantined transfers require reviewed `confirmed_donation`
   decisions, with audit records, refund handling and exclusions.
3. **Finalized accounting:** At a defined UTC cutoff, read WAX irreversible-block
   data and immutable token amounts, identity/precision, donor designation,
   reserved liabilities and outgoings. Reconcile with the on-chain account.
   Allocate only from verified unreserved amounts using decimal-string
   integer base units; 5% simulation is **not** an authorization or a reserve.
4. **Member destination proof:** Verify a member's registered account ownership
   with nonce challenge, chain authority verification, expiry and anti-replay;
   freeze recipient and token/amount under the signed authorization.
   Handle wallet changes, rejected/missing accounts, undeliverable transfers,
   ambiguous confirmations and revoked authorization.
5. **Prize-law/tax/privacy review:** Obtain jurisdiction-specific written advice
   on competition/gambling rules, promotion terms, age restrictions, token
   classification, sanctions screening where applicable, tax/reporting,
   retention and operator liability. This document does not provide legal signoff.
6. **Operator spending approval:** Separate reviewed release specifying each
   token/contract, permitted sources, recipient rules, daily caps, sender
   authority, emergency pause, signer custody, receipt reconciliation and
   funding constraints. Implement an independently audited signing service and
   explicit hardware/multisig controls before any payouts.
7. **Ledger design:** A new reviewed migration is required for immutable
   finalized payout intents with unique idempotency keys, destination hashes,
   reservation state, transaction IDs, confirmations and failed/unknown states.
   Existing V2 bundle schema only allows preview-only rows; do not force it
   into payout execution.

## Current production state (must remain unchanged)

```toml
TAG_RUN_ENABLED = "true"
TAG_RUN_WEEKLY_REWARDS_ENABLED = "false"
TAG_RUN_V2_OBSERVATION_ENABLED = "true"
TAG_RUN_V2_POOL_ENABLED = "false"
TAG_RUN_V2_DRAWS_ENABLED = "false"
TAG_RUN_V2_PAYOUTS_ENABLED = "false"
```

The pool record stays `status='paused'`. No token signing, approval,
payout, ledger reservation, new migration or deployment is authorized by this PR.

## Acceptance

```bat
node --test scripts/tag-run-v2-payout-policy.test.mjs
node --test scripts/tag-run-community-rewards.test.mjs
node --test scripts/tag-run-v2-observation.test.mjs
npm run ci:worker-api
node scripts/verify-d1-production-migrations.test.mjs
```

Manually confirm `/rainstatus` privately displays the pending WAX account,
does not expose wallet details in the group, and continues to show payouts
disabled. Full live transfer testing is **not** in scope.
