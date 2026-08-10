# Crypto Moonboy Pets Roguelite Foundation

This foundation, Moon Alley slice, and Moonpet identity layer build on the protected Pet reward, run, and activity work shipped in PRs #1155, #1156, and #1157. They do not add Telegram commands, redesign UI, add paid power, create new currencies, or open unrestricted reward paths.

## Reward authority

All new roguelite modes must call `awardPetReward()` from `workers/moonboys-api/pets/roguelite-foundation.js`. Callers supply a server-generated source, stable idempotency key, and requested reward bundle. The service:

- reserves one unique reward claim per Telegram user, source, and idempotency key;
- atomically clamps Pet XP to 1,200/day and Community XP to 250/day using accepted `telegram_pet_events` as the canonical accounting ledger;
- updates the Pet profile, Community XP log/user/date-matched leaderboard, Pet season state, currencies, materials, items, and relics in the same D1 batch;
- records requested and applied rewards with their source and context;
- returns zero rewards for duplicate or concurrent callbacks.

Existing Events, Kaiju, Jobs, Activities, Adventure, Arena, and legacy run banking now finalize through this authority. Event and Kaiju flows retain the PR #1155 pending reservation, repeat-slot, Energy-payment, original accounting-window, and callback recovery protections; the reservation ID is handed to `awardPetReward()` for atomic finalization. New modes cannot self-register an arbitrary source: the authority rejects sources outside its reviewed allowlist.

Repeatable roguelite materials and items have daily service-level ceilings of 40 and 10 respectively. The starter boss awards no Pet XP or Community XP and instead uses materials, an evolution item, and idempotent relic ownership. Boss, room, and completion requests must prove a matching persisted run/room state before a claim can be created.

## Moon Alley vertical slice

Moon Alley is the first playable region catalog. It is a difficulty-one cyberpunk street-graffiti district with a ten-room default run:

1. Alley Entrance
2. Graffiti Wall
3. Rival Encounter
4. Hidden Cache
5. Street Market
6. Underground Tunnel
7. Police Heat
8. Neon Shortcut
9. Elite Encounter
10. Boss Room, which unlocks Alley King

The server walks the authored room pool in order and deterministically selects encounter enemies from the persisted run seed. Street Rat, Rival Moonpet, and Cyber Guard are the initial enemy pool. A run can fail, be abandoned, complete, or extract; every terminal transition deletes its temporary modifiers, and duplicate terminal callbacks reuse the persisted terminal state.

Alley King uses the existing boss and reward authority. A valid resolved boss room can award bounded Neon Scrap, Spray Pigment, one Evolution Fragment, and a deterministic 25% relic roll. It awards no repeatable Pet XP or Community XP. The ten relic definitions are persistent collectible ownership records; their gameplay effects are cataloged for later activation and are not XP multipliers, cap bonuses, or direct reward-authority bypasses. The ten run modifiers are temporary rows removed at run end.

Backend analytics record run starts, room outcomes, modifier choices, boss attempts, boss wins, terminal status/depth, applied reward bundles, and relic discoveries. These raw events support room completion/failure counts, extraction rate, average depth, reward averages, and discovery reporting without adding a UI.

## Moonpet evolution roadmap

The implemented backend evolution order is Moon Egg, Street Moonpet, Cyber Moonpet, Elite Moonpet, and Legendary Moon Guardian. Definitions live separately in `workers/moonboys-api/pets/content/evolutions.json`; import-time validation requires ordered stages, valid requirement and unlock data, and rejects XP multipliers, reward multipliers, and cap increases.

Each evolution is permanent and sequential. The backend checks Pet level, recorded boss victories, unique relic ownership, and authoritative `telegram_pet_inventory` quantities in one atomic D1 batch. Required inventory is consumed exactly once only when the evolution row is created. Duplicate requests return the existing evolution and cannot consume inventory again. Evolution unlocks store cosmetic IDs, animation-state IDs, and achievement IDs only. They do not award XP, increase caps, multiply rewards, or confer NFT power.

The currently implemented requirements are:

- Moon Egg: adoption and Pet level 1.
- Street Moonpet: Pet level 5 and 5 Neon Scrap.
- Cyber Moonpet: Pet level 20, three Alley King victories, two relics, 10 Neon Scrap, and three Evolution Fragments.
- Elite Moonpet: Pet level 35, eight Alley King victories, five relics, 20 Neon Scrap, and eight Evolution Fragments.
- Legendary Moon Guardian: Pet level 50, 15 Alley King victories, 10 relics, 40 Neon Scrap, and 15 Evolution Fragments.

These identity stages and unlock records are live in the backend. No additional regions, evolution-only adventure content, combat power, or redesigned evolution screen is claimed by this implementation.

## Personality system

