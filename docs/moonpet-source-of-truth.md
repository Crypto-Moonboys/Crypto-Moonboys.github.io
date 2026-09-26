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

### Play Now and practice

Play Now links the current snapshot to available live routes. Navigation does
not submit an action; each destination still enforces its server requirements.
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
