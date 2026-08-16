# Moonpet Season 1 Seasonal Model

**Status:** Canonical product rules for Season 1. This document defines the rules; it does not mean that every described system is implemented.

## Product boundary

Crypto Moonboy Pets is a **community-only game**. There are no cash purchases, crypto purchases, token cashouts, paid recovery paths, or financial rewards. Arcade XP is earned community progression, not money, a token, or an investment. Spending Arcade XP on a game unlock does not transfer cash or crypto and has no cash value.

## Status legend

- **LIVE** — available in the current game.
- **IN DEVELOPMENT** — approved Season 1 behavior that still needs implementation.
- **FUTURE** — direction reserved for a later release; it is not a current Season 1 feature.

## Canonical season and pet rules

| Rule | Status | Canonical behavior |
| --- | --- | --- |
| Season length | **LIVE** | Seasons target a 90-day progression cycle. The current runtime calendar resets at UTC year boundaries, so a year-end partial season may be shorter. |
| Seasonal roster | **LIVE** | Each player may have at most three Moonpets in a season. |
| Pet 1 | **LIVE** | The first seasonal Moonpet is free each season. |
| Pet 2 | **LIVE** | Unlock by spending 500 **spendable Arcade XP** earned through community play. |
| Pet 3 | **LIVE** | Unlock by spending 1,000 **spendable Arcade XP** earned through community play. |
| Active pet | **LIVE** | A player has one active seasonal Moonpet at a time. Pet-instance state resolves against the active or explicitly participating `pet_id`; account seasonal systems remain account-level. |
| Daily growth | **IN DEVELOPMENT** | Pet XP may exceed the daily target, with diminishing returns planned; Growth Marks are capped at one per `pet_id` per day. |
| Weekly growth | **IN DEVELOPMENT** | Weekly Crests are capped at one per `pet_id` per week. |

Pet 2 and Pet 3 are **gameplay unlocks**, not purchases with money or crypto. No paid shortcut or paid recovery route exists. The 500 and 1,000 spendable Arcade XP amounts are the current live Season 1 community XP unlock costs.

### Future balancing note

Higher costs such as 10,000 Arcade XP for Pet 2 and 25,000 Arcade XP for Pet 3 may be considered only in a later economy-balancing PR. They are not current Season 1 costs. Any replacement must update runtime behavior, UI copy, tests, and public documentation together so the source of truth cannot drift from the live game.

## Active and participating Moonpets

**LIVE.** A player has one active seasonal Moonpet at a time. Pet-instance actions resolve against one active or explicitly participating `pet_id`. Switching the active Moonpet preserves that instance's identity, stats, lifecycle, and other pet-specific progression rather than replacing them with another pet's state.

This isolation does not make every progression system pet-owned. Seasonal XP, seasonal tiers, leaderboard progression, and other systems explicitly defined at account level remain shared account seasonal state. Implementations and public copy must distinguish pet-instance records from account seasonal records instead of implying that all XP, rewards, or progression are independent per pet.

## Legendary completion

**IN DEVELOPMENT.** A seasonal Moonpet's Legendary target is:

- 60 Growth Marks;
- 10 Weekly Crests; and
- the required Pet XP and trials defined by the eventual balancing contract.

Standard seasons target a 90-day progression cycle. During a full-length cycle, the 60-day/10-week gates are designed to give a consistent player roughly two weeks of missed-time flexibility. Partial year-end seasons require separate balancing and cannot be assumed to provide the same buffer. Pet XP can continue past its normal daily target under the later diminishing-returns design, which must prevent heavy play from collapsing the intended seasonal journey into one week. Marks and Crests provide calendar-based fairness and remain independently capped per pet.

## Catch-up direction

**FUTURE.** Rested XP, behind-pace bonuses, and one difficult seasonal Crest recovery challenge per `pet_id` will help recover legitimate missed pace. Catch-up may improve Pet XP pace, but it must never manufacture Growth Marks, Weekly Crests, or Arcade XP. The detailed contract is in [`pet-game-catch-up-rules.md`](./pet-game-catch-up-rules.md).

## Sanctuary

**FUTURE.** A Moonpet that completes the Legendary requirements moves into Sanctuary as a completed Legendary pet. Sanctuary is the durable record used to recognize completed pets after their seasonal journey; it is not a cashout, token reward, or financial asset.

## Breeding and Fusion

**FUTURE.** Breeding/Fusion unlocks only after a player has completed Legendary Sanctuary pets. It is planned as a later weekly event system, not a Season 1 core progression feature. Species, Variant, Trait, Mutation, Fusion, Lunar File/Event File, and Critter are the preferred vocabulary for future content.

No breeding route, Fusion route, Fusion reward, or associated interface is authorized by this rules-only foundation.
