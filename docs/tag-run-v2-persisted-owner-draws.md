# TAG RUN #1697 — persisted owner-reviewed draws

This adds the missing local draw-to-payout connection. A committed day freezes its approved 1% snapshots, participant weights, confirmed donation receipts, outstanding reward obligations and rule hashes. Revealing the committed seed against one specified future irreversible WAX block persists the deterministic winner bundles. A separate reviewer can then approve those bundles for the existing payout cap/reservation executor.

The 1% rate follows merged policy migration 106 and docs/tag-run-v2-daily-one-percent-policy.md; the original issue’s 5% wording is historical.

No Worker route, scheduled draw, signer, flag change, deployment or production database write is added. Migration 107 is included, not applied. A reviewed draw creates reward liabilities; it does not send tokens or automatically create payout intents. The contract approval registry remains empty.

## Activation prerequisites

Before any mutation, the owner must separately approve and complete all of the following:

- Private database backup, offline migration rehearsal and application of migration 107 after 103–106. Verify the production migration evidence; the required-migration manifests now include the previously omitted 106 and new 107. Do not update deployment evidence timestamps without fresh evidence.
- Independent approval of this draw policy and entropy/trust model, including the historical-win consumption rule below. The new deployed plain-text flag TAG_RUN_V2_DRAW_REVIEW_RELEASE_APPROVED must explicitly be true; it is deliberately absent from wrangler configuration in this PR.
- Reviewed pool configuration at policy version 2, active_daily_bps=100, historical_ticket_bps=5000. The legacy daily_bps=500 field is retained only for schema compatibility.
- Approved token assets, independently verified confirmed-donation provenance, complete participation capture through the target UTC day and verified canonical 1% snapshots. These records must already exist; this tool does not turn observed/quarantined balances into spendable funds or manufacture chain evidence.
- The private Telegram funding controls documented in `docs/tag-run-v2-telegram-funding-controls.md` provide the reviewed donation and irreversible snapshot inputs while draws and payouts remain off. They do not relax this workflow's independent commit/reveal/review checks.
- Flags TAG_RUN_ENABLED=true, TAG_RUN_WEEKLY_REWARDS_ENABLED=false, TAG_RUN_V2_POOL_ENABLED=true, TAG_RUN_V2_DRAWS_ENABLED=true, TAG_RUN_V2_OBSERVATION_ENABLED=false and TAG_RUN_V2_TIP_ACCOUNT=isthatajoint. No payout/send flag is needed merely to review a draw. Existing separate payout gates still control every actual send.

The CLI checks actual deployed Worker settings, pins the production D1 database and rechecks settings immediately before each mutation. Imported workflow functions accept a trusted database/environment adapter; they are not public authorization endpoints. Anyone controlling the database, operator process or Cloudflare token is privileged. Reviewer names are audit metadata, not authentication or proof that two different people approved.

## Operator sequence

Use Node 24 from the repository root. Credentials come from CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN and TAG_RUN_OPERATOR_GROUP_ID. Keep the token and private seed out of source control and logs. Node --use-system-ca can be required on Windows; never disable TLS validation. Replace the example day with a completed UTC day, and placeholders with actual independently reviewed identities/digest.

1. Commit once: node --use-system-ca scripts/tag-run-v2-owner-draw.mjs commit --day 2026-11-09 --reviewer operator-id --seed-file D:/private/tag-run-2026-11-09.json --live
2. Wait until the recorded future block is irreversible on both fixed providers. Reveal using exactly the same seed file: node --use-system-ca scripts/tag-run-v2-owner-draw.mjs reveal --day 2026-11-09 --seed-file D:/private/tag-run-2026-11-09.json --live
3. Verify/replay read-only: node scripts/tag-run-v2-owner-draw.mjs verify --day 2026-11-09
4. The independent reviewer must examine the frozen input_json, snapshots/donation provenance, weights, outstanding obligations, bundles_json/debits_json, secret commitment/reveal and beacon block through authorized read-only database access. The compact verify receipt reports the input digest and bundle count; it is not the complete review evidence. Recompute with replayDraw if using an independent local review harness.
5. Approve that exact digest: node scripts/tag-run-v2-owner-draw.mjs review --day 2026-11-09 --reviewer independent-reviewer-id --inputs-digest INPUTS_DIGEST_FROM_REVIEW --live
6. Use the existing owner payout cap, reservation, signing and reconciliation workflow only after its separate contract, permission, amount/destination and release approvals. This CLI never imports or invokes a signer.

Every mutation requires the exact interactive confirmation. The seed file is created exclusively outside this repository and reused on retries; a wrong group/day is rejected. Node requests private file mode, but Windows ACLs must be managed by the operator. Back up the seed privately: losing it blocks reveal. The secret is never printed by the tool; after reveal it is intentionally public in the draw ledger so reviewers can replay it.

