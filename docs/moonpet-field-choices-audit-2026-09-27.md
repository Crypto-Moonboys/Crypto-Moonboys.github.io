# Moonpet player-loop audit and field encounters — 27 September 2026

Base: merged PR #1338, `48bb4f0a35ee082bef0b21499f3a197b9c075dcb`.
The public Worker reported this commit deployed at `2026-09-27T17:46:51.420Z`.
Only public deployment metadata was read. All gameplay checks use local SQLite
accounts and the real Worker handlers, not production player mutations.

## Findings and changes

The ordinary care cooldown fix from #1338 is on main and deployed. Feed, Play,
Clean, Sleep and Train are represented in each server snapshot. This audit
retains its accepted-event, sequential-action, reload and expiry regressions.

A separate dead end remained in standard Moon Runs: their room buttons stayed
enabled at zero original-pet energy even though the Worker returns `pet_tired`.
Play Now also recommended any saved run, including one with no available source
pet or a first room with no energy and nothing to extract. Both now use the same
readiness calculation. Zero-energy runs with cleared progress still offer
extraction; the recommendation explicitly says to extract. An unavailable source
pet blocks both actions, while other panels remain usable. A different selected
pet cannot supply energy for the original run pet. Official Daily Run choices
retain their separate rules and do not inherit the standard-run energy gate.

New v9 Contracts add three authored field encounters at checkpoint drafts.
After selecting the upgrade or supply cache, the player can make one trade,
leave, or continue a room without taking the offer. Standard has two encounters;
Long has four. Server seed and checkpoint determine the encounter, so reloads
do not redraw it. The latest decision receipt is saved and shown while active.

| Encounter | Decision A | Decision B |
| --- | --- | --- |
| Roadside Quartermaster | 18 salvage buys 2 supplies | 2 supplies sell for 16 salvage |
| Courier Aid Station | 1 supply heals up to 18 route HP | Lose 10 route HP for 14 salvage |
| Abandoned Salvage Rig | 1 supply gains 18 salvage | 14 salvage heals up to 22 route HP |

Leave costs nothing. Healing previews show the actual capped gain. Trades need
their resources; full-health healing and detours leaving under 1 HP are blocked.
These are contract resources, not pet health, energy, items or currencies.
Spending can reduce the main goal, side goal or final rank. Decisions advance no
room and consume neither a path room nor the optional preparation. The next
room closes any skipped offer. The owner/pet/season/revision guarded update
saves one decision; duplicate, stale and parallel requests cannot repeat it.

All v1–v8 saves retain their rules and gain no encounters. Skipping the new
offers reproduces v8 room, boss, goal and rank outcomes. Long-format record
queries include v9; the collection remains 108 setups. Daily bonus slots, XP
caps, goal targets, difficulty unlocks and boss requirements remain unchanged.

## Wiring and replay coverage

This audit combines current control/handler inspection with the existing Worker
regressions and real mobile fixtures. Literal server-action buttons are checked
against the dispatcher; dynamic choices are also exercised by subsystem tests.
The browser fixture covers all six screens and both egg and hatched states.

| Player system | Wiring and limits checked | Role between cooldowns |
| --- | --- | --- |
| Adoption, incubation, care, training | Lifecycle authority, action dispatch, care cooldown snapshots, activity busy gates and 18-energy training gate | Predictable growth actions; no random care failure added |
| Daily missions, Daily Journey, Weekly Journey | Objective evidence and qualifying navigation, accepted actions, daily/weekly scopes | Capped growth goals; keep repeat Contracts available afterward |
| Contracts | Six goals, three builds, two lengths, three tiers, drafts, supplies, redraws, paths, preparations, bosses, new field decisions, persisted records | Unlimited replay and rank, no pet energy cost; bounded daily XP |
| Practice | Local save/reload, builds, route risks, drafts, extraction and pet isolation; no gameplay POSTs | Available even before hatching; local goals without rewards |
| Standard Moon Run | Source pet, room authority, energy, extraction, saved progress and rewards | Repeatable with energy; bank progress at zero energy |
| Official Daily Run | Account/day attempt, original pet, conditions, room odds, two checkpoint tactics, extraction and terminal settlement | One official attempt; no fabricated extra attempt |
| Adventures, events, districts, stories | Choice dispatch/previews, energy and cooldown gates, bounded repeat rewards, mastery and saved recovery | Existing risk choices; preserve their individual limits |
| Jobs and timed activities | Job availability, four activity options, duration previews, interrupted claim recovery | Activities accumulate while Contracts remain playable |
| Bounties, expeditions, market, crafting | Qualifying routes, claims, destination choices, energy/attempt limits, recipe goals and inventory capacity | Goal tracking and resource planning, with server limits |
| Inventory, equipment, cosmetics, relics | Existing use/equip/upgrade controls, reward authority, inventory boundaries and inactive relic-passive disclosure | Build planning; no invented relic combat powers |
| Weekly Boss and Seasonal Raid | Attack choices, previews, level/energy/day gates and saved reward recovery | Limited boss actions alongside repeatable Contract finales |
| Arena and Kaiju | Capability gates, server action handlers, combat/queue and ownership regression suites | Opponent-dependent modes; no live human match was conducted |
| Seasons, slots, traits and leaderboards | Current-pet/season authority, reward recovery and account-scoped limits in existing suites | Longer progression; slot switching cannot create extra bonuses |

## Verification

Focused tests cover the run readiness defect and distinguish standard energy
gates from official Daily Run rules. Mobile fixtures prove the standard server
rejects a tired room, the app disables its button, a bankable run still extracts,
and a missing source pet does not disable Contracts or Practice.

Contract tests run 4,320 mixed-outcome simulations, including all seven field
actions (six trades plus leave), and confirm all 108 setups are completable.
They verify exact preview/outcome deltas, healing caps, nonlethal costs, disabled
choices, skipped offers, forged effects, foreign owners, duplicate and parallel
moves, saved receipts, v8 equivalence when skipping, old-save gates, rank and
bounded reward recovery. Practice adds 900 simulations. Mobile tests select all
four field encounters in a ten-room run, reload offers and receipts, verify
button costs/disabled states and finish with the unchanged single bonus.

Final local and CI results are recorded in the PR. These checks establish
mechanics and wiring; they do not measure retention or prove every historical
account, physical device, Telegram client, network failure or live opponent.

## Remaining opportunities and rollout

The strongest next addition is a rank-only rotating Contract challenge using
the existing goal/build/tier/format records. It could suggest a different setup
without changing Growth Marks, weekly requirements or currency supply. That is
a proposal; this PR implements field encounters and run readiness only.

GK approval is required for merge and production deployment. After merge,
deploy `moonboys-api` from clean current main with the provenance script. Pages
uses `20260927-field-choices-v1`. No new migration or VPS restart is required;
existing migration 076 remains a prerequisite. Check the deployed commit, open
a new Contract, choose a checkpoint encounter and reload. Check the same cost
is not applied twice. Existing saved Contracts retain their earlier rules.
