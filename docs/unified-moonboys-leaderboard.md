# Unified Moonboys Leaderboard

Use `/games/leaderboard.html` as the home for rankings across games and reward systems. Give every ranking scope the same **Daily**, **Weekly**, **Monthly**, and **Seasonal** controls.

| View | Who ranks |
| --- | --- |
| Global · Hardest Grinder | Every eligible individual player, including clan members and unaffiliated players |
| Clans | The nine Battle Chamber factions, with member contributions and NPC/weekly boost breakdowns |
| Clan Players | Individual players with clan contributions, filterable by clan, with their global rank visible |
| No Clan | Individual players with unaffiliated activity, with their global rank visible |

Use one global player identity and global rank per period. Attribute clan contributions to the recorded faction when the verified event was earned. A later membership change cannot move past points between factions. A player active both before and after joining can have entries in both activity breakdowns while appearing once in Global.

Use UTC calendar days, Monday-start UTC weeks, UTC calendar months, and the configured season dates. Keep completed periods reproducible from the sources and scoring rules in effect for that period.

## Source integration

| Source | Breakdown on the board | Evidence for the unified ranking |
| --- | --- | --- |
| Shared Arcade and other games | Verified game scores and Arcade XP by title | Server-accepted runs and XP receipts, joined to the originating event |
| Dead Run, NBG London, Block Topia | Native records and rewards | Verified sessions, runs or settlement receipts from each game |
| MoonPet | Pet progression and reward totals | Verified care, gameplay and progression events |
| Battle Chamber and Daily WTF Signals | Player activity, clan totals, weekly perks and NPC rounds | Completed Signals, banked task tiers, leader rounds and finalized weekly awards |
| Community rewards, Tag Run, claims and Championship Clout | Native XP, Clout, lottery outcomes and prizes | Signed or settled source events with provenance and verified identity |

Expose native scores, XP, Gems, boosts and prizes in breakdowns. Compute the cross-system player rank from a versioned table of Grinder Points per verified activity. When one action produces a game record, XP and a reward, credit the activity once and show all three effects in its details. Keep NPC rounds and future weekly clan lottery carryover on clan rows. Preserve native per-game rankings and wallet balances.

## Implementation order

1. Inventory each authoritative reward producer and document its event ID, player/faction identity, earned time and replay behavior. Mark coverage by source and period.
2. Build the read model from server-owned settlement records. Define effective dates, point weights, caps, ties and how passive or chance-based awards contribute before publishing the global rank. Replay a representative week across games and clan sizes to check for double credit and source dominance.
3. Serve paged, server-ranked responses keyed by scope and period. Include source coverage, score breakdown, and a stable rank for the signed-in player's account. Preserve closed-period standings across retries and late arrivals.
4. Replace the existing page’s scope and period controls while retaining the per-game scores. Show loading, partial coverage and unavailable states explicitly.
5. Test cross-source identity and deduplication, clan changes, NPC isolation, repeatable settlement, UTC rollover, season boundaries, and that a clan player remains eligible for Global.

The current page uses `js/arcade-leaderboard.js` and `js/leaderboard-client.js`. Clan standings and leader support come from separate Worker modules. This document describes the target board. Points and source coverage must be verified before the Global Hardest Grinder rank goes live.
