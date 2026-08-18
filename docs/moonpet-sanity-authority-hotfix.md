# Moonpet sanity authority hotfix brief

Linked master audit: #1226

Baseline: `785e35a6581908e9e7d4d665a0fd90bc08dd2b60` after PR #1225.

This branch is intentionally a narrow Codex handover branch. The implementation PR must remain bounded to the sanity hotfix items below.

## Scope

Fix only:

1. Canonical Moonpet season-key authority.
2. Broken Kaiju active-pet pending-work guard.
3. D1 production migration verifier coverage for migrations 061 and 062.

Do not change:

- Arena runtime authority.
- Kaiju reward conversion beyond the pending-work guard hotfix.
- Moon Gold / Moon Crystal / Style ownership model.
- Weekly Boss architecture.
- Daily 3-of-5 Growth Mark contract.
- Sanctuary settlement.
- Identity, Memory, Behaviour, Prestige.
- Breeding, Fusion, genomes, lineage.
- Global pet_id enforcement triggers.

## Required implementation details

### 1. Canonical season key

Create or expose one canonical server helper for Moonpet season key authority.

Current live authority should remain UTC calendar quarters:

```js
pet-sYYYY-001 through pet-sYYYY-004
```

Replace independent day-of-year `/90` season-key logic in:

- `workers/moonboys-api/pets/daily-moon-run.js`
- `workers/moonboys-api/pets/roguelite-foundation.js` reward settlement fallback, if applicable
- any other Moonpet Worker runtime path found by source search

Tests must guard against reintroducing `Math.floor(dayOfYear / 90)` in Moonpet season-key generation.

### 2. Kaiju pending-work guard

Fix the active-slot pending-work guard SQL.

It must not query `telegram_pet_kaiju_matches.telegram_id`, because that column does not exist.

Use the participant columns:

```sql
(player1_telegram_id=? OR player2_telegram_id=?)
```

Add regression tests proving active-pet switching is blocked while a Kaiju match is unfinished.

### 3. D1 verifier coverage

Add migrations 061 and 062 to:

- `deployments/d1-evidence-request.json`
- `scripts/verify-d1-production-migrations.mjs`
- `scripts/verify-d1-production-migrations.test.mjs`
- `.github/workflows/d1-production-migration-verify.yml`

Required migrations:

- `061_moonpet_season_economy_calibration.sql`
- `062_moonpet_evolution_stage_5.sql`

## Required tests

At minimum:

- canonical season helper returns quarter keys at Q boundaries;
- Daily Moon Run uses the canonical quarter key;
- reward settlement fallback no longer has independent `/90` Moonpet season logic;
- Kaiju pending work blocks active pet switching for player1 and player2;
- D1 verifier requires migrations 061 and 062;
- no Arena, Kaiju reward conversion, economy ownership, Sanctuary settlement, Identity/Memory, Prestige, or breeding changes.

## Merge rule

Do not merge until:

- `ci-worker-api` passes;
- D1 production migration verifier passes;
- PR template passes;
- all review threads are resolved;
- changes remain inside the scope above.
