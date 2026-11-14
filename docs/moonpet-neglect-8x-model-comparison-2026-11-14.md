# Moonpet neglect model comparison: 8× target
**14 November 2026 · Draft policy research only · GK approval required · No live penalties**

## Decision summary

Recommend the **Aggressive** curve for a future shadow-mode trial:

**daily debit = 22 Care Standing units × missed required-care fraction × min(8, 2 + consecutive incomplete days - 1)**

The parenthetical gives multipliers **2×, 3×, 4×, 5×, 6×, 7×, 8×** on days 1–7 and stays at 8× thereafter. The 22-unit basis is not an invented daily earning estimate: it is the current configured base Pet XP of one accepted Feed (6), Play (10), and Clean (6). Care Standing is a separate, reversible balance; it never subtracts permanent Pet XP.

Cap account debt at **35 bases = 770 Care Standing units**, exactly the Aggressive curve's cumulative full-neglect debit through day 7. At the cap, future server-authoritative Pet XP awards are temporarily reduced by at most 25%; the withheld amount pays debt down one-for-one. A fully completed Feed/Play/Clean set also pays down 22 units and resets the incomplete-care streak. The reduction tapers linearly from 25% at the cap to 10% near zero debt, then becomes 0% at zero.

This is stronger than the previous 2× proposal but bounded. Day 1 is 44 units, twice the entire required care set. Day 7 is 176 units. Day 8 does not create permanent or unbounded damage: the multiplier stays at 8×, debt remains capped, and the existing authoritative condition decay continues to create a visible care consequence.

## Source-backed XP economy

All figures below come from current Worker code and are regression-checked by scripts/moonpet-neglect-simulator.test.mjs.

| Source | Configured Pet XP | Important limit |
| --- | ---: | --- |
| Feed / Play / Clean | 6 / 10 / 6 | 45-second action cooldown; accepted receipt only |
| Sleep / Train | 5 / 20 | 45-second action cooldown; state and energy gates apply |
| Energy Drink / Dance / Cuddles | 0 / 0 / 0 | 10/5/5-minute cooldowns; 3/5/5 uses per UTC day |
| Daily Cache | up to 40 | Once per UTC day and remaining Pet XP allowance |
| Daily completion | 25 | Authoritative completed-objective receipt |
| Contract bonus | 20 | First 3 qualifying completions per account/UTC day |
| Timed Train / Work / Explore | up to 86 / 66 / 132 | 2/8/8-hour activity caps; only one active session |
| Jobs | 26–66 | Job-specific level/stage/cooldown rules |
| Event and Kaiju repeats | source-specific | Full rewards for first 6/5, half rewards through 10, then no repeat reward |
| All accepted Pet XP receipts | **1,200 maximum per account/UTC day** | Aggregate settlement cap; not a normal earning rate |

Equipment and variable game modes can change individual rewards, but the transaction records only the post-cap accepted amount. The specialist Care/Training/Adventure/Arena/Job/Bond track caps are separate progression-track limits, not extra Pet XP capacity.

The repository has no production cohort distribution from which to assert “typical” daily Pet XP. Calling 1,200 normal would be false. For reproducible recovery comparisons, the simulator therefore uses three **achievable configured bundles**, not behavioral averages:

| Workload reference | Calculation | Pet XP/day |
| --- | --- | ---: |
| Casual reference | required care set 22 + Daily Cache 40 | 62 |
| Regular reference | all five direct actions 47 + Daily Cache 40 | 87 |
| Dedicated fixed reference | regular 87 + daily completion 25 + three contract bonuses 60 | 172 |

Actual casual/regular/dedicated medians still require an anonymized accepted-receipt query that includes zero-activity accounts. Variable adventures, jobs, equipment and combat are intentionally excluded from these fixed bundles.

The permanent visible-level curve requires 640/14,440/46,240/77,440/96,040 Pet XP for Levels 5/20/35/45/50 and 392,040 for Level 100. Legendary also requires minimum age **365 days**, **240 Growth Marks**, **44 Weekly Crests**, Level 50, 15 Alley King victories, 10 relics and materials. No candidate model removes or rewrites any of those earned records.

## Compared escalation curves

| Model | Day 1 | Day 2 | Day 3 | Day 4 | Day 5 | Day 6 | Day 7+ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Moderate | 2× | 2.333× | 2.667× | 3× | 3.333× | 3.667× | 4× |
| **Aggressive** | **2×** | **3×** | **4×** | **5×** | **6×** | **7×** | **8×** |
| Severe | 3× | 4.167× | 5.333× | 6.5× | 7.667× | 8.833× | 10× |

Each result below is raw debit / bounded ending debt in Care Standing units. Partial care is exactly proportional. “1/3 care” means two required actions were missed; it does **not** reset the streak.

