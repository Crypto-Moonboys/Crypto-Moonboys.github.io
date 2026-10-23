# Fast Edit Mode — static site changes

This mode removes unrelated heavyweight CI work for **verified, low-risk static edits**. It is automatic, not a label or a contributor-controlled bypass.

## Fast path (pull requests and main pushes)

A pull request or direct push to `main` can use Fast Edit Mode only if **all** changed files qualify:

- Local JPG/PNG/WebP/GIF/AVIF artwork immediately within `art/`, `img/`, or `assets/` (not nested game-asset subdirectories; maximum 8 MiB each).
- Presentation CSS immediately under `css/` without imports or remote resources (maximum 2 MiB per file), excluding game, faction, MoonPet, My Moonboy and wiki runtime migration styles.
- Existing **top-level** `*.html` pages changed exclusively by plain text in simple heading/paragraph/label elements, or by inert local image tags using a strict attribute allowlist. HTML script/style/template and all other markup must remain byte-identical (maximum 160 changed lines per HTML file).
- A total of at most 15 changed files.

Top-level admin, MoonPet, builder, canon-publishing or other explicitly protected pages are excluded even when only their literal copy changes. The CI workflows load the classifier and its authoritative unit tests from the **protected base commit** (`BASE_SHA`), never from PR-modified source. The new classifier is not eligible for the fast path until it already exists in the protected base; bootstrap and workflow edits therefore take full CI. All domain jobs explicitly fail when the classifier prerequisite fails, instead of silently skipping a required status. The classifier reads the actual Git base and head commits. It fails closed on deletions, renames, new HTML pages, unknown history, workflow/config/test changes, script edits, `wiki/**`, game pages, authentication, Worker, D1, canon or anything else not listed. Mixed PRs use **full CI**. An unsafe image tag (including event-handler attributes or remote image URLs) cannot qualify.

Examples:
- `art/New%20Banner.jpg`, `css/wiki.css`: fast.
- Replace literal `<h1>` copy in `community.html` without touching attributes/scripts: fast.
- Add a local `<img src="/art/banner.jpg" alt="Banner">` to an existing root HTML page: fast.
- Modify `wiki/crypto-moonboys.html`, `games/index.html`, `js/site-shell.js`, `workers/**`, `.github/**` or `package.json`: full.
- Change markup, inline JavaScript, links/attributes, external resources, or create a new HTML page: full.

## Preserved status checks

The existing `CI / ci-wiki`, `ci-worker-api`, `ci-arcade`, `ci-wax`, `ci-visual`, Worker Deployment Provenance and Production Deployment Truth job names continue to report status. On Fast Edit PRs, those jobs explicitly acknowledge the safe scope instead of installing dependencies and running unrelated heavyweight suites. The `CI / fast-edit` job still runs classifier tests and checks the diff for whitespace errors.

Other workflow triggers (Wiki Structure Enforcement, graph publishing, release/deployment workflows, PR template, etc.) are unchanged. Nonqualifying PRs or pushes, unknown or non-main refs, and manual dispatches run their normal suites. After any merge or direct push, the GitHub Pages rollout and live-site verification continue to run normally. GitHub Pages publishing and post-deployment verification are not bypassed.

This is **not** a substitute for visually verifying the changed page on desktop/mobile after release. If repository branch protection lists any job contexts, keep those configured; do not disable required contexts to use Fast Edit Mode.

## Reviewing and troubleshooting

An eligible PR or main-push classifier job prints `fast_edit=true` plus changed files. A normal PR prints `fast_edit=false`. To force full CI, run the existing workflows by manual dispatch, or include a legitimate code/test/configuration change; do not add fictitious files solely to manipulate selection. If classification fails unexpectedly, examine the log and the exact file diff.

Changes to this classifier, its tests, or CI workflows always require full CI. Maintain a negative regression test whenever extending the allowlist.
