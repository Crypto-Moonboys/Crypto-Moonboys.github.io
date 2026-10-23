# Block Topia: Node warning and CORS origin audit

## Evidence

Production VPS on 2026-10-23 returned HTTP 200 at localhost:2567/health and the patched proxy-addr 2.0.8 after restart. PM2 remained online. Logs contained `MODULE_TYPELESS_PACKAGE_JSON` for `shared/block-topia/constants.js`, plus CORS denials for `https://game.cryptomoonboys.com` and `https://space.cryptomoonboys.com`. Log timestamps did not establish whether the CORS entries occurred before or after the deployment.

## Node module warning

The root package is not declared ESM; the shared constants file uses `export`. A nested `shared/block-topia/package.json` with `type: module` defines its scope without converting the entire website's root package and its CommonJS scripts to ESM. A regression test imports the shared constant from a clean Node process and checks that the warning does not occur.

## CORS diagnosis — no trust expansion

`server/block-topia/src/index.js` accepts the configured comma-separated `CORS_ORIGIN` values or defaults to `https://cryptomoonboys.com`, `https://www.cryptomoonboys.com` and `https://crypto-moonboys.github.io`. Production does not automatically permit localhost. Both Express and Colyseus origin checks use the same predicate. The multiplayer client defaults its WebSocket endpoint to `wss://game.cryptomoonboys.com`, but the request Origin is the **page hosting the browser**, not necessarily the WebSocket endpoint hostname.

The denied `game.` and `space.` origins are not sufficient evidence to allow either hostname. Do not add them without verifying a legitimate browser page at each origin, the expected auth flow, and current production `CORS_ORIGIN` configuration. In particular, never use `*` or a blanket `*.cryptomoonboys.com` wildcard.

## Live read-only verification

On the VPS, check PM2 service and localhost health; inspect actual effective `CORS_ORIGIN` without publishing environment secrets. Use browser developer tools on the real Block Topia entry page to inspect the request Origin and whether matchmaking and WebSocket upgrade succeed. Check recent, timestamped logs for CORS rejections after an actual attempted connection. If an additional browser origin is confirmed necessary, propose a separate explicit allowlist change and tests before deploying it.

## Deploy

This PR changes shared module metadata and tests/docs only; no production origin rules or game server logic are changed. If deploying the new metadata on the VPS, fast-forward the repository after checks, run the existing Block Topia test suite, and restart only the `block-topia` PM2 service during a quiet period. Do not restart Swarmsy, GitLab, or the VPS.
