# Dependency security remediation — 2026-10-23

This change addresses two Dependabot alerts without upgrading unrelated application frameworks.

- Root: `express-rate-limit` -> `ip-address` updated from 10.7.2 to 10.7.4 with a root npm override.
- Block Topia: `express` / `@colyseus/monitor` -> `proxy-addr` updated from 2.0.7 to 2.0.8 with a server npm override.
- GitHub Actions CI uses Node 22; `.nvmrc` now documents the same local default. Existing `engines.node >=22` is intentionally unchanged.
- No Cloudflare D1 migrations or MoonPet gameplay changes.

## Verification before merge

1. Run `npm ci` and `npm ls ip-address proxy-addr` from the repository root.
2. Run `npm ci` and `npm ls proxy-addr` from `server/block-topia`.
3. Run `npm audit --omit=dev` in each location, recording other pre-existing findings separately.
4. Run root CI and `npm test` in `server/block-topia`.
5. Inspect the exact Node/npm warnings from the Actions logs; do not suppress them or conflate them with Dependabot alerts.
6. Verify Block Topia trust-proxy setup across the deployment ingress. Do not enable broad `trust proxy` as a workaround.
7. Confirm Dependabot alerts close after the merge and the appropriate deployment rebuild.

Note: The ip-address 10.7.4 lock entry has no integrity hash because package registry metadata could not be fetched in the authoring environment. Regenerate both lockfiles with `npm install --package-lock-only --ignore-scripts` in their respective directories before merge, and review the resulting diff. Do not merge if npm ci or the security assertions fail.
