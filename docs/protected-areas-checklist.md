# Protected areas compliance checklist

This checklist is mandatory for every human or automated agent changing this repository.

The broad validation workflows are intentionally manual-only. That saves GitHub Actions time; it does **not** suspend product, security, canon, deployment, or data-integrity contracts. A disabled or untriggered workflow is not permission to skip the checks relevant to a change.

## Required agent procedure

1. Read `AGENTS.md`, `AGENT_EDITING_RULES.md`, this checklist, and any authority documents named for the affected area.
2. Inspect current `main` and list every changed path before editing.
3. Map every changed path to **all** matching protected areas below. One change can require several groups of checks.
4. Make the smallest scoped patch. Do not weaken, delete, bypass, or silently skip a test to obtain a pass.
5. Run the focused checks for each matching area. Use the complete domain runner when behavior or contracts change.
6. Report the exact commands and results. If a check was not run, state that clearly with the reason and remaining risk.
7. Keep merge, deployment, migration, payout, key use, and other irreversible actions pending until GK explicitly approves them.

Passing local checks does not prove production deployment, live blockchain behavior, external service health, or migration completion.

## Protected-area map

| Protected area | Typical paths and changes | Contracts that must remain true | Minimum focused checks | Complete domain |
| --- | --- | --- | --- | --- |
| Canon, Wiki, lore and publishing state | `brand-canon/**`, `wiki/**`, `og-templates/**`, canon scripts, public lore pages | Read `brand-canon/README.md`, `CANON_POLICY.md`, locks and reconciliation decisions. Preserve supported history, IDs, URLs, ownership, source receipts and substantial stories. Proposals are not approvals. | `npm run test:canon`; `npm run test:wiki-structure`; relevant generator/check command | `npm run ci:wiki` |
| Worker, API, Telegram auth, Moonpet server and D1 | `workers/**`, Worker configuration, API/auth/Telegram routes, server state and migrations | Preserve signed identity, authorization, rate limits, replay protection, schema compatibility and fail-closed behavior. Never expose secrets. Do not run remote D1 migrations or deploy a Worker without GK approval. | Relevant Node test file(s); `npm run worker:build-check`; migration verification when migrations change | `npm run ci:worker-api` |
| Moonpet client, browser behavior and art | `moonpet-game.html`, `js/moonpet-*.js`, Moonpet styles/assets, browser fixtures and tests | Preserve Telegram identity, permanent pet state, recovery, lifecycle timing, room contracts and art architecture. Tests using clocks or processes must have explicit bounded cleanup. | Relevant Moonpet test file(s); `npm run moonpet:art:check` for art/asset changes | `npm run ci:visual` |
| Arcade, games, XP and leaderboards | `games/**`, game scripts/assets, leaderboard clients, Arcade identity and progression | Preserve signed auth, server authority, score/XP separation, anti-cheat, replay protection, course/version compatibility and existing player identity. | Relevant game test; `npm run test:nbg-level1` for NBG Level 1; `npm run test:invaders-ship` for Invaders ship assets | `npm run ci:arcade` |
| WAX, NFT metadata, feeds and rarity | Collection/NFT pages, WAX scripts/data, metadata, feed registries, rarity and ownership logic | Keep contract, symbol and precision exact. Preserve provenance and ownership semantics. Never sign or broadcast a real transaction as a test. | Relevant metadata/feed/audit test(s) | `npm run ci:wax` |
| Public shell, homepage, navigation, SEO and visual behavior | Public HTML, shared CSS/JS shell, homepage, navigation, sitemap and metadata | Preserve accessibility, canonical URLs, live-vs-planned truth, working links, responsive behavior and runtime mounts. Cosmetic work must not alter unrelated auth or gameplay. | `npm run test:shell-parity`; `npm run seo:test`; `npm run seo:audit`; relevant page/browser test | `npm run ci:visual` |
| CI, workflows and test harnesses | `.github/workflows/**`, `scripts/ci-*.mjs`, domain runners and package scripts | Validation remains manual-only unless GK approves exact automatic triggers. Preserve all five Full Linux domains and the final all-domains gate. Do not manufacture green statuses. | Relevant workflow/domain-runner tests; run each affected `npm run ci:<domain>` command | Full Linux Test Suite |
| Deployment, migrations and provenance | Pages/Worker deployment workflows, `wrangler*`, deploy helpers, migration files | Preserve Pages compatibility gates, version/provenance records and documented deployment order. A dry run is not a deployment. | Appropriate build/dry-run and migration verification | Relevant domain plus manual release verification |
| Secrets, custody, rewards and payouts | Keys, permissions, WAX custody, TAG RUN draws/rewards, payout code and production flags | No secret disclosure, real signing, payout, approval expansion, custody change or production enablement without explicit GK authority. Preserve deterministic accounting and duplicate-payment protection. | Focused reward/payout/auth tests | `npm run ci:worker-api` and, where WAX contracts/metadata change, `npm run ci:wax` |

If a path fits more than one row, run the union of the checks. For example, a Moonpet client change that modifies Telegram auth belongs to both **Moonpet/visual** and **Worker/API/auth**.

## Generated canon state

Wiki/canon generation is Linux-bound because its directory-safety checks require Linux `/proc/self/fd` anchoring.

For a change that affects generated Wiki state:

1. Run the generator in Linux/WSL.
2. Run `node scripts/generate-wiki-content-state.mjs --check`.
3. Review and commit only the intended generated artifacts.
4. Run `npm run test:canon` and `npm run ci:wiki`.

Do not hand-edit hashes to make a check pass. A shallow clone may not contain historical objects needed by canon tests; fetch the required history before treating missing objects as a product defect.

## When the full suite is required

Dispatch **Actions → Full Linux Test Suite → Run workflow** for the intended branch when:

- GK requests a final or comprehensive check;
- a release candidate or high-risk merge needs all-domain evidence;
- changes span multiple protected domains;
- auth, security, scoring, rewards, payouts, migrations or deployment gates change;
- CI/domain grouping or shared test infrastructure changes; or
- focused results show possible cross-domain effects.

The suite runs Wiki, Worker/API, Arcade, WAX and Visual. Its final gate is green only when all five succeed for the displayed commit. It does not deploy anything.

For a small static image, text, CSS or isolated page edit, broad browser/Worker/D1 suites are normally unnecessary. The agent must still verify the file, path, references, accessibility and affected page, run any directly relevant guard, and disclose that broader checks were not run.

## Mandatory PR handoff

Every PR touching a protected area must include:

- changed files and intended behavior;
- protected areas matched;
- exact commands run and their results;
- checks not run, with reasons;
- generated files or migrations involved;
- deployment/migration order, if applicable;
- remaining risks or blockers; and
- the statement **“Merge/deploy/migrate remains pending GK approval”** unless GK has explicitly authorized that exact action.

A vague statement such as “tests passed” is not enough.
