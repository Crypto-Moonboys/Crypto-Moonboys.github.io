# Moonpet missed-care beta trial

Migration 114 adds a shadow ledger to wikicoms. After migration, deploy moonboys-api. The trial defaults off. For an approved trial, set the private Worker binding `MOONPET_CARE_SHADOW_OWNERS` to a comma-separated list of up to 20 beta Telegram IDs, including inactive owners. Set `MOONPET_CARE_SHADOW_ENABLED=true`. Remove or disable that flag to stop observation and settlement. Keep the cohort stable through the final settlement day. Player XP, guidance and public profiles continue to use the ordinary game rules.

The existing half-hour schedule samples the selected pet, hatch status and wallet recovery. All 48 samples and the closing midnight boundary must be present for a day to qualify. The trial starts forward from activation. A wholly unobserved day has no row and contributes no debt. Partial coverage, an egg, missing ownership or a selection change freezes the account's standing for that day. For this pilot, switching pets makes the whole day exempt, so the rate of such exclusions matters when interpreting results.

The next full UTC day is reserved for delayed event writes and incident reporting. A short outage between samples or an action that failed before writing a receipt may be invisible to the database. Record known incidents **before settlement** in `moonpet_care_shadow_exclusions(day_key, owner_scope, reason)`. Use the UTC date and either the affected Telegram ID or `*` for a service-wide incident. A later discovery should exclude that account's affected trajectory from the analysis. Closed rows are immutable to the job.

After the grace day, each tick settles the oldest eligible open date for each enrolled account in a D1 transaction. Three distinct accepted actions on the same source pet complete care, including actions that earned zero XP. Gross XP includes every accepted Pet XP award on the account. The ledger stores standing in exact thirds and models the simulator's fractional daily XP estimate before the full-care credit. This estimate is for comparing earnings across beta accounts. Applying an integer reduction to individual awards would require a separate reward-path change.

Review anonymized results in D1. A NULL exemption reason on a settled row indicates an eligible day. Include zero-earning days in the denominator.

```sql
SELECT day_key, coalesce(exempt_reason,'eligible') AS outcome,
       count(*) AS account_days, sum(gross_pet_xp=0) AS zero_xp_days,
       sum(gross_pet_xp) AS earned_pet_xp,
       round(sum(estimated_withheld_xp),2) AS hypothetical_withheld_xp
FROM moonpet_care_shadow_days
WHERE settled_at IS NOT NULL
GROUP BY day_key, outcome ORDER BY day_key, outcome;
```

Local replay and rollback test: `node --test scripts/moonpet-care-shadow.test.mjs`.
