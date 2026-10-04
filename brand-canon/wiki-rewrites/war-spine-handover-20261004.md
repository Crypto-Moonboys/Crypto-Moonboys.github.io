# War spine expansion — delivery handover

User authorises research, substantial new fictional authorship, implementation, validation and PR creation. No merge or deployment is authorised.

## Baseline and branches

- Verified current main: `cf614917c7a022db83bb02ba47d8a6ee774bd980` (merged PR #1433).
- Backup: `codex/backup-war-spine-20261004-020000` (initial checkout snapshot, before updating).
- Sandbox: `codex/sandbox-war-spine-20261004-020000` (starts at current main).
- Normal sandbox cannot write `.git` and its proxy is unreachable. Approved escalated Git commands work locally. The CLI GitHub credential subsequently failed; connected GitHub tools can publish exact Git blobs/trees. Verify blob hashes against the local files. Do not change network policy or protections.

## Completed batch and decisions

All seven queued P1 pages: `bitcoin-kids`, `bitcoin-x-kids`, `bitcoin-kid-army`, `the-bitcoin-kid-army`, `hodl-warriors`, `hodl-x-warriors`, `hodl-wars`.

Read repository editing rules, template instructions, ownership queue/state, both previous batch ledgers, latest brand vision, Master Source of Truth, First Witness chronology/glossary/concordance. Preserve all five revision-2 core history pages and eleven supporting people from PR #1433.

Extracted and read the actual `about/w81.zip`: 94 text entries, 2,334,149 uncompressed bytes, under `/tmp/moonboys-research/w81`. Repository archive scan found no other ZIPs. Raw subject files and relevant searched passages were read; the evidence ledger records exact source names and reconciliations. ZIP SHA256: `eb3f1902b8f5e8b8e20a16c18c925a072bf81699ca404f3abb04c4f5b9a34b96`.

Reconciliation: outside Kids are Alfie's lineage; X Kids are the engineered inside generation. Army pages describe the same organisation, with one main operational reference and one distinct history/contested-accounts companion, never two factions. HODL Warriors and HODL X Warriors remain distinct, with no settled universal genealogy. Literal percentages, immunity claims, total overwrite, premature armistice/endgame claims and contradictory dates are attributed rather than silently promoted. The history companion and HODL WARS are classified as core references, not additional factions. Twelve new people and local institutions/events are explicitly recorded as authored, not recovered from W81.

## Completed pages

All seven completed, revision 1, one canonical block each, native collapsible contents navigation and retained layouts/artwork/engagement. Measured counts excluding contents: Kids 4,644; X Kids 4,689; Army 4,105; Escape Accounts 2,700; HODL Warriors 4,229; HODL X 4,462; HODL WARS 4,864. Total 29,693 words, 160 sections. The companion is deliberately shorter because it has a distinct historical purpose. Editable temporary drafts/installer: `/tmp/moonboys-drafts`. Repository HTML and evidence ledger are the durable deliverables. Legacy Army anchors are retained. Two misleading absent-page cards were removed; existing correctly labelled Block Topia cards remain. No First Witness or prior revision-2 article edits.

## Validation

Publishing surfaces regenerated, then content-state inventory/audit regenerated separately. Full `npm test` passed all five required groups. Independent wiki, graph, syntax and diff checks passed. Original 58 lore-search queries, 12 First Witness intent contracts, title-only relationship tokens and false free-NFT/Sacred Chain relationship regression are preserved. Added 48 connected-lore search cases and structural/ownership tests, plus distinct HODL identity/lookup assertions after review. New metadata uses `wiki-search-terms` / `keyword_bag`; production ranking weights and browser search/short-word rules are unchanged. The generator now rejects contradictory HODL aliases inherited from old SAM memory.

Browser validation passed for seven pages at desktop/mobile widths, all 320 target resolutions, early/middle/late actual navigation, overflow, comments mounts, seven no-JavaScript pages and twelve new-person full-search/autocomplete queries. The final pass waits for smooth scrolling to settle before asserting header clearance and taking screenshots. Desktop and mobile screenshots were inspected, including the settled HODL X mobile contents jump. Logs: `/tmp/moonboys-full-ci-final.log`, `/tmp/moonboys-wiki-ci.log`, `/tmp/moonboys-graph.log`, `/tmp/moonboys-browser.log`. Screenshots/reports: `/tmp/moonboys-war-preview`.

Environment-only fixes: `npm ci`, existing Chromium via `/tmp/moonboys-browsers` symlinks, stale ignored `public-site` cache preserved at `/tmp/moonboys-existing-public-site`. Test-created `__pycache__` is not part of this PR.

## PR delivery and review

[PR #1434](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/pull/1434) is open and attached to the Codex task, with **Hold merge** selected. Initial article/test/generated-assets commit: `3b25c9510d6dd357abba7748abb40960c87e3b1c`. Connected GitHub publication checked every blob against the local Git hash. The local branch was synchronised to the exact remote commit/tree; it tracks the matching sandbox branch. The canon approval label represents the user's explicit rewrite authorisation, not permission to merge or deploy.

GitHub CI (including visual), graph, structure, WAX, worker/API and deployment-provenance checks passed at the initial commit. The initial PR-template check rejected the environment-prefixed `npm test` evidence syntax; the description now also includes the exact `npm test — passed` line it requires, and that check passed. The initial unlabelled canon check was superseded by the successful labelled run.

Both Codex and Copilot reviews were read. Codex's misleading Moongirls/Block Topia card finding was fixed by removing duplicate cards while retaining the existing correct Block Topia cards. Copilot's HODL alias collision was fixed in the index generator and regenerated outputs, with order-independent entity-lookup and canonical-name search assertions. HODL Warriors and HODL X Warriors remain distinct; GK reiterated that lock during review. Copilot's stale handover finding is addressed by this delivery update. The evidence ledger records all three findings.

After review fixes, wiki CI, graph integrity, syntax/diff and real browser search checks passed. The two card-edited pages were rechecked on desktop/mobile (92 targets), including no-JavaScript navigation. The final PR follow-up contains these fixes and handover; current GitHub run status is available on the PR checks. No unresolved canon decision was silently settled and no merge/deployment was performed.

## Next steps

1. Hold merge/deployment for GK; inspect the final PR checks before any approved merge.
2. After an approved merge, perform the live verification listed in the PR (external engagement was isolated in local previews).
3. Use the generated rewrite audit for the next connected batch. Increment these seven articles' revisions on any later change to merged canon prose.
