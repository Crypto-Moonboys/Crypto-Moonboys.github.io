# Moonpet 8× neglect economy stress test
**14 November 2026 · Draft simulator findings only · GK approval required · No live penalties**

## Outcome

The current 25% model **fails one mandatory recovery threshold in its original form**. Because withheld future XP also paid Care Standing debt, a player earning the 1,200 daily cap cleared a seven-day neglect balance in only **4 days**, while the 62/87/172-XP references took 24/21/15 days. Raising the withholding percentage made the high earner escape even faster.

The revised candidate fixes the exploit by separating the two effects:

- Daily debit remains **22 × missed required-care fraction × min(8, streak + 1)**.
- Full neglect still reaches 8× on day 7 and creates 770 Care Standing units.
- Prolonged neglect is bounded at **1,540 units**; it never grows indefinitely.
- Future Pet XP is reduced from 10% up to a maximum of **25%** while standing exists.
- Withheld XP is a temporary progression consequence but **does not repay standing**.
- Only a complete accepted Feed/Play/Clean set repays **44 standing units** and resets escalation.
- Seven-day debt therefore takes **18 genuine full-care days at every earning rate**.
- Maximum debt takes **35 full-care days**. No previous XP or milestone is removed.

Twenty-five percent is the lowest tested maximum that meets the stated mathematical deterrence and 14–30-day seven-day-recovery thresholds after the recovery exploit is removed. The 40/50/65/75% options increase losses but do not improve recovery or any mandatory pass result, so they are not justified without production cohort evidence.

The 44-unit credit is exactly two 22-unit care bases. A one-base credit would require 35 days to clear a seven-day balance and fail the requested 14–30-day target; two bases clear it in 18 days without allowing higher XP earnings to shorten the process.

This is a recommendation for further shadow analysis only. Duplicate settlement, retry and backfill safety are not implemented and are correctly reported as **NOT TESTED**.

## Evidence boundaries

The fixed source-backed daily references remain:

| Reference | Pet XP/day | Meaning |
| --- | ---: | --- |
| Casual | 62 | Feed/Play/Clean plus Daily Cache |
| Regular | 87 | All five direct actions plus Daily Cache |
| Dedicated fixed | 172 | Regular bundle plus daily completion and three contract bonuses |
| Level-50 pace floor | 264 | Smallest whole daily average whose 365-day total exceeds 96,040 XP |
| Cap stress | 1,200 | Configured aggregate daily settlement ceiling, not a normal return |

The repository has no measured XP-per-minute distribution. The requested 30-minute and several-hour cases therefore use the transparent 62 and 172 fixed bundles as proxies; they are not claims about real hourly earnings. All behavioral conclusions remain provisional until zero-inclusive production cohorts are measured.

## Why the original recovery rule failed

| Seven-day return profile | Original recovery | Original XP withheld | Revised recovery | Revised XP withheld |
| --- | ---: | ---: | ---: | ---: |
| 62 XP/day | 24 days | 257.40 | 18 days | 197.69 |
| 87 XP/day | 21 days | 316.55 | 18 days | 277.41 |
| 172 XP/day | 15 days | 446.42 | 18 days | 548.43 |
| 1,200 XP/day | **4 days** | **704.00** | **18 days** | **3,826.29** |

The original system let grinding act as a recovery accelerator. The revised system makes recovery depend on care attendance, so extra XP cannot buy a shorter standing period. Higher earning still produces a larger proportional future-XP consequence, which keeps the cap-level case meaningful.

## Full withholding-rate comparison

All rows use the revised 1,540 cap and a seven-day absence. Each player starts recovery with 770 debt and clears it in 18 complete-care days. “Total disadvantage” is seven days of missed earning plus policy-specific withholding. Outstanding debt is zero at the end of every row.

