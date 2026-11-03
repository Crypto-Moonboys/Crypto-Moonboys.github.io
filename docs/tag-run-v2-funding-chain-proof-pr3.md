# TAG RUN V2 — PR3 read-only funding evidence and accounting verification

This PR builds on merged #1708 (direct-to-registered-wallet preview planning)
and #1709 (immutable *offline-only* accounting rehearsal). It performs bounded,
read-only verification of quarantined WAX transfer **evidence** and a
non-executable reconciliation. It does **not** approve donations, create
payable obligations, reserve funds, sign, broadcast or send WAX tokens.

## Important distinction: checking evidence is not authorizing funding

The existing read-only \`readInboundTipReceipts()\` returns quarantined
transfer evidence. The new \`inspectWaxFundingEvidence()\` accepts 1–20
such receipts and checks:

1. The pinned WAX mainnet chain ID and treasury account \`isthatajoint\`
   using \`get_info\` and \`get_account\`. Account existence is **not proof
   of treasury private-key possession**.
2. Each receipt's block is at or before a chain RPC's last irreversible block
   (LIB), and \`get_block\` returns the matching 64-character block hash.
   This establishes a corroborated irreversible **block reference**.
3. Two distinct, documented Hyperion hosts must independently report the
   *same* transfer action by immutable global sequence, transaction ID,
   block number, token contract, sender, destination, exact token quantity
   and SHA-256 of the memo. One provider's success is **not sufficient**.
4. \`get_currency_stats\` confirms the current token symbol and precision,
   while \`get_currency_balance\` returns a **current head balance**.
   Neither supplies the token account's historical balance at the LIB.
5. Missing data, malformed precision, ambiguous action responses, mismatched
   host evidence, chain RPC errors, unsafe numeric action sequences, stale
   block identities or unknown assets fail closed.

Two indexers agreeing is independent **indexer corroboration**, not a
cryptographic transaction Merkle inclusion proof. An indexer may have the
same underlying data source as another. Even successful review leaves
\`donationConsentVerified=false\`,
\`treasuryCustodyVerified=false\`,
\`historicalSnapshotFinalized=false\`,
\`fundingApproved=false\`, and
\`transferAttempted=false\`.

### Source and network boundaries

- Existing modules: \`tag-run/v2-chain.js\`, \`tag-run/v2-deposits.js\`,
  \`tag-run/v2-core.js\`.
- New modules: \`tag-run/v2-funding-evidence-review.js\` and
  \`tag-run/v2-funding-review-summary.js\`.
- Only the read-only chain endpoints \`get_info\`, \`get_account\`,
  \`get_block\`, \`get_currency_stats\`, \`get_currency_balance\` and
  two Hyperion \`get_actions\` reads are used.
- **No production Telegram command, cron, database migration, Worker route,
  flag or signing credential is added.** The modules are not imported by
  any deployed production entrypoint.
- The transaction history check requires two complete responses. It fails
  closed when either independent provider is unavailable. Do not silently
  reinterpret unavailable evidence as zero tokens or approved donation.

## Provisional accounting, not funding

\`reconcileUnapprovedFunding()\` uses exact decimal-string \`BigInt\` units.
It totals corroborated inbound amounts by token identity and separately
reports the current head balance and any caller-supplied known exclusions
or reservations. It rejects duplicates, malformed evidence and deficits.

**The difference between historical incoming transfers and a present
balance is not a verified historical funding balance.** There may be
outgoing transfers, other incoming transfers, supply changes, fees or
a partially scanned history. Until independently approved donation
sources and finalized historical state exist, the report enforces:

- \`independentlyApprovedDonationUnits: "0"\`
- \`fundedRewardBudgetUnits: "0"\`
- \`spendingEnabled: false\`
- \`historicalBalanceFinalized: false\`

No amount in these reports should be presented to players as money owed.

## Intended eventual funded-ledger lifecycle — proposal only

This PR deliberately does **not** implement the following. Before a
funded release, a separately reviewed, operator-authorized ledger must
provide:

1. A verifiable, irreversible token-balance cutoff from a historical state
   source capable of proving balances at the **same** cutoff block.
2. Independent donor opt-in/consent and audit review for each incoming
   payment, including wrong-asset/refund and excluded-funds decisions.
3. Formal treasury custody control proof and a signer with limited
   contract/action scope, spending caps, emergency pause and rotation.
4. Per-token atomic budget/reservation operations with unique allocation
   keys, balance/cap checks under contention, and immutable recipient
   account + registration version.
5. Statuses such as proposed → reviewed → reserved → submit_pending →
   confirmed or ambiguous/manual_review; no blind retry after an uncertain
   blockchain response.
6. On-chain transaction confirmation at irreversibility, idempotent
   reconciliation, timeout handling and signed operator release approval.
7. Jurisdiction-specific legal, tax, promotion and privacy review.
   No wallet signature is needed from players simply to *register* their
   receiving accounts, but the treasury must still authorize spending.

This is a **future design**, not a claim that any status is payable today.
Do not place signing keys in GitHub, ChatGPT, Telegram or logs.

## Validation

Run on the PR branch using Node 22.13+:

\`\`\`bat
node --test scripts/tag-run-v2-funding-proof-pr3.test.mjs
node --test scripts/tag-run-v2-payout-rehearsal-pr2.test.mjs
node --test scripts/tag-run-v2-direct-wallet-plan.test.mjs
node --test scripts/tag-run-v2-community-pot.test.mjs
npm run ci:worker-api
node scripts/verify-d1-production-migrations.test.mjs
\`\`\`

Mock-RPC tests cover two corroborating providers, mismatched and absent
history, irreversible-block mismatches, wrong chain/treasury account,
precision and quantity mismatches, duplicate/unsafe action sequences,
head-balance vs historical-balance separation, quarantined summary
reconciliation, deficits and **zero transfer execution**.

## Release boundary

**Do not merge before passing tests and review.** No Worker deployment
or D1 migration is needed to make these offline-read-only modules available
in source control. In production, V1 weekly rewards, V2 funded pools,
draws and payouts remain disabled; V2 observations remain read-only.
The separate scheduled-job verification issue #1705 remains OPEN.