A commitment fixes one seed hash and future block per group/day. Retries reuse that record and cannot reroll winners. If sources change, operations fail closed; inspect the saved day before doing anything else. A separate reviewer may reject an unfunded committed/revealed day with the reject command, --reviewer, --reason and --live. That day cannot be recommitted. A reviewed day cannot be cancelled through this tool, because its winners already have funded liabilities.

## Allocation and historical weight

The existing deterministic pot-luck engine selects at most 20 bundles per approved asset from 1% of its eligible unreserved balance, using exact integer units. When both historical and current classes exist, class selection is 50/50 per bundle. This is a probability rule, not a guarantee that exactly half the realized token amount goes to each class. No token prices are used.

This PR proposes a bounded funded-win historical consumption rule: once a reviewed draw awards any historical-class bundle to a member, consume up to 510 of that member's available historical weight, oldest source days first, once across all token wins in that draw. Current-class wins and historical losers consume no historical weight. Remaining historical weight rolls forward under the existing eligibility cap. The exact claims record source receipts, prior consumption and a winning bundle; they apply only in the same transaction as independent review. Rejecting an unfunded draw consumes nothing. This rule requires the separate draw-release approval above before activation.

## Accounting and concurrency

All reviewed winner bundles are unpaid treasury obligations until an exact payout intent is irreversibly confirmed. This includes unregistered winners and bundles that do not have an intent yet. The next snapshot must reserve their complete exact sum, across groups for the same asset. An unpaid reward is not expired or returned to the pot by this implementation.

The owner send guard also protects those obligations. Required current balance is excluded units plus the greater of (frozen prior reservations + committed cap units) and (all currently unpaid reviewed bundle units). Invalid/missing liability lists block sends. This can conservatively hold funds after some older confirmations; it never relaxes an existing approved snapshot/cap.

Each transition uses one D1 batch containing two statements, with trigger writes inside that transaction. Database guards recheck source records, capture completion, asset approval, pool status and outstanding obligations before commit/reveal/review. Changed data or a failed second statement rolls everything back. Frozen snapshots, managed draws/bundles and historical claims cannot be overwritten/deleted through ordinary writes or REPLACE. Revoking an asset, snapshot or pool remains possible and blocks pending work. Concurrent callers can receive a conflict; inspect/retry the same day, never generate a new seed. D1 trigger-inclusive change counts are supported.

Bounds are explicit: up to 100 assets, 20,000 participation rows, 2,000 members per class, 5,000 donation receipts, 20,000 outstanding bundles and a 900 KB frozen input. Larger histories fail closed and require a separately reviewed compaction/scaling design.

## Entropy and trust limits

The fixed Greymass and EOSphere providers must return fresh WAX heads. The chosen beacon is at least 120 blocks beyond both reported heads, and the database must persist the commitment within the ten-second deadline. Reveal requires both providers to report that exact block irreversible and agree on its ID. The final PRNG seed hashes the domain, committed secret and block ID.

These are matching RPC observations, not cryptographic inclusion proofs or a trustless randomness oracle. Producers/colluding providers, privileged database operators and selective refusal to reveal remain in the threat model. Publicly archiving the commitment before beacon production and independent release review remain operational requirements; this tool does not publish an external tamper-proof commitment. It cannot automatically reselect a beacon or recreate a rejected day.

## Validation

Focused Node/SQLite tests exercise deterministic multi-asset winners, idempotent/concurrent transitions, future-block/irreversibility checks, source changes during a transaction, immutable claims, historical consumption, full unpaid obligations, existing payout cap/reservation integration, rollback of each transition, private seed retry recovery and paused deployment gates. Migration rehearsal applies 107 twice over populated legacy tables, preserves every existing row and checks foreign keys/integrity. The canonical schema is exercised separately.

Run node --test scripts/tag-run-v2-draw-workflow.test.mjs scripts/tag-run-v2-contract-send-guard.test.mjs scripts/tag-run-v2-owner-payout.test.mjs scripts/verify-d1-production-migrations.test.mjs, then node scripts/ci-domain-runner.mjs worker-api. The draw suite is registered in the existing manual domain runner; no automatic workflow trigger changes are made.

Reference: D1 REST query/batch shape https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/ ; D1 batch transactions https://developers.cloudflare.com/d1/worker-api/d1-database/ ; D1 payload limits https://developers.cloudflare.com/d1/platform/limits/ ; Antelope chain endpoints https://docs.antelope.io/leap-plugins/latest/chain.api/ .

Recorded 10 November 2026: 85/85 focused tests passed on Node v24.14.0. The complete manual node scripts/ci-domain-runner.mjs worker-api run passed all 200 commands with exit code 0. Two additional edge-case tests were included in the final focused rerun; implementation code was unchanged. Staged whitespace checks passed. No live migration, deployed-flag mutation, signing or transfer was performed.