| Maximum | Profile | Gross recovery XP | Policy XP withheld | Net recovery XP | Total disadvantage | Active-day equivalents |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 25% | 62 | 1,116 | 197.69 | 918.31 | 631.69 | 10.19 |
| 25% | 87 | 1,566 | 277.41 | 1,288.59 | 886.41 | 10.19 |
| 25% | 172 | 3,096 | 548.43 | 2,547.57 | 1,752.43 | 10.19 |
| 25% | 264 | 4,752 | 841.78 | 3,910.22 | 2,689.78 | 10.19 |
| 25% | 1,200 | 21,600 | 3,826.29 | 17,773.71 | 12,226.29 | 10.19 |
| 40% | 62 | 1,116 | 283.78 | 832.22 | 717.78 | 11.58 |
| 40% | 87 | 1,566 | 398.21 | 1,167.79 | 1,007.21 | 11.58 |
| 40% | 172 | 3,096 | 787.27 | 2,308.73 | 1,991.27 | 11.58 |
| 40% | 264 | 4,752 | 1,208.37 | 3,543.63 | 3,056.37 | 11.58 |
| 40% | 1,200 | 21,600 | 5,492.57 | 16,107.43 | 13,892.57 | 11.58 |
| 50% | 62 | 1,116 | 341.18 | 774.82 | 775.18 | 12.50 |
| 50% | 87 | 1,566 | 478.75 | 1,087.25 | 1,087.75 | 12.50 |
| 50% | 172 | 3,096 | 946.49 | 2,149.51 | 2,150.49 | 12.50 |
| 50% | 264 | 4,752 | 1,452.75 | 3,299.25 | 3,300.75 | 12.50 |
| 50% | 1,200 | 21,600 | 6,603.43 | 14,996.57 | 15,003.43 | 12.50 |
| 65% | 62 | 1,116 | 427.27 | 688.73 | 861.27 | 13.89 |
| 65% | 87 | 1,566 | 599.55 | 966.45 | 1,208.55 | 13.89 |
| 65% | 172 | 3,096 | 1,185.33 | 1,910.67 | 2,389.33 | 13.89 |
| 65% | 264 | 4,752 | 1,819.34 | 2,932.66 | 3,667.34 | 13.89 |
| 65% | 1,200 | 21,600 | 8,269.71 | 13,330.29 | 16,669.71 | 13.89 |
| 75% | 62 | 1,116 | 484.66 | 631.34 | 918.66 | 14.82 |
| 75% | 87 | 1,566 | 680.09 | 885.91 | 1,289.09 | 14.82 |
| 75% | 172 | 3,096 | 1,344.55 | 1,751.45 | 2,548.55 | 14.82 |
| 75% | 264 | 4,752 | 2,063.73 | 2,688.27 | 3,911.73 | 14.82 |
| 75% | 1,200 | 21,600 | 9,380.57 | 12,219.43 | 17,780.57 | 14.82 |

The effective disadvantage is proportional because each profile follows the same earning pattern. At 25%, the policy adds 3.19 active-day equivalents beyond the seven days not played. Higher rates add more loss but do not fix a remaining threshold failure. Selecting 40% solely because it is numerically larger would over-penalize legitimate returners without evidence.

## Debt-cap comparison

The seven-day Aggressive debit is 770 regardless of a higher cap, so cap choice does not change the seven-day result. It controls how prolonged absence differs from one week.

| Cap model | Resolved cap at 87/day | Day 7 debt / recovery | Day 14 debt / recovery | Day 30–180 debt / recovery |
| --- | ---: | ---: | ---: | ---: |
| Current | 770 | 770 / 18 days | 770 / 18 days | 770 / 18 days |
| **Recommended double** | **1,540** | **770 / 18 days** | **1,540 / 35 days** | **1,540 / 35 days** |
| Triple | 2,310 | 770 / 18 days | 2,002 / 46 days | 2,310 / 53 days |
| Dynamic | 770 | 770 / 18 days | 770 / 18 days | 770 / 18 days |

The dynamic formula is seven times recent daily XP, bounded to 770–2,310. It resolves to 770/770/1,204/1,848/2,310 for the 62/87/172/264/1,200 profiles. This creates a trailing-earnings manipulation target and unequal recovery for identical neglect, so it is rejected.

The 770 cap makes eight days and 180 days economically identical. The 2,310 cap requires as many as 53 care days and exceeds the desired recovery burden. The 1,540 cap distinguishes prolonged abandonment while remaining finite at 35 full-care days.

## Maximum-XP grind followed by 1–14 missed days

The initial 1,200 XP remains permanent as required. These are future consequences after return:

