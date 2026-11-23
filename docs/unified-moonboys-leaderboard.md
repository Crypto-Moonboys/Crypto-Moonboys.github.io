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

## Grinder Points v1

The unified chart reads the Moonboys D1 authorities and keeps the existing Arcade score tabs and Node Map below it.

| Verified source | Points | Daily cap per player |
| --- | ---: | ---: |
| Shared Arcade, NBG London, ranked Dead Run and accepted Block Topia RPG wins | 10 per eligible record | 30 per game |
| Battle Chamber banked tiers | 10 per bank | 30 |
| MoonPet eligible gameplay or care receipt | 5 per record | 30 |
| Completed Daily WTF Signals | 5 per completion | 30 |
| Settled wiki missions | 5 per mission | 15 |
| Accepted Tag Run messages | 1 per message | 15 |

The game filters rank Grinder Points for that game. The breakdown shows accepted record counts, best native score, and source XP where the underlying receipts retain those values. NBG replay-verified finishes retain the completion receipt in the unified board. Its native scores, times, and prizes remain on the London board. Derived XP credits, prize receipts, Championship Clout effects and duplicated score mirrors do not earn additional points. Unverified, practice or client-only results stay outside the unified chart.

For individual activity without a faction recorded on the source, the weekly crew roster assigns the points. Activity without either record is shown in No Clan. All individual activity appears once in Global. The nine faction rows include their attributed player totals, tracked NPC rounds, and existing weekly Supply Dock, Signal Relay or Crew Rally points. NPC rounds and clan perks do not enter any individual total.

### Battle Chamber weekly boosts

The finalized unified weekly Factions chart sets the next Battle Chamber boost level as `10 - rank`. Slowing a rival suppresses the overlapping NPC round. If it changes the closing rank, it also changes the next boost level. A faction needs eligible activity in the closing week to earn a boost.

At settlement, the existing bank and roster activity rules select Supply Dock, Signal Relay or Crew Rally. A faction without recorded active bankers receives Crew Rally. The selection and rank are frozen together. The Battle Chamber and unified board then read the same weekly perk. The native task-banking standings and collectible awards continue to follow their existing rules. Weeks before the first eligible unified close use finalized banking ranks for perks. From the first eligible close onward, the next perk waits for unified settlement.

### Closing and bonuses

Each closed chart preserves standings from receipts available at settlement. The existing five-minute scheduled Worker closes periods starting 15 minutes after their UTC or configured season boundary. It can catch up missed closes in chronological order. Places 1, 2 and 3 earn 30, 20 and 10 bonus points on each finalized chart. Exact ties share a rank and award. Bonus-only rows cannot earn another bonus. An award carries into the immediately following period of the same kind. Global includes up to 60 points from the combined individual chart bonuses. Factions and individual Games charts retain their own awards. Clan Players and No Clan bonuses appear on their origin chart when the player records eligible activity there again. Bonuses leave the settled order and XP wallets intact.

Migration 132 sets the first eligible daily close at the end of the first full UTC day after migration. Weekly, monthly and seasonal closes begin at the first applicable boundary after that date. The current view can read verified activity from before migration if it falls inside the active period. Previously closed periods are not backfilled for bonuses.

### Release order

1. Apply `132_unified_leaderboard.sql` to the Moonboys API D1 database and verify the epoch and empty snapshot tables.
2. Deploy the versioned `moonboys-api` Worker. Check `GET /leaderboard/unified?scope=global&period=weekly` and a game-filtered response.
3. Confirm Pages serves the updated leaderboard and the native views load. Check the first completed period in Last finalized and verify its bonuses in Current. The project release policy governs migration, merge and deployment approval.
