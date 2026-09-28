# Moonpet gameplay and reward recovery audit — 28 September 2026

Base: merged PR #1349, `d2bbe0ed6b10335a6bb74f8527870b8a49dc6fcb`.
This is a source, SQLite and browser audit. Production accounts were not modified;
it is not a claim that every live account has been inspected.

## Confirmed faults and changes

- Mini App Standard extraction and final-room retries skipped specialist rewards
  after the primary result committed. New recovery uses the saved source key,
  original pet, season and day. Opening the authenticated game repairs up to 20
  unpaid, source-backed awards; already-paid and invalid ownership rows are
  excluded before that limit.
- An API replay of a Mini App room minted another 10 Adventure XP because it
  used an API-prefixed key for a Mini App source. All Standard room surfaces now
  use the persisted identity. Tests reproduced 20 XP for one 10-XP step.
- Official Daily rooms and extraction had no recoverable specialist identity.
  New resolved room outcomes and terminal analytics persist canonical identities
  with their game state. A stale retry or refresh recovers the original award.
  A saved final boss awards only its missing 10-XP step; it cannot also earn the
  24-XP extraction award. Closed unmarked legacy Daily runs are not re-keyed.
- Raid victory progression, Adventure, district and story rewards could lose
  specialist XP after interrupted writes. Recovery uses accepted Adventure
  receipts, saved raid victories and new district/story reservation identities.
  Changing a retry request ID cannot change the reserved reward identity.
  Adventure API requests now receive the same 120-character event-key guard as
  other progression-bearing actions.
- Pending raid payouts were visible/claimable only for the selected pet. An
  earlier season's victory disappeared when a new pet was selected. Pending
  rewards now list source-backed victories across owned pets and seasons.
  Claims verify the victor's owner/season/slot and credit that pet. An active egg
  can claim those saved rewards; it cannot use this exception to start a raid.
  The egg Explore panels now render both saved Weekly Boss and raid claim controls.

The first Mini extraction/final-step, raid progression, cross-surface duplicate
and hidden earlier-season raid scenarios were observed failing before their fixes.
No reward amount, daily cap, cooldown, boss difficulty or quest target changed.

## Gameplay and ending coverage

| System | Player loop / ending / reward |
| --- | --- |
| Care and special care | Feed, Play, Clean, Sleep, Train and special actions retain server cooldowns, eligibility and daily caps; growth and specialist tracks remain separate |
| Jobs, Cache and timed activities | Saved claims and original-pet/day recovery; normal primary XP/currency settlement and caps |
| Seven daily missions and bounties | Existing qualifying action routes, claim conditions, cooldown guidance and UTC reset; the seven-item checklist has no separate all-seven bonus |
| Daily Journey | Three of five qualifying objectives produce the daily Growth Mark; source-backed recovery and duplicate protection |
| Weekly Journey | All five targets produce a Crest; historical threshold dates and source-backed recovery remain covered |
| Official Daily Run | One account attempt per UTC day, ten rooms, checkpoint tactics and Alley King ending; failure, extraction and interrupted boss settlement |
| Standard Run | Saved choices and unbanked loot, extraction/failure, 100-room ending; specialist awards survive retries and refresh without another room or primary payout |
| Contracts and Practice | Saved six/ten-room routes, choices and boss endings; first three qualifying daily Contract bonuses remain bounded; Practice remains repeatable and local |
| Districts and stories | Authored decisions, saved outcomes, mastery/boss checkpoints and repeatable story cycles; existing daily limits remain |
| Weekly Boss and seasonal raids | Attempts, defeat and recoverable rewards; saved raids remain reachable after switching pets or seasons |
| Season tiers and completion | Tier claims and final evolution plus 60 qualified Marks / 10 Crests; no separate season-completion boss exists |
| Shop, market, crafting, gear and cosmetics | Existing costs, unlocks, capacity, item use, goals and retry protections remain covered |
| Arena and Kaiju | Existing capability/level/hatched-pet gates, matchmaking and settlement suites; no combat access change |

Locked future features remain locked. This patch repairs existing earned rewards;
it does not invent a new completion bonus or add another boss.

## Public logs, leaderboards and graphs

Pet leaderboards use accepted Pet XP for daily/weekly, source-season XP for the
seasonal board, and owned pet totals for all-time. The new old-season raid test
checks 150 Pet XP on daily/weekly boards, the original season, summed all-time
XP, and the source pet in public activity. Switching to an egg and repeated
claims do not move or duplicate that reward.

Specialist Adventure/Care/Bond/etc. XP is a separate progression system. Repairing
it does not add Pet XP or Community XP again. Accepted primary events feed recent
activity; Standard room choices also live in run steps, Daily rooms in room
records, and Contract choices in saved Contract state. The public page is a
recent activity list, not a complete click history.

`community.html` reads `/telegram/leaderboard` for Community XP. `graph.html`
loads canonical wiki graph data; `games/leaderboard.html` sends its selected
Arcade row to `setPlayerState`. Moonpet XP is not an input to either graph.
Graph integrity checks 327 indexed wiki pages, 337 nodes, 1,629 edges and 75
mobile nodes; these runtime changes require no graph regeneration.

## Validation and limits

`scripts/moonpet-progression-sync.test.mjs` now has 39 SQLite regressions
(16 new). They cover injected primary/specialist failures, changed retry keys,
pet/season switches, saved boss completion, cross-surface duplicates, historical
caps and dates, bounded recovery, whitespace keys, ambiguous legacy API keys, source ownership,
and public reward output.
The existing Daily ending tests now also assert that an interrupted early
extraction repairs its 24 Adventure XP on refresh.

The mobile player-loop test exercises all six screens at 390×844 and 360×640,
including an enabled saved-raid claim while the selected pet is an egg. Public
leaderboard browser checks cover 360/390/1280px, period choices, source activity,
refresh, retained stale data and retry. Exact final full-suite and CI results
are recorded in the PR.

Historical Daily/district/story receipts without an unambiguous specialist key
are not guessed or repaid. Existing conservative legacy extraction handling is
preserved. Missing pet/season/slot authority is excluded. The repair queue is
bounded, so a large recoverable backlog may require several state refreshes.

## Deployment

Deploy `moonboys-api` from clean merged main using the provenance wrapper and
publish the matching Pages revision for the egg claim controls. Client cache
version: `20260928-runtime-recovery-v1`. No new D1 migration or VPS restart.
Verify `/deployment-info` against the merged SHA, reopen the Mini App, and check
a saved raid claim plus the public Pet leaderboard/activity.

Backup: `codex/backup-moonpet-loop-audit-20260928-014500`.
Sandbox: `codex/sandbox-moonpet-loop-audit-20260928-014500`.
GK approval is required before final merge or production deployment.
