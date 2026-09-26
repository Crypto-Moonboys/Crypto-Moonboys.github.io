# Moonpet continuing-play audit — 26 September 2026

Base: `b43bbbc4ebb94acbab82ee660277d1b83d0fc11a`.
The public Worker deployment-info endpoint reported the same commit during
this audit, deployed at `2026-09-26T22:27:55.791Z`.

## Findings and changes

The earlier player-loop PR repaired navigation and added local practice. It
did not create ongoing server-recorded quests. Daily missions, stories,
districts and official Daily Run still have their existing limits.

This change adds **Continuing Contracts** to Missions and Play Now:

- Three six-room goals: four successful routes, 65 salvage, or finish with
  at least 50 route health. All require reaching the end alive.
- Three builds with different health, supplies, odds and salvage strengths.
- Cover, bold, search and supply routes show odds, gains and failure costs.
- Two drafts per contract, each offering three upgrades from a six-perk pool.
- Three difficulty tiers; tiers 2/3 unlock at 5/15 completed contracts.
- Server-saved progress and pet-owned Contract Rank. Another quest is offered
  immediately after success, failure or abandonment. Closing the app preserves
  an active contract, including when returning on another signed-in device.
- No pet energy cost or contract cooldown. Rank/completion progress continues
  after the economic bonus budget is exhausted.
- The first three successful contracts per account per UTC day reserve up to
  20 Pet XP each. The existing 1,200 Pet XP daily cap still applies. Bonus
  reservations are shared across pets; interrupted delivery can be retried
  later on the original contract. No gold, gems, materials, items, Community
  XP, Growth Marks, Weekly Crests or competitive leaderboard credit.

Contract rank is a separate accomplishment record, not a hidden source of
combat power, evolution qualification or Daily Journey completion.

Two additional confirmed UI defects were fixed:

1. At 360px, the bottom navigation clipped the Profile button. Six equal grid
   columns and narrower label spacing keep all six destinations visible.
2. Refreshing rebuilt build/goal selectors with their defaults. Renders now
   preserve valid selections for the same pet; they do not carry drafts into
   another pet's controls. Missions also gets direct section shortcuts.

## System sanity checks

| System | Result / boundary |
| --- | --- |
| Incubation, hatch, care, Energy Drink, Dance, Cuddles | Existing lifecycle and cooldown authority retained; contract access requires a hatched active pet |
| Daily/Weekly Journey and seven daily missions | Accepted evidence, rewards, reset and ownership checks retained; contracts do not fabricate this evidence |
| Standard Moon Run | Existing room choices, energy costs, banking, item costs and reward authority retained |
| Official Daily Run | Existing seeded, account/day reservation and persisted room authority retained |
| Continuing Contracts | New server-owned repeatable quest loop; atomic moves, source-pet rank and bounded XP bonuses |
| Practice | Remains local and reward-free; no practice score is accepted by contracts |
| Jobs, timed activities, shop, gear, bags, crafting, bounties and expeditions | Existing dispatcher, affordability, specialist, cooldown and settlement regressions passed |
| Stories, districts, weekly boss and raids | Existing authored choices and daily limits retained |
| Arena and Kaiju | Existing capability and match tests passed; Arena requires a hatched level-10 pet, Kaiju a hatched pet. Kaiju remains classified as account-owned |
| Identity, seasons, slots and achievements | Pet authority, switching and rollover regressions passed |
| Advanced traits, breeding, lineage, fusion, sanctuary, prestige | Remain classified as future/locked; no playable claim added |
| Existing EGGYONE assets | Current refresh retained visual approval; no art downloaded/generated or re-approved here |

This is source/fixture verification, not a claim that every live account or
Cloudflare binding was exercised. Existing relic ownership still does not
prove every catalogued effect is active in both legacy and daily run engines.

## Persistence and integrity

Migration 076 adds one table plus indexes; it does not rewrite existing saves.
Contracts carry pet ID, owner, season and a monotonically increasing revision.
Both owner and active-slot authority are checked again in the write statement.
The client submits a choice, never its roll, run state, rank or requested XP.

The same atomic terminal update records rank and reserves one of the three
account/day bonus slots. The central reward ledger authorizes only completed
contracts with a reservation, forces the reward to 20 Pet XP before normal
caps, and uses the immutable contract ID as the idempotency key. A ledger
receipt is required before bonus delivery is marked complete. Retrying after
a crash cannot redirect or duplicate the award.

Missing migration/schema support disables this board without preventing the
rest of the Mini App from loading. The ownership audit and migration evidence
workflow include the new table/migration.

## Validation

- Worker/API domain: **66 checks passed**.
- Arcade domain: **23 checks passed**.
- **1,080 contract simulations** across all goals, builds and tiers: 854 goals
  met, 226 failures, 2,157 upgrade drafts.
- SQLite integration tests: parallel starts/moves; stale/terminal moves;
  foreign account/pet requests; active-slot change during a write; shared
  bonus budget across pets; continued rank after cap; UTC reset; 1,200 XP cap;
  interrupted delivery; crash after ledger award; forged reward inputs;
  migration idempotency and missing-table fallback; actual Mini App dispatch.
- Existing 900 practice simulations passed; practice remains isolated.
- Actual Mini App browser tests at **390×844 and 360×640**: six screens, all
  navigation buttons visible, build selection survives refresh, accept/play/
  draft/reload/finish a contract, exactly one XP bonus, unchanged energy/gold,
  and the next three quest choices. Fixtures use the real Worker and SQLite.
- Identity ownership audit: zero violations. Migration verification,
  CI grouping, anti-drift, copy guard and whitespace checks passed.
- Full visual-domain execution locally stopped at an unrelated avatar browser
  test because its default Playwright browser was unavailable. The new Mini
  App browser test passed using the provisioned Chromium executable; GitHub
  CI installs the standard browser and remains the complete visual gate.

The existing Dead Run test had an unconditional repository-wide ban on schema
changes. Its scope guard now applies when Dead Run client files change, with
positive/negative regression examples. Dead Run runtime files are untouched.

## Deployment

After review/merge, from the current clean `main` checkout:

```sh
git pull --ff-only origin main
npm ci
npx wrangler d1 migrations list wikicoms --remote --config workers/moonboys-api/wrangler.toml
npx wrangler d1 migrations apply wikicoms --remote --config workers/moonboys-api/wrangler.toml
node scripts/deploy-worker-with-provenance.mjs moonboys-api
```

Migration **076_moonpet_continuing_contracts.sql** must be applied before the
Worker deployment. If the migration list shows unexpected older migrations,
follow `docs/D1_MIGRATION_RUNBOOK.md` before applying; do not mark unapplied
migrations as complete or skip failures. Publish the updated static frontend
through the normal GitHub Pages workflow.

Then reopen Telegram, select a hatched pet, open Missions → Contracts, finish
one contract, reload, and verify rank, bonus and another quest. Check an egg
still has incubation/practice and a clear contract unlock explanation. Confirm
the Worker deployment-info commit matches current main.

No production migration, player-data mutation, merge or deployment was
performed during this implementation.
