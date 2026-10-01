# Moonpet Source of Truth

## Purpose

This document is the canonical reference for Crypto Moonboy Pets system classification, ownership boundaries, and roadmap status.

Its purpose is to prevent documentation drift between:

- Public wiki pages
- How-to guides
- Telegram Mini App copy
- Tests
- Future development PRs

Any gameplay, documentation, or UI change affecting Moonpet status should reference this document.

## Current rules and historical audits

This reference and the seasonal model describe current rules. Dated audits are
evidence for their reviewed commit and must not override later shipped behavior.
In particular, old “no completion bonus/finale” and “Style/relics inactive”
findings were superseded by completion rewards and the style/relic release.
See [the September 29 reconciliation tracker](moonpet-reconciliation-2026-09-29.md)
for verified fixes and work still outstanding.

## Permanent pet ownership

Pets and purchased spaces persist across calendar seasons. State preparation never
creates a replacement for an owner with saved ownership. Profile lists active pets
across all creation seasons, and switching uses the saved pet/owner/source tuple.
New purchases are limited to three active pets across all seasons. If safe recovery
finds more than three saved pets, every record stays visible and new purchases are
blocked for review. Recovery does not erase the rollout egg or choose which pet to lose.

Creation season keys, pet IDs, XP, lifecycle, identity, source events and wallet
receipts remain unchanged. Weekly evidence keeps historical weeks 1–13 and then
continues at week 14 after the creation quarter, with no end date. Migration 085
retains historical nullable qualification keys and every existing receipt while
lifting the database week limit; migration 086 restores proven Sanctuary archives.
Competition calendars, existing prices and evolution thresholds remain unchanged.
First-pet entry requires 1,000 lifetime Arcade XP from the server-owned
`arcade_progression_state.arcade_xp_total`. Entry does not spend XP. Community XP,
Telegram profile levels, spendable-wallet balances and client payloads cannot
satisfy this gate. Existing pet profiles retain access, including safe starter
recovery. The proposed year-long evolution pacing remains separate work.

State projects `lifetime_progression` separately from `competition_season`.
Pet age and displayed lifetime week start at the saved ownership creation date;
Growth Marks, Weekly Crests, Pet XP and completion stay with the pet. Historical
source season keys and qualification-week numbering remain receipt provenance,
not the current competition period. Core loads defer completion detail; Missions
and Profile hydrate it without resetting progression. Competition XP for new
awards uses the earning day's calendar quarter, including delayed reserved
rewards. Existing competition rows are not rewritten.
Standard Run endings use their saved terminal timestamp for competition XP
even when payout recovery happens in a later quarter; daily/weekly settlement
windows keep their existing behavior. Concurrent first-adoption requests run
onboarding only for the profile insert winner.

## XP and score ownership

| Value | Owner and meaning |
| --- | --- |
| Pet XP | Original earning pet; controls its level and unlocks. |
| Specialist XP | Original pet's Care, Training, Adventure, Arena, Job and Bond tracks. |
| Account Season XP | Aggregate awarded Pet XP for the player and earning competition quarter; drives shared tier claims and seasonal ranks. Not spendable. |
| Daily / weekly pet ranks | Accepted Pet XP receipts in the settlement UTC day / week. |
| All-time pet ranks | Sum of retained owned pets' XP, including earlier seasons; legacy profile fallback only before per-pet authority exists. |
| Community XP | Separate account score; only the Community XP portion of accepted pet rewards feeds this board and its chart. Community and pet seasons are independent. |

Moon Gold, Moon Crystals, Style Tokens, materials, consumables, gear/cosmetic
ownership and spendable Arcade XP belong to the account. Equipped gear and cosmetic
selection belong to the pet. Switching pets never redirects a saved reward.
The lifecycle name **Egg**, Stage-0 display name **Secret Bot**, and art identity
**EGGYONE** refer to different aspects of the same starting pet.

The Community leaderboard and chart use one `/telegram/leaderboard` response and
explicit `score_basis`. The shared Community season authority selects an active
date-containing row by start date descending, then id descending; future and
expired rows are ignored. An existing active Community season with no scores stays
empty; all-time is used only when no active Community season exists. Thrown,
unsuccessful or malformed database reads produce an unavailable/retry response,
never zero ranks.
This chart compares player totals; it is not a historical/source breakdown or the
wiki relationship graph. Pet XP is not added to Community XP or Arcade scores.

---

# Current Live Build

### Saved state and public ranking read integrity

Required game-state and public ranking/activity list reads reject both thrown
D1 errors and resolved failed/malformed results. An outage must not publish an
empty inventory, reset mission/boss progress or hide a saved claim. Existing
Mini App/website retry behavior and explicit Relic Vault/Weekly Journey
unavailable states remain. Successful empty lists are valid. Material reads for
crafting, upgrades and Style Lab must succeed before spending.
See [the read-integrity audit](moonpet-read-integrity-audit-2026-09-29.md).

The operator's migration 078 check confirmed three seasonal corrections and no
pending correction. Public seasonal/all-time pairs now agree, but the audit
still observes a historical weekly receipt total above retained all-time XP.
The beta rebaseline preserved daily/weekly receipts; migration 080 then records
unverifiable pre-launch receipts in an audit-preserving quarantine. Quarantined
rows are excluded from daily/weekly ranks and public Pet activity without being
deleted or used to rewrite retained Pet XP. See
[the beta XP quarantine decision](moonpet-beta-xp-quarantine-2026-09-30.md).

