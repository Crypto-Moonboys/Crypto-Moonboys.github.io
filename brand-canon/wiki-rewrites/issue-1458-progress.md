# Issue #1458 — implementation progress and restart ledger

Updated 8 October 2026. **Status: first implemented tranche; full mission open.**
W81 is foundational truth. This is a checkpoint of completed implementation,
not a claim that the whole universe is reconciled. Preserve the adult tone.

Base: `81bd8f13d17b0864d5de849f3c4aac4b902abc14` (merged #1457).
Backup: `codex/backup-issue-1458-20261008-090000`, at that exact base; local
snapshot created before changes and remote backup verified.
Working branch: `codex/sandbox-issue-1458-20261008-090000`.
No direct push to main, merge, issue closure or production deployment.

## Verified and actually reviewed

- **94** original archive files verified against archive SHA-256, CSV and the
  independent immutable ledger; **93** unique contents, **2,334,149** bytes.
- **4** complete original texts read and compared this tranche: W1, w32, w33,
  w56. Do not relabel the remaining 90 as semantically complete.
- **11 existing pages** received focused section review: Rune, Pinks enforcement,
  Games, Princess, Code Alchemists, Sarah, Croydon, Block Topia, Forty Paths,
  master chronology and faction Commentaries. This is not a whole-page audit
  of every paragraph. Section targets are in `issue-1458-audit.json`.
- **419** top-level wiki pages pass automated targeted canon lint and content
  inventory checks. That number is a static scan, not a human semantic count.

## Implemented content

**Four new encyclopedia articles:** Whisper Codex (808 words), Six Pillars
(870), Great Consensus (1,036), Crypto Moongirls (1,064), counted inside their
canonical content blocks including source notes/navigation. They preserve
source doctrine with explicit attribution and carry real metadata, native
contents, citations, comments, category links, search and entity/graph/sitemap
entries. New routes were explicitly authorised by the complete task.

**Seven existing articles expanded:** Rune Tag, Squeaky Pinks Enforcers, Hard
Fork Games, Block Topia, Queen Sarah, Princess, Code Alchemists. All **632**
previous paragraphs and original IDs in those articles remain intact; canonical
revisions increase once. No First Witness or NFT prose is changed.

**Three source-level interpretive conflicts handled:** w56's inside population
label is aligned to Bitcoin X Kids rather than collapsing it into Alfie's
outside Kids; w33's universal religion claim is located in its sect rather than
rewriting the 2030 Covenant; w33's NULL #28 label does not merge the Prophet
with the Gasless Ghosts. **Zero major dated historical retcons published.**

**Two new adult characters:** Dara Venn, 38, and Lysa Rook, 44. The Cut Ledger
story carries assault, falsified injury reports, institutional corruption,
violent defection, broken fingers, theft, a lost bed and a victim who refuses
both sides' victory story. It has limited local consequences, no new scripture,
no settled final outcome and no new numbered faction. One existing culture,
Crypto Moongirls, receives a standalone expansion. The new supporting house
is an institution within an existing sect. See `../story-bibles/the-cut-ledger.md`.

The [working master bible](../story-bibles/gk-master-canon.md) covers the thirteen
requested areas and records unresolved work. It includes all 34 current named
readings without pretending to invent the six remaining cultures. Fifth Carbon
and Necessary Monsters remain preserved. Digest, companion, source dispositions
and CSV now distinguish merged modern material and this new recovery; original
W81 names, byte sizes and hashes remain unchanged.

## Lasting protections implemented

Single authority policy: `../CANON_POLICY.md`. Entry/onboarding: root `AGENTS.md`,
`AGENT_EDITING_RULES.md`, `.copilot-instructions.md`, `.github/copilot-instructions.md`.
PR template now requires source, ripple, adult-story, discovery and approval
checks. `../canon-locks.json` contains anchors, identity boundaries, 34/6 and
nine-runtime distinction, 94 source identities and targeted claim rules.
`../reconciliation-decisions.json` holds seven implemented and four proposed
old/new decisions with rationale and affected paths.

`canon-integrity-check.mjs` runs in wiki CI and checks explicit chronology,
identity merges, final-ending and archival-game claims while accepting local
source attribution. It checks CSV/immutable-ledger agreement and requires a
matching GK approval receipt for changed protected register fields.
`verify-w81-archive.py` recovers/validates original bytes outside the site;
corruption tests cover archive tampering, false CSV hashes and duplicate names.

**Practical limit:** static lint cannot establish arbitrary scene chronology,
all relationships or the authenticity of a claimed external approval. Human
canon review and the existing maintainer prose-approval gate still apply.

## Verification evidence

`issue-1458-verification.json` contains exact counts and scope. Successful checks:

- `python3 scripts/verify-w81-archive.py` — all 94 entries.
- `python3 scripts/verify-w81-archive.test.py` — 4 corruption/integrity tests.
- `node scripts/canon-integrity-check.test.mjs` — 6 regression groups.
- `npm run test:canon` — targeted guard passes across 419 pages.
- `BASE_SHA=81bd8f13d17b0864d5de849f3c4aac4b902abc14 CANON_PROSE_CHANGE_APPROVED=1 npm run ci:wiki` — passed. The local flag represents the task's explicit prose authorisation; it does not apply a GitHub label or approve production.
- Content-state parity and ownership preservation — passed.
- Graph publishing integrity — 412 indexed pages, 422 nodes, 2,060 edges.
- `CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node scripts/wiki-canon-browser-validation.mjs` — 22 desktop/mobile views, four no-JavaScript readings, four full-search/autocomplete queries; no overflow/script errors. Local screenshots and report: `/tmp/gk1458-browser`.
- Internal links/fragments — 485 checked, zero broken.
- `node scripts/prepare-pages-artifact.mjs public-site` — Pages artifact built successfully; no deployment.
- `git diff --check` and changed-script syntax — passed.

Full `npm test` final result will be recorded before delivery. Initial attempts
failed on sandbox process/network restrictions and a missing declared
`smol-toml` dependency. `npm ci --ignore-scripts --cache /tmp/gk1458-npm-cache`
restored the locked dependencies without changing the lockfile; the full suite
was restarted with the explicit baseline and task-authorised prose flag.

The default preservation gate correctly rejects a changed protected article
without the maintainer's `canon-prose-change-approved` PR label. Do not weaken
that gate to make this draft look release-ready. Existing duplicate-paragraph
inventory debt remains separately recorded; this tranche preserves NFT pages.

## Precise continuation order

1. Recover verified originals with the checked verifier if `/tmp/gk1458` is gone.
   Skip completed full readings W1/w32/w33/w56; inspect their exact decision
   records when using them. Source checksums alone do not complete any other file.
2. Complete W12's eight parts and W13 household chronology/relationships. Draft
   full SAM biography and an exact proposed solution to 2036/2030 before GK
   approval; do not invent a replacement year or merge software/personhood.
3. Complete W15 and w25 serial comparison. Map Kael, Sylas, Veyra, Council,
   Blackout, Layer Eight, Crimson Protocol and every competing Eternal Pulse
   ending; retain clear source voices and prepare a coherent final proposal.
4. Compare M16, W5, w68/w69 and all faction profiles to every modern faction
   biography. Establish independent membership/institutions for each candidate
   in `issue-1458-proposals.md`; develop a complete six-slot proposal rather
   than filling arithmetic with offices, duplicate generations or aliases.
5. Fully read the nine First Witness Books, all supporting chapters and current
   bibles. Audit chronology/character ages/geography/economics and all 90 other
   original texts by substantial claim/scene. Update the audit state after each
   actual reading; do not call this master bible definitive yet.
6. Implement approved historical/identity/scripture/roster decisions across
   every dependent surface in coordinated commits; broaden character/faction
   expansion and standalone articles where warranted.
7. Regenerate gate/index/entity/link/graph/sitemap/content inventory after new
   prose. Scope related-path generation so it preserves existing curated NFT
   collection groups and narrative links. The default all-page generator
   rewrote unrelated collections during this tranche; those changes were
   restored before final builds. Its canonical generator remains unchanged.
8. Run the required checks for subsequent changes, maintain this ledger, update
   the same PR and Issue #1458, and obtain GK's final approval before merge.
   Keep the issue open until all eight phases and acceptance criteria are done.

## Delivery

PR link and final CI status will be appended below when available. Draft status
is required while the repository-wide reconciliation and specific canon
approvals above remain incomplete.
