# Core history rewrite — first batch

This batch reconciles the five P1 pages in the core cosmology/history queue. It replaces their article bodies once, preserves their URLs and site mounts, and records canon revision 1. It does not revise the 82 First Witness pages or decide unresolved character/faction biographies.

## Decisions and evidence

| Article | Replacement decisions | Primary repository evidence |
|---|---|---|
| `sacred-chain` | Separate inherited scripture/memory from World Chain infrastructure and Block Topia's True Bitcoin Fork. Start with the 2030 witness, leave the Sacred Fork date open, and retain soul/upload explanations as theology or disputed origin traditions. | `first-witness-sacred-fork`, `first-witness-glossary`, `first-witness-concordance`, `first-witness-master-chronology`; W81 `w23`, `w27`, `w28`, `w30`, `W20`. |
| `triple-fork-event` | Fix the World Chain catastrophe to 2880. Explain Chainfire as the collapse process and Great Unravelling as the wider historical period. Preserve the 2765 conflict and use the stronger by-2930 secure-region anchor. Keep later three-saga readings and the Final Fork distinct. | `first-witness-triple-fork-chainfire`, `first-witness-world-chain-error`, `first-witness-master-chronology`, `first-witness-concordance`; W81 `W15` opening history, `w70`, `w22`, `w23`. |
| `genesis-kernel` | Replace repeated origin assertions with separate rescue-intelligence, original-ledger and Genesis Error traditions. Leave date and exact chain relationship open. Identify the Architects account's impossible “subsequent 2789” sequence without inventing a corrected date. | `first-witness-concordance`, `first-witness-sacred-fork`; W81 `W2` Kernel entry, `w37`, `w61`, `w63`, `w87` relevant entries. |
| `graffiti-nexus` | Consolidate the surviving hidden-server legend once. Treat $PUNK source-code, relic-forge and Kernel-energy claims as uncertain contents. Do not turn the Leake Street analogy into a real-world headquarters/ownership claim. | Existing article and its legacy `wiki/bibles/graffiti-nexus.json` account; First Witness witness/custody principles, `first-witness-street-kingdoms-reading`; W81 `w23`, `w58`, `w70` for broader Paint Path context. The specific Nexus name has no independently identified W81 account. |
| `hard-fork-games` | Restore the forty-faction summons and Feast Week; attribute 480 entrants to the detailed account. Keep arena and Citadel optimisation descriptions as competing accounts. Retain emissary/Clone Harvest testimony, three paths and bonnet status. Keep Bitcoin Kids/X Kids and HODL/HODL X distinct. | `first-witness-concordance`, `first-witness-block-topia-reading`, `first-witness-glossary`; W81 `W14`, `w22`, `w23`, `w26`, `w39`, `w62`, `w70`, `w25` relevant golden-ticket statements. |

The source order is the user's current convergence hierarchy: published First Witness; latest canon/brand vision; W81 digest; available dedicated subject records; raw W81; surviving wiki archive. Old SAM verification counts are not evidence. All sources remain in the repository; no external source URLs are added to the lore.

## Ownership and presentation

- Each article has one `CANONICAL_CONTENT` block, `data-canon-revision="1"` and `data-canon-source-tier="first-witness+w81"` on its existing article root.
- The existing content-state generator records `content_owner`, `canon_revision` and `canon_source_tier`, classifies completed rewrites as `KEEP`, and locks automated prose through `canon-locked`. No second manifest or bot-memory approval system is introduced.
- The existing prose/markup approval ratchet continues to apply. A later changed canonical body must increase its revision; a revision cannot be removed or decreased. An increased revision does not grant approval by itself.
- Explicit `wiki-category: core` metadata supersedes stale SAM category memory, keeping these history/system pages out of incidental character or faction classifications.
- Search terms remain specific to each subject. Search, publish gate, link map/graph, entity map/graphs, SAM memory, statistics and sitemap are regenerated through the existing publishing pipeline.
- Legacy `bible-content` mounts are removed from these five articles so older SAM timelines and relationships cannot append to the canonical body. The shared bible-loader script and other pages retain their existing behaviour.
- Breadcrumbs, related navigation, category tags, comment/vote mounts and script boots remain. Fake SAM authority badges/cycle counts and invented source counts are removed. No games, auth, Worker routes or database schemas change.

## Remaining uncertainty

Kernel ontology, NULL's exact origin, Sacred/Aether technical boundaries, exact Sacred Fork date, Nexus contents, and disputed Games mechanics stay open. The rewrite establishes how those traditions are described; it does not promote their strongest metaphysical claims into settled history.

Modern dedicated character/faction bibles are not separately identified in this checkout. This first batch does not fill that gap by treating historical SAM JSON as approved modern canon. The remaining queue is still in `brand-canon/wiki-rewrite-audit.md`.

## Validation

- The wiki CI group passes, including the ownership approval ratchet, publishing audit, content-state parity and all 12 First Witness search-ranking contracts.
- Graph parity passes for 409 indexed wiki pages, 419 graph nodes, 2,041 edges and the 75-node mobile graph. All five rewritten articles retain their URLs and are classified as core history.
- The arcade, Worker/API and WAX CI groups pass. The visual CI group passes, including native radio, Moonpet mobile flows, public sync, community XP, avatar export and shell/copy guards.
- All five articles render at 1,440px desktop and 390px mobile with one visible canonical title, no horizontal overflow, no script errors and no legacy bible JSON requests. Existing comments and vote mounts are retained; Nexus did not previously have a comments mount.
- Browser checks use packaged Chromium 147.0.7727.0 because the standard Playwright CDN installation is unavailable in this environment. External API requests are blocked in the isolated article preview; local artwork supplies the existing metadata images. Live voting/comments behaviour still needs post-merge verification.
- The Triple Fork structured-data description is corrected alongside the visible body and search metadata. No First Witness HTML file changes.

Production merge remains on hold until GK approves the final PR.

## Next coherent batch

Continue with the protagonist/war spine: Bitcoin Kids, Bitcoin X Kids, the two Bitcoin Kid Army surfaces, HODL Warriors, HODL X Warriors and HODL WARS. Reconcile that whole set before locking any new relationship between the groups. The current batch remains subject to GK's final merge decision.