The following systems are considered live gameplay systems.

### Weekly Boss reward-list availability

A failed Weekly Boss pending-reward read reaches the existing state refresh retry
path. It cannot publish an empty claim list that hides a saved payout. Successful
empty reads remain valid. Reward settlement and source-pet ownership are unchanged.
See [the Shop and completion audit](moonpet-shop-sanity-audit-2026-09-29.md).

### Economy actions preserve care decay

Trade, Shop purchases and Daily Cache must not advance `last_decay_at` without
applying elapsed care decay. Their reward/equipment writes leave the care clock
alone; existing decay reads/writes apply it. This avoids restoring stale energy,
hunger, happiness and cleanliness after inactivity. Rewards and leaderboard
accounting are unchanged. See [the post-deployment audit](moonpet-post-deploy-audit-2026-09-29.md).

### Callsign and Trade write integrity

Callsign changes update only the owned selected pet's name, with its compatibility
mirror in the same transaction. Trade reservations compare authoritative instance
XP as well as the profile mirror; conflicts consume no wallet balance or attempt.
Trade settlement applies receipt XP to current instance state. These protections
prevent overlapping rewards from being erased by old snapshots. Historical live
leaderboard discrepancies need separate source-ledger reconciliation; this change
does not invent or replay old rewards. See [the 29 September sanity audit](moonpet-sanity-audit-2026-09-29.md).

### Daily checklist bonus and season finale

Migration `077_moonpet_completion_rewards.sql` and the matching Worker deploy
activate two additions in MISSIONS. The seven existing daily checklist goals
now have one account/UTC-day completion bonus: up to 25 Pet XP, 50 Gold and
1 Style. This is separate from Daily Journey and awards no Mark, Crest,
Community XP or official-run credit. Accepted action and upgrade receipts latch
checklist bits; an account wallet crossing or holding 50 Gold latches the bank
goal. Spending cannot erase earned progress. Complete unclaimed days remain
claimable after midnight. The first claim freezes its selected hatched source
pet/season; duplicate or interrupted delivery uses that same reward key.
An accepted official Daily Moon Run satisfies the Adventure checklist goal.
Migration `083_moonpet_daily_run_completion_credit.sql` adds that run type to
the durable insert/accept triggers so the credit survives a failed refresh and
UTC rollover.

Signal Sovereign is an additional season finale. Eligibility is final evolution
plus 60 distinct-day Marks and 10 distinct-week Crests, or an existing season
completion marker. It never removes completion, retires the pet or
makes boss victory a new mandatory requirement. Retained qualified/complete
pets, including earlier seasons, can play. Striker, Guardian and Tactician have
separate battle HP, charge and repair kits. Boss intents and exact move effects
are previewed; choices save online with a monotonic revision, including retries.
There is no pet energy/stat cost. Defeat allows a free retry with another build.
First victory records the pet's Finale Victor achievement and pays up to 100
Pet XP, 200 Gold and 5 Style once per pet/season. A failed payout leaves the
victory saved with an explicit claim button, even after changing the active pet.

Both rewards use the existing atomic ledger, fixed server reward values and
1200 daily Pet XP cap. Daily/weekly leaderboards count settlement-time Pet XP;
seasonal XP follows the award-day competition quarter and all-time includes retained pets. Reserved awards keep their saved earning day.
Public activity names the two rewards. These payouts add no Journey objectives
or specialist/material bonuses.

Missing feature tables during rollout show the additions as unavailable while
retaining the existing checklist. Other database errors follow the retry path.
Apply migration 077 before deploying the Worker; GitHub Pages serves the new UI.
See [implementation and deployment notes](moonpet-completion-features-2026-09-28.md).

### Account state and concurrent Standard Run actions

Roster adoption, the active-pet pointer, Arcade balances and Daily Journey
objective/receipt reads are required display evidence. A failed read reaches
the Mini App refresh retry path, preserving the previous valid display; it does
not show the starter as selected, zero Arcade XP, missing slots or an unearned
Growth Mark. The existing Weekly Journey syncing state also covers a failed
latest-receipt read. Successfully empty results remain valid empty state.

Pending run/Arena/Kaiju reads must succeed before switching the active pet or
repairing an invalid active pointer. Calendar changes never switch a valid pointer. Standard Run resolution also
requires readable source-pet, inventory, account-wallet and daily XP-cap evidence.
Its transaction verifies every pet-owned field and the equipped progression rows
(including missing rows) captured before resolving the choice. Concurrent care,
rewards, equipment upgrades or mastery changes reject the stale step
before costs, consumed items, run advancement or failure XP are committed.
The player can refresh and choose again. Reward amounts, source-pet/season
ownership, caps and public leaderboard formulas remain unchanged.

See [the account-state sanity audit](moonpet-account-state-sanity-2026-09-28.md).
Worker deploy only; no new migration, frontend deployment or assets are needed.

### State refresh and relic visibility

Relic Vault projects the account's stored relics using their `unlocked_at`
timestamp. A failed vault read is labelled temporarily unavailable, not empty;
it never clears ownership. All ten relics have active, snapshotted adaptations in
new Contract runs. Standard and official Daily Runs retain their
separate rules, and earlier saved runs retain their original rules.