| Missed days | Starting debt | Full-care recovery days | Future XP withheld at 1,200/day |
| ---: | ---: | ---: | ---: |
| 1 | 44 | 1 | 130.29 |
| 2 | 110 | 3 | 406.29 |
| 3 | 198 | 5 | 728.57 |
| 4 | 308 | 7 | 1,128.00 |
| 5 | 440 | 10 | 1,765.71 |
| 6 | 594 | 14 | 2,688.00 |
| 7 | 770 | 18 | 3,826.29 |
| 8 | 946 | 22 | 5,026.29 |
| 9 | 1,122 | 26 | 6,226.29 |
| 10 | 1,298 | 30 | 7,426.29 |
| 11 | 1,474 | 34 | 8,626.29 |
| 12 | 1,540 | 35 | 9,013.71 |
| 13 | 1,540 | 35 | 9,013.71 |
| 14 | 1,540 | 35 | 9,013.71 |

Pre-neglect grinding cannot be confiscated, but it also cannot prepay attendance. Against an equal gross earning opportunity after return, every row receives less net XP than a consistently cared account.

## Strategy exploitation results

| Strategy | Gross XP | Policy XP withheld | Net XP | XP not earned while absent | Total disadvantage | Ending debt |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Three 172-XP days, seven absent, repeated for 365 days | 19,092 | 4,639.58 | 14,452.42 | 43,688 | 48,327.58 | 1,518 |
| Weekends only at 172 XP/day | 17,888 | 4,447.67 | 13,440.33 | 44,892 | 49,339.67 | 1,496 |
| One required action daily at 10 XP | 3,650 | 904.89 | 2,745.11 | 18,980 | 19,884.89 | 1,540 |
| Thirty 1,200-XP days, seven absent, thirty 87-XP return days | 38,610 | 277.41 | 38,332.59 | 0 versus 87/day calendar baseline | 277.41 | 0 |

The last row demonstrates the required permanent-XP boundary: the 36,000 XP earned before absence remains intact. Against another player with the same 38,610 gross opportunity, the neglecting player still receives 277.41 less. Comparing different attendance separately, the first three strategies also lose the XP they never attempted to earn.

One action per day never resets the streak: it remains at 365, debt stays capped, and the action's future reward remains reduced. Alternating among 1, 2 or 5 permanent pets produces the same account debt. Telegram reminders enabled or disabled also produce identical debt and streak results.

## Return horizons

Under the recommended fixed cap, earning rate changes the amount withheld but not the number of genuine care days:

| Absence | Starting debt | Recovery days | Withheld at 62/day | 87/day | 172/day | 264/day | 1,200/day |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 7 days | 770 | 18 | 197.69 | 277.41 | 548.43 | 841.78 | 3,826.29 |
| 14 days | 1,540 | 35 | 465.71 | 653.49 | 1,291.97 | 1,983.02 | 9,013.71 |
| 30 days | 1,540 | 35 | 465.71 | 653.49 | 1,291.97 | 1,983.02 | 9,013.71 |
| 90 days | 1,540 | 35 | 465.71 | 653.49 | 1,291.97 | 1,983.02 | 9,013.71 |
| 180 days | 1,540 | 35 | 465.71 | 653.49 | 1,291.97 | 1,983.02 | 9,013.71 |

The 35-day maximum is a deliberate bound: 180 days away is worse than seven days but not 13 times worse and never becomes unrecoverable.

## 365-day progression projections

| Profile | Consistent XP | XP after one seven-day absence | Missed-play XP | Policy-specific loss | Level 50 by day 365, consistent / absent |
| --- | ---: | ---: | ---: | ---: | --- |
| 62/day | 22,630 | 21,998.31 | 434 | 197.69 | No / No |
| 87/day | 31,755 | 30,868.59 | 609 | 277.41 | No / No |
| 172/day | 62,780 | 61,027.57 | 1,204 | 548.43 | No / No |
| 264/day | 96,360 | 93,670.22 | 1,848 | 841.78 | Yes / No |
| 1,200/day stress | 438,000 | 425,773.71 | 8,400 | 3,826.29 | Yes / Yes |

The 62/87/172 fixed bundles do not reach Level 50 even with perfect attendance; this is an existing economy fact, not a neglect-model effect. Real players need other variable source rewards. The 264/day row is intentionally the exact whole-number pace floor: any seven-day absence already drops it below 96,040 before policy withholding. The policy adds 3.19 active-day equivalents, for 10.19 total days of delay.

