# War spine expansion — working handover

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

All seven completed, revision 1, one canonical block each, native collapsible contents navigation and retained layouts/artwork/engagement. Measured counts excluding contents: Kids 4,644; X Kids 4,689; Army 4,105; Escape Accounts 2,700; HODL Warriors 4,229; HODL X 4,462; HODL WARS 4,864. Total 29,693 words, 160 sections. The companion is deliberately shorter because it has a distinct historical purpose. Editable temporary drafts/installer: `/tmp/moonboys-drafts`. Repository HTML and evidence ledger are the durable deliverables. Legacy Army anchors are retained. Two absent-page links now lead to Block Topia. No First Witness or prior revision-2 article edits.

## Validation

Publishing surfaces regenerated, then content-state inventory/audit regenerated separately. Full `npm test` passed all five required groups. Independent wiki, graph, syntax and diff checks passed. Original 58 lore-search queries, 12 First Witness intent contracts, title-only relationship tokens and false free-NFT/Sacred Chain relationship regression are preserved. Added 48 connected-lore search cases and structural/ownership tests. New metadata uses `wiki-search-terms` / `keyword_bag`; no production ranking/selector changes.

Browser validation covers seven pages at desktop/mobile widths, all 320 target resolutions, early/middle/late actual navigation, overflow, comments mounts, seven no-JavaScript pages and twelve new-person full-search/autocomplete queries. The final pass additionally waits for smooth scrolling to settle before asserting header clearance and taking screenshots. Final result pending at this handover checkpoint. Logs: `/tmp/moonboys-full-ci-final.log`, `/tmp/moonboys-wiki-ci.log`, `/tmp/moonboys-graph.log`, `/tmp/moonboys-browser.log`. Screenshots/reports: `/tmp/moonboys-war-preview`.

Environment-only fixes: `npm ci`, existing Chromium via `/tmp/moonboys-browsers` symlinks, stale ignored `public-site` cache preserved at `/tmp/moonboys-existing-public-site`. Test-created `__pycache__` is not part of this PR.

## Next steps

1. Confirm final smooth-scroll browser pass and inspect its screenshots.
2. Finish exact-hash GitHub publication, open and attach the PR, record its URL here.
3. Read Codex/Copilot findings and CI; fix valid issues, record final status. Hold merge for GK.
