# TAG RUN V2 — WAX read-only authorization review

**This is NOT a payout release, signing workflow, `linkauth` command, custody certificate, security audit or immutable funding snapshot.** No live transfers, permissions or production flags change.

## What the module checks

The isolated verifier `workers/moonboys-api/tag-run/v2-wax-authority-review.js` reads two separately operated WAX mainnet RPC services: Greymass (`https://wax.greymass.com`) and EOSphere (`https://wax.eosphere.io`). These are configured as strict host allowlists, not user-supplied URLs. Only these six read endpoints are permitted:

```
get_info
get_account
get_abi
get_code_hash
get_currency_stats
get_currency_balance
```

For the exact treasury `isthatajoint` and selected fungible token identity, the verifier requires:

- Both providers are WAX mainnet with a positive last irreversible block.
- Owner and active permissions exist with a valid `owner` → `active` → `tagrain` hierarchy. **Both independent providers must agree on the complete owner and active authority definitions**—threshold, keys/weights, delegated actor/permission/weights, waits/weights, and linked actions. Set ordering differences are normalized; malformed or conflicting authority evidence fails closed.
- `tagrain` has threshold 1, exactly the previously verified public signing key with weight 1, no other delegated account or wait authorities.
- There are no unexpected action links. A matching `contract::transfer` link is observed only; it is NEVER created by this tool.
- The `transfer` ABI is the standard `(from:name,to:name,quantity:asset,memo:string)` layout.
- The code hash is present, nonzero and agrees between providers. A hash is only considered *pinned* if supplied by an **independent** approved WASM audit (never just copied unreviewed from the same RPC response).
- Token issuer and supply/max supply are structurally valid, and WAX quantity precision exactly matches the requested symbol/precision.
- Current treasury token balances and normalized authority/ABI/code/statistic observations match across both nodes.

Provider failure, malformed evidence, mismatch, an absent transfer link, an unexpected permission, an unpinned hash, or an empty token balance returns **BLOCKED**. Matching observations return only **MANUAL_REVIEW_REQUIRED**, with release, signing, broadcasting and custody authorization explicitly false. The operator CLI exit code is 2 for BLOCKED, 3 for manual review and 1 for errors; there is no payout-authorized success code.

**Limitations:** Even an agreed code hash and token ABI cannot prove the smart contract implements `require_auth(from)` correctly. The deployed WASM needs independent source/bytecode audit and approved hash provenance. Two current chain RPC reads are not proof of a historical irreversible snapshot, nor cryptographically independent chain inclusion evidence. An action link applies at the **contract action** level, not to a particular token symbol or maximum amount. For `kingsofgraff::transfer`, that includes both LFGK and DUMPIT. The separate owner signing and D1 reservation protections are still mandatory before any hypothetical future payout.

## Operator read-only command (Windows)

Run after checking out this PR branch:

```powershell
cd D:\GITHUB\Crypto-Moonboys.github.io
node --test scripts/tag-run-v2-wax-authority-review.test.mjs
echo $LASTEXITCODE
```

To inspect WAX account state **without signing or transmitting any transaction**:

```powershell
node scripts/tag-run-v2-wax-authority-review.mjs --contract kingsofgraff --symbol LFGK --precision 4
```

Without a separately audited contract hash, the expected status is BLOCKED, including `independent_wasm_hash_approval_missing`; current `isthatajoint@tagrain` also had no action links in the prior on-chain inspection. No private key, Anchor session, API credential, D1 write, D1 schema change, Worker route or scheduled task is required.

If and only if a qualified independent reviewer supplies a SHA-256 code hash matched to the **audited deployed WASM**, add `--approved-code-hash <64-character-hex>` to compare it against live observations. Doing so **still cannot authorize token transfers**.

## Tests and development guardrails

```powershell
node --test scripts/tag-run-v2-wax-authority-review.test.mjs
npm run ci:worker-api
```

Tests mock both providers and exercise good observations, missing links, unexpected extra action links, authority/key/threshold changes, **owner and active key/delegation/wait disagreements, malformed parent authority structures and order-only equivalence**, malformed ABI, code hash mismatches, unpinned hash, wrong chain, mismatched balance, precision and RPC outages, and CLI argument safety.

No automatic workflow triggers are added; the manual Worker API domain suite is extended with the new focused test. PR review and explicit owner approval are required before merge. Production funded draws and transfers remain OFF.

## Structured failure diagnostics

If the verifier cannot validate both providers, it continues to return
`BLOCKED` and `independent_wax_rpc_evidence_unavailable`, with a new
`diagnostics` array. Each entry has only the allowlisted RPC provider,
the read-only endpoint or validation stage, and a bounded machine-readable
error code. No RPC response body, raw exception, credentials, private keys
or request payloads are included.

For example:

```json
{
  "status":"BLOCKED",
  "reasonCodes":["independent_wax_rpc_evidence_unavailable"],
  "diagnostics":[{
    "provider":"https://wax.eosphere.io",
    "stage":"get_currency_stats",
    "code":"token_precision_mismatch"
  }],
  "releaseAuthorized":false
}
```

`rpc_transport_failure`, `rpc_http_failure` and `rpc_invalid_json`
distinguish connectivity/HTTP/JSON errors from parsed-response validation.
Both providers are inspected using `Promise.allSettled`, so one failure
cannot suppress the other. Validity is still all-or-nothing; the diagnostics
are **not** an approval bypass.

After merging this change, repeat the exact local read-only command and
use the new `diagnostics` entries to determine the true cause. Do not
change WAX permissions, sign a transaction or enable funded draws.
