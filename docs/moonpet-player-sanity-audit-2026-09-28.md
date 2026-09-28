# Moonpet player sanity audit — 28 September 2026

## Baseline and scope

Merged main was `651b80c69cec2066c71c30ae9027992a86c3096b` (#1357).
Production `/deployment-info` reported that exact commit, deployed at
`2026-09-28T08:47:54.761Z`, and `/health` returned `{"ok":true}`.
The preceding saved-ending fixes are deployed. This audit checks source,
isolated SQLite players, browser flows and read-only public endpoints. It
does not claim to inspect every live account or mutate production player data.
Read-only live daily, weekly, seasonal and all-time leaderboard requests also
returned valid JSON for the requested period. An initial Python HTTP request
was denied; the subsequent curl checks of the same public endpoints succeeded.

## Confirmed fault and fix

District state silently caught both initialization and read errors, then used
empty mastery. This is unsafe because the same state determines the encounter,
checkpoint, material, reward and mastery increment:

- If the first insert fails, the mission can still charge energy and pay XP.
  Its completion update affects no mastery row, but the attempt is marked
  completed. Later initialization creates an empty row, losing the earned
  mastery and excluding the completed attempt from pending recovery.
- If an existing mastery read fails, the mission is generated as if mastery
  were zero. A pet at 90 mastery can receive a normal encounter instead of its
  checkpoint boss, with the wrong reward decision.

Both original fault-injection tests failed on merged main because the action
continued instead of reporting the database failure. The getter now propagates those
errors and requires a real initialized row. The action stops before reserving
an attempt, charging energy or awarding a reward. A successful retry uses the
saved mastery. State projections also fail instead of advertising a fabricated
zero-mastery mission. The existing request error/retry path remains in use.

Review of commit `3f10a442f8` found another entry to the same fallback: the pet
authority lookup swallowed its database error. Both calls during state building
could fail, returning the unrelated runtime object and advertising zero mastery.
An added full Mini App state regression reproduces this on that reviewed commit.
The authority lookup now propagates database failures while a successful lookup
that finds no matching pet still returns the normal action rejection.

Three real SQLite fault cases now check both state construction and action
handling: no false zero-mastery projection, no attempt, energy or XP consumption
on failure, correct checkpoint display on retry, one mastery increment/reward
receipt, and matching daily/all-time public leaderboard totals after replay.
A separate test preserves the successful missing-pet rejection behavior.
Existing reset, pet-switch and season-rollover recovery tests remain in place.
No additional state queries or raised SQL budgets are introduced.
This prevents new bad settlements; it does not guess or rewrite historical
mastery that may already have been lost by a completed attempt.

## Action and quest review

| Area | Wiring / ending / reward contract checked |
| --- | --- |
| Adoption, incubation, hatch, roster, evolution | Owned active pet, lifecycle and level gates; existing API and browser suites |
| Feed, Play, Clean, Sleep, Train, Dance, Energy Drink, Cuddles | Server actions and cooldowns; the three newer buttons restore stats and do not grant XP or official care-objective credit |
| Jobs, activities, adventures, street events, expeditions | Accepted action receipts, energy/cooldown limits, completed claims and saved source-pet rewards |
| Seven daily missions | Accepted account-day action checklist; no separate all-seven bonus or boss is promised |
| Daily bounties / Cache | Four rotating bounties and once-per-key claims; one Cache per account/UTC day |
| Daily Journey | Three of five official objectives, one qualified Growth Mark per day; source evidence and recovery |
| Weekly Journey | All five targets: five care, three training, three qualifying runs, one boss attempt, two distinct check-in days; one qualified Crest per week |
| Standard / Daily Moon Run | Standard extraction/failure or 100-room finish; official Daily ten-room route and Alley King; terminal settlement and replay |
| Continuing Contracts | Six/ten-room routes, main goal plus final boss; repeatable Contract Rank and three daily 20-Pet-XP bonus slots |
| Practice | Freely repeatable local run and ending, without official rewards or leaderboard credit |
| Districts / stories | Authored choices, checkpoints / final story cycles, saved decisions and daily limits; district error handling fixed here |
| Weekly Boss / seasonal raid | Attempt and energy gates, saved victory claims, original source pet and rotation, bounded ending recovery |
| Arena / Kaiju | Battle pet authority, eligibility, costs and reward receipts |
| Shop, items, trade, market, crafting, gear, cosmetics, Relic Vault | Wallet/inventory/capacity checks, duplicate-safe settlement; Style Lab unlocks are not a visible equip feature |
| Season | Account XP tier claims; per-pet completion requires final evolution, 60 distinct-day Marks and 10 distinct-week Crests; no additional final-season boss |

The user-visible action handlers and their backend branches remain connected.
Locked future breeding, post-season Traits, Sanctuary, Lineage, Fusion and
Prestige remain unavailable. No new mode, reward, threshold or XP type is added.

## Website leaderboard agreement

Website, Mini App and bot use the shared Pet leaderboard projection. Daily and
weekly rankings count accepted Pet XP in their settlement windows; seasonal
ranking reads the source season; all-time includes retained owned pet instances.
Community XP, Contract Rank, specialist XP, Marks and Crests remain separate.
Recent public activity is a receipt feed, not a log of every navigation click.
Account-owned zero-XP purchases do not borrow the active pet's identity.

The new district retry tests read the public API after actual settlement and
confirm one XP contribution. Existing public-sync tests cover source-pet/season
attribution, archived pets, duplicate rewards and zero-XP activity. Browser
tests cover website period selection, refresh and outage states. The source
review found no new leaderboard mapping change needed for this patch.

## Validation and deployment

The expanded ending suite has eleven tests, and the existing 98-case
progression suite passes with unchanged SQL budgets. Live-system tests pass.
Full local `npm test` and GitHub CI results are recorded in the PR, including
Mini App mobile screens and public leaderboard mobile/desktop browser tests.

After merge, deploy the Worker from updated clean main with
`node scripts/deploy-worker-with-provenance.mjs moonboys-api`, compare
`/deployment-info` with that commit and reopen the Mini App. No new D1 migration,
frontend cache-token change or VPS restart is required. Existing migrations
remain required. Do not inject database faults into production for acceptance.
