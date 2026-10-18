# PR 6 / #1552 — My Moonboy final QA, provenance and release hold

**Prepared:** 2026-10-18  
**Baseline:** merged PR5 #1557, `main` at `a7779559325a406223725893bbda64995df66a47`.  
**Current decision: HOLD.** These are reviewable QA instructions and automated coverage pointers, **not** evidence of a verified production rollout.

## Scope and authority

PR 6 checks the delivery assembled in PRs #1553–#1557. It must not change XP, Clout, rewards, currency, Telegram credentials, MoonPet state, ownership, cooldowns, faction standings, game endpoints, or migrations. It does not change the editorial `/dashboard.html`. Existing `POST /player/action-plan` is an authenticated, no-store, read-only projection. Open Task is navigation, not action execution. Source status can be live, live_empty, preview, query_failed, migration_pending or unavailable; unknown is never a zero award or a claimed reward.

The machine inventory in [`data/player-action-plan-pr6-release-evidence.v1.json`](../data/player-action-plan-pr6-release-evidence.v1.json) maps **all 15 acceptance cases** from #1552 to a named, registered regression and a still-pending signed-account verification step. An automated coverage pointer means only that code exists. It is not a test result or production certification. Do not change `production_state` to `verified` without the complete evidence specified below.

## Automated QA — required green gates

On the exact PR head SHA, require successful GitHub CI for `ci-worker-api`, `ci-arcade`, `ci-visual`, `ci-wiki`, and `ci-wax`, plus PR template, structural/publishing, deployment-truth and provenance workflows that GitHub reports as applicable. Record links to completed runs; pending/skipped/failed is not green. Review Copilot/Codex comments and resolve findings rather than accepting a green badge alone.

- API/SQLite: `node --test scripts/player-action-plan-api.test.mjs` and `node --test scripts/player-action-plan-contract.test.mjs`. Cover no/one/three pets, original pet and season, auth/selector attack, rate limit, no-store/no writes, D1 missing table vs query error, snapshot pagination, UTC/BST and exact source timers. `createReadOnlyActionPlanDb` currently caps 80 statements and a 5s projection deadline; those are guards, **not** a measured 1,000-user capacity claim.
- Frontend: `node --test scripts/my-moonboy-browser.test.mjs`, `node --test scripts/faction-operations-browser.test.mjs`, `node --test scripts/player-action-sync-browser.test.mjs`, and `node --test scripts/player-action-sync-parity.test.mjs`. Playwright requires installed Chromium. Check 360/390/1280 layout, keyboard tab navigation/focus, labels, contrast, disabled/reduced-motion experience, all nine faction pages and Community, original-pet badge attribution, UTC rollover, stale/offline, burst dedupe, delayed receiver startup, guest privacy and rejected writes.
- Security/integrity: `node --test scripts/telegram-progression-auth.test.mjs`, `node --test scripts/verify-d1-production-migrations.test.mjs`, plus the ordinary CI Worker/Arcade tests for payouts, anti-cheat, ownership, MoonPet retention and Community XP. These use fixtures or local SQLite unless explicitly proven otherwise. Do not mistake fixture-signed auth for a live owner test.
- PR6 gate: `node --test scripts/player-action-plan-pr6-release-gate.test.mjs`; verifies all 15 matrix rows point to registered test suites and prevents a paper-only release sign-off. The CI runner executes this in `ci-worker-api`.

For performance, collect actual p50/p95/p99 read duration, D1 statement count, response size, error/429 rate and failure modes for **1, 10, 100 and 1,000 concurrent signed reads** in a safe, operator-approved non-production or controlled environment. Distinguish no/one/three pets and paginate/history. Do not conduct a 1,000-user load test against production without capacity approval. No measured benchmarks are supplied by this PR. Browser accessibility work must include a real keyboard/screen-reader pass, not just locator assertions.

## Mandatory signed-account live QA

Use disposable consenting owner-controlled accounts; never record real auth hashes, bot tokens, raw Telegram IDs, pet IDs, request bodies, private task text or screenshots exposing another player's profile. Redact network traces, screenshot captures and logs before linking evidence. Capture environment, UTC timestamp, build SHA, test case ID, expected, observed, pass/fail and evidence URL for every case.

