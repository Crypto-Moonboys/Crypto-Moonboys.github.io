# Moonpet ending and leaderboard audit — 28 September 2026

Base: merged #1356, `2781a17981a2806774856a290274358e99cbc4c6`.
The production Worker reported that exact commit, deployed at
`2026-09-28T08:07:56.960Z`. The preceding weekly distinct-day correction is live.
This follow-up checks current source, real SQLite failures and isolated browser
players. It does not claim that every production account has been inspected.

## New failures reproduced

1. A district reward can commit before its mastery/completion transaction fails.
   Its pending row was only found under today's date. After midnight, a new
   action started a new district attempt while the old paid mastery stayed lost.
2. A story step has the same separation between payout and progress. An
   interrupted paid step disappears from the retry path after the daily reset,
   leaving the chain behind its earned rewards. Later days can continue from
   the stale step.
3. A raid can charge energy and persist the chosen attack before its damage
   transaction fails. After the date or boss rotation changes, no state recovery
   finishes that attack. Saved-victory claims cannot help because the victory
   record does not exist yet.

The regressions inject the failure after durable payment or energy debit, then
advance the clock and switch pets. All three failed on merged main with the
original system event still `settling` and no repaired completion/damage.

## Changes

- District/story actions select their oldest unfinished reservation before
  today's new step. The current board retains its pending choice after midnight;
  district previews use the saved mission. New reservations freeze the complete
  decision before settlement, preventing a different result on a later retry.
- State refresh processes at most two abandoned live-system endings, after the
  existing two-minute settlement lease. It joins the complete owner/pet/season/
  slot authority and uses the original period. A charged raid returns to its
  original boss rotation even when another pet or season is active.
- Recovery reuses the same guarded completion transactions and reward keys.
  Paid receipts do not pay twice, charged energy is not charged again, and an
  uncharged energy reservation is not automatically started by a state read.
- An older paid story ending can close without overwriting a later completed
  story's step or cycle count. New actions finish older pending work first.
- A failed repair receives a retry delay, allowing other eligible records to
  use the small recovery budget. Fresh in-flight settlements retain their lease.

The normal empty recovery path adds one read. Existing warm-state and large
backlog SQL-budget regressions pass without raising their limits. No schema,
public route, reward amount, XP allowance or gameplay cooldown is changed.

## Current action, quest and reward coverage

| Area | Wiring and ending checked | Result |
| --- | --- | --- |
| Adoption, egg care, hatch, pet roster and identity | Lifecycle gates and the owned active slot | Existing tests retained |
| Care, Dance, Energy Drink, Cuddles, training, items, jobs and timed activities | Server validation, stat/cooldown costs, accepted receipts, claim and interrupted-claim paths | Existing action, progression and browser tests retained |
| Seven daily missions and bounties | Source-action counts and once-per-key bounty claims | Checklist remains distinct from bounty rewards; no separate all-seven payout |
| Daily Cache | One account claim per UTC day; capped XP and wallet rewards | Settlement, rollover and duplicate tests retained |
| Daily Journey | Three of five official objectives, one qualified daily Mark | Source-event and recovery tests retained |
| Weekly Journey | All five targets, including two distinct check-in days | Merged #1356 rule and UI/award/recovery parity retained |
| Standard Moon Run | Rooms, bosses, banked extraction/failure and 100-room completion | Saved-ending and reward replay tests retained |
| Official Daily Run | Ten rooms, Alley King, one official account/day attempt | Terminal rewards and bounded recovery fairness retained |
| Continuing Contracts | Saved choices, six/ten-room routes, final boss plus goal, completion records and capped bonus | Existing full route/replay tests retained; Contract Rank remains repeatable |
| Practice | Local saved simulation and ending | No official XP, rewards or quest credit |
| District missions | Risk choices, mastery checkpoint bosses, materials and XP | Reset-safe pending completion fixed here |
| Story chains | Authored choices, final outcome/cycle and step rewards | Reset-safe pending completion and no historical rewind fixed here |
| Weekly Boss | Attempt, victory and saved claim | Existing reward/source-pet tests retained |
| Seasonal raid | Saved attacks, phased boss, victory and reward claim | Charged attack recovery across date/rotation/season fixed here |
| Arena and Kaiju | Eligibility, reserved battle pet, energy and reward receipts | Existing ownership, cap and retry tests retained |
| Shop, trade, market, crafting, upgrades, cosmetics and Relic Vault | Wallet/capacity checks, inventory or unlock records and replay | Existing economy and public-activity tests retained |
| Season XP tiers and per-pet completion | Tier claims; final evolution plus 60 distinct-day Marks and 10 distinct-week Crests | Existing completion and interrupted-award tests retained; no extra final-season boss |

## Website synchronization

The website, Mini App and bot use the same Pet leaderboard projection. Pet XP
is distinct from Community XP, Contract Rank, specialist XP, Marks and Crests.
Stat-only buttons, navigation and zero-XP purchases do not add ranking XP.
The public feed presents recent accepted receipts rather than every click.

The new tests exercise public API output with real settlement. A district or
story reward paid before the fault keeps its single original event/day and
all-time total after repair. A raid completed from a saved old-season attack
awards exactly 150 Pet XP once to that original pet and season, while its event
uses the delivery day's daily/weekly window. The current season and newly
selected pet do not receive that historical season's XP. All-time includes both
owned pets. This is consistent source attribution, not leaderboard drift.

The earlier graph audit still applies: Wiki relationships and Arcade scores are
separate graph inputs. This patch does not change either graph or create a new
score. No locked future system is advertised as newly playable.

## Validation and limits

`scripts/moonpet-live-ending-recovery.test.mjs` adds seven real SQLite tests:
paid district/story recovery after midnight and a switch; a final raid hit and
reward across boss/season rollover; direct new-day retry ordering; uncharged
reservation safety and frozen choices; one-record recovery bounds and persistent
failure isolation; and preventing an older story from rewinding later progress.
The suite is included in Worker/API CI. Existing live-system and 98-case
progression suites also pass. Full `npm test` and GitHub check results are
recorded in the PR.

Automatic repair requires retained ownership and a saved decision, or a saved
charged raid attack. It does not guess missing/corrupt historical data. New
district/story reservations keep the required decision from the start. A large
valid backlog drains across subsequent state refreshes. Authenticated live
Telegram acceptance remains a post-deploy check; production player data was
not mutated during the audit.

## Deployment

After merge, deploy the Worker from clean updated main using
`node scripts/deploy-worker-with-provenance.mjs moonboys-api`, compare
`/deployment-info` with the merged commit and reopen the Mini App. No new D1
migration, VPS restart or frontend cache-token update is needed. Existing
production migrations must already be present. Verify any retained pending
ending finishes on refresh and that its reward appears once on the correct
leaderboard period; do not inject failures into production to perform this check.
