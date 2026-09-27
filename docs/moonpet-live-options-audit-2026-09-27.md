# Moonpet playable-choice audit — 27 September 2026

Base: merged PR #1340, `e44bcff8573af57302c197f941b13cfc7ce8cd3f`.
Verification uses isolated SQLite accounts and real Worker handlers. No live
player account was modified and no production deployment was performed.

## Confirmed defect and repair

Standard Moon Run Trade and paid Street Event choices looked playable even
when the account could not afford any rolled cost. Selecting one reached an
authoritative payment rejection. Play Now and bounty navigation also treated
any Street Event with choices as playable, without inspecting payment gates.
A new regression failed on the previous code because a zero/low-wallet preview
had no availability information. A SQLite regression also confirms the real
run handler rejects the choice with `insufficient_run_cost`.

The Worker now projects three currency states for each standard-run, event and
adventure choice. The client uses these projections in the corresponding buttons:

| State | Meaning | Player behavior |
| --- | --- | --- |
| Available | Wallet covers every possible currency cost | Choice remains enabled |
| Conditional | At least one outcome/cost roll is affordable, others exceed the wallet | Choice remains enabled with balance and maximum-cost warning |
| Unavailable | No possible outcome can be paid | Choice shows resource requirements and is disabled |

Every nonzero-probability outcome is considered independently, including
setbacks with cheaper or different currency costs. Future rewards and an
unbanked run bag cannot fund the choice. Standard-run previews use the current
account wallet even when the run belongs to a different selected pet; risk and
equipment continue to use the original run pet. Pet stat costs are clamped by
the existing server rules and are not converted into new entry requirements.

Free alternatives remain enabled. Street Event suggestions disappear only
when every choice is explicitly unavailable. Older snapshots without these
fields retain their previous behavior. Official Daily Run choices have no
wallet charge and keep their own score/tactics previews. All authoritative
payment, reward, randomness, cooldown and progression rules are unchanged.

## Sanity audit coverage

| Area | Result and continuing options |
| --- | --- |
| Action wiring | Existing Mini App dispatch/parity tests plus the literal-button audit cover backend routes; all six mobile screens are exercised |
| Care and jobs | Existing tests cover all care cooldowns, busy activities, specialist gates, job cooldowns and concurrency; jobs have no energy payment gate |
| Standard Moon Runs | Original-pet energy, equipment and extraction rules retained; per-choice account-wallet readiness repaired |
| Official Daily Run | One account attempt per UTC day, original-pet evidence, tactics and exhausted-attempt labels retained; 10,000-run simulation and authority tests pass |
| Daily missions / Journey | Existing accepted-action credit, three-of-five Journey qualification, UTC reset and interrupted award recovery tests pass |
| Weekly Journey / Boss | Existing all-five-objective qualification, two-day cache requirement, boss choices, threshold-crossing dates and source-backed recovery queue tests pass |
| Season rewards / completion | Existing tier claims, source-pet ownership, historical awards, completion gates and settlement recovery tests pass |
| Repeatable Contracts | 4,320 simulated runs cover all 108 setups, builds, paths, drafts, field choices, rank goals and saved runs; play continues after daily bonus slots are used |
| Practice | Unlimited local runs remain available, including during energy/cooldown waits; no official quest/reward credit is claimed |
| Economy / activities / combat | Existing expedition, trade, cache, market, crafting, activity, Arena and Kaiju authority/concurrency tests pass |

Daily and weekly targets still have their intended reset windows. Repeatable
Contracts and Practice provide play between those windows. This patch does not
turn capped rewards into unlimited rewards or invent quest credit for them.

## Verification and limits

Focused tests cover zero, minimum and maximum balances; all three currencies;
multiple possible outcomes; zero/100-percent setback probability; free routes;
future-reward exclusion; switched pets; and navigation readiness. Mobile checks
use the real Worker/SQLite state at 390×844 and 360×640 and compare paid run/event
buttons with the wallet and exact signed encounter rendered in the browser. Screenshots inspect
the disabled Trade explanation while other room choices stay enabled.

Local Worker/API, Arcade, Wiki and WAX suites pass. The PR records the final
mobile, GitHub Visual CI and repository-gate results. These tests establish code
behavior, not measured retention, all historical account states, every physical
device or successful live human matchmaking. Currency may change after a
snapshot, so the server still validates payment at action time. Conditional
choices can still be rejected when their random cost exceeds the balance; the
UI now says so before selection. Persistent outages remain errors.

## Rollout

Deploy the Worker and updated Pages assets after GK approval and merge. Cache
token: `20260927-live-options-v1`. No new D1 migration or VPS restart is required;
existing Journey and Contracts migrations remain prerequisites. Check the
merged commit through `/deployment-info`, reopen the Mini App, inspect a paid
choice at low balance, then add currency through an ordinary accepted action
and verify the refreshed choice. Confirm free routes, Contracts, Daily Journey,
Weekly Journey and season claim navigation still work. GK approval is required
before production merge or deployment.
