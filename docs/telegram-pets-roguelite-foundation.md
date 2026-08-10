# Crypto Moonboy Pets Roguelite Foundation

This foundation extends the protected Pet Run Engine shipped in PR #1155. It does not add Telegram commands, UI, paid power, new XP currencies, or unrestricted reward paths.

## Reward authority

All new roguelite modes must call `awardPetReward()` from `workers/moonboys-api/pets/roguelite-foundation.js`. Callers supply a server-generated source, stable idempotency key, and requested reward bundle. The service:

- reserves one unique reward claim per Telegram user, source, and idempotency key;
- atomically clamps Pet XP to 1,200/day and Community XP to 250/day using accepted `telegram_pet_events` as the canonical accounting ledger;
- updates the Pet profile, Community XP log/user/date-matched leaderboard, Pet season state, currencies, materials, items, and relics in the same D1 batch;
- records requested and applied rewards with their source and context;
- returns zero rewards for duplicate or concurrent callbacks.

Existing Events, Kaiju, Jobs, Activities, Adventure, Arena, and legacy run banking now finalize through this authority. Event and Kaiju flows retain the PR #1155 pending reservation, repeat-slot, Energy-payment, original accounting-window, and callback recovery protections; the reservation ID is handed to `awardPetReward()` for atomic finalization. New modes cannot self-register an arbitrary source: the authority rejects sources outside its reviewed allowlist.

Repeatable roguelite materials and items have daily service-level ceilings of 40 and 10 respectively. The starter boss awards no Pet XP or Community XP and instead uses materials, an evolution item, and idempotent relic ownership. Boss, room, and completion requests must prove a matching persisted run/room state before a claim can be created.

## Migration requirement

Apply `workers/moonboys-api/migrations/042_telegram_pet_roguelite_foundation.sql` to the `wikicoms` D1 database before deploying Worker code that invokes this foundation.

Migration 042 rebuilds the two v1 run tables so SQLite can extend the status constraint with `abandoned`. It copies every existing v1 run/step column and row before removing the temporary v1 tables, then recreates the one-open-run and callback-deduplication indexes. The v1 `extractable` and `extracted` states, unbanked rewards, depth/risk fields, unique event keys, and foreign keys remain supported. It materializes the net balance of legacy event-ledger items into `telegram_pet_inventory` and installs temporary cutover triggers that mirror accepted legacy item-event inserts until every Worker isolate runs the new authority. New-authority audit events carry `inventory_authority: true`, so mixed old/new deployment traffic cannot double-apply consumption.

Production evidence must include migration 042 in `d1_migrations`. The deployment manifest intentionally remains `unverified` until that evidence is captured; do not mark it applied based only on repository state.

Before production apply:

1. Confirm migration 033 is present and there is no already-created 042 table set from a manual partial apply.
2. Capture a D1 backup and record counts/status totals for `telegram_pet_runs` and `telegram_pet_run_steps`.
3. Run `node scripts/telegram-pets-roguelite-migration-rehearsal.test.mjs`; it seeds v1 active, extractable, and extracted data with unbanked rewards, callback keys, and legacy awarded/consumed items, applies 042 with foreign keys enabled, and verifies item balances, constraints, and referential integrity.
4. Apply 042 separately from the Worker deployment using the repository D1 migration runbook. Confirm both `telegram_pet_legacy_item_*_042` triggers exist, then deploy the Worker; the bridge keeps old-isolate event writes synchronized during propagation.
5. Recheck row counts, open-run uniqueness, callback keys, migrated item balances, the legacy-sync checkpoints, `PRAGMA foreign_key_check`, and the expected new tables/indexes before deploying the Worker.
6. Keep the compatibility triggers through the cutover observation window. Remove them only in a later migration after production evidence confirms all deployed Workers mark authority-owned audit events; never drop them between applying 042 and completing the Worker rollout.

Because 042 is a table rebuild, a failed or partially manual application must be treated as a stopped deployment. Do not rerun fragments or mark the migration applied until every copied field, index, and foreign key has been verified.

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
