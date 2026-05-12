# Contributing

## Branch safety

- Stale `codex/*` branches must not be merged directly.
- Any reopened branch must be rebased or recreated from the latest `main` before review.

## Validation before merge

- `npm test` must pass before merge.
- Every PR must complete the pull request template. PRs with missing deploy/test scope must not be merged.

## Deployment and restart notes

- Worker changes require an explicit deploy note in the PR.
- VPS/server changes require an explicit restart note in the PR.