| Model | Days | 0/3 care | 1/3 care | 2/3 care |
| --- | ---: | ---: | ---: | ---: |
| Moderate | 1 | 44 / 44 | 29.33 / 29.33 | 14.67 / 14.67 |
| Moderate | 3 | 154 / 154 | 102.67 / 102.67 | 51.33 / 51.33 |
| Moderate | 7 | 462 / 462 | 308 / 308 | 154 / 154 |
| Moderate | 14 | 1,078 / 770 | 718.67 / 718.67 | 359.33 / 359.33 |
| Moderate | 30 | 2,486 / 770 | 1,657.33 / 770 | 828.67 / 770 |
| Moderate | 90 | 7,766 / 770 | 5,177.33 / 770 | 2,588.67 / 770 |
| Moderate | 365 | 31,966 / 770 | 21,310.67 / 770 | 10,655.33 / 770 |
| Aggressive | 1 | 44 / 44 | 29.33 / 29.33 | 14.67 / 14.67 |
| Aggressive | 3 | 198 / 198 | 132 / 132 | 66 / 66 |
| Aggressive | 7 | 770 / 770 | 513.33 / 513.33 | 256.67 / 256.67 |
| Aggressive | 14 | 2,002 / 770 | 1,334.67 / 770 | 667.33 / 667.33 |
| Aggressive | 30 | 4,818 / 770 | 3,212 / 770 | 1,606 / 770 |
| Aggressive | 90 | 15,378 / 770 | 10,252 / 770 | 5,126 / 770 |
| Aggressive | 365 | 63,778 / 770 | 42,518.67 / 770 | 21,259.33 / 770 |
| Severe | 1 | 66 / 66 | 44 / 44 | 22 / 22 |
| Severe | 3 | 275 / 275 | 183.33 / 183.33 | 91.67 / 91.67 |
| Severe | 7 | 1,001 / 770 | 667.33 / 667.33 | 333.67 / 333.67 |
| Severe | 14 | 2,541 / 770 | 1,694 / 770 | 847 / 770 |
| Severe | 30 | 6,061 / 770 | 4,040.67 / 770 | 2,020.33 / 770 |
| Severe | 90 | 19,261 / 770 | 12,840.67 / 770 | 6,420.33 / 770 |
| Severe | 365 | 79,761 / 770 | 53,174 / 770 | 26,587 / 770 |

The uncapped column exposes long-absence risk; it is never the proposed collectible balance. Moderate remains too forgiving at one week. Severe reaches the common debt cap before day 7 and imposes a 66-unit first-day debit, so it adds early shock without improving the bounded long-absence outcome. Aggressive best matches the requested 8× target and fills the cap exactly on day 7.

## Returning-player recovery

After seven completely missed days, a player must complete the full required care set every recovery day. The fixed 22-unit care credit and the temporary reward reduction both pay debt down. Values are deterministic simulator results.

| Model | Starting debt | 62 XP reference | 87 XP reference | 172 XP reference |
| --- | ---: | ---: | ---: | ---: |
| Moderate | 462 | 15 days; 136.02 XP withheld | 14 days; 175.84 withheld | 10 days; 251.31 withheld |
| Aggressive | 770 | **24 days; 257.39 XP withheld** | **21 days; 316.55 withheld** | **15 days; 446.42 withheld** |
| Severe | 770 | 24 days; 257.39 XP withheld | 21 days; 316.55 withheld | 15 days; 446.42 withheld |

This is deliberately earned recovery, but it remains finite. Even if the required actions produce zero gross award because the existing daily cap is already exhausted, the 22-unit care credit clears the maximum balance in 35 days. More active players clear it sooner because withheld future XP is converted to debt repayment. No previously settled XP is removed.

## Grinding, disappearance and repeated cycles

The exploit scenario runs 12 cycles of three complete-care earning days followed by four no-care days (84 calendar days). Pre-earned XP cannot prepay future attendance.

| Model | XP withheld at 62/day | XP withheld at 87/day | XP withheld at 172/day | Ending debt |
| --- | ---: | ---: | ---: | ---: |
| Moderate | 442.57 | 611.58 | 1,103.12 | 770 |
| Aggressive | **469.64** | **653.93** | **1,258.11** | **770** |
| Severe | 482.85 | 673.55 | 1,305.14 | 770 |

Under Aggressive, the 172-XP reference earns 6,192 gross XP on its 36 active days but receives 4,933.89 while debt exists; 1,258.11 is diverted to recovery and the account still ends at the cap. Grinding first therefore preserves already-earned XP but cannot erase the future gameplay disadvantage of repeated abandonment.

## 365-day progression effect

