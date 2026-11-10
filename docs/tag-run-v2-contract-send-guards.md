# TAG RUN #1697 — contract and total-debit guards

The local owner payout CLI now requires a reviewed contract approval for the exact WAX chain, contract, symbol and precision. It validates the approved deployed code and ABI, token transfer configuration and current treasury coverage before asking Anchor to sign, and again after approval before the single broadcast attempt.

This change does not approve a contract, enable payouts, change wallet permissions, deploy a Worker or migrate D1. The checked-in approval registry is deliberately empty. Current production flags remain outside this change.

## Approval authority

The reviewed trust root is scripts/config/tag-run-v2-contract-approvals.json. Entries must be supplied through a separately reviewed operator/repository change after an independent contract audit and owner approval. There is no CLI flag or RPC fallback that turns an observed hash into an approved one. Audit reviewer/reference fields are provenance requirements; software cannot certify reviewer independence merely because those strings exist. Access to the privileged script and its policy file must remain controlled.

Each approval specifies:

| Field | Required meaning |
| --- | --- |
| assetKey | Exact canonical WAX chain + contract + symbol + precision |
| codeHash | Independently reviewed deployed WASM SHA-256 |
| abiHash | Reviewed packed ABI SHA-256; fetched ABI bytes are hashed locally |
| adapter | Supported audited transfer-behaviour checker |
| configState | Explicit approved presence/absence of supported configuration |
| auditReviewer / auditReference | Independent review provenance |
| validUntil | Canonical UTC ISO expiry, checked again immediately before submission |

No real hashes are pre-approved by this PR. Test fixture hashes and reviewer names are not deployment approvals. Every file load is fresh; an approval removal, changed policy digest or expiry while Anchor is open blocks submission.

## Supported behaviour

Nonzero or configured fee vectors are unsupported in this release. The complete treasury debit must equal the exact frozen payout reservation: fee units are zero. Supporting fee-bearing transfers later requires a separately approved accounting design reserving their full debit; this patch does not hide fees in a safety margin.

The kingsofgraff-config-v1 adapter is restricted to kingsofgraff. It reads the exact selected symbol's configs row as raw binary, with numeric symbol-code lower/upper bounds and a two-row fail-closed limit. It accepts only a separately approved absent row or the canonical ten-byte symbol-code + tradeable=true + empty fee-vector layout. A presence change, nonempty fee vector, disabled tradeability, wrong symbol, unexpected trailing data, pagination or malformed response blocks.

For the observed bytecode, an absent config skips the configurable fee/restriction path; a tradeable row with an empty fee vector has no configured transfer fee. The earlier #1727 review identified bagzregistry exemption/DEX dependencies in other branches. Those restricted/fee-bearing branches are not simulated or enabled here. Independent review must confirm that the approved code version obeys the adapter's assumptions.

The audited-static-zero-fee-v1 adapter is available for other independently audited contracts whose transfer path has no mutable fee/tradeability or external-registry dependency. It cannot be used for kingsofgraff. This is a specific review assertion tied to a code hash, not automatic support inferred from a standard-looking ABI.

## Send sequence and accounting

1. Existing deployed release flags and the frozen D1 intent remain mandatory. An empty/missing approval blocks before the local SEND confirmation or any UNKNOWN write.
2. The executor's existing reservation-to-broadcast_unknown CAS still occurs before signer handoff. The signer copies/freezes the request so a caller cannot alter it while a wallet prompt is open.
3. Before signing, read current D1 debit authority and query Greymass and EOSphere. Both must agree on WAX chain, complete owner/active controlling authorities, restricted permission scope, approved code/ABI, supported configuration and token balance. Each provider's code-hash reads bracket its observation. Policy is reloaded again before Anchor opens.
4. Anchor remains sign-only: broadcast:false and noModify:true. Existing exact decoded-action and raw signed-byte checks remain in place.
5. After approval, reload D1 authority and policy, repeat both providers' observations, and require unchanged code/ABI/configuration/permission and policy digests. New deposits may change the balance; they do not change the frozen payout.
6. Recheck deployed flags and D1 again after RPC reads. Validate total debit against the exact amount, per-transfer cap, cumulative committed cap and the independently recomputed 1% snapshot budget using BigInt. Current treasury balance must cover excluded funds plus the greater of frozen prior reservations + current cap commitments and all currently unpaid reviewed winner bundles, including winners without registrations or payout intents. Missing or malformed liability data blocks the send. A concurrent commitment increase must still fit the observed balance.
7. Reload policy/expiry once more, then attempt one push. A rejection after handoff retains UNKNOWN for manual reconciliation and never creates an automatic retry.

Reconciliation of already-broadcast transfers remains available under the previous paused-mode rules and does not require a currently valid approval to settle an old irreversible chain receipt.

## Limits that still matter

These checks are client-side observations, not a transaction-atomic on-chain condition. An administrator can change code, fees, registry or permission state after the final reads and before chain execution. The independent audit/release decision must address that residual race, upgrade authority and the total-debit guarantee; an on-chain assertion mechanism or contract-level immutable controls would be a separate implementation. Matching RPC responses are not irreversible historical balance proofs. A standard ABI, two current observations and an empty fee list do not substitute for full independent contract approval.

No automatic signer, payout cron, public endpoint, token allowlisting, donation conversion or new payout authorization is introduced. Existing #1697 funding, persisted-draw, legal/security and explicit amount/destination release gates still apply.

## Manual verification

Run from the repository root on Node 24:

- node --test scripts/tag-run-v2-contract-send-guard.test.mjs scripts/tag-run-v2-owner-payout.test.mjs
- node --test scripts/tag-run-v2-payout-executor-pr9.test.mjs scripts/tag-run-v2-one-percent-policy.test.mjs scripts/tag-run-v2-payout-dry-run.test.mjs
- npm run ci:worker-api

The new test is registered in the existing manual Worker API domain runner. No workflow triggers are changed. Tests cover code/ABI/fee/tradeability/balance/approval changes during an open Anchor prompt, raw configuration parsing, provider failures and disagreement, over-budget/BigInt totals, missing approvals before ledger mutation, emergency pause during RPC, frozen-request mutation and UNKNOWN retention without broadcast/retry. The new owner query is compiled against the canonical SQLite schema in the owner-flow test.

The endpoint shapes are documented in https://docs.antelope.io/leap-plugins/latest/chain.api/ . RPC reads use fixed providers, no redirects, a ten-second timeout per request and a 512 KiB response limit. Node 24's --use-system-ca may be needed on the operator workstation to use its Windows trust store; TLS verification must not be disabled.

## Validation recorded — 10 November 2026

The focused contract-send, owner-payout and WAX-authority suites passed 73/73 tests on Node 24.14.0. The complete manual `node scripts/ci-domain-runner.mjs worker-api` run completed all 196 commands with exit code 0, including the final controller-change tests. Staged whitespace checks passed. No live Anchor-device transaction signing, transfer, production migration, deployment or independent contract approval was performed.
