# Issue #1436 — archive migration and public-text repair

Authority: [GK's issue #1436](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/issues/1436), explicitly started in Codex. It authorises existing-page research, fictional expansion, direct commits to main and publication without PRs. No new wiki pages. Keep ordinary SAM canon writes blocked.

Baseline: `221d7df26e50e2b9c6a9e450ee5195c8f02930ed`, merged #1435. Backup: `codex/backup-issue-1436-20261004-120000` (published). The 82 First Witness pages and 16 completed rewrites are preserved. Initial queue: **112** (27 RECONCILE, 15 DEDUPE, 64 NEEDS_HUMAN_REVIEW, 6 ARCHIVE_STYLE).

The actual `about/w81.zip` was extracted again: 94 text files, 2,334,149 bytes, SHA256 `eb3f1902b8f5e8b8e20a16c18c925a072bf81699ca404f3abb04c4f5b9a34b96`. It is the only repository ZIP and remains unchanged. Sources follow README/Master Source of Truth for the real project, First Witness/current decisions for fictional continuity, then raw W81 and attributed legacy records. New fiction is identified below; no invented real biography, clients, rights or live capabilities.

## Publication and protection

Each direct article commit requires its own separately published annotated tag named `canon-direct-1436-<full commit SHA>`. Its JSON receipt names issue 1436, repository, exact parent, exact commit and complete changed-file list. The resolver verifies the remote tag and actual single-commit diff, rejects extra commits, new/deleted wiki pages, First Witness changes and unrelated runtime changes. Only the first authorised baseline can install this mechanism; subsequent receipts cannot approve edits to protection code. Missing/malformed receipts and API failures fail closed. Ordinary SAM writes receive no receipt. Existing labelled-PR approval and revision ratchets remain intact.

Before every publication: refresh main, preserve concurrent changes, regenerate publishing surfaces and ownership inventory separately after final HTML, run wiki/ownership/search/structure and graph checks plus `git diff --check`, create the exact receipt, then fast-forward main without force. Parallel researchers draft isolated files; one publisher owns repository edits/generated files and sequential commits.

## Completed articles

| Existing page | Sources and reconciliation | Newly authored detail |
|---|---|---|
| `queen-sarah-p-fly` — 2,622 words | W81 w70, w26, w65, w67, W18, W8; First Witness chronology/glossary/concordance, Block Topia, leadership and synthetic minds readings. Restores city sovereignty, separates Queen/Commander accounts and artist identity, attributes 2066 and disputed powers. Does not make her ruler of Sacred Chain or resolve her origin/endgame. | Petition Table, clerk Ilyra Fen and Filter Petition; supervisor Pell Ardent and Double Order hearing. Bounded administrative cases, not new universal laws or archival discoveries. |

Each completed page has one revision-1 canonical block, source tier `first-witness+w81`, aligned HTML/OG/Article descriptions, preserved layout/artwork/URLs/anchors/comments and native collapsible contents. Obsolete bible injection mounts and repetitive SAM verification copy are removed. Subject terms use `wiki-search-terms`; relationship tokens and search short-word/ranking rules are preserved.

## Validation and remaining work

Queen publication: `node scripts/resolve-canon-prose-approval.test.mjs`, `BASE_SHA=221d7df26e50e2b9c6a9e450ee5195c8f02930ed CANON_PROSE_CHANGE_APPROVED=1 npm run ci:wiki`, `node scripts/graph-publishing-integrity.test.mjs` and `git diff --check` passed. Publishing surfaces and inventory were generated separately. Isolated Chromium passed at 1440×1000 and 390×844: 30 contents targets, settled header clearance, no overflow/script errors/bible injection, no-JavaScript navigation, and actual full search/autocomplete for Ilyra Fen and Pell Ardent. A malformed draft start-marker was caught by ownership validation and corrected before publication. Exact committed SHA and changed paths are preserved in the annotated receipt tag.

Remaining after the first completed page: **111**. Connected character, faction and creator-reference drafts are in progress; the generated rewrite audit remains the authoritative queue. Do not recreate or rewrite the sixteen earlier completed articles without a concrete correction and revision increment.
