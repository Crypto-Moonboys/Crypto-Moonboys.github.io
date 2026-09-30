# Moonpet beta XP quarantine — 30 September 2026

## Decision

The remaining beta-history mismatch is handled by quarantine, not by inventing
missing pet ownership or rewriting retained XP. Migration 080 records existing
accepted Pet XP receipts that cannot be defended against current ownership data:

- an account has per-pet authority but the receipt has no exact retained
  pet/owner/season slot; or
- the complete accepted receipt total for an exact pet/owner/season tuple is
  greater than that retained pet's XP.

For the second case, every historical receipt in the inconsistent tuple is
quarantined. Choosing only enough rows to make the arithmetic fit would falsely
claim knowledge of which beta reward or starting balance was wrong.

## Runtime effect

Quarantined receipts are excluded from daily/weekly Pet leaderboards and the
public Pet activity feed. The website, Mini App and bot already use the shared
leaderboard projection, so they remain aligned. Seasonal and all-time ranks keep
their existing retained authorities.

The migration does **not** delete or modify reward events, pet XP, levels,
wallets, inventory, achievements, claims or Community XP. Legacy accounts with
no per-pet instance rows retain their account-scoped receipts and profile
fallback. New rewards after migration are not retroactively quarantined.

## Deployment

Apply migration `080_moonpet_beta_xp_quarantine.sql` before deploying the Worker.
Afterward run `scripts/check-moonpet-beta-xp-quarantine.sql`. That report returns
counts only and checks that no visible historical weekly window exceeds retained
all-time Pet XP.
