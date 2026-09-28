# Moonpet run authority and reward retry audit — 28 September 2026

## Baseline

Audited main `9950253f3b4323cfcc8b44a359f95e65b1875349` (merged #1361).
Production reported that commit, deployed at `2026-09-28T12:22:39.285Z`, with
healthy status. The game page, Mini App, play-options, Practice and CSS files
matched main byte for byte. All four public Pet leaderboard periods and the
activity feed returned valid data.

This follows the [cross-system audit](moonpet-cross-system-sanity-2026-09-28.md).
It repeats the full regression/browser coverage and concentrates on remaining
run classification, interrupted creation, evidence reads and secondary rewards.
Tests use isolated SQLite players; live verification is read-only and does not
inspect every private player account.

## Reproduced bugs and corrections

### Daily Runs could enter the Standard engine

A failed Daily reservation read was treated as no reservation. Both action
surfaces could then use Standard Run rules. Omitting `run_id` also skipped
classification even when the active run was Daily. An isolated API extraction
closed the Daily run through `pet_run_legacy`, paying its banked XP and Community
XP while leaving its Daily record active. Older Telegram run controls reached
the same Standard functions directly.

Reservation errors now propagate. ID-less actions resolve the active run before
classification and pass its saved ID to Daily processing. Standard resume,
step and extraction explicitly exclude Daily reservations, canonical room runs
and reserved Daily IDs. Telegram gives the player the Mini App Explore link
instead of presenting Standard choices for an official Daily attempt.

### A saved Daily reservation could have no usable room

If room creation was interrupted after saving the reservation or room advance,
the state response displayed no choices. Refresh now restores a genuinely
missing next room from the stored seed and room index, using the existing
idempotent room insert. A read error is never treated as a missing room. Existing
room decisions and outcomes are not regenerated; repair does not advance the
run, charge energy or settle rewards.

### Daily synchronization could finalize incomplete records

Required reads of the boss win, resolved rooms, existing leaderboard record
or streak history silently returned empty data. Synchronization could then mark
terminal analytics applied with missing boss/objective/stat evidence. Other
Daily authority and Growth Mark reads had the same error-swallowing pattern.

These reads now propagate errors and preserve the retry path. A successful
query with no matching record is still a valid empty result. Finalization waits
for its evidence; repeating a successful sync does not increase runs or boss
counts again. Daily/weekly objective and Growth Mark recovery remains bounded.

### Paid Standard endings could lose personality and memory

The Standard recovery queue excluded every paid claim, even if a later
personality or memory write failed. The primary reward and leaderboard XP were
correct but the pet's run count/milestone or exploration progression stayed
missing.

The existing bounded queue now also selects source-backed paid endings missing
an applied identity receipt. It reuses the original reward key, pays nothing
again and finishes the missing identity work. Recovery verifies owner, pet,
season and accepted event type. It can finish for an archived source pet;
personality uses the accepted event's original day and existing daily cap.
Extraction memories retain the original event timestamp, including an earlier
extraction recovered after a newer one. No new boss victory is invented for a
Standard run without canonical boss evidence.

## Functions, missions and public synchronization

| Area | Verification retained |
| --- | --- |
| Adoption, egg care, hatch, roster, evolution | Lifecycle/owner gates and source-pet regression suites |
| Feed, Play, Clean, Sleep, Train; Energy Drink, Dance, Cuddles | Real stat effects, cooldowns, daily limits, busy/energy gates and saved receipts |
| Daily checklist and 7/7 bonus | Seven earned objectives; saved once-per-account/day bonus and duplicate-safe claim |
| Daily Journey and bounties | Source-backed objectives, three-of-five Mark, bounty claims and UTC reset |
| Weekly Journey and Weekly Boss | All five objectives, Crest, saved boss victory and interrupted reward recovery |
| Standard Run | 100-room completion/extraction, original-pet payout and now paid-ending identity recovery |
| Official Daily Run | Account/day reservation, ten rooms, tactics, Alley King, extraction, terminal records and safe retries |
| Contracts and Practice | Saved six-/ten-room Contract goals, drafts and final boss; repeatable rank and capped bonus. Practice stays local with no official XP |
| Districts, stories, seasonal raids | Saved choices, daily limits, checkpoint/boss endings and original-pet reward recovery |
| Season tiers and Signal Sovereign | Tier claims; final evolution plus 60 Marks/10 Crests; three finale builds, failure/retry, saved victory and one payout |
| Jobs, activities, expeditions, trade, shop, crafting and gear | Costs, capacity, source receipts, equipment use, mastery and interrupted claims |
| Arena and Kaiju | Existing combat eligibility, battle ownership and settlement regression suites |
| Pet leaderboards and activity | Daily/weekly/seasonal/all-time projections, accepted XP and original-pet attribution; paid identity repair adds no XP |

The website and Mini App use the shared Pet leaderboard. Official Daily Run
score/records, Community XP, Contract Rank, specialist tracks, Marks and Crests
are separate measures. Public activity records game receipts, not navigation.
The wiki graph verifier passed with 327 nodes and 1,629 edges; full/mobile graph
data agree. Moonpet rewards do not feed the wiki relationship or Arcade graphs.

## Evidence and deployment

All 22 new regression cases fail against the audited base and pass with this
patch. The two focused suites pass 33 cases. Existing SQL budgets remain 180
statements for warm state and 600 for the recovery fixture: its 50-source backlog
peaked at 569 statements and drained completely. D1 query-limit checks remain
in the full suite. Full `npm test` passed across all five domains, including the
390×844 and 360×640 player loops and public leaderboard browser checks. GitHub
CI results for the published commit are recorded in the PR.

No production player records were modified. This patch does not reverse old
payouts or guess corrections for already-finalized historical Daily records;
those would require retained source evidence and a separately reviewed repair.
Missing Standard identity receipts are repaired automatically only when their
existing source evidence passes the queue's authority checks.

After merge, pull clean main, run `npm ci`, then
`node scripts/deploy-worker-with-provenance.mjs moonboys-api` and verify
`/deployment-info` against the merged commit. This is a Worker-only runtime
change: no new migration, frontend asset release or VPS restart is required.
