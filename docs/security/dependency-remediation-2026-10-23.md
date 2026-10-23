# Dependency security remediation — 2026-10-23

This PR addresses two Dependabot alerts without upgrading unrelated application frameworks.

- Root: `express-rate-limit` -> `ip-address` from 10.7.2 to 10.7.4, with a root npm override.
- Block Topia: `express` / `@colyseus/monitor` -> `proxy-addr` from 2.0.7 to 2.0.8, with a server npm override.
- Node 22 is the project runtime baseline. The GitHub Actions action runtimes are separate from the installed Node version; CI and Block Topia workflows use `actions/checkout@v5` and `actions/setup-node@v5` to eliminate their Node 20 action-runtime deprecation warnings.
- No Cloudflare D1 migrations, MoonPet gameplay changes, or Worker API route changes.

## Lockfile integrity

The `ip-address@10.7.4` `sha512-` hash was restored from independent public npm lockfile/package source records for the *exact* release. `proxy-addr@2.0.8` already has a SHA-512 integrity value. `npm ci` validates package tarballs against their recorded hashes, and `scripts/security-dependency-check.mjs` now asserts that both patched dependencies include syntactically valid integrity fields and that lockfiles agree with the overrides. Regenerate lockfiles through npm only when the dependency graph changes; do not strip integrity metadata.

## Evidence / required checks

- Block Topia Server PR workflow #39871509438 completed successfully with `npm ci`, `npm audit --audit-level=low`, `npm test`, root `npm ci`, and browser test before this follow-up.
- Root CI PR workflow #39871509625: worker/API, wiki, arcade, WAX jobs succeeded, visual job was still running at review time; new commits require fresh checks.
- New workflow runs must verify both `npm ci` trees and the security checker; do not merge before all required checks pass.
- Inspect Node warnings separately: prior logs also showed `punycode` and `url.parse()` deprecations, experimental SQLite warnings and module-type detection warnings. They are not fixed by changing GitHub Action runtimes. Determine their origins before making unrelated dependency upgrades.
- Check the deployed Block Topia server's actual proxy trust configuration before deployment; do not enable broad `trust proxy`.
- Verify Dependabot alert closure on merge, then rebuild/restart Block Topia only if the deployment uses this Node server. No Worker or D1 migration is required.

## Post-merge

Run `npm ls ip-address proxy-addr` from root, `npm ls proxy-addr` in `server/block-topia`, and validate the live Block Topia health endpoint, multiplayer matchmaking and authenticated monitor behavior after deploying the patched server.
