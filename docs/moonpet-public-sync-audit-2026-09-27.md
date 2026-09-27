# Moonpet public synchronization audit — 27 September 2026

Base: merged PR #1344, `56d323fbd41f08c0394005c9c51d81a45cc9200b`.
This audit traces source code, real SQLite reward settlement and isolated browser
players. It does not claim that every production account has been inspected.

## Reproduced failures and changes

1. **All-time Pet XP followed the selected pet.** Website and Mini App queries
   used `telegram_pet_profiles.pet_xp`, which mirrors the current companion.
   The regression gave one owner pets with 100 and 200 XP and observed 100 on
   the all-time board. All-time now sums owned instances across seasons, including
   archived pets, with exact instance/season-slot authority. A genuinely legacy
   account with no instances retains its profile total. Invalid instance tuples
   are not replaced with an unrelated compatibility total.
2. **Ranking surfaces disagreed.** The website, Mini App period chooser, initial
   Mini App panel and bot had separate queries and tie ordering. One read-only
   projection now serves them. The initial panel explicitly shows current-season
   ranks. Ties use stable owner-ID ordering; IDs remain absent from public Pet
   entries. The Mini App still returns a self row below its top-page limit.
3. **Public reads could mutate other players.** Identity materialization could
   initialize pets/lifecycles or move their season pointer while viewing ranks.
   Ranking and activity queries now read persisted identity only. Missing or
   inconsistent authority stays masked; the owner's authenticated game flow
   remains responsible for initialization and migration.
4. **Activity used the wrong pet.** Events were decorated with the current pet's
   evolution/lifecycle, including older rewards after a switch. The activity
   projection now joins the event's original owner/pet/season/slot. Unattributed
   legacy events cannot borrow the current companion's identity. Anonymous
   activity no longer falls back to a raw Telegram owner ID. Wallet reconciliation
   markers remain excluded.
5. **Community ranks could be stale.** `/telegram/leaderboard` ordered current
   XP but returned a persisted `rank` when present. A regression seeded rank 99
   on the top scorer and observed 99. The response now derives rank from the
   current ordered result, with deterministic ties.
6. **Website refresh/error/mobile behavior was incomplete.** Pet ranks loaded
   once, request failure looked like an empty board, and narrow screens overflowed.
   The page now has refresh and recent accepted activity. Returning to the page
   refreshes after a 30-second throttle; manual refresh and error retries are wired.
   A failed refresh retains the prior rows with a warning. The table scrolls
   within its own region and places Pet XP before optional identity/stat columns.

## Reward, logging and display boundaries

| Game path | Durable evidence / ending | Website and leaderboard effect |
| --- | --- | --- |
| Care, training, jobs, trade, activities, items and economy | Accepted action/reward records; cooldowns, ownership, wallet checks and settlement receipts | Applied Pet XP appears in Pet ranks; only explicitly awarded Community XP reaches Community ranks. Accepted event records can appear in recent activity |
| Standard runs | Saved rooms/choices, bosses, extraction/completion and reward receipts | Applied XP enters the corresponding boards; existing run-depth records remain a separate ranking |
| Official Daily Run | One account attempt per UTC day; ten rooms and Alley King; saved boss/early-terminal recovery | Applied XP enters Pet/Community totals according to the reward; official Daily Run records and Journey evidence stay separate |
| Continuing Contracts | Saved choices/revision, six/ten-room routes, goal-specific bosses, rank and route records; bounded bonus reservations | Paid Contract bonus enters Pet XP ranks once. Contract Rank and individual choices do not mint Community XP or add graph score |
| Practice | Local saved run and score; repeatable | No official XP, public reward event or graph score |
| Daily Journey | Three of five qualifying objectives; Growth Mark receipt | Mark/evolution progress is distinct from Pet XP; qualifying source actions contribute only their actual XP |
| Weekly Journey | All five objectives; Crest and historical threshold-crossing date | Crest and season-completion progress are distinct from XP. Recovered evidence does not pay source rewards again |
| Weekly Boss and seasonal raid | Defeat records and recoverable reward claims | Applied rewards flow through existing ledgers; recovery does not duplicate a victory or payout |
| Season XP tiers and pet completion | Tier claims; final evolution plus 60 Marks and 10 Crests | Account season XP ranks and per-pet completion remain separate. Recovery retains the original pet/season |

Daily and weekly Pet scores use accepted events in their recorded UTC settlement
window. Seasonal scores use `telegram_pet_season_state` for the source season.
All-time uses retained owned-pet XP, including earlier seasons. The identity,
level and streak displayed beside an account score describe the current pet;
recent activity identifies its source pet instead. Historical recovery can
therefore raise today's score and an older season without raising this season.
That is source attribution, not a synchronization error.

The existing seven daily mission checklist has no separate all-seven payout.
Pet season completion has no additional final boss. Breeding, post-season Traits,
Sanctuary, Lineage, Fusion and Prestige remain future/locked Mini App content.
No unfinished option, reward cap or quest threshold is changed here.

## Graph trace

`community.html` uses `js/telegram-community.js` and `/telegram/leaderboard` for
Community XP, alongside the separate Pet leaderboard surface.

`graph.html` uses `js/graph-visualization.js`, which loads `graph-data.json` or
`entity-graph-lite.json`. `scripts/generate-graph-data.js` builds those nodes from
canonical wiki-index entries and their content/relationship rank signals. Pet
XP, Contract Rank, Growth Marks and Community leaderboard positions are not inputs.

The graph on `games/leaderboard.html` receives the selected Arcade row through
`onRowSelect(entry) -> setPlayerState(entry)`. `js/arcade-graph.js` uses that same
row's Arcade breakdown. The Arcade board comes through `leaderboard-client.js`,
not the Pet endpoints. No Pet score was injected into either graph. Existing
graph files did not need regeneration for these runtime fixes.

## Verification

- Regression first failed at 100 versus 300 all-time XP, then passed after the
  shared projection change; switching no longer changes the account total.
- Real central reward settlement and duplicate retry verify original-pet XP,
  daily/weekly display, original-season attribution, Community XP separation,
  one activity entry and the Community stored-rank failure/fix.
- Website and Mini App entries match for all five supported periods. Initial
  state matches the seasonal chooser. Read-only assertions use SQLite's mutation
  count; tests cover self outside top results, foreign pointers, missing/legacy
  identity, wrong event season, masked identity, private IDs and error responses.
- Website browser checks pass at 360, 390 and 1280 pixels: four score periods,
  activity, refresh, preserved stale rows, inline retry, first-load outage and
  no page-wide overflow. Pet XP is visible before horizontal scrolling.
- The existing Mini App player-loop browser suite passes at 390×844 and 360×640.
  The full Worker/API domain passes, including daily/weekly/season, boss/recovery,
  economy, authority and Contract regressions. GitHub CI results are recorded in
  the PR. Graph integrity passes (337 nodes, 1,629 edges, 75 mobile nodes).

## Limits and deployment

Recent activity is the latest ten accepted records on the page, not a complete
click history. Contract moves are saved in Contract state, incubation in its
lifecycle records, and local Practice remains local. Deleted or inconsistent
historical authority cannot be safely reconstructed by a public read. These
queries expose current authoritative records; they do not backfill invented XP.

After GK approves merge, deploy `moonboys-api` from clean merged main with the
provenance wrapper, verify `/deployment-info`, and publish the matching Pages
revision. Client token: `20260927-public-sync-v1`. No D1 migration or VPS restart.
Reopen the Mini App and refresh the Pet leaderboard. Check period parity and an
earned reward on an owned test account; production player data was not mutated
during this audit.
