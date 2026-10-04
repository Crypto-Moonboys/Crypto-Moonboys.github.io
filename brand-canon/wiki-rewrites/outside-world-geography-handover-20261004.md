# Outside-world geography handover — 2026-10-04

## Branches and scope

- Backup: `codex/backup-maidstone-expansion-20261004-093509`
- Sandbox: `codex/sandbox-maidstone-expansion-20261004-093509`
- Scope: Maidstone Base, Croydon Tower Blocks, Street Kingdoms, Block Topia; inherited Bitcoin Kids/X Kids alias collision; publishing surfaces, content-state inventory, tests and evidence records.

## Durable decisions

Maidstone is a present-day/future-reception boundary article, not a lore fortress. Croydon remains an inhabited plural place, not one tower or faction compound. Street Kingdoms describes the wider outside society and does not invent all forty factions. Block Topia is anchored to Queens and the True Bitcoin Fork without merging it with World Chain or Sacred/Aether Chain. New names and institutions are enumerated in the evidence ledger and are not claimed as W81 discoveries.

The legacy alias `bitcoin kids crypto moonboys wiki` belongs only to Bitcoin Kids. Bitcoin X Kids has no version of that alias. Generator filtering, generated entities and order-independent lookup tests must stay aligned.

## Release boundary

Do not merge or deploy without explicit GK approval. After merge, any later change inside these four canonical blocks must increment the relevant revision. Preserve all PR #1433 revision-2 and PR #1434 revision-1 prose unchanged.

## PR #1435 review corrections

- Review backup: `codex/backup-pr1435-review-20261004`, at `4dc6014930154a4fe7c178d56e019bb74c4a37a3`.
- Delivery branch: `codex/expand-wiki-with-new-research-and-articles`; isolated local repair branch: `codex/fix-pr1435-review-20261004`.
- Align all four Open Graph descriptions with their HTML descriptions and the three existing Article JSON-LD descriptions with the same wording. Remove the rejected Maidstone headquarters, singular Croydon birthplace and truncated Street Kingdoms claims from previews.
- Clarify that the Street Kingdoms are neither one faction nor every outside place.
- Give contents targets an 18rem scroll margin at widths up to 1120px, matching the existing war-spine pages and clearing the stacked mobile header.
- Remove the three duplicate legacy page titles so each document has one title with JavaScript disabled; update their retained last-updated labels to October 2026.
- Add regression coverage for HTML/Open Graph/Article JSON-LD/search-card description parity and a single static article title. Keep all existing subject, ranking and distinct-identity tests.
- Regenerate publishing surfaces and the ownership inventory only after the final HTML edits. The original CI failure was a stale `wiki-content-state.json`; the final generated artifacts are deterministic.
- Keep revision 1 because these are corrections within the same unmerged batch. No First Witness or earlier twelve merged canon articles were edited.

## Repair validation

- `BASE_SHA=2ead2b1e5b005b5df62b0c99ec453ef58e430ebc CANON_PROSE_CHANGE_APPROVED=1 npm run ci:wiki`: passed the complete wiki domain suite.
- `node scripts/graph-publishing-integrity.test.mjs`: passed, with 409 indexed wiki pages, 419 total graph nodes, 2,041 edges and 75 mobile nodes.
- All 13 generated publishing/ownership artifacts were byte-identical on a second generation after the final HTML fixes; `node scripts/generate-wiki-content-state.mjs --check` passed.
- Chromium 147.0.7727.0: all four pages rendered at 1440x1000 and 390x844, with 120 contents targets verified across eight page/viewports, no horizontal overflow, no script errors, and no legacy bible requests. First, middle and last contents jumps cleared the fixed header. Each page retained one title and working native contents with JavaScript disabled. Four authored-person queries passed full search and autocomplete.
- Browser proof used an isolated four-page adaptation of `scripts/wiki-war-spine-browser-validation.mjs`, with local-only requests and the existing QA Chromium binary. Top/middle/bottom and contents-jump screenshots were captured; desktop and mobile samples were visually inspected. This replaces the original environment's missing screenshot verification.
- `git diff --check` and syntax checks for both changed JavaScript files passed. The replacement PR description passed the repository's exact PR-template validator.
- The full repository `npm test` was not rerun for this wiki-only repair. Existing worker/API, WAX and visual jobs had passed on the original PR head; final GitHub checks must still be assessed against the repaired head.
- The canon prose approval label records the requested writing/fix authorization. It does not grant final merge or deployment approval; the draft and hold-merge boundary remain.

## GitHub merge-checkout repair

GitHub's first repaired-head run still failed the inventory check because the PR originated at `e333dd35a37d2f88881d51682725ff7739507f6e`, before the automated data-feed refresh at base `2ead2b1e5b005b5df62b0c99ec453ef58e430ebc`. Its synthetic merge checkout included the refreshed `gkniftyheads-nft-collection.html`, while the PR inventory still hashed the older page. The same checkout difference explains the original CI failure.

Synchronise the PR branch with that exact base refresh and regenerate the inventory against the combined tree. This carries existing main changes through without editing their content; no refresh files are added to the PR's diff against main. Relative to GitHub's synthetic merge, only the inventory's source-tree hash and that NFT page's four content identities change. The complete wiki domain suite, graph integrity, inventory freshness and whitespace checks passed against this combined tree before delivery.
