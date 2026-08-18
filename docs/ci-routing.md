# CI routing

GitHub Actions is path-aware so gameplay and infrastructure PRs run the checks for the domain they touch instead of the whole repository by default.

## Pull request routing

| Changed paths | Workflows or jobs |
| --- | --- |
| `workers/**`, `scripts/*worker*`, `scripts/telegram-pets/**`, `scripts/telegram-pets*`, `scripts/moonpet*`, `scripts/verify-d1-production-migrations*`, `deployments/**` | Worker/API CI, Moonpet tests, Worker provenance checks |
| `workers/moonboys-api/migrations/**`, `scripts/verify-d1-production-migrations*`, `deployments/**` | D1 Production Migration Verify |
| `js/**` except `js/arcade/**`, `css/**`, `*.html`, `wiki/**` | Visual/static checks, wiki checks, graph publishing integrity |
| `arcade/**`, `js/arcade/**`, `scripts/*arcade*`, `scripts/*btqm*`, `scripts/*invaders*` | Arcade CI |
| `wax/**`, `scripts/*wax*` | WAX CI |

The main `CI` workflow keeps its existing job names and routes each job with an internal changed-path detector. Jobs outside the changed domain are skipped rather than renamed or removed, which keeps branch-protection check names stable.

Workflow YAML, `package.json`, `package-lock.json`, or `scripts/ci-domain-runner.mjs` changes run every `CI` domain because they can affect routing or command resolution.

## Manual full CI

Every major CI workflow supports `workflow_dispatch`. Use **Actions** in GitHub, choose the workflow, then select **Run workflow** to run the full suite for that workflow regardless of changed paths.

For the combined repository suite, manually run **CI**. That dispatch runs wiki, Worker/API, Arcade, WAX, and visual jobs.

## Gameplay PR expectation

Gameplay and authority PRs should only run checks for the domain they touch. For example, Worker-only Moonpet authority changes should run Worker/API and relevant D1/provenance checks without triggering unrelated visual, wiki, Arcade, or WAX jobs.
