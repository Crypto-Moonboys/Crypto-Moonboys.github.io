# TAG RUN V2 — Canonical multi-token draw snapshot commitment (v1)

**Scope:** read-only canonical digest verification. No wallet keys, chain actions,
D1 migration, payout reservation, transaction signing, linkauth, release flags,
deployment, or funded draw activation.

## Why

The existing review-only payout preflight supported one legacy snapshot digest,
but deliberately blocked multi-token draws because migration 104 does not define
a canonical aggregate hash. This PR introduces a deterministic, versioned
commitment format and verifies it against the reviewed draw's
`snapshots_digest` field. **It does not generate or overwrite reviewed draw
records.** A separate approved review workflow must persist the exact digest
before a multi-token draw can become a read-only review candidate.

## Canonical v1 payload

The SHA-256 input is the UTF-8 encoding of the JSON array:

```text
[
  "tag-run-v2:snapshot-set:v1",
  "<WAX mainnet chain ID>",
  "isthatajoint",
  "<authenticated chat ID>",
  "<YYYY-MM-DD UTC day>",
  [
    [
      "<full asset key>",
      "<existing 64-char snapshot digest>",
      <irreversible block number>,
      "<64-char block ID>",
      "<onchain integer base units>",
      "<allocated unpaid integer base units>",
      "<excluded integer base units>",
      "<spendable integer base units>",
      "<5 percent integer base units>"
    ],
    ...
  ]
]
```

- Rows sorted by the **full canonical asset key**, not by UI order.
- Duplicate asset keys, wrong chain, wrong wallet, malformed digest, missing
  source block, inconsistent balance arithmetic, non-verified snapshots and
  more than 100 assets all fail closed.
- Integer token units use decimal strings and BigInt. No floating point.
- The exact 5% per-token budget is
  `floor((onchain - allocated_unpaid - excluded) * 500 / 10000)`.
- Each snapshot must have a matching stored contract/symbol/precision/chain
  record. The digest is bound to the selected UTC day; independent evidence\n  must establish the source's timing.
- The hash is domain separated and bound to WAX chain, treasury, group and day.

**Compatibility:** Existing *single-asset* reviewed draws may retain their
legacy `snapshots_digest = snapshot_digest` binding. For two or more assets,
the preflight requires the new canonical v1 SHA-256 digest. No heuristic,
fallback, or unreviewed conversion is permitted.

## Windows test

```powershell
cd D:\GITHUB\Crypto-Moonboys.github.io
node --test scripts/tag-run-v2-snapshot-commitment.test.mjs
node --test scripts/tag-run-v2-payout-dry-run.test.mjs
npm run ci:worker-api
```

The SQLite-backed payout test creates a two-token reviewed draw, calculates
the canonical digest, verifies a review candidate, then tampers with a block
and verifies rejection. Pure tests cover order independence, tampering,
duplicates, invalid source metadata and domain separation.

## Independent on-chain authorization — next separate gate

This digest establishes **data integrity only**, not WAX custody or authority.
Before any transfer approval, a separate read-only on-chain gate must verify
the live chain ID, irreversible-block source, exact token contract/action ABI
and deployed WASM, treasury permission tree, `tagrain` signing authority,
linkauth action scope, current balance, token precision, donation provenance,
and destination controls. In particular, linking
`kingsofgraff::transfer` affects **both** LFGK and DUMPIT and cannot
restrict amount or destination. Do not link it based on this PR.

**Real payouts, funded draws and transfers remain OFF.**