1. Guest and linked unassigned: public crew remains visible; guest has no private fetch; unaligned owner receives faction join guidance, not 0/3 verified.
2. Owners with 0, 1 and 3 pets; egg-only and selected vs original saved-run pet; preserve permanent slots and previous-season contract/boss claims. Account-wide Cache and bonuses appear once only. Compare all applicable entries directly with canonical MoonPet Saved Status.
3. Daily 7/7 complete but pending claim, then accepted claim and rerender. Verify claim-ready changes to claimed only after server response; no second settlement/write. **Known PR5 parity gaps:** Daily Cache, season-tier, finale/extra/weekly bounty classes remain Saved Status-only unless independently supported; never inflate My Moonboy Claims badge.
4. Active, upcoming and expired WTF windows using persisted D1 evidence, plus preview-only fallback; test UTC and UK local time either side of DST and midnight. Daily vs pet adoption-week changes must not erase saved claims or evolve pets.
5. Faction-aligned owner across their chamber, Community and My Moonboy; all nine public faction pages with guest and mismatched owner. Verify three current source operations, private contribution isolation, focus retention.
6. A real accepted Arcade/MoonPet/faction/Wiki action and a rejected action. Exercise sender- and receiver-side delayed bus loading, accepted bursts, two tabs and hidden/focused tabs. Verify latest read after acceptance, no repeat payout and sanitized BroadcastChannel metadata.
7. Telegram `/daily` completed outside the browser; return/focus to reconcile. Disconnect/offline while read pending, reconnect, expired signed auth, account switch, sign-out, partial D1 source outage and slow API. No old-owner content, false current claims, or duplicate action POST.
8. Open Task and page navigation: correct destination, no claim/energy/purchase side effect. Compare separation of Arcade XP, Pet XP, Community XP, faction clout and verified Championship Clout. An unverified Championship source must remain preview/unavailable.

Record each of the 15 case results individually in the evidence manifest and attach a redacted test artefact link. Do not use a green QA label for an untested variant. **This PR does not have authenticated production fixtures or consent to execute gameplay writes. All signed checks remain pending.**

## Immutable release-subject attestation (no circular commits)

The committed `data/player-action-plan-pr6-release-evidence.v1.json` is a **pending acceptance inventory**, not a mutable proof-of-release certificate. Its status, CI, approval and production proof fields must remain pending/null in PR #1558. **Never commit completed CI URLs or GK approval back into the subject branch** to certify that branch: doing so changes its SHA and invalidates the subject being certified. The PR6 test gate enforces this pending-only contract.

1. Finish all code, documentation and tests. Freeze the final PR **release-subject SHA H**. Run and confirm every mandatory CI job on **H**, including `ci-wiki`, `ci-worker-api`, `ci-arcade`, `ci-wax`, `ci-visual`. Review all code findings. Any new code or documentation commit produces a **new H** and requires re-verification.
2. Record the exact 40-character **H**, links to successful GitHub Actions jobs for H and their conclusions, signed-user acceptance evidence, and a GK approval comment explicitly naming **H** in an **external attestation**: a comment on PR #1558 or issue #1552 (or an independently managed release record). Do not alter H just to write that evidence. Every CI reference must be independently checked against GitHub's actual head_sha and job conclusion; a pasted link/label is not verification.
3. After GK approves H, merge under the approved policy. Record the **actual merge SHA M** separately, then validate that the Pages deployment built and published **M**. Verify the Worker SHA and applied D1 migration ledger independently; capture all post-merge smoke, rollout and rollback evidence in a follow-up external release comment linked from #1552. **H and M are different subjects** if GitHub creates a merge/squash commit. Their identities must never be conflated.
4. If the final GitHub PR head changes after approval, stop and obtain new CI/review/approval for the replacement H. If only external comments are appended, H stays fixed, so attestation converges. Never change the committed manifest to `verified`. To close #1552, assess the **external** attestation against the same release requirements and explicit GK approval.

The in-repository `releaseErrors(record)` validation remains a proof-field schema/consistency check for *independent release records*. It cannot prove a CI link is authentic, that a human actually approved, or that production was deployed. Those checks require an operator querying GitHub/Cloudflare. PR CI must only assert the tracked manifest is an honest pending inventory.