State refreshes batch notice/achievement writes and do not rewrite unchanged
achievement progress or timestamps. Recovery uses per-queue source allowances
from `pets/recovery-limits.js`; larger backlogs drain across later refreshes.
Journey source evidence, daily Mark awards and weekly Crest awards rotate past
their last attempted batch. A persistently failing batch cannot hold later
eligible quests at the back of the queue. Each queue saves one scheduling cursor
in `telegram_pet_recovery_cursors` before processing a nonempty batch; an overlapping
refresh must still match the cursor it read. The cursor grants no quest credit.
Failures remain pending and are revisited on wraparound. Award/source limits,
qualification rules, original pet/season attribution and reward keys still apply.
Daily final-ending and early-ending queues rotate through pending sources using
separate account cursors in `telegram_pet_recovery_cursors`. A turn is saved before repair,
so failed sources yield to newer work and remain eligible after wraparound.
Overlapping refreshes compare the saved cursor before advancing it. Cursors are
scheduling data only; existing source and receipt checks still decide rewards.
Each repair retains its original pet, season, day and idempotent receipt. Daily
care recovery defers award finalization to the bounded Journey award pass, while
direct gameplay retains immediate finalization. Reward amounts, caps and gates
are unchanged. See `moonpet-vault-state-performance-2026-09-28.md` for measured
query counts and regression coverage.

## PET

Core Moonpet identity and lifecycle.

Includes:

- Pet creation
- Needs
- Care state
- Health
- Energy
- Personality
- Memories
- Evolution progression

---

## Care

Daily interaction loop.

Includes:

- Feeding
- Playing
- Cleaning
- Sleeping
- Training actions

Care actions contribute to progression systems where applicable.
The Care Console disables Sleep and Train while a background activity has active
status, matching the server's existing busy gate. Train also requires 18 energy.
Feed, Play and Clean remain available subject to their normal cooldowns. A
completed activity awaiting reward recovery does not block care. The console
links to the Work activity panel; Contracts can continue alongside the timer.
Daily care-set missions show accepted Feed/Play/Clean substeps, and Coach selects
the first missing one. These are account/day event summaries, not client progress.

---

## Daily Journey

Daily structured progression system.

Rules:

- Objectives must be completed through valid gameplay actions.
- Progress belongs to the correct Moonpet.
- Rewards require authoritative validation.

---

### Daily Cache and season reward receipts

Daily Cache grants 40 Moon Gold, two Style Tokens and up to 40 Pet XP once per
account per UTC day. It retains its existing account/day 1,200 Pet XP window.
The XP amount is recalculated against accepted events inside settlement, then
added to the captured pet's current XP. Concurrent XP cannot be overwritten or
push the cache through the cap. Currency, instance changes and the accepted
receipt commit together. The compatibility profile is mirrored only while that
same pet is selected, and retries do not give Bond progression to another pet.

The Care Console shows the current XP allowance, claimed receipt and UTC reset.
Play Now links to an available cache; after collection, Contracts remains
available directly from Care. This is a single daily reward, not an endless
reward farm.

Season tiers are marked claimed only by an awarded unified reward receipt.
A rejected payout leaves the tier available; an old unpaid compatibility marker
cannot hide it. A paid receipt remains claimed even if writing the compatibility
marker was interrupted. Retries use the same owner/season/tier reward key.

Daily mission shortcuts show qualifying alternatives for the adventure, shopping
and bank targets. Weekly objective routes lead directly to care, training, runs,
Weekly Boss and Daily Cache. The weekly run label includes standard as well as
official runs; standard completion/extraction and official Daily Run finishes
use the existing accepted-event authority. Contracts remain excluded.
The links are navigation only and never spend resources or submit progress.

Play Now's next bounty chooses only currently available qualifying routes,
ranked by existing progress. It checks care/work cooldowns, active activities,
run-source energy and availability, Adventure readiness, cache status, usable
inventory and Kaiju capability gates. A blocked Moon Run may route to an
available Adventure. Official Daily Runs are not suggested for a bounty that
counts standard run events. When all targets are blocked, Contracts
and the bounty board remain accessible. Board links explain that a route is not
ready without hiding the target or granting progress. All checks are navigation
hints from the latest state; the server still validates gameplay and rewards.

## Weekly Journey

Weekly structured progression system.

Rules:

- Weekly progress is tracked independently.
- Rewards require validated completion.
- Duplicate settlement must not create duplicate rewards.

The five objectives require five care actions, three training actions, three
qualifying run finishes, one Weekly Boss attempt and check-ins on two distinct
UTC days in the same pet journey week. Mini App progress, live Crest
qualification and historical recovery use accepted source events for the same
owner, pet and season. Multiple check-in aliases on one day count as one day.
Recovery preserves the first day all five targets were met; extra later actions
cannot move it. Instance and season-slot ownership must agree before evidence
is accepted. Already awarded Crests are not removed by this validation change.

---

## Jobs

Timed and gated activities.

Includes:

- Job progression
- Requirements
- Timers
- Rewards
- Specialist progression

Timed activities expose server-derived reward and stat-cost previews at five
minutes, thirty minutes, two hours and their duration cap. Training caps at two
hours; sleep, work and explore cap at eight hours. Explore gives one crystal
from thirty minutes until two hours; the Adventure Map replaces that crystal
at two hours. Previews remain subject to reward caps and stat limits.

One background activity continues while other routes are played. The Work
screen links directly to Contracts. Ready claims and recoverable
interrupted claims appear in Play Now. Recovery uses the stored reward snapshot,
does not accumulate a new reward and cannot be cancelled or paid twice. Active
sessions expire twenty-four hours after their duration cap if left unclaimed.

