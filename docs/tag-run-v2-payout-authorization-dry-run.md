# TAG RUN V2 — READ-ONLY payout authorization dry run

**Purpose:** Test payout eligibility against reviewed D1 evidence without
reserving funds, changing production flags, modifying WAX authorities or
signing/broadcasting tokens. This adds no public route, cron or migration.

This is an **operator preflight**, not the automatic signer. The production
executor/ledger and scheduled automation remain the only transaction
authority; this preview never inherits their release permission.

## Security and reviewed source checks

- Exact WAX mainnet, token contract, symbol, and precision; local
  operator asset allowlist is mandatory but does NOT override D1.
- Asset eligibility must be `approved` in D1, with verified and reviewed metadata.
- Token identity must be explicitly approved in D1. Funding comes from the independently corroborated irreversible `isthatajoint` balance snapshot; individual inbound tips do not require separate approval. Unknown or quarantined token identities remain excluded.
- Pool `review_only`, wallet `isthatajoint`, daily budget BPS 500,
  historical ticket BPS 5000.
- Verified irreversible source snapshot with full exact-string/BigInt arithmetic.
  The 1% daily cap is floor((onchain - allocated - excluded) * 100 / 10000).
- Exact payout cap bound to the immutable snapshot, no pause, cumulative
  committed amount and per-transfer limit. Reject cross-day unresolved caps.
- Reviewed draw + reviewer, frozen nonzero `preview_only` bundle, registered
  recipient, no duplicate payout intent for the same bundle.
- Any D1 error fails closed; no signer, D1 write or network broadcast exists
  in this module. An unsigned action preview is informational only.

**Outputs:** `BLOCKED` with reason codes or `REVIEW_CANDIDATE`. Both always
have `releaseAuthorized:false`, `reserveAttempted:false`,
`signatureRequested:false` and `transactionBroadcast:false`.
A candidate is **never authorization for payout**. The preview can become
stale between reads. Token WASM safety, actual WAX permission links, donor
consent and finality require separate independent checks.

## Run locally on Windows

From the repository root:

```powershell
cd D:\GITHUB\Crypto-Moonboys.github.io
node --test scripts/tag-run-v2-payout-dry-run.test.mjs
echo $LASTEXITCODE
```

To inspect a production D1 record with **only a scoped READ-ONLY Cloudflare
D1 API token** (never put tokens in GitHub, screenshots or this chat):

```powershell
$env:CLOUDFLARE_API_TOKEN="<short-lived D1 read-only token>"
$env:CLOUDFLARE_ACCOUNT_ID="<Cloudflare account ID>"
$env:TAG_RUN_OPERATOR_GROUP_ID="<configured Telegram group ID>"

node scripts/tag-run-v2-payout-dry-run.mjs --asset kingsofgraff:LFGK:4 --day 2026-11-02 --bundle 0
```

The example should be BLOCKED in current production; it does not invent
approvals. With independently reviewed D1 records, an operator can append
`--allow-asset kingsofgraff:LFGK:4 --review-digest <real-64-hex> --reviewer <review-reference>`.
These are **manual review selectors**, not authoritative permission to send.

Exit 0 = a review candidate (never allowed to send), 2 = blocked, and 1 =
invalid arguments or private D1 read failure. The CLI is SELECT-only and
does not expose a D1 write method. It imports the existing owner D1 REST
adapter only to perform authenticated SELECT queries.

## Launch restrictions

Do not infer symbol-specific controls from WAX `linkauth`. Linking
`kingsofgraff::transfer` affects both LFGK and DUMPIT; permission links
cannot restrict quantity or destination. No contract link is created here.
Full on-chain authorization/WASM review, approved token identity and balance snapshot, approved draw,
legal and treasury authorization, and safeguarded owner signing are required
before a separately approved real payout.

**Production release:** PR #1746 adds separately gated automatic scheduling,
signing and payout execution. This dry-run module remains SELECT-only and can
never reserve, sign, broadcast or authorize that release. See
`docs/tag-run-v2-full-automation-release.md` for the actual deployment gates.

## Regression test scope

Tests use an in-memory SQLite database with the current TAG RUN migrations,
and cover 1% BigInt arithmetic, duplicate reservations, per-transfer cap,
cumulative remaining cap, wallet substitution, asset quarantine,
snapshot tampering, draw/pool/cap pauses, read failures and
SELECT-only CLI query enforcement. Additional full Worker tests are
required before merge. Passing test fixtures are not proof of live funding.

## PR #1720 review remediation (2026-11-05)

Fixed four Codex findings: use a genuinely invalid WAX destination for rejection coverage while a valid changed registration is read from D1; compare all four stored asset identity columns; validate reviewed confirmed donations at or before snapshot irreversible block with BigInt balance reconciliation; validate draw snapshot commitment and fail closed on multi-asset draws lacking a published aggregate digest scheme. New SQLite test cases cover identity tampering, partial/refund-review donor balances, future/revoked donation evidence and mismatched/ambiguous draw commitments.

**Validation:** syntax checks and eight isolated pure-logic scenarios passed after patching. Full migration-backed `node --test scripts/tag-run-v2-payout-dry-run.test.mjs` and `npm run ci:worker-api` are still outstanding; do not claim they have passed. No payout activation or production D1 mutation is authorised by this dry run.

## PR #1746 policy alignment (2026-11-12)

Per-transfer donation approval was removed. The payout preflight now trusts only the reviewed token identity, immutable verified snapshot, canonical draw commitment, payout cap and registered destination. Deposit rows cannot add or remove authority.