## Deployment/provenance proof — after explicit GK approval

**Do not merge or deploy just to manufacture an attestation.** First record the approved commit and review in PR discussion. PR6 modifies static user guidance, CI audit and documentation only; **no new Worker or D1 change**, so PR6 itself requires **no Worker deployment, no migration and no VPS restart**. The already-merged PR2 Worker endpoint must nevertheless be independently confirmed present in production.

1. Identify exact approved PR6 merge SHA on `main`. Confirm the successful `Deploy GitHub Pages` run (`.github/workflows/pages.yml`) checked out that SHA, built `public-site` and deployed via `actions/deploy-pages`; capture run URL, deployed URL, completed UTC time and commit. Inspect the published `/my-moonboy.html`, `/how-to-play.html`, Community and nine chambers from a clean browser. **A successful PR CI job is not Pages deployment proof.**
2. Read **`https://api.cryptomoonboys.com/deployment-info`** and match its commit/version metadata to the last *actually deployed* moonboys-api Worker commit (not necessarily this frontend PR SHA). Capture safe response fields and deployment run/provenance reference. Check `/health` as permitted. An API that lacks the expected `POST /player/action-plan` route blocks release; do not send unsigned private owner IDs to probe it.
3. Run existing D1 production migration verification workflow `.github/workflows/d1-production-migration-verify.yml` using authorized protected production credentials and read-only verification. Link sanitized results for `wikicoms`, applied migration ledger, and any missing indexes/tables; a repo migration file is **not** evidence it was applied. Do not run migrations from this PR.
4. After merged Pages rollout, repeat redacted signed-owner smoke and public guest privacy probes on the exact deployed builds. Log regressions, evidence links, timestamps and GK sign-off in the external release attestation linked from PR #1558 or issue #1552, not as new commits to the frozen release-subject SHA. An `automation_state=ci_green` label alone does not imply live verification.

## Rollback (operator-controlled)

- **Stop**: if private data crosses identity boundaries, claim badges falsely show verified availability, responses leak auth, rewards write twice, or Worker/D1 mismatch is observed, stop rollout, disable release acceptance and notify GK. Record times and failing SHA without copying private payloads.
- **Pages**: identify the last known-good deployed Pages SHA and its successful workflow. Prepare a reviewed revert PR of only the offending frontend/docs changes to `main` (or use the repository's documented authorized rollback workflow if one is available), with GK approval, and verify Pages publishes the restored SHA. Do **not** force-push `main` or assume a workflow rerun checked out an old SHA. Re-check public and owner privacy boundaries.
- **Worker**: no Worker change is in PR6. If a pre-existing API regression is implicated, have the Worker release operator use the last known-good deployment version via its approved rollback procedure, verify `/deployment-info`, `/health` and read-only authenticated source health, and record both SHAs. Do not redeploy moonboys-api from PR6 or point Pages at a mismatched unverified endpoint.
- **D1**: no schema change in PR6. Never blindly reverse an applied migration, delete saved claims, or restore an older DB over live rewards. For DB incidents, isolate affected writes, take a backup/evidence snapshot and follow a separately approved forward-compatible recovery plan that preserves permanent pets, receipts, season attribution and payout idempotency.
- **Verify recovery**: repeat guest/no-owner, one owner/three pets, claim and faction cases; re-check Pages SHA, Worker SHA, D1 ledger and audit logs. Link operator, time, result and rollback exercise evidence. Without confirmed recovery, keep the incident open.

## Merge decision

- [x] Draft PR6 evidence scaffold; no gameplay change, Worker deploy, migration or restart.
- [ ] Exact head CI and domain review green.
- [ ] Live signed-owner cases AC-01 through AC-15 individually verified and redacted.
- [ ] Keyboard/screen reader, source-degradation and controlled concurrency/performance evidence.
- [ ] Pages SHA, Worker `/deployment-info`, D1 applied migration ledger and rollback proof.
- [ ] Explicit **GK** review and approval.

**HOLD** until all required items are evidenced. Close #1552 only after approved release and observed production behavior, not merely after this document merges.
