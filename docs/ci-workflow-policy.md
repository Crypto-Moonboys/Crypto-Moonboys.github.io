# CI workflow policy — GK-approved lightweight operation

**Decision (27 October 2026):** eliminate routine automatic GitHub Actions checks so a small image/page/text change does not queue long, unrelated suites. Agents remain responsible for checking their own work and disclosing risks. This change controls triggers, **not** whether a feature is tested when material.

## What runs automatically

- `.github/workflows/pages.yml` still publishes merged `main` to GitHub Pages (or may be run manually). It **must** retain the NBG course-to-Worker compatibility check before publishing. A failed gate means the new client is not live. Deploy a version-compatible leaderboard Worker first, then rerun Pages.
- `.github/workflows/update-site-feeds.yml` and `.github/workflows/verified-graph-refresh.yml` keep their intended scheduled content/data refreshes. They are operations, not a check required for every PR. They can be reviewed separately if GK wants to discontinue refreshes.
- Other validation, proof, browser and Moonpet-health workflows are **manual dispatch only**. Moonpet health monitoring will **not run periodically** under this policy; operators must review production health manually until a separately approved monitor is reintroduced.

## Agents: no drift, fast changes

1. Read `AGENTS.md`, `AGENT_EDITING_RULES.md`, relevant product specs and canon policy. Preserve existing contracts, gameplay semantics, identifiers, URLs, user accounts and approved lore.
2. Inspect the exact current `main` and affected files. Do not regenerate unrelated artwork, rewrite other systems or change score/reward verification for a cosmetic patch.
3. Make narrowly scoped edits on a branch. For a single asset/image/CSS/page change, check the file, path and references; avoid Playwright, D1, and Worker suites unless the change affects them.
4. For substantial gameplay, authentication, Worker, schema or replay changes, run **targeted local checks** or dispatch the relevant manual Actions job. Record failures honestly; manual workflows do not imply tests are unnecessary.
5. Do not merge or deploy without GK's explicit approval. Describe deployment order, migrations and known blockers. Keep Pages Worker compatibility and production safety checks; do not bypass anti-cheat, replay, provenance or required permissions.
6. For PRs, give a concise summary: changed files, behavior, tests actually performed, tests not performed, risks, deploy notes and GK approval pending.
7. Do not re-enable `push`, `pull_request`, `workflow_run` or `schedule` for validation workflows without GK's explicit approval. Automatic *publishing* and scheduled content generation are distinct from validation.

## Operational cautions

- GitHub branch protection/rulesets can still require named checks even if workflows are manual-only. If merges are blocked by **Expected — Waiting for status**, GK must adjust required status checks in repository settings; automation cannot truthfully substitute a pass.
- `workflow_dispatch` is available under **Actions → select workflow → Run workflow**. Some workflows require inputs. Rerun a specific test on demand, rather than running all workflows.
- A GitHub Pages deployment gate failure is **not** a CI test failure; it indicates a real deployment prerequisite. In particular, NBG London course v6 requires the live leaderboard Worker to advertise support for v6 and required auth/D1/KV availability.
- The separate Moonpet production health probe recently failed on `/deployment-info` HTTP 503. Disabling the schedule does **not** repair the endpoint or prove gameplay health. Track incident #1648 separately.
- The repo's version-tagged production Worker deployment helper is `scripts/deploy-worker-with-provenance.mjs`. Do not replace its provenance mechanism with an untagged deploy just for speed.

## Restore checks when needed

To reintroduce automatic checks, obtain GK approval for a specific check, exact path filter, events, estimated runtime and operational owner. Prefer a narrow 1–2-minute check rather than blanket suites. Never make broad CI a hidden dependency of an image update.
