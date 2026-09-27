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

---

# Current Live Build

The following systems are considered live gameplay systems.

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

---

## Daily Journey

Daily structured progression system.

Rules:

- Objectives must be completed through valid gameplay actions.
- Progress belongs to the correct Moonpet.
- Rewards require authoritative validation.

---

## Weekly Journey

Weekly structured progression system.

Rules:

- Weekly progress is tracked independently.
- Rewards require validated completion.
- Duplicate settlement must not create duplicate rewards.

---

## Jobs

Timed and gated activities.

Includes:

- Job progression
- Requirements
- Timers
- Rewards
- Specialist progression

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

Continuing contracts are server-owned six-room quests for hatched active pets.
They have three goals, three starting builds, route risk/reward choices and
upgrade drafts after rooms two and four. Each completed contract records rank
points for its source pet and immediately offers another quest. Rank has no
daily cap and no effect on Pet XP, currencies, combat, Growth Marks or Weekly
Crests. Difficulty tiers 2 and 3 open after 5 and 15 completions respectively.

New v2 contracts give all eight room scenes real route modifiers. The displayed
odds, salvage and failure damage already include the room, build, difficulty
and upgrades. Clear chance stays between 30% and 98%. Saved v1 contracts keep
their original mechanics and rank calculation until they finish.

At the start, players may choose All Routes (one success with cover, bold and
search), Daredevil (three bold successes), or Well Supplied (finish with five
supplies). Completing both the main and optional objective adds 60 × tier
Contract Rank, included in the total. Missing only the optional objective does
not fail the contract. Failed or abandoned contracts earn zero rank. Side
objectives grant no extra XP, currency or official quest credit. Selection and
progress are stored with the run; clients cannot change them or supply wins.
The board shows each goal's completion count and best rank total for the active
pet and season, plus completions remaining until the next difficulty unlock.

There is no pet energy cost or gameplay cooldown. Contract health, supplies
and salvage are isolated run resources. Leaving the app preserves the run on
the server; abandoning or failing a contract gives no points or bonus.

The first three successful contracts per account per UTC day reserve a bonus
of up to 20 Pet XP each, subject to the existing 1,200 daily Pet XP cap. The
reservation budget is shared across pets. Delivery retries use the original
contract and pet and do not create another reward; an undelivered reserved
bonus may be recovered later. No gold, gems, materials, items, Community XP,
Daily Journey credit or leaderboard scores are granted. Rank continues after
the bonus budget is exhausted. Records are pet/season scoped.

Migration 076 is required before the updated Worker is deployed. Without the
table, the board is unavailable while the rest of the Mini App remains usable.

### Play Now and practice

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

Practice Roguelite is an explicitly local, reward-free simulation available
after adoption, including the egg stage. It has three builds, three goals,
12 rooms, risk previews, health/supply management, three upgrade drafts and
extraction. Players may replay without care cooldowns or pet energy costs.
Practice does not award Pet XP, Community XP, currencies, items, Growth Marks,
Weekly Crests, achievements, quest credit or leaderboard scores. Runs and a
personal best are saved in this browser, isolated by pet ID, with at most three
saved pet entries. They are not authoritative or synced across devices.

Existing story-chain, district, raid and reward limits remain in force. No
future system is unlocked by practice. The player can leave and resume play;
there is no penalty for closing the app.

### District, story and seasonal raid decisions

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
claim control, including older rotations for the same pet and pet season.
Claiming does not require a new attack, energy or the current boss level.
Claims verify the stored defeat and original ownership and retain the original
reward idempotency key. Switching to another pet cannot claim that reward.

---

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

Future long-term Moonpet progression/home system.

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
implemented conditions. Relic ownership is collectible/progression state;
passive relic effects remain inactive. See
`docs/moonpet-roguelite-wiring-audit-2026-09-27.md` for the wiring matrix,
concurrency fixes, validation and deployment requirements.