Egg and unadopted players see clear action locks across Work, Economy and other
panels. Egg care, incubation, hatching, account controls and stale-combat cleanup
retain their existing rules.

---

## Runs

Roguelite exploration system.

Includes:

- Standard Moon Run
- Daily runs
- Encounters
- Risk choices
- Extraction
- Run rewards

### Continuing contracts

Continuing contracts are server-owned quests for hatched active pets.
New v9 contracts retain six goals, three starting builds and two route lengths:
Standard has six rooms and drafts after rooms two/four; Long has ten rooms and
drafts after rooms two/four/six/eight. Both use route risk/reward choices. Each completed contract records rank
points for its source pet and immediately offers another quest. Rank has no
daily cap and no effect on Pet XP, currencies, combat, Growth Marks or Weekly
Crests. Difficulty tiers 2 and 3 open after 5 and 15 completions respectively.

Goals introduced in v6 include Break the Blockade (successful bold routes), Trace the Lost
Signal (successful search routes), and Restock the Crew (remaining supplies).
The six Standard targets, in goal order, are 4 route wins / 65 salvage / 50 HP /
3 bold wins / 3 search wins / 5 supplies. Long targets are 7 / 120 / 50 / 5 / 5 /
8. All require surviving the full chosen route. Failure, abandonment and merely
reaching a target mid-route earn no rank or bonus. Later rooms retain increasing
threat and failure damage. Longer routes offer more salvage and upgrade choices,
not a larger XP bonus. The existing three account/day bonus slots and 1,200 XP
cap are unchanged. All 108 setups are available once their existing tier gate
is met; no new unlock currency or migration is introduced.

Goal, format, target, depth and progress are controlled by saved server state.
Moves cannot switch length or supply progress. Saved versions 1–5 keep six rooms,
original goal thresholds and original draft/preparation rules. In long routes,
late redraws are offered only when different unowned perks remain. Supply caches
remain available at every draft. The final room does not create a new draft.

Contracts from v8 onward have a final boss in the last room. Scout/Escort meet the
Shield Warden, Recon/Resupply the Signal Hound, and Salvage/Breach the Vault
Breaker. Each offers named cover/bold/search tactics with different route
modifiers. The boss is disclosed before starting and throughout the run. A
successful final tactic and the main objective are both required for completion;
a failed tactic ends the contract with zero rank/XP even if route health remains.
Supply rest is disabled in the boss room; optional preparation remains available.
The existing chance clamp and server roll apply, and path/perk/preparation
modifiers are included in previews. Boss outcome is saved once with the final
move. There is no separate boss payout or extra daily-bonus slot. Existing v1–v7
saves retain their last-room setback/rest rules and do not gain a boss.

New v9 contracts also offer one optional field encounter after each checkpoint
draft: rooms 2/4 in Standard and 2/4/6/8 in Long. The server seed fixes the
encounter; refreshing cannot redraw it. Each has two resource decisions and a
free leave option. Taking a room route instead skips the encounter. Choices do
not advance a room, consume path duration or replace the optional preparation.

| Encounter | First decision | Second decision |
| --- | --- | --- |
| Roadside Quartermaster | Spend 18 salvage for 2 supplies | Sell 2 supplies for 16 salvage |
| Courier Aid Station | Spend 1 supply to heal up to 18 route HP | Lose 10 route HP for 14 salvage |
| Abandoned Salvage Rig | Spend 1 supply for 18 salvage | Spend 14 salvage to heal up to 22 route HP |

Healing previews show the actual gain up to maximum route HP. Full-health heals,
unaffordable trades and a detour that would leave fewer than 1 HP are unavailable.
Only contract resources change. Spent salvage/supplies/HP may reduce the main or
side objective and final rank. There are no pet items, currencies, energy costs,
extra XP bonuses, Growth Marks or Weekly Crests. The same owner, active-pet,
season and revision guard saves one choice and its receipt; retries cannot trade
again. Old v1–v8 saves gain no encounters. Skipping all encounters preserves v8
room, boss, goal and rank rules. Existing 108 records include v9 Long results.

Contracts from v7 onward offer an optional path after each upgrade/supply choice.
Quiet Streets adds 8 percentage points to route odds, subtracts 5 salvage per
success and subtracts 4 failure damage. Salvage Hotspot subtracts 8 percentage
points, adds 10 salvage per success and adds 4 failure damage. Stay on Course
keeps normal rules. Each lasts two room advances; Rest counts as an advance but
keeps its own healing and zero-salvage rules. Preparations do not consume path
duration. Skipping the offer by taking a route keeps normal rules. Path choice
is saved once with the same revision guard, costs no resources, advances no room
and earns nothing immediately. Route previews and resolution use the same
modifiers, with final odds clamped to 30–98%. Paths do not add collection entries
or increase the daily XP budget. Existing v1–v6 saves gain no path offers.

New v4 contracts add Take Supply Cache to both draft checkpoints. It replaces
that checkpoint's upgrade with two contract supplies. Choosing it does not
advance a room, change pet energy or grant XP, inventory or currencies. Supplies
can fund recovery, Scout Ahead, or Well Supplied. The saved revision consumes
the draft once, so retries or parallel clicks cannot collect twice. Existing
v1/v2/v3 contracts retain their original draft choices; v4 keeps v3's room,
preparation, side-objective, rank and daily-bonus rules.

