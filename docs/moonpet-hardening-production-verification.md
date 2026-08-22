# Moonpet Hardening Production Verification

Production-only verification checklist for the Moonpet authority hardening chain (migrations 070-074).

## Scope lock

- Verification only.
- Do not add gameplay, breeding, lineage, fusion, genetics, traits, sanctuary expansion, or token/payment logic in this pass.

## 1) D1 migration and schema verification

Run GitHub Actions workflow:

- **Workflow:** `D1 Production Migration Verify`
- **Trigger:** `workflow_dispatch`

This run now verifies:

- Required migration chain through `074_moonpet_live_system_ownership_classification.sql`
- Identity authority violation view health
- Hardening schema objects for 070-074
- Specialist authority invariants
- Live-system ownership invariants

Artifacts to retain:

- `d1-production-migration-evidence`
  - `d1-production-migration-evidence.json`
  - `d1-identity-authority-audit-result.txt`
  - `d1-moonpet-hardening-audit-evidence.json`

## 2) Identity authority verification

The workflow enforces:

- `moonpet_invalid_identity_authority_rows` count is `0`
- No invalid pet ownership tuples survive in production

## 3) Specialist progression verification

The workflow enforces:

- No specialist progression/event rows missing valid `(pet_id, telegram_id, season_key)` ownership tuples
- No specialist event crossover to multiple pets for the same owner/event key
- Account-owned wallet/material/inventory tables remain account-scoped (no `pet_id` drift)

## 4) Live system ownership verification

The workflow enforces:

- District/event chain/seasonal boss system rows keep pet-owned authority
- Daily/weekly journey and daily run rows keep valid pet authority joins
- No empty pet tuple in pet-owned live systems

## 5) Production smoke

Run:

```bash
node scripts/moonpet-production-smoke.mjs <expected-deployed-commit-sha>
```

Verify:

- Worker health endpoint
- Worker deployment provenance (`/deployment-info` commit match)
- Mini App surface loads (`moonpet-game.html`, Mini App JS/CSS)

Then run manual authenticated Mini App checks for:

- selected pet state
- cooldown timers
- Daily Journey / Weekly Journey / Daily Moon Run authority behavior
- district/event-chain/seasonal-boss settlement ownership after active-pet switch

## 6) Production truth manifest upkeep

`deployments/production.json` and `scripts/production-deployment-truth-audit.mjs` now require the full Moonpet migration set through `074` so deployment truth cannot drift behind the hardening chain.
