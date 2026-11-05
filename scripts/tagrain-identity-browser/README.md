# TAGRAIN browser-only identity proof harness

This is an **isolated manual test**, not a production signing service. Do not deploy this directory or commit generated bundles. No tokens, transfer actions, `linkauth`, or `updateauth` are requested.

## Prerequisites
- Anchor desktop with `isthatajoint@tagrain` selected and unlocked.
- Node 24, browser, localhost. Do **not** paste any private key.
- Run from this directory in a disposable workspace:

```powershell
npm install --no-save --package-lock=false anchor-link@^3.3.0 anchor-link-browser-transport@3.6.1 @greymass/eosio esbuild
npx esbuild identity.mjs --bundle --format=esm --platform=browser --outfile=identity.bundle.js
python -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/` in a browser. If Python is unavailable use any static HTTP server bound to localhost. **Do not host publicly.**

The button calls `Link.login('tagraintest')` with `verifyProofs: true`, then checks the returned signer, WAX chain and registered public key. The browser test does not invoke transfer or transaction broadcast. Inspect the Anchor prompt and reject any transaction or unfamiliar action.

## Acceptance
- Success only when `login` returns the exact `isthatajoint@tagrain` signer and recovered signing key matches the on-chain key.
- Wrong actor, permission, chain or key fails closed.
- No private keys or raw signatures logged or stored.
- No transfers, chain state changes, or production feature-flag changes.
- Browser/Anchor compatibility and dependency advisories must be reviewed before merge. This harness is not payout release approval.

The operator confirmed a successful live localhost Anchor identity test on 2026-11-05 (10/10 local unit tests, successful browser bundle build). If build or browser handshake fails, report error and do not fall back to a broadcast transaction.

## Automated negative tests (no wallet prompts)

Run `node --test verify.test.mjs` from this directory. All ten tests must pass. The live browser proof additionally requires `verifyProofs: true`, a populated verified account, correct chain and the registered signing key. Rebuild after pulling this PR.

**Important:** A prior green result without explicit `verifyProofs: true` was not sufficient evidence of cryptographic authority verification. Retest the live Anchor flow after this change. Do not merge based on the earlier screenshot alone.

## Dependency security scope

The existing repository-root `npm audit --omit=dev` reports vulnerable `body-parser`, `qs`, and `zod` dependencies through Express/PixelLab. Running it from this folder without an independent manifest audits the same parent project. The one-off `npm install --no-save` also reported additional advisories; these must not be represented as cleared. Audit a separate disposable directory with its own manifest/lockfile for the exact browser-harness dependencies before treating dependency security as signed off. Never run `npm audit fix` on the main repo solely for this harness.

## Isolated dependency audit — 2026-11-05

Operator ran a disposable audit in `D:\TAGRAIN-AUDIT` using `anchor-link@3.3.0`, `anchor-link-browser-transport@3.6.1`, `@greymass/eosio`, and `esbuild`. `npm audit --omit=dev` reported **6 vulnerabilities (3 low, 3 moderate, 0 high/critical)**. Findings include `elliptic` (cryptographic primitive implementation, no fix available) and `uuid <11.1.1` (missing bounds check, no fix available), with transitive dependencies. This is **not a clean audit**; risks must be accepted explicitly for localhost-only manual use or dependencies replaced before broader deployment. No approval for production signing, reward payout or token transfer follows from this result.

Manual browser identity proof succeeded with `verifyProofs: true` and parsed public-key equality; 10 unit tests and bundle build passed in operator's Windows environment. This is evidence of one successful manual test, not proof of general security or of transaction-signing authority.