Contracts from v5 also offer one optional Redraw Upgrades at each checkpoint when different unowned perks remain.
It costs 15 contract salvage and replaces the displayed perks with different
unowned perks: three at the first checkpoint and two at the second after taking
an upgrade (three if the earlier choice was supplies). The replacement is saved
before returning and can be used only once per checkpoint. The player must still
choose an upgrade or supplies; redraw does not advance a room. Spent salvage
reduces salvage-goal progress and final rank. Redraw grants no XP, currency,
items or official mission credit. Existing v1–v4 contracts retain their rules.

Contracts from v2 onward give all eight room scenes real route modifiers. The displayed
odds, salvage and failure damage already include the room, build, difficulty
and upgrades. Clear chance stays between 30% and 98%. Saved v1 contracts keep
their original mechanics and rank calculation until they finish.

Contracts from v3 onward add one optional preparation per room. Scout Ahead spends two
contract supplies for +10 percentage points to that room's route odds, capped
at 98%. Field Patch spends 20 contract salvage to heal up to 25 route HP.
Neither advances the room or earns points/XP by itself. Field Patch requires
missing health; spent salvage no longer counts toward the goal or final rank.
Preparation is saved with the run and resets after advancing a room. Upgrade
drafts must be resolved first. Saved v1/v2 contracts do not gain preparations.

At the start, players may choose All Routes (one success with cover, bold and
search), Daredevil (three bold successes), or Well Supplied (finish with five
supplies). Completing both the main and optional objective adds 60 × tier
Contract Rank, included in the total. Missing only the optional objective does
not fail the contract. Failed or abandoned contracts earn zero rank. Side
objectives grant no extra XP, currency or official quest credit. Selection and
progress are stored with the run; clients cannot change them or supply wins.
The board shows each goal's completion count and best rank total for the active
pet and season, plus completions remaining until the next difficulty unlock.

The Route Collection groups completed contracts into 108 combinations of
six goals, three builds, three difficulty tiers and two route lengths.
Saved v1–v5 completions remain Standard records; Long records are separate. It reads existing saved
contracts; no separate currency, reward or claim is created. Repeat clears add
to that setup's count and can improve its best rank. Failed/abandoned runs do
not clear a combination. Records are scoped to the active pet and season.
An uncleared unlocked route can fill the setup controls without starting a run;
the player still chooses the quest's Start button. Tier gates remain authoritative.
After a run finishes or the page reloads, its route length, build, tier and optional side goal
are selected for the next contract. Players can change them freely.

There is no pet energy cost or gameplay cooldown. Contract health, supplies
and salvage are isolated run resources. Leaving the app preserves the run on
the server; abandoning or failing a contract gives no points or bonus.

Street Event and Adventure choices expose normal and setback probabilities,
base reward ranges and cost ranges from the same catalog used by resolution.
They do not expose a rolled outcome. Repeated Street Event scaling, reward caps,
and stat limits still govern the actual award. Adventure entry energy is a
separate requirement from the rolled cost. The Mini App shows the existing
30-minute Adventure cooldown and the shared job cooldown, disables those
controls during the wait, and includes their expiry in its refresh schedule.
Jobs and Adventures also enforce their account cooldown inside reward settlement,
so distinct simultaneous requests cannot both award. Adventure settlement
rechecks the captured pet's entry energy. Rejections preserve the real cooldown
or energy reason and never report an unawarded rolled outcome as a success.
Play Now links to available Adventures, Street Events and unlocked jobs whose
cooldown has elapsed, alongside Contracts and other existing routes.

The first three successful contracts per account per UTC day reserve a bonus
of up to 20 Pet XP each, subject to the existing 1,200 daily Pet XP cap. The
reservation budget is shared across pets. Delivery retries use the original
contract and pet and do not create another reward; an undelivered reserved
bonus may be recovered later. No gold, gems, materials, items, Community XP,
Daily Journey credit or leaderboard scores are granted. Rank continues after
the bonus budget is exhausted. Records are pet/season scoped.

Migration 076 is required before the updated Worker is deployed. Without the
table, the board is unavailable while the rest of the Mini App remains usable.

### Crafting goals and account spending

Players can select one crafting goal for each pet on the current device. The
goal survives reloads when browser storage is available; it remains local to
the session otherwise. It can be changed or cleared without spending anything.
The workshop shows owned/required/missing materials, the output stack, and a
Play Now link when a goal is selected. Crafting remains a separate explicit
server action. Goals grant no additional rewards or official quest credit.

Available routes come from the current state: districts offering a missing
material, expeditions whose possible finds include it, and affordable unbought
market offers for either ingredients or the finished item. District material
previews and settlement share the same selection function. Risk, attempt caps,
energy, daily reset, prices and actual payment checks still apply. A route link
only navigates. Contracts remain available while limited routes reset and do
not supply crafting materials.

Crafting and equipment upgrades recheck the current level inside the spend
transaction. Equipment and cosmetic purchases recheck wallet recovery there as
well. A rejected transaction spends nothing; the same request can retry after
the requirement is restored, and successful retries cannot spend again.
Catalog lookups reject inherited property names as invalid cosmetic keys.

Moon Market purchases require the entire paid bundle to fit: 999,999 per item
stack, 9,999 per material, and 999,999 per account currency after the exchange.
The board, Coach and crafting planner expose or respect this capacity check.
Settlement checks every bundle component atomically before stock reservation
and payment. A concurrent fill, level loss, hatch-state change or active-pet
switch cannot spend using an earlier snapshot. Rejection charges nothing and
keeps the offer unbought. Exact-fit purchases and already-paid retries remain
valid. These all-or-nothing rules apply to paid Market bundles; existing earned
loot caps and other reward sources retain their existing behavior.