This does not make Legendary impossible. Pet life is permanent and has no day-365 deadline; the player can earn Level 50 later. The simulator grants no Growth Marks, Crests, boss wins, relics or materials and removes none. The authoritative 365-day minimum, 240 Marks and 44 Crests remain unchanged.

## Worst-case legitimate impact

- A player exactly on the 264/day Level-50 pace misses day-365 Level 50 after one absent week and needs about 10.19 additional active days. Seven of those days are the natural cost of not playing; 3.19 are policy-specific.
- A 1,200/day player loses 3,826.29 future XP after a missed week, but still clears in the same 18 full-care days as everyone else.
- A returning player at maximum 1,540 debt needs 35 care days. This exceeds the seven-day target window but is finite and applies only after roughly twelve or more consecutive incomplete days.
- The casual fixed bundle cannot prove day-365 Legendary even without penalties. Production distributions are required before judging real casual completion rates.

## Anti-exploit and runtime requirements

- Count three distinct accepted Feed/Play/Clean receipts on one immutable eligible source pet and UTC day. One action is only one-third care.
- Never count a notification, view, claim, duplicate receipt, optional purchase or client-side state.
- Debt is account-scoped; pet switching cannot move, duplicate or erase it.
- Reminder preferences affect delivery only.
- Settle each closed UTC day once with a policy-versioned unique key. Cron retries and recovery backfills must read the same settlement receipt.
- Known outages, failed writes, unhatched states and server-declared impossible care must be excluded before settlement.
- Apply future withholding inside the authoritative atomic reward transaction. Gross entitlement must still consume the existing 1,200 cap so withholding cannot create farming headroom.
- Use cumulative integer withholding or a stored fractional remainder; per-receipt flooring would enable reward-splitting.
- Existing Next Best Action and missions should show missing care, current multiplier, standing, withholding range and full-care days remaining.
- Player warnings should appear before UTC close and clearly state that Telegram opt-out does not change care requirements.

The simulator proves mathematical idempotence only. No D1 ledger, unique settlement constraint, concurrent Worker implementation, cron retry or backfill path exists in this PR. Those runtime protections are **NOT TESTED**.

## Mandatory success report

| Metric | Target | Actual | Result |
| --- | --- | --- | --- |
| Day-seven multiplier | Approximately 8× | 8× | PASS |
| Seven-day deterrence | Greater than seven routine-care days | 886.41 total vs 609 at the 87/day reference; 609 missed + 277.41 policy | **PROVISIONAL PASS** |
| Grind/neglect exploit | No advantage at equal playtime/opportunity | Repeated 3-on/7-off loses 4,639.58 additional XP at equal gross opportunity | **PROVISIONAL PASS** |
| Recovery from seven-day neglect | 14–30 consistent-care days | 18 days for 62, 87, 172, 264 and 1,200 XP/day | **PROVISIONAL PASS** |
| 365-day progression integrity | No irreversible damage | 0 earned XP or milestone records removed; delay only | **PROVISIONAL PASS** |
| Duplicate penalty protection | Zero duplicates | Runtime settlement does not exist | **NOT TESTED** |
| Reminder opt-out parity | Identical results | Identical 1,540 debt and streak in simulator | **PROVISIONAL PASS** |
| Multi-pet exploit protection | Zero account-penalty multiplication | Identical account debt for 1, 2 and 5 pets | **PROVISIONAL PASS** |

The results are provisional because the activity profiles are source bundles, not measured player distributions. The release gate is **NOT READY**: mandatory runtime duplicate protection is not implemented or tested, and production cohort evidence is unavailable.

## GK decision requested

For a future shadow-only design, approve or reject:

1. Aggressive 2×→8× escalation.
2. A fixed 1,540 account debt cap.
3. A 10–25% temporary future-XP reduction.
4. Withholding that does not repay Care Standing.
5. A 44-unit credit only for a complete Feed/Play/Clean day.
6. The eligibility, outage and source-pet rules above.
7. Read-only warnings and recovery guidance integrated with Next Best Action and missions.

Do not approve live activation from this PR. It contains only documentation, a standalone simulator and tests. It does not merge, deploy, migrate D1, schedule penalties, alter Worker rewards or activate any feature.