Personality progress is earned from accepted behaviour: Arena and boss combat advances Street Fighter, Adventure and successful run milestones advance Explorer, care actions advance Loyal, and random events advance Curious. `telegram_pet_personality_traits` stores one permanent progress row per Moonpet and trait. A unique identity-event ledger makes repeated or concurrent callbacks advance progress once, and a stable analytics key records each trait unlock once.

Traits are presentation and future-content hooks. Their allowed uses are dialogue, cosmetics, event preferences, and future content routing. They are not raw XP multipliers, reward multipliers, cap changes, or combat-stat boosts.

## Memory system

`telegram_pet_memories` preserves first adoption, first run, first extraction, first boss victory, biggest Moon Gold reward, favourite activity, completed runs, bosses defeated, and milestone IDs. Per-boss victory totals support evolution checks without turning memories into rewards. Pet Run and roguelite terminal callbacks, boss rewards, Arena, care, Adventure, and random events write through the same identity-event ledger so duplicate callbacks cannot duplicate history.

The existing `/petprogress` output now appends the current evolution stage, unlocked personality names, and concise memory highlights. This is an extension of the current text output, not a UI redesign.

`telegram_pet_identity_analytics` records stable evolution unlocks, personality unlocks, and memory milestones. Evolution events include seconds since first adoption, allowing average time-to-evolution reporting; trait unlock counts can be compared with adopted-pet counts for balancing. Analytics do not issue rewards.

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

After migration 042 is fully applied and verified, apply `workers/moonboys-api/migrations/043_telegram_pet_identity_expansion.sql` before deploying the identity-enabled Worker. Migration 043 only adds identity tables and indexes; it does not rebuild, replace, or remove migration 042 tables, inventory authority, reward claims, caps, triggers, run validation, or duplicate protections. Production evidence must include both migrations.

## Foundation tables

- `telegram_pet_runs`: region, difficulty, deterministic seed, room progress, terminal status, score, and run summary analytics.
- `telegram_pet_run_rooms`: generated room state and one resolution per run/room number.
- `telegram_pet_run_modifiers`: temporary run-scoped effects, deleted at every terminal run transition.
- `telegram_pet_reward_claims`: idempotent source-aware reward ledger.
- `telegram_pet_inventory`: material and item quantities awarded by the reward service.
- `telegram_pet_relics`: permanent relic ownership, rarity, unlock time, and effects JSON.
- `telegram_pet_run_history`: aggregate completion, boss, room, score, speed, and discovery records.
- `telegram_pet_run_analytics`: start, room, modifier, boss, and end events used for balancing.
- `telegram_pet_evolutions`: permanent sequential evolution unlocks and cosmetic/achievement state.
- `telegram_pet_personality_traits`: permanent behaviour progress and one-time trait unlock timestamps.
- `telegram_pet_memories`: permanent firsts, totals, favourite activity, biggest reward, and milestones.
- `telegram_pet_identity_events`: callback idempotency ledger for personality and memory writes.
- `telegram_pet_identity_analytics`: evolution, personality, milestone, and time-to-evolution balancing events.

## Expansion points

- Add or revise content under `workers/moonboys-api/pets/content/`: `regions.json`, `rooms.json`, `enemies.json`, `bosses.json`, `relics.json`, `modifiers.json`, and `evolutions.json`. Keep future regions and encounters out of `worker.js`.
- Reference only IDs that already exist in the relevant catalog. Import-time validation rejects missing room, enemy, boss, and relic references.
- Add enemies, events, loot and bosses to reviewed region pools without changing run persistence.
- Add room resolvers behind `generatePetRunRoom`, `persistPetRunRoomOutcome`, `rewardPetRunRoom`, and `advancePetRun`.
- Add run-only modifiers only through `choosePetRunModifier`; validation rejects XP, cap, and permanent-stat effects.
- Add boss definitions to `PET_ROGUELITE_BOSSES`; `rewardPetRogueliteBoss` always routes their drops through `awardPetReward`.
- Add permanent relic activation separately from run modifiers. Relic reward bonuses must still produce a requested bundle that is capped and claimed by the reward service.
- Re-run the content validation, callback/concurrency tests, and the 10,000-run economy simulation for every content expansion.

## Content reward rules

- Enemy, room, boss, extraction, and completion rewards must call `awardPetReward()` with a stable server-generated idempotency key.
- Repeatable bosses must not award Pet XP or Community XP. Do not add XP multipliers, daily-cap bonuses, permanent-stat mutation, direct currency writes, or inventory writes to content effects.
- Materials and items remain subject to the authority's daily caps; relic ownership remains unique through `telegram_pet_relics`.
- Boss and room rewards require a matching resolved persisted room, and completion/extraction rewards require a matching terminal run state.
- Relic probability and room selection must be deterministic from persisted run identifiers so retries cannot reroll outcomes.
- New content does not imply that every cataloged effect is active. Activation belongs in a separately reviewed integration that preserves these rules.

The Moon Alley loop is: Care → Prepare → Enter Moon Alley → Make choices → Fight → Loot → Extract → Upgrade → Repeat.
