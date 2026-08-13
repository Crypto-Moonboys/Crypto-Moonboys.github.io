# Moonpet AAA-quality gameplay audit

## Outcome

Moonpet has a strong technical foundation and an unusually broad feature set for a Telegram Mini App. It is not a finished AAA game: the largest gap is depth and feedback inside the playable systems, not the number of menu sections. This pass raises the core Moon Run from a generic button loop to a coherent, readable roguelite foundation without replacing the authoritative reward, anti-cheat, lifecycle, economy, or leaderboard systems.

## What this pass fixes

- Expands Moon Alley from 10 to 20 authored encounters, 3 to 9 enemy identities, and 1 to 3 bosses.
- Keeps normal, elite, and boss checkpoint fiction consistent with the actual encounter tier.
- Makes authored room choice pools drive the mechanical choices shown to the player.
- Uses one shared risk analysis for both server outcomes and player previews, preventing misleading odds.
- Shows room objective, threat, opponent, exact risk band, likely rewards, costs, gear advantage, unbanked loot, and extraction consequences.
- Surfaces authoritative success/failure story copy after a choice resolves.
- Preserves server authority: the client never rolls rewards, odds, or outcomes.

## Current scorecard after this pass

| Area | Score | Audit note |
| --- | ---: | --- |
| Identity and lifecycle | 8.5/10 | Multiple species, deterministic traits, evolution and rare morphs are well established. |
| Companion presentation | 8/10 | Strong code-rendered identity, mood, ceremony and presence layers. |
| Onboarding and discovery | 7.5/10 | Guide, deep links, utility rail and recommendations are present; first-session pacing can improve. |
| Care loop | 6.5/10 | Functional and connected, but long-term care decisions need more consequences and combo play. |
| Moon Run roguelite | 8/10 | This pass adds coherent authored rooms, opponents, stakes and decision previews. |
| Missions | 7.5/10 | Good cross-system credit and progress visibility; mission variety needs expansion. |
| District missions | 5.5/10 | Connected but mechanically thin and too close to a task list. |
| Story chains | 5/10 | Present, but branches, character choices and persistent consequences remain shallow. |
| Arena | 7.8/10 | Server-owned move previews, charge state, solo telegraphs, sealed PvP intent and perspective-correct recaps make the existing counter combat readable. Persistent builds and richer opponent archetypes remain future work. |
| Kaiju | 7.3/10 | The active category is now persisted before selection, every card exposes its relevant value and strengths, and results explain the score. Collection roles and multi-round mastery remain future work. |
| Economy and gear | 7/10 | Broad and authoritative; build identity and meaningful trade-offs need stronger presentation. |
| Progression and endgame | 7/10 | Deep breadth across prestige, relics, rare morphs and leaderboards; balance still needs live data. |
| Navigation and accessibility | 8/10 | Strong Mini App routing and utility controls with reduced-motion support. |
| Performance | 8/10 | Canvas/code art and lightweight DOM are appropriate for Telegram; profile on low-end devices before launch scale. |
| Content variety | 6.5/10 | Improved in Moon Run, but the rest of the game needs the same authored-content density. |

## Next priority phases

1. District and story depth: branching objectives, named rivals, persistent choices, and multi-step failure/recovery routes.
2. Roguelite buildcraft: checkpoint relic drafting, run modifiers, synergies, curses, and build summaries.
3. Feel and polish: restrained procedural audio, better input anticipation, hit timing, animation transitions, and device profiling.
5. Live balancing: funnel, choice, failure, extraction, economy, and retention telemetry with documented tuning gates.

## Release boundary

This is an AAA-quality gameplay foundation pass, not a claim that Moonpet is now a content-complete AAA production. Worker deployment and static-site publication are both required. No D1 migration or new binding is introduced.


## August 13 follow-up: District Stories

The post-Moon-Run audit found the largest remaining gameplay gap in District Missions and Street Story Chains. Both had progression and rewards, but each resolved through one generic button with no objective, opponent, risk read, or player choice.

This pass adds 18 authored district encounters across all six regions, three server-derived approaches with distinct odds/mastery/reward ceilings, and twelve story scenes with two server-recorded choices each. Outcomes and rewards remain Worker-authoritative. Cached clients keep the former guaranteed balanced path. No migration, daily-limit relaxation, or idempotency change is required.

| System | Before | After |
| --- | ---: | ---: |
| District Missions | 5.5 | 7.8 |
| Story Chains | 5.0 | 7.6 |
| Moon Run | 8.0 | 8.0 |
| Overall gameplay foundation | 7.1 | 7.6 |

The next highest-impact work is Arena/Kaiju tactical depth: opponent intent, build counters, multi-round decisions, and stronger post-match progression identity.