Inventory descriptions distinguish consuming an item from leaving it in the
bag for a standard Moon Run bonus. Style Patch is a consumable, not clothing;
Adventure Map does not improve expedition outcomes or job luck. Care's Energy
Drink button and the consumable Energy Drink remain separate actions. Style Lab
uses account-owned unlocks and per-pet visual loadouts. Equip/remove is free;
frames, nameplates, Explore trails and idle victory poses render on the canvas.
Existing ownership works without repurchasing. Callsign editing remains free.
The styles do not change stats; reduced-motion mode keeps decorative trails still.


### Moon Gold trade availability

Moon Gold Trade remains a separate game-currency action with a shared five-minute
account cooldown. Buttons use the current server cooldown and affordability.
The transaction rechecks cooldown, stake affordability, active pet, unchanged
Pet XP and the daily XP cap before reserving a result. Concurrent requests cannot
bypass the cooldown; stale state is rejected for review instead of overwriting
newer progression. Duplicate accepted requests return the existing receipt.

### Expedition destination choices

Crystal Expeditions let a hatched active pet choose any unlocked destination:
Dust Tunnels at Level 1 for 12 energy, Crystal Caves at Level 10 for 18 energy,
and Guardian Rift at Level 25 for 24 energy. Earlier routes stay available.
Each displays its existing possible finds; all destinations share the original
three account-wide attempts per UTC day and up-to-12 Pet XP award per attempt.
The source pet's normal daily XP cap still applies. Changing pets or routes
does not grant more attempts. Older clients retain their highest-unlocked default.

The reward transaction verifies the captured pet's ownership, season, active
status, hatched lifecycle, XP-derived level and full energy cost. It also reserves
the next account/day attempt number. Concurrent distinct requests cannot reuse
an ordinal or exceed the three-attempt cap; rejected requests spend nothing.
XP, energy and streak changes stay with that pet if the active selection changes
in flight. Wallet currencies and materials remain account-owned.

Accepted request keys replay their original destination, cost and saved receipt,
including after the last attempt, a pet switch or UTC rollover. Historical
account-only receipts remain account-only. Replay grants no further rewards.
The Mini App shows today's receipts, the UTC reset, and available destinations
in Play Now. Contracts are linked from the board for continued
play after energy or attempts run out. A frontend awaiting the updated Worker
shows a syncing message instead of submitting destination choices it cannot honour.

### Play Now

Play Now links the current snapshot to available live routes. Navigation does
not submit an action; each destination still enforces its server requirements.
It prioritizes saved raid rewards and affordable or already-paid district
retries, then claimable bounties and finished activities, and shows a direct
route for the closest unfinished bounty. Every unfinished bounty has links to
its qualifying actions; Bring It Home includes both Moon Run and Adventure.
Four bounties rotate per account at 00:00 UTC. Their care targets explicitly
count Feed, Play, Clean, Sleep and Train, not the three stat-only care buttons.
The Energy Drink consumable remains an item-use action, distinct from the
Energy Drink care button. Claimed bounties show their claimed state.
Daily Journey exposes each of its five authoritative objectives and progress,
separately from the seven daily missions. The official Daily Moon Run exposes
account/day attempt status and its UTC reset; switching pets does not grant a
second attempt. The standard Moon Run and official Daily Moon Run retain their
separate reward and completion rules.

The player can leave and resume saved routes without a penalty for closing the app.

### Telegram presentation read authority

Legacy Telegram Moonpet screens must distinguish an authoritative missing row
from an unavailable database read. Status, Details, Coach, Missions, Progress,
Identity, Achievements, Season, Evolution, Streak, Gear, Bag, Economy,
Bounties, Expeditions, Market and Shop show retry copy when a required read
fails. They must not describe an existing pet as unadopted or turn unavailable
inventory, materials, boss victories, relics, achievements or equipment into
zero/empty progress.

The shared guidance and Economy projections follow the same rule, including
Mini App callers. Optional reaction text and media remain best effort because
they do not authorize progress, costs or rewards.

### District, story and seasonal raid decisions

District pet authority and mastery must be successfully read (and mastery
initialized if needed) before a mission is shown or reserved. A failed authority
query must not be treated as a successful missing-pet lookup. A database failure
is a retryable request failure, not zero mastery: it must not consume energy,
bypass a checkpoint, pay the wrong reward
or mark a mission complete without its mastery. The successful path uses the
same queries and reward limits as before.

Saved district/story decisions survive UTC resets. A new click finishes the
old pending decision before starting today's step; it keeps the original choice
and reward receipt. New district/story reservations freeze the decision before
settlement begins. An older story repair cannot rewind a later completed step.

State refresh recovers at most two abandoned district/story/raid settlements
whose existing two-minute lease has elapsed. Recovery uses the original owned
pet and season, including archived pets, and a raid's original boss rotation.
It never charges an unstarted energy action. Already paid XP stays on its
original receipt; a newly delivered reward enters the current daily/weekly
settlement window and competition quarter, unless a reservation froze its earning day. Source pet/season receipt provenance stays unchanged. Failed repairs back off so other
quests can proceed. Missing ownership or decision evidence is not invented.

District approaches all use their advertised risk, including the default
balanced approach used by older clients. An omitted approach does not grant
a guaranteed clear. Every attempt costs 10 energy; setbacks retain only the
documented partial rewards and mastery. The existing daily limit remains.

