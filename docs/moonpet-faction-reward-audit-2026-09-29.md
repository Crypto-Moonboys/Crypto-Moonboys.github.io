# Moonpet reward-boundary audit — 29 September 2026

## Verified baseline

Main and production both report `ad4ad5a2bc008ef97fb412615b693dc4d1394591`
(PR #1379), deployed at `2026-09-29T14:51:13.054Z`. `/health` returns `ok: true`.
This pass follows the [care/equipment audit](moonpet-care-equipment-audit-2026-09-29.md)
and checks reward calculation failures in addition to the existing gameplay matrix.

## New defect: faction lookup outages could settle reduced rewards

Three action entry points swallowed a rejected faction lookup and substituted
`null`: jobs, Mini App district missions and Mini App story choices. The reward
code treated that as a player without a faction. It could settle a lower reward,
consume the action's cooldown or district energy, advance story/district progress,
and save an idempotent receipt that later retries could not correct.

All three reproductions failed against main: an injected faction read failure
still returned an accepted action. The fix removes only those three fallbacks.
A failed lookup now reaches the existing action-error response before reward
reservation, cost settlement or story progression. A successful query with no
faction row still awards the normal unaligned reward. Arena rewards, live-system
state and specialist reward recovery already use strict faction reads; their
behavior is unchanged.

Regression coverage includes:

- Jobs with Blockstars, districts with Rugpull Miners and stories with Graffpunks.
- No energy/wallet/accepted-event/reward-claim/story advancement on failed reads.
- Retry at the correct five-percent bonus, compared with an otherwise identical
  unaligned fixture; faction evidence retained in the authoritative receipt.
- Duplicate replay does not spend, pay or advance again.
- Mini App and website daily, weekly, seasonal and all-time XP projections agree
  with the accepted award, and public activity contains its Pet XP.
- Successful missing-faction lookups remain playable for all three actions.

No route, price, reward formula, progression gate, query count or schema changes.
No historical rewards are reconstructed by this patch.

## Game functions, endings and rewards

The complete test command covers the existing systems below; exact pass results
are recorded in the PR. The audit does not equate visible controls with tested
private production accounts.

| System | Executable coverage |
| --- | --- |
| Care / hatch / roster / evolution | Active-pet authority, cooldowns, energy, stat-only care, overlapping awards and the preceding equipment-race fix |
| Shop / Equipment | All 17 purchases and 153 upgrade transitions, free owned switching, duplicate/concurrent requests, truthful effects and maxed-collection daily credit |
| Market / crafting / inventory | Twelve offers, five recipes, six consumables, costs/capacity and reward attribution |
| Daily missions | Seven checklist goals and one completion payout; Journey evidence/Growth Mark, Cache and bounties; rollover and interrupted claims |
| Official Daily Run | Ten rooms, checkpoint tactics, Alley King ending and recoverable boss payout |
| Weekly missions | Journey objectives and distinct check-in days, Crest recovery; Weekly Boss defeat and original-pet reward recovery |
| Standard / Contracts | Choices, failures, extraction, boss completion, repeat play and bounded official rewards |
| District / story / raid / expeditions | Saved decisions, checkpoints/endings, energy/cost checks and interrupted payout recovery; new faction-outage coverage |
| Season | Tier claims, final evolution plus 60 distinct-day Marks and 10 distinct-week Crests; Signal Sovereign finale, saved turns, failure/retry and first-victory payout |
| Arena / Kaiju | Source attribution, costs, saved results and settlement regressions; no live human-opponent match performed |
| Rankings / activity | Accepted reward receipts, four Pet XP periods, recent activity, Community XP and replay/rollback assertions |

Practice remains local and gives no official progress. Style Lab collects unlocks
without appearance/stat effects; passive relic powers remain inactive. Breeding,
Traits, Sanctuary, Lineage, Fusion and Prestige remain unavailable in the Mini
App. These are existing explicit limitations, not newly activated functionality.

## Live public consistency and historical limit

All four public Pet boards responded with HTTP 200:

| Public username | Daily | Weekly | Seasonal | All-time |
| --- | ---: | ---: | ---: | ---: |
| HenrikPiga | No row | No row | 6,935 | 6,935 |
| Graffpunks | 100 | 748 | 4,127 | 4,127 |
| noballgames | 1,200 | 2,400 | 1,901 | 1,901 |

The historical weekly/all-time mismatch for noballgames remains unresolved.
Migration 078 preserved accepted daily/weekly history while rebasing season
counters. Its successful count checks did not establish that every old receipt
agrees with retained Pet XP. Public projections cannot identify whether old
receipts or retained totals need repair. Private ledger evidence is required;
no production player records were read privately, changed or wiped in this pass.

Live graph/Pets verification passed: 327 Wiki nodes, 1,629 edges; full/mobile
graphs share `verified_at=2026-09-29T09:58:40.424Z`. Wiki graphs describe entities
and links, not Pet XP. Pet, Community, Arcade and Contract scores retain their
separate meanings; public activity is a recent receipt feed, not every click.

## Release

After merge, deploy `moonboys-api` using the provenance wrapper. No new D1
migration, frontend deployment or VPS restart is required by the runtime fix.
Normal Pages automation may publish the documentation. Check jobs, district
choices and story choices after deployment, plus the four public Pet boards.
Full local tests, syntax/diff checks and GitHub checks are recorded in the PR.
This audit did not merge or deploy code or mutate production data.