For a single seven-day absence at the start of a 365-day window, followed by full care, the year simulation separates XP not earned during absence from the additional policy reduction.

| Model | Reference | Missed-play XP | Policy withholding | Total gap vs 365 active days | Active-day equivalent |
| --- | --- | ---: | ---: | ---: | ---: |
| Moderate | 62/day | 434 | 136.02 | 570.02 | 9.19 days |
| Moderate | 87/day | 609 | 175.84 | 784.84 | 9.02 days |
| Moderate | 172/day | 1,204 | 251.31 | 1,455.31 | 8.46 days |
| Aggressive | 62/day | 434 | **257.40** | 691.40 | 11.15 days |
| Aggressive | 87/day | 609 | **316.55** | 925.55 | 10.64 days |
| Aggressive | 172/day | 1,204 | **446.42** | 1,650.42 | 9.60 days |
| Severe | 62/day | 434 | 257.40 | 691.40 | 11.15 days |
| Severe | 87/day | 609 | 316.55 | 925.55 | 10.64 days |
| Severe | 172/day | 1,204 | 446.42 | 1,650.42 | 9.60 days |

All three end with zero debt after sustained recovery. Aggressive adds roughly 2.6–4.2 active-day equivalents beyond the seven days of missed earning, depending on the source bundle. It cannot grant age, Marks or Crests and cannot bypass the 365-day lifecycle. Because the final evolution requires 96,040 XP plus non-XP gates, live cohort modelling is still required before choosing a launch value.

## Condition and multiple permanent pets

Condition already supplies the extended-neglect consequence. Starting from pristine bars and applying the current server formula with no care, one day yields hunger 100, happiness 32.8, cleanliness 23.2, energy 47.2 and derived health 26; three days yields health 0. The proposed policy should reuse this authoritative decay and Next Best Action urgent-vitals guidance, not create a second permanent injury system.

Care Standing is account-scoped. Simulations with 1, 2 and 5 pets produce the same maximum 770 debt; naïvely charging each pet would multiply raw liability by 2× or 5× and is rejected. The once-daily Feed/Play/Clean evidence should be locked to one immutable eligible source pet/day. Other owned pets continue their existing individual condition decay, but the account is not charged multiple financial penalties.

## Anti-exploit and fairness requirements

- One Feed is only 1/3 attendance: the next day's missed fraction is 66.67%, the streak advances, and the Aggressive day-2 debit is 44 units. Only all three distinct accepted action receipts reset escalation.
- Duplicate/idempotent receipts, notification opens, mission claims, optional purchases and client state cannot count as care.
- Telegram opt-out changes delivery only. The simulator proves identical debt and streak results with reminders enabled or disabled.
- Grinding cannot bank attendance. Only receipts in that UTC care day count; pre-earned XP, Marks and Crests remain permanent.
- Pet switching cannot move evidence between pets or days. One account/day settlement receipt and policy version must make cron retries idempotent.
- Known Worker/D1 outages, unhatched pets, ownership gaps and server-declared impossible actions require explicit eligibility exclusions. A player must not be charged for a care set the authoritative UI could not complete.
- Future reduction must be computed inside the existing server-authoritative atomic reward transaction. The existing 1,200 cap must consume the **gross post-cap entitlement before withholding**, so debt cannot create extra farming headroom.
- Integer rounding must use a cumulative withheld target or stored fractional remainder. Flooring every small receipt independently would let players split rewards to evade reduction.
- Debt settlement and recovery need unique event/day keys, immutable source attribution, atomic balance updates and replay tests. No module-level request state or detached promise may hold authoritative balance.

## Integration with existing guidance

The current Next Best Action prioritizes saved-state recovery, active runs, urgent vitals, eligible care and missions. A future read-only Care Standing card should consume the same eligibility decisions, show the first missing Feed/Play/Clean action, and route through the existing Daily/Weekly Journey UI. A reminder, displayed plan or opened mission remains advisory; the accepted server receipt is attendance.

When debt exists, the guidance order should be: recover an interrupted authoritative state; address critical vitals; complete the missing required care action; then show debt/reward-reduction status and ordinary missions. This avoids suggesting blocked actions and makes recovery understandable without turning Telegram into a requirement.

## Approval boundary

GK approval is required for the 22-unit basis, Aggressive curve, 770 cap, 10–25% future-XP reduction, 22-unit full-care credit, eligibility/exemption rules, source-pet attribution, UI copy, shadow duration and rollback criteria. Before approval, query anonymized accepted-receipt cohorts and simulate real zero-inclusive distributions.

This draft adds only documentation, a standalone simulator and tests. It does **not** add a D1 schema, run a migration, alter the Worker reward path, schedule a settlement job, send a notification, deduct XP, activate a feature flag, deploy or merge.
