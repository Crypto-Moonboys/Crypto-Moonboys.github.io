# GK canon policy — Issue #1458

Effective 8 October 2026. Implements GK's latest directive in Issue #1458 and
the complete reconciliation task. This policy supersedes older editorial
language treating W81 as disposable inspiration, forbidding all retcons, or
permanently freezing the six unnamed positions. Dated ledgers retain evidence
of earlier decisions; they do not overrule a later explicit GK decision.

## Two authorities

Fiction: W81 / RAW CANNON's 94 texts are foundational truth. Read the relevant
original witnesses, the current First Witness, connected articles and approved
modern fiction together. Contradictions inside W81 require deliberate choices,
not simultaneous literal acceptance. A newer page is not automatically right.
GK is final canon authority. Preserve strong old and new material; correct weak
history when a supported, coherent interpretation is stronger.

Real-world claims: README, Master Source of Truth, current verified runtime and
published terms control product, legal, artist biography, NFT and reward facts.
W81 lore and old promotional plans cannot establish those facts. Fictional
Agent SAM, deployed SAM tooling and SWARMSY SPARKY are distinct.

## Before writing

1. Read the current owning article, relevant story bibles, source register,
   immutable archive ledger and dependent pages. Inspect specific scenes and
   claims; do not infer completeness from COVERED or an existing URL.
2. Compare witness chronology, ages, identities, geography and cause/effect.
   Record rejected versions and reasons in `reconciliation-decisions.json`.
3. For each substantive claim identify exact source and section, authority
   (working canon, attributed account, disputed, proposal, original fiction),
   affected routes and the approval evidence if required.
4. Preserve prior unique paragraphs and narrative consequences unless the
   decision explicitly explains their revision. Do not shorten a detailed page
   into an archive summary. Keep Fifth Carbon, Necessary Monsters, Black Dividend
   and approved adult character/faction stories and their authorship boundaries.

## Deliberate evolution and GK approval

`canon-locks.json` records current convergence anchors and high-risk identity
boundaries. A lock prevents accidental drift; it is not a claim that history
cannot improve. Significant First Witness scripture revisions, dated historical
anchors, major identity changes and Forty-slot assignments require a concrete
GK decision before publication. Record approval URL/quote/date, update the lock,
update all dependent articles/bibles and regenerate discovery together. A PR
label approving ordinary prose is not evidence approving a new chronology.

The forty-position investigation must compare source-supported cultures and
their membership, history and institutions. Do not fill slots with duplicates,
titles, emergency formations, locations or service units. Nine live Battle
Chamber options remain a separate runtime roster. Prepare candidates and impact
maps even while approval is pending; continue unrelated authorised improvements.

Alternative voices can remain where they matter to the story. Attribute them
locally (named speaker/source, reported belief or `data-canon-status` and
`data-canon-source` on a section). Quotes cannot silently become the narrator's
physics. Do not invent retrospective 2030 scripture, guaranteed resurrection,
universal upload or a concluded Final Fork without an explicit canon decision.
For claims covered by the guard, the local attribution must identify a registered
W81 filename or recorded `decision:` ID. Generic “the archive claims” language
does not establish provenance or exempt a claim.

## Adult writing

This is an adult, gritty, culturally grounded world. Preserve sexuality, desire,
strong language, cruelty, exploitation, religious conflict and irreversible
loss where the story supports them. Do not automatically turn antagonists into
misunderstood helpers, cleanse institutions of abuse, or substitute sermons for
character choices. Newly authored intimate participants must be adults; source
characters' ages must not be silently changed. Fiction about contemporary named
people cannot invent their private lives or real-world endorsements.

Characters need appetite, agency, relationships, failure and consequences.
Factions need material resources, internal disagreement, territorial interests
and a distinctive culture. Connecting fiction should explain a real gap, not
add a new cosmic mechanism to evade a difficult history.

## Validation and delivery

Keep original W81 bytes out of the publication tree. Recover the archive from
the exact historical commit in the retirement ledger and verify archive and all
94 text hashes with `scripts/verify-w81-archive.py --output-dir /tmp/...`.
The verifier checks both the CSV and the independent historical checksum ledger.

Run `npm run test:canon`. It recovers and verifies the original archive and runs
the Python corruption tests before the JavaScript regressions and guard; mandatory
wiki CI calls the same command. The guard scans paragraphs, lists, table cells
and all six heading levels for explicit high-risk chronology,
identity mergers, final outcomes and archival product claims. It is a targeted
lint, not a semantic oracle: human research still handles paraphrases, every
supporting relationship and faction arithmetic. False positives need a local,
exact, source-linked attribution, not a blanket file exemption.

The reviewed-story baseline in `canon-locks.json` also protects completed
stories on the open reconciliation PR, including the Cut Ledger and Fifth
Carbon. The guard checks existing narrative paragraphs against that commit
and the PR base. A changed paragraph requires an implemented, sourced decision
with `paragraph_changes` identifying the old hash, an actual replacement hash
and the reason. Changing a recorded baseline requires a matching GK approval
receipt. This protects preservation; it does not establish narrative truth.

After prose changes increment revisions, preserve canonical ownership blocks,
extend native contents and related links, approve requested legitimate new
routes in the publish register, and run:

```
node scripts/generate-related-wiki-paths.mjs
node scripts/generate-publishing-surfaces.mjs
node scripts/generate-wiki-content-state.mjs
node scripts/graph-publishing-integrity.test.mjs
npm run ci:wiki
```

For a limited batch, repeat `--page slug` on the related-path generator to
write only the requested pages while retaining full-site relationship context.
Unknown pages fail before writing. This preserves unrelated curated links,
including NFT collection groups.

Lore batches must also pass `scripts/wiki-lore-preservation-check.mjs` against
the PR base. Canonical prose and related paths may change; the existing article
body outside those blocks, runtime dependencies and NFT article descriptions
remain protected. The related-path generator preserves citation-voting panels,
existing group layout and curated NFT card descriptions. Mandatory wiki CI
runs this check and its removal/corruption regressions before the prose gate.

Verify new terms in search/entity graphs, internal links and fragments, category
navigation and sitemap; check desktop/mobile and no-JavaScript reading. Run
broader required repository checks. Record results, limitations and pending
approvals in the progress ledger and PR. Never claim a check passed without a
successful run. Keep Issue #1458 open until full reconciliation is complete.

## Approved final decisions and publication boundary — 9 October 2026

All 94 W81 comparisons are accepted as complete. Use the existing evidence; do not restart research. GK has approved the five Issue #1458 implementations recorded in the decision ledger. This approval permits the coordinated content change, not a merge or release.

The intended Final Fork ending belongs to the editorial master and decision ledger. The public Year 3008 storyline remains future/unresolved. The four paths enumerated in `canon-locks.json` under `disclosure_boundary.editorial_only_paths` are excluded from Pages; public articles and discovery must not link readers to them or copy the intended ending, including hidden text, metadata and generated JSON. Editorial records in this public Git repository are not confidential storage. Preserve locally attributed source visions without converting them into the approved ending. The actual Pages builder and mandatory canon regressions enforce this boundary.

Keep original contradictory SAM dates on surviving fictional artifacts. Correct the chronology and catalogue beside the damage; do not erase Fifth Carbon's conflict. The Forty now have forty named cultures and six distinct approved new institutions. Keep the original thirty-four, all adult lives, First Witness Books, identity boundaries and nine live Battle Chamber choices.
