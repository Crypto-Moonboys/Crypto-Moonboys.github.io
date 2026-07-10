# Status

- Branch created from `main` after PR #1016.
- Runtime contract is implemented.
- Competitive Arcade entry now requires server-backed Telegram verification before gameplay bootstrap.
- Shared submission/sync paths keep the no-local-pending competitive-run contract enforced.
- Leaderboard writes now require authoritative `/gklink` linkage, and public reads sanitize legacy guest-like names without deleting authenticated rows.
- Automated validation is green:
  - `node scripts/telegram-hard-gate-runtime-contract.test.mjs`
  - `node scripts/ci-domain-runner.mjs arcade`
  - `node scripts/ci-domain-runner.mjs worker-api`
  - `node scripts/leaderboard-worker-p1-regression.test.mjs`
  - `npm test`
