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

The button calls `Link.identify` with an explicit account/permission and relies on Anchor Link's signature recovery, on-chain key/threshold check, and exact requested-permission check. This is **not** a token-transfer signing test. The identity request does not use `transact` or `broadcast`. Inspect the Anchor prompt and reject any transaction or unfamiliar action.

## Acceptance
- Success only when `identify` returns the exact `isthatajoint@tagrain` signer and recovered signing key matches the on-chain key.
- Wrong actor, permission, chain or key fails closed.
- No private keys or raw signatures logged or stored.
- No transfers, chain state changes, or production feature-flag changes.
- Browser/Anchor compatibility and dependency advisories must be reviewed before merge. This draft is **not release approval**.

Note: `anchor-link-browser-transport` integration is proposed, **not yet validated in a live browser**. If build or browser handshake fails, report error and do not fall back to a broadcast transaction.

## Automated negative tests (no wallet prompts)

Run `node --test verify.test.mjs` from this directory. All seven tests must pass. The live browser proof additionally requires `verifyProofs: true`, a populated verified account, correct chain and the registered signing key. Rebuild after pulling this PR.

**Important:** A prior green result without explicit `verifyProofs: true` was not sufficient evidence of cryptographic authority verification. Retest the live Anchor flow after this change. Do not merge based on the earlier screenshot alone.