Story chains retain two authored choices per scene and one rewarded step per
chain/pet/UTC day. District and story decisions are saved before reward
settlement. Retries keep the original choice, reward and outcome, including
after a reward receipt is written but the response fails. Completed story
requests acknowledge the original completion even after the scene advances.

Seasonal raids offer Conserve Energy (12 energy, 65% of steady damage rounded
down), Steady Strike (18 energy, original damage), and a boss-specific counter
(18 energy, displayed success chance and damage). Steady damage is
`35 + 2 × visible level`. The four weaknesses select distinct counter profiles;
failed counters deal half steady damage rounded down. Counters resolve this
hit only and do not apply Arena status effects. One attack per pet/UTC day,
boss unlock levels, rotation HP and defeat rewards remain in force.

Raid randomness is server-generated and saved before energy debit. A retry
cannot change the move, damage or cost. Damage accumulates atomically even when
attempts from adjacent UTC days settle out of order. The phase display divides
the existing boss HP into 300-damage segments; it is not a separate combat mode.

Unsettled district, story and raid requests expose their saved choice once
the settlement lease expires. Paid attempts can resume at zero energy; unpaid
attempts still need their original cost. Saved raid rewards have a separate
claim control, including older rotations and archived source pets.
Claiming does not require a new attack, energy or the current boss level.
Claims verify the stored defeat and original ownership and retain the original
reward idempotency key. Switching to another pet cannot redirect that reward.

---

### Weekly Boss choices and recovery

The Weekly Boss unlocks at visible level 5 after hatching. Strike, Outsmart
and Endure each cost 12 energy and share one account attempt per UTC day.
The board shows the actual damage range for the selected pet, including its
level, evolution, health, energy and any weakness/personality bonuses.
Endure deals damage; it does not heal or apply a persistent defensive effect.
The boss rotates Monday at 00:00 UTC. Today's saved action/damage and the
next rotation are visible alongside the existing daily reset.

An attack captures its source pet and season. The transaction rechecks that
pet's eligibility and stats, debits its energy, saves damage and records any
defeating pet before reward delivery. Switching the active pet cannot move
that debit or victory to another pet.

Saved victory rewards have a separate recovery control, including older UTC
weeks and wins by another pet owned by the same player. Recovery requires the
original stored owner, pet, season and defeat. It does not require a fresh
attack, energy or a level-5 active pet; switching to an egg does not hide an
already earned reward. The receipt keeps its original idempotency key and
victory day/week. Old recovery cannot rewind care clocks, reset a newer streak
or fabricate this week's Journey evidence.

Play Now and Coach surface pending rewards. After an attack, the board links
to server-saved Contracts. Their existing rules remain:
contracts continue without energy or cooldowns, with bounded daily bonuses;

## Equipment

Equipment progression system.

Includes:

- Gear
- Loadouts
- Upgrades
- Materials
- Crafting
- Equipment progression

---

## Arena

Competitive Moonpet combat.

Requirements:

- Active hatched Moonpet
- Additional Arena requirements where applicable

Arena is a live combat system.

---

## Kaiju

Kaiju Sticker Battle system.

Requirements:

- Active hatched Moonpet

Kaiju is a live combat system.

---

## Progression

Current progression systems include:

- Pet XP
- Specialist progression
- Evolution
- Seasons
- Achievements
- Leaderboards

---

# Future Roadmap Systems

The following systems are not considered live gameplay.

## Advanced Traits

Future expansion of trait depth, unlocks, and gameplay effects.

Current Personality and Aptitude systems remain separate.

---

## Breeding

Future system.

Planned requirements:

- Completed Moonpets
- Trait foundation
- Breeding rules

---

## Lineage

Future ancestry system.

Planned features:

- Parent records
- Generations
- Inherited identity

---

## Fusion

Future combination system.

Depends on:

- Traits
- Lineage
- Balancing rules

---

## Sanctuary

Historical Sanctuary snapshots remain immutable and readable. Automatic retirement
and settlement reconciliation are removed. Completed pets stay active. Migration
086 restores only matching automatically archived ownership records; retired or
unproven records are never reactivated. Expanded Sanctuary gameplay remains future work.

---

## Prestige

Future endgame progression system.

Prestige is not currently a live progression loop.

---

# Authority Rules

## Pet-owned data

Examples:

- Pet XP
- Evolution
- Personality
- Memories
- Lifecycle progression

## Account-owned data

Examples:

- Account currencies
- Community progression
- Shared player records

## Combat systems

Combat systems must use authoritative validation and protected settlement.

---

# Documentation Rules

Public pages must:

- Clearly separate live systems from roadmap systems.
- Never describe future systems as playable.
- Never introduce requirements that runtime does not enforce.
- Match current Mini App behaviour.

---

# Change Process

Any future Moonpet system change should update:

1. Runtime implementation.
2. Source of truth document.
3. Public documentation.
4. Regression tests.
5. Player-facing Mini App guidance.

This document is the reference point for future Moonpet development.

# Official Daily Run choices and tactics

New Daily Runs pin rules v2 before their first room. Every multi-choice Moon
Alley room offers safe, balanced and bold risk/score approaches. The preview
and server resolution share the same probability and score calculation.
After rooms 3 and 6, players may choose Guardian, Striker or Scavenger for
the rest of that run, or continue without a tactic. Choices are immutable,
server-saved and scoped to the original run pet. They affect run score and
clear odds only; reward authority, daily limits and economic caps are unchanged.

