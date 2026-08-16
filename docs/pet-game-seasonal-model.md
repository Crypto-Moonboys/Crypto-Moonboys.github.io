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
| Season length | **LIVE** | A season lasts 90 days. |
| Seasonal roster | **IN DEVELOPMENT** | Each player may have at most three Moonpets in a season. |
| Pet 1 | **IN DEVELOPMENT** | The first seasonal Moonpet is free each season. |
| Pet 2 | **IN DEVELOPMENT** | Unlock by spending 10,000 **spendable Arcade XP** earned through community play. |
| Pet 3 | **IN DEVELOPMENT** | Unlock by spending 25,000 **spendable Arcade XP** earned through community play. |
| Active pet | **IN DEVELOPMENT** | A player has one active seasonal Moonpet at a time. Every action and reward affects only the active or explicitly participating `pet_id`. |
| Daily growth | **IN DEVELOPMENT** | Pet XP may exceed the daily target, with diminishing returns planned; Growth Marks are capped at one per `pet_id` per day. |
| Weekly growth | **IN DEVELOPMENT** | Weekly Crests are capped at one per `pet_id` per week. |

Pet 2 and Pet 3 are **gameplay unlocks**, not purchases with money or crypto. No paid shortcut or paid recovery route exists. Slot APIs, Arcade XP spending, and Pet 2/Pet 3 interfaces are deliberately deferred to later implementation PRs.

## Active and participating Moonpets

The active-pet rule prevents one action from progressing an entire roster. A request must resolve one participating `pet_id`; Pet XP, Growth Marks, Weekly Crests, trials, and other pet progression belong only to that Moonpet. Changing the active Moonpet does not copy, pool, or retroactively move progression between pets.

## Legendary completion

**IN DEVELOPMENT.** A seasonal Moonpet's Legendary target is:

- 60 Growth Marks;
- 10 Weekly Crests; and
- the required Pet XP and trials defined by the eventual balancing contract.

The 90-day window and the 60-day/10-week gates are intentionally shaped so a consistent player can miss roughly two weeks and still complete a Moonpet. Pet XP can continue past its normal daily target, but later diminishing returns must prevent heavy play from collapsing a 90-day season into one week. Marks and Crests provide calendar-based fairness and remain independently capped per pet.

## Catch-up direction

**FUTURE.** Rested XP, behind-pace bonuses, and one difficult seasonal Crest recovery challenge per `pet_id` will help recover legitimate missed pace. Catch-up may improve Pet XP pace, but it must never manufacture Growth Marks, Weekly Crests, or Arcade XP. The detailed contract is in [`pet-game-catch-up-rules.md`](./pet-game-catch-up-rules.md).

## Sanctuary

**FUTURE.** A Moonpet that completes the Legendary requirements moves into Sanctuary as a completed Legendary pet. Sanctuary is the durable record used to recognize completed pets after their seasonal journey; it is not a cashout, token reward, or financial asset.

## Breeding and Fusion

**FUTURE.** Breeding/Fusion unlocks only after a player has completed Legendary Sanctuary pets. It is planned as a later weekly event system, not a Season 1 core progression feature. Species, Variant, Trait, Mutation, Fusion, Lunar File/Event File, and Critter are the preferred vocabulary for future content.

No breeding route, Fusion route, Fusion reward, or associated interface is authorized by this rules-only foundation.

