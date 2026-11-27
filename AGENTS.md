# Agent entry point

## Current canon entry point — 16 November 2026

Read [the official canon index](brand-canon/README.md) before lore or canon work. Crypto Moonboys is both creator brand and fantasy cast played/created by real people. GK’s implemented `GK-20261116-MARKET-FACTIONS-COMMAND` decision controls current command over incompatible older descriptions: Bulls and Bears are the market factions; Alfie’s Bitcoin Kid Army is their protection army under orders only from GKniftyHEADS; HODL Warriors unite all GK factions’ members and are not a faction; every member aspires to the distinct HODL X order of Queen Sarah’s Block Topia. Preserve the 1 + 2 + 37 political count, distinct Bitcoin X Kids and the unresolved public Final Fork.

The main `/wiki/crypto-moonboys.html` page is the story-led heart of the lore, including wider realms, mythology and timeline. Product onboarding remains in the current brand/product guides and retained creator reference. Real-world 1/1 builder eligibility is separate from fictional military service. This clarification implements existing GK direction and changes no live faction options, licences or gameplay.

## GK workflow policy — routine checks are manual (27 October 2026)

**Project phase: build complete; debugging and final verification before live launch.** No new features, speculative rewrites, or automated anti-drift gates unless GK explicitly authorises them. **Do not turn on automatic broad CI or scheduled health-probe jobs.** Read [docs/ci-workflow-policy.md](docs/ci-workflow-policy.md) before editing workflows, adding an image, changing a page, or asking for release approval.

- Prefer the smallest scoped patch and direct local reasoning/tests; do not trigger every Actions workflow for ordinary art, text, CSS or page changes.
- Validation workflows in `.github/workflows/` are **workflow_dispatch/manual only**. Run focused checks manually when risk warrants it and report exactly what ran or did not run.
- GK approved the narrow **Runtime Image Derivatives** generator on 27 November 2026. It may run only for `HODLKONG64` pushes to non-production branches when a convention master, runtime manifest or pipeline file changes. It generates and verifies declared WebP derivatives; it must not expand into broad CI, write `main`, merge, publish Pages or deploy Workers. Follow [the runtime image pipeline](docs/runtime-image-pipeline.md).
- **MANDATORY RUNTIME IMAGE RULE — NO HUMAN OR ADMIN BYPASS:** every new or modified PNG/JPG/JPEG/WebP must be a registered `*-master` or its declared `*-runtime.webp`. The required **Runtime Image Policy** PR check enforces naming, registration, lock state, generated output and quality. Human direct commits to `main` are prohibited by the branch ruleset, including for GK. Do not weaken, skip, rename or remove this check; follow [the runtime image pipeline](docs/runtime-image-pipeline.md).
- **Do not claim a green check, production deployment or verified ranked run without evidence.**
- **GitHub Pages publishing is separate**: its existing Worker/course-compatibility gate stays in place to protect leaderboard submissions. Never bypass it to speed up an image update.
- Keep functional scheduled data-feed / graph refresh jobs independent of PR CI; do not remove them without a separate operational decision.
- If GitHub rules require old status checks, tell GK which settings to change; do not fabricate passing statuses.
- Retain branch/PR review and GK sign-off. No merge, production deployment, D1 migration, payout or irreversible action without explicit GK approval.


## Protected areas remain enforced when Actions are manual

Before changing any protected area, read and follow [the protected areas compliance checklist](docs/protected-areas-checklist.md). Disabling or not triggering a workflow disables automation only; it does not disable the underlying contract or the agent's duty to validate affected behavior.

Every agent must map all changed paths to the checklist, run the union of applicable focused checks, and state exactly what ran, what did not run, and why. Never weaken a guard to make a branch pass. Cross-domain, release, auth, security, scoring, reward, payout, migration, deployment-gate, or CI-harness changes require the manual Full Linux suite when the checklist says so.

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