Existing runs retain their earlier rules and condition. New runs select only
implemented conditions. All ten relics now have active, documented adaptations
in new Contract runs: health, odds, hidden routes, damage reduction,
rest, a once-per-run escape and rare salvage. Their canonical IDs are read from
owned relics and snapshotted at start; database reads must succeed. Stored
effects JSON cannot inject a bonus. Old saved runs retain their rules.
Standard Moon Run and official Daily Run retain their existing separate rules. See
`docs/moonpet-roguelite-wiring-audit-2026-09-27.md` for the wiring matrix,
concurrency fixes, validation and deployment requirements.

## Recovery fairness and state-read failures

State recovery reserves bounded work for each queue. Standard endings,
specialist awards and Weekly Boss finishes rotate past failed batches using
private account cursors, like the existing Daily Run and Journey queues. Cursor
positions schedule retries and never authorize payment. Failed sources remain
pending; targeted repairs do not advance unrelated background scheduling.

Required inventory, mission, progression, cooldown and reward reads must not
turn a database failure into a normal empty/zero state. They use the existing
error/retry path; deliberate feature-unavailable projections remain explicit.
If an action commits but its following state read fails, show the saved action
result and use Refresh to read the save without resubmitting the action. See
`docs/moonpet-cross-system-sanity-2026-09-28.md` for the regression evidence,
gameplay/leaderboard matrix and deployment notes.
# Run engines and interrupted endings

Official Daily Runs are classified from their saved reservation, including
actions which omit a run ID. Required authority/evidence read failures must
propagate; they are not proof that a run is Standard or a boss was not beaten.
Legacy Standard controls cannot mutate Daily/canonical room runs and direct
the player to the Mini App. Refresh may restore a missing next Daily room from
its saved seed; existing room outcomes are never regenerated.

A paid Standard ending can still need personality/memory recovery. Accepted
source receipts, original pet/season/day, fixed identity keys and the existing
bounded recovery cursor govern that repair; it does not pay the primary reward
again. See [the follow-up audit](moonpet-run-authority-sanity-2026-09-28.md).

## Interrupted Daily startup and lifecycle projections

A canonical Daily start can predate its reservation. Classification may finish
that initialization only from intact, unplayed source evidence: original
owner/pet/season, run-start receipt, Daily ID/day/seed and route. Existing creation
receipts preserve legacy conditions; existing rooms/outcomes and rules are not
rerolled. Read the Daily summary after recovery so its attempt flag agrees with
the board. Recovery does not pay run rewards or create another attempt.

Lifecycle, account-wallet and required identity/guidance reads must propagate
database failures instead of hiding saved evolution, memories, personalities,
boss victories or rare-morph progress. Pet-age failures use the existing explicit
PROGRESSION UNAVAILABLE card. Optional reaction text may retain its fallback.
Gameplay must not treat a failed lifecycle lookup as permission to bypass hatch;
combat keeps its explicit closed lifecycle-unavailable response.
See [the startup/lifecycle audit](moonpet-start-lifecycle-sanity-2026-09-28.md).


### Owned equipment and beta XP correction (29 September 2026)

Permanent gear is bought once per account. Shop and Equipment offer free
switching on an eligible active pet, preserving gear level and mastery. The
`equip` receipt awards no Pet XP, Community XP or daily shopping credit. Legacy
Buy controls switch owned items for free too. The daily shopping goal accepts a
new permanent gear purchase or paid upgrade; Market and crafting are separate.
All 17 permanent items at level 10 automatically satisfy that one daily goal.

Migration 078 is a user-authorized beta rebaseline, not a reconstruction of
historical missing XP. It only reduces season counters that exceed all retained
owned Pet XP, setting them to retained owned Pet XP for that season. It records
before/after values and receipt totals, preserves pet levels, wallets, items and
claimed rewards, and does not alter daily/weekly receipt totals. Apply it before
the Worker deployment, then run the count-only rebaseline check. No full player
wipe is required. Deeper legacy ledger differences remain diagnostic evidence.

### Care equipment authority (29 September 2026)

Care reserves its accepted receipt only while the relevant equipped progression
rows still match the reward calculation: food for Feed, toy for Play, and outfit
for the five ordinary care actions. Concurrent paid upgrades, mastery changes,
row creation or deletion require a fresh action. Rejection consumes no care
reward or cooldown; unrelated slots and other accounts do not block it. This
uses the same progression guard as Standard Run choices and adds no D1 queries.
Rejected-action feedback takes priority over queued progress notices; those
notices remain unacknowledged until a successful action or refresh.

Shop descriptions describe the effects applied by the Worker. Crystal Bowl adds
energy, not health; outfit XP/currency bonuses apply to Feed, Play, Clean, Sleep
and Train. Dance, Energy Drink and Cuddles retain their stat-only policies. The
legacy Telegram gear summary shows the live Shop description and actual
level/mastery multiplier rather than presenting utility-registry targets as
implemented bonuses. Its command still launches Equipment when the Mini App
flag is enabled. See [the follow-up audit](moonpet-care-equipment-audit-2026-09-29.md).

### Faction evidence before reward settlement (29 September 2026)

Jobs, district missions and story choices must distinguish a successful missing
faction row from a failed faction query. Database errors propagate before the
action reserves rewards, charges energy or advances progress; retry calculates
the correct faction bonus. Missing rows retain normal unaligned rewards. Saved
receipts and decisions keep their existing replay semantics. See the
[faction reward-boundary audit](moonpet-faction-reward-audit-2026-09-29.md).
