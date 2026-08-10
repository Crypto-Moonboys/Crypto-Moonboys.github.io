# Crypto Moonboy Pets Roguelite Foundation

This foundation extends the protected Pet Run Engine shipped in PR #1155. It does not add Telegram commands, UI, paid power, new XP currencies, or unrestricted reward paths.

## Reward authority

All new roguelite modes must call `awardPetReward()` from `workers/moonboys-api/pets/roguelite-foundation.js`. Callers supply a server-generated source, stable idempotency key, and requested reward bundle. The service:

- reserves one unique reward claim per Telegram user, source, and idempotency key;
- atomically clamps Pet XP to 1,200/day and Community XP to 250/day using accepted `telegram_pet_events` as the canonical accounting ledger;
- updates the Pet profile, Community XP log/user/active leaderboard, Pet season state, currencies, materials, and items in the same D1 batch;
- records requested and applied rewards with their source and context;
- returns zero rewards for duplicate or concurrent callbacks.

Existing Events, Kaiju, Jobs, Activities, Adventure, and Arena flows remain compatible and retain their PR #1155 protections. They are not rewritten in this foundation PR. New modes must not write permanent reward balances directly.

## Migration requirement

Apply `workers/moonboys-api/migrations/042_telegram_pet_roguelite_foundation.sql` to the `wikicoms` D1 database before deploying Worker code that invokes this foundation.

Migration 042 rebuilds the two v1 run tables so SQLite can extend the status constraint with `abandoned`. It copies every existing v1 run/step column and row before removing the temporary v1 tables, then recreates the one-open-run and callback-deduplication indexes. The v1 `extractable` and `extracted` states, unbanked rewards, depth/risk fields, unique event keys, and foreign keys remain supported.

Production evidence must include migration 042 in `d1_migrations`. The deployment manifest intentionally remains `unverified` until that evidence is captured; do not mark it applied based only on repository state.

## Foundation tables

- `telegram_pet_runs`: region, difficulty, deterministic seed, room progress, terminal status, score, and run summary analytics.
- `telegram_pet_run_rooms`: generated room state and one resolution per run/room number.
- `telegram_pet_run_modifiers`: temporary run-scoped effects, deleted at every terminal run transition.
- `telegram_pet_reward_claims`: idempotent source-aware reward ledger.
- `telegram_pet_inventory`: material and item quantities awarded by the reward service.
- `telegram_pet_relics`: permanent relic ownership, rarity, unlock time, and effects JSON.
- `telegram_pet_run_history`: aggregate completion, boss, room, score, speed, and discovery records.
- `telegram_pet_run_analytics`: start, room, modifier, boss, and end events used for balancing.

## Expansion points

- Add enemies, events, loot and bosses to the region pools without changing run persistence.
- Add room resolvers behind `generatePetRunRoom`, `persistPetRunRoomOutcome`, `rewardPetRunRoom`, and `advancePetRun`.
- Add run-only modifiers only through `choosePetRunModifier`; validation rejects XP, cap, and permanent-stat effects.
- Add boss definitions to `PET_ROGUELITE_BOSSES`; `rewardPetRogueliteBoss` always routes their drops through `awardPetReward`.
- Add permanent relic activation separately from run modifiers. Relic reward bonuses must still produce a requested bundle that is capped and claimed by the reward service.
- Add APIs and Telegram controls in later PRs. This PR deliberately exposes no new command surface.

The target loop remains: Care → Prepare → Run → Fight → Loot → Upgrade → Evolve → Repeat.
