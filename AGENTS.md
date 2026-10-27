# Agent entry point

## GK workflow policy — routine checks are manual (27 October 2026)

**Do not turn on automatic broad CI or scheduled health-probe jobs.** Read [docs/ci-workflow-policy.md](docs/ci-workflow-policy.md) before editing workflows, adding an image, changing a page, or asking for release approval.

- Prefer the smallest scoped patch and direct local reasoning/tests; do not trigger every Actions workflow for ordinary art, text, CSS or page changes.
- Validation workflows in `.github/workflows/` are **workflow_dispatch/manual only**. Run focused checks manually when risk warrants it and report exactly what ran or did not run.
- **Do not claim a green check, production deployment or verified ranked run without evidence.**
- **GitHub Pages publishing is separate**: its existing Worker/course-compatibility gate stays in place to protect leaderboard submissions. Never bypass it to speed up an image update.
- Keep functional scheduled data-feed / graph refresh jobs independent of PR CI; do not remove them without a separate operational decision.
- If GitHub rules require old status checks, tell GK which settings to change; do not fabricate passing statuses.
- Retain branch/PR review and GK sign-off. No merge, production deployment, D1 migration, payout or irreversible action without explicit GK approval.


Read `AGENT_EDITING_RULES.md` for branch, product and release rules. For any lore,
wiki, scripture, canon generator or source-research work, also read
`brand-canon/CANON_POLICY.md`, `brand-canon/canon-locks.json`, and
`brand-canon/reconciliation-decisions.json` before editing. Start/resume Issue
#1458 at `brand-canon/wiki-rewrites/issue-1458-progress.md`.

**W81 is foundational truth.** Reconcile its 94 original witnesses with the
current First Witness and approved modern stories; none is an excuse for an
accidental retcon. Current product truth has a separate authority hierarchy.
Read current articles and their dependencies before changing them. Preserve
their substantial stories, adult tone, IDs, URLs and ownership markers.

New fiction is authorised within the requested scope; identify it as authored
fiction. GK reviews significant scripture, historical-anchor, identity and
Forty-register changes before publication. Prepare concrete decisions and
dependent edits in the sandbox; never treat a proposal as already approved.
Do not push to main, merge or deploy without GK's explicit release approval.

Use `npm run test:canon` and the wiki/publishing checks specified by the policy.
Record actual verification and unfinished semantic research honestly. A source
checksum or a COVERED label never proves complete claim/scene reconciliation.
