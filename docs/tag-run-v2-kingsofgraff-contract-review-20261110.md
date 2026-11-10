# TAG RUN #1697 — deployed contract authorization checkpoint

Date: 10 November 2026. Base: 060975179. Treasury: isthatajoint. Contract: kingsofgraff.

## Result

The archived deployed WASM reaches the exact transfer sender's require_auth call before token-table access or inline actions in the offline cases below. This closes the narrow ABI-only uncertainty about which account is passed to that host call. It does not establish full contract safety, execute a successful transfer, validate a real signature or approve the observed code hash for production.

The release remains blocked on independently approved contract review, the missing contract transfer link, approved donated funding and the remaining #1697 release requirements. The offline probe deliberately stops at the authorization boundary.

## Corrected identity checkpoint

The current scripts/tagrain-identity-browser/README.md records an operator-confirmed live identity proof on 5 November using verifyProofs: true and parsed public-key equality. The earlier issue summary saying no successful proof was recorded was stale. This review reran the ten existing negative/unit tests; it did not request another live Anchor signature. The existing dependency audit remains 3 low and 3 moderate findings, not clean production-signing approval.

## Public chain evidence

See [the saved observations](evidence/tag-run-1697-contract-20261110.json), captured at 2026-11-10T19:10:12.211Z. These are contemporaneous head-state observations. The reported LIB heights do not make account/configuration reads immutable historical state proofs.

| Check | Observed result |
| --- | --- |
| Providers | Greymass and EOSphere |
| Chain | WAX mainnet, matching canonical 64-character chain ID |
| tagrain parent / threshold | active / 1 |
| tagrain signing key | Expected dedicated public key, weight 1 |
| Delegations / waits / linked actions | All empty |
| Deployed bytecode | 74,562 bytes; identical independently downloaded binary hash on both providers |
| SHA-256 | c08fb0c42b5b71f3b4a5c17afdeacfd9ca7036b2c1efdbd80cd91c4ad6f00408 |
| Config rows under kingsofgraff | DUMPIT: is_tradeable=1, tx_fees=[]; no LFGK row in the complete result |
| Exact treasury fee exemption lookup | No matching isthatajoint row for either token or shared registry |

The two downloads used get_raw_code_and_abi and base64 decoding. The legacy get_code wasm JSON string did not reconstruct the reported binary hash and was discarded. The binary committed here matches the get_code_hash response. This is an observed hash, deliberately not an approved hash pin.

## Sender authorization trace

Disassembly used WABT 1.0.39 locally; no WABT dependency is added to the project. The deployed apply entry checks receiver==code before dispatching the transfer action (name value 14829575313431724032, signed i64 -3617168760277827584). Its generated dispatcher f200 deserializes from, to, quantity and memo, then invokes f162 with those exact field pointers.

The beginning of f162 rejects self-transfer, loads from into its local l6, and unconditionally calls env.require_auth(l6). The first token-table lookup and recipient notifications occur afterward. The function names are generated disassembly labels, not recovered source names.

The standalone test archives the original public WASM, checks its SHA-256, and adds only an export for existing memory 0 so the local host can implement read_action_data/memcpy. A test verifies every non-export section is byte-for-byte unchanged, including the instruction section. It also checks the original apply export remains. No chain host implementation, wallet, RPC, D1 adapter or signer is available in the offline VM. The simulated authorization host always throws at the checkpoint; even a matching simulated sender never completes the transfer.

Covered cases: LFGK and DUMPIT sender checks; changed sender; recipient/contract authorization substitution; zero, negative and large quantities; long memo; self-transfer rejection; foreign-code notification; and explicit checkpoint-only semantics. These cases are evidence about this observed binary, not a substitute for a complete independent bytecode/source audit or a blockchain authorization-engine test.

## Contract-specific findings before permission linking

This is not an unmodified standard token implementation. The deployed ABI and bytecode include:

- configs with per-symbol is_tradeable and tx_fees; settxfees can change fee configuration.
- Per-token exempted lookups using numeric symbol-code scopes (LFGK 1262962252; DUMPIT 92673856591172).
- Shared bagzregistry exempted and dexes dependencies. The latter participates in restrictions when a token configuration disables general tradeability.
- A transfer fee path (f166), after the primary sender debit, that can credit fee recipients, emit an inline fee log and debit the sender again. String evidence includes a separate insufficient-balance-for-transfer-fee message. The empty current fee vectors do not prove fees cannot change later.

Before a real release, the independent review must resolve those branches and mutable configuration. The protected signer/accounting policy must cover the treasury's total debit, including any fees, and the exact deployed code version. A standard transfer ABI or an observed zero-fee configuration alone cannot approve arbitrary tokens. The present owner payout path validates signed action bytes and fresh D1/release state; these observations must not be represented as a new fee-aware send guard.

A kingsofgraff::transfer link would cover every symbol under that contract, including LFGK and DUMPIT. It does not inherently constrain quantity, recipient or total daily spending. No linkauth, updateauth, token approval or permission change was prepared for execution or sent by this checkpoint.

## Validation performed

- node --test scripts/tagrain-identity-browser/verify.test.mjs — 10/10 pass on the unchanged operator checkout.
- node --test scripts/tag-run-v2-wax-authority-review.test.mjs — 21/21 pass on the unchanged operator checkout.
- node --test scripts/tag-run-v2-deployed-authorization.test.mjs — 11/11 pass on this branch.
- node --use-system-ca scripts/tag-run-v2-wax-authority-review.mjs --contract kingsofgraff --symbol LFGK --precision 4 — expected BLOCKED (exit 2), specifically tagrain_transfer_action_not_linked and independent_wasm_hash_approval_missing.

The plain Node RPC command initially failed local certificate trust. Node 24's --use-system-ca used the Windows trust store and completed the same checks without disabling TLS verification. No production transport behavior was changed.

Full Worker API CI, new live Anchor approval, successful token execution, source-build reproducibility, independent full WASM audit, fee-bearing transfer simulation, production funding and finality proof were not performed here. No workflow was triggered or edited. Existing scoring and production funded switches were not changed.

## Next release work

1. Obtain independent review of this deployed binary and its fee/tradeability/registry behavior; approve an exact version and total-debit policy. This document is a review input, not that approval.
2. Complete the protected send-path code/version/fee checks required by that policy before enabling any payout path.
3. Prepare the exact restricted transfer link for separate owner approval only after contract review is accepted.
4. Continue asset/funding approval, persisted funded draws and separately authorized micro-payout verification under #1697.
