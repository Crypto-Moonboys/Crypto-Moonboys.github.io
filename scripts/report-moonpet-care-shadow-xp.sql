-- Prospective whole-XP replay of policy v1. Uses only frozen account/day inputs.
-- Freeze the rate at UTC midnight. A late settlement can only affect a later day.
WITH opening AS (
  SELECT d.telegram_id, d.day_key, d.exempt_reason, d.gross_pet_xp,
    coalesce((
      SELECT p.debt_thirds FROM moonpet_care_shadow_days p
      WHERE p.telegram_id=d.telegram_id AND p.policy_version=d.policy_version
        AND p.day_key<d.day_key AND julianday(p.settled_at)<julianday(d.day_key)
      ORDER BY p.day_key DESC LIMIT 1
    ),0) AS opening_debt
  FROM moonpet_care_shadow_days d
  WHERE d.policy_version=1 AND d.settled_at IS NOT NULL
), daily AS (
  SELECT *, CASE WHEN exempt_reason IS NULL AND opening_debt>0
    THEN gross_pet_xp*(1540+min(2310,opening_debt)) ELSE 0 END AS numerator
  FROM opening
), cumulative AS (
  SELECT *, sum(numerator) OVER (
    PARTITION BY telegram_id ORDER BY day_key ROWS UNBOUNDED PRECEDING
  ) AS running_numerator
  FROM daily
), projected AS (
  -- Integer division carries fractions across receipts and days for each owner.
  -- With a fixed daily rate the total is identical for one award or many.
  SELECT *, running_numerator/15400 - (running_numerator-numerator)/15400 AS withheld
  FROM cumulative
)
SELECT day_key, count(*) AS settled_account_days,
  sum(exempt_reason IS NOT NULL) AS exempt_account_days,
  sum(exempt_reason IS NULL AND gross_pet_xp=0) AS eligible_zero_xp_days,
  sum(gross_pet_xp) AS gross_pet_xp, sum(withheld) AS projected_withheld_xp,
  sum(gross_pet_xp-withheld) AS projected_net_pet_xp
FROM projected GROUP BY day_key ORDER BY day_key;
