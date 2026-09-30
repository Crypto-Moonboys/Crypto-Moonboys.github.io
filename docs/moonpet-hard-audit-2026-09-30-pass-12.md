# Moonpet hard audit — 2026-09-30, pass 12

## Scope

This pass rechecked live care actions, cooldowns, Practice, Contracts, Style Lab,
Standard Run room and boss settlement, Daily and Weekly Journey receipts,
season completion, public activity, and all leaderboard periods after PR #1401.

## Fixed

- Practice and Contracts now reject resolved D1 failures for ownership, saved
  runs, claims, starts, compare-and-swap steps, and reward receipts.
- Style Lab no longer reports an equip/remove success when D1 resolved the
  `RETURNING` query with `success: false`.
- Standard Run starts, room outcomes, boss rewards, terminal recovery, and
  unified reward receipts now treat resolved D1 failures as unavailable rather
  than empty, stale, duplicate, or successful state.
- Care, Work, Trade, and Adventure cooldown/idempotency reads now fail closed.
  Special-care limits cannot become another use during an unreadable history.
- Daily and Weekly Journey receipt failures no longer publish false incomplete
  progress.
- Growth Marks, Weekly Crests, lifecycle requirements, and season-completion
  writes now distinguish D1 outages from missing progress or duplicates.

## Rechecked without code changes

- Daily, weekly, seasonal, all-time, and run-depth leaderboards share the same
  strict read model as the Mini App and reject malformed D1 results.
- Public activity excludes pending/rejected events, wallet reconciliation, and
  quarantined beta XP while retaining zero-XP crafting, equipment, and Style
  collection events.
- Daily checklist completion, Weekly Boss recovery, seasonal finale, Arena,
  Kaiju, and their public XP/activity projections remain covered by behavioral
  regression suites.
- Breeding and Sanctuary remain intentionally unavailable player features;
  this audit did not expose their foundation code as live actions.

## Deployment

No D1 migration is included. After merge, deploy `moonboys-api`; the static
site does not need a separate manual deployment for this Worker-only runtime
change.
