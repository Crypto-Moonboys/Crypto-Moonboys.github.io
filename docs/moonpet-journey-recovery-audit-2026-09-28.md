# Moonpet quest and ending sanity audit — 28 September 2026

## Verified baseline

Current main: `a9908944b5c916687dd8ed8c7f58d0d0ff9a2d8d` (merged #1358).
Production reported that same commit, deployed at `2026-09-28T09:26:10.964Z`;
health was OK. Read-only live daily, weekly, seasonal and all-time leaderboard
requests returned valid JSON for each requested period. The district
authority/progression correction is deployed.
This review uses current source, real SQLite fault injection and isolated
browser tests. It does not claim to inspect every production player's account.

## New failure reproduced

Daily and weekly Journey recovery selected only the oldest eligible awards.
State refresh allows two of each per request. If those two persistently fail,
every refresh selects them again and later earned Marks/Crests remain stranded.
Source-evidence recovery has the same issue when its oldest batch keeps failing.
The per-record catch prevents a request crash but does not provide fairness
between batches. This is separate from the Daily Run ending cursor fixed earlier.

Three regressions failed on merged main: two failing daily awards blocked a
third; two failing weekly awards blocked a third; and a failing source batch
blocked a later accepted event. Source tests use a smaller configurable batch
to reproduce the same behavior without a large fixture. Award tests use the
actual two-award state allowance.

## Fix

Each of the three queues now orders pending work after its last attempted batch,
then wraps to older pending work. It saves the next position before settlement,
so exceptions, rejections and interruptions also yield to the next batch.
An atomic compare-and-set prevents a refresh using an old snapshot from
rewinding the cursor or processing that stale batch.

Scheduling uses three private account keys in existing `telegram_settings`.
The cursor is not reward evidence and cannot bypass source ownership, accepted
objective evidence, qualification thresholds or existing idempotent settlement.
No pending work is deleted, marked paid or permanently skipped. If its underlying
problem is repaired, it is retried on wraparound.

The normal empty queue adds no statements. Each nonempty queue adds one cursor
write for its whole batch. Existing source/award limits are unchanged. The
98-case progression suite passes without raising the 180-statement warm-state
or 600-statement backlog budgets; the backlog fixture peaked at 565 statements.

## Action, mission and ending review

| Area | Contract checked |
| --- | --- |
| Adoption, incubation, hatch, roster, callsign, evolution | Owned active pet, lifecycle/level gates and per-pet progression |
| Care and three newer pose buttons | Stat effects, cooldowns and receipts; Dance/Energy Drink/Cuddles remain stat-only |
| Jobs, timed activities, adventures, street events, expeditions | Accepted action receipts, costs, saved outcomes and claim/retry paths |
| Seven daily missions | Account-day checklist with qualifying action links; no separate all-seven bonus |
| Bounties and Cache | Four rotating bounty claims and one account/day Cache, backed by accepted receipts |
| Daily Journey | Three of five official objectives; at most one qualified Growth Mark per day; fair recovery fixed here |
| Weekly Journey | Five care, three training, three qualifying runs, one boss attempt and two distinct check-in days; fair Crest recovery fixed here |
| Standard / Daily Moon Run | Extraction/failure or 100-room finish; official ten-room run ends at Alley King; terminal reward recovery retained |
| Contracts / Practice | Six/ten-room Contracts require main goal and final boss; unlimited rank with three daily XP bonus slots; Practice has no official rewards |
| Districts / story chains | Saved choices, checkpoint bosses / final story cycles, daily limits and reset-safe endings; #1358 read-error guard retained |
| Weekly Boss / seasonal raids | Attack gates, victory, original pet/rotation reward claims and interrupted-ending recovery |
| Arena / Kaiju | Eligibility, captured combat pet, energy and battle reward receipts |
| Shop, items, trade, market, crafting, upgrades, cosmetics, Relic Vault | Costs, capacity, inventory/unlock authority and duplicate-safe settlement |
| Season | XP-tier claims; per-pet final evolution plus 60 distinct-day Marks and 10 distinct-week Crests; no additional final-season boss |

Rendered literal action keys all have Worker references; actual dispatch and
UI behavior are covered by the API and browser suites. Future breeding,
post-season Traits, Sanctuary, Lineage, Fusion and Prestige stay locked.
This patch adds no modes, rewards, XP types or shortcuts around daily limits.

## Leaderboard and attribution

Pet rankings remain shared by the website, Mini App and bot. Daily/weekly
rankings use accepted Pet XP settlement windows, seasonal ranking uses source
season XP, and all-time includes retained owned pets. Community XP, Contract
Rank, specialist XP, Marks and Crests remain distinct measures. Public recent
activity is a receipt feed rather than every UI interaction.

The new tests switch the active pet, recover the original pet's daily/weekly
awards, preserve their original earned periods, retry the previously failed
records, and replay recovery without duplicates. Reading the public all-time
endpoint confirms the awards do not invent Pet XP. Source recovery preserves
the original accepted XP event rows byte-for-byte. The patch changes scheduling,
not the leaderboard projection or earning rules.

## Validation and deployment

The quest/public-sync suite now has eight tests, including four new fairness,
source, attribution and overlapping-refresh cases. Three failure cases were
reproduced before the fix. Syntax/diff checks and the 98-case progression suite
pass. Full local tests and GitHub results are recorded in the PR, including all
six mobile game screens and the public leaderboard browser tests.

After merge, deploy the Worker from updated clean main using
`node scripts/deploy-worker-with-provenance.mjs moonboys-api`, verify the commit
at `/deployment-info`, and reopen the Mini App. No new migration, frontend cache
token or VPS restart is required. A retained backlog progresses across refreshes;
persistently broken source data remains pending rather than receiving invented
credit. Production player records were not mutated during this audit.
