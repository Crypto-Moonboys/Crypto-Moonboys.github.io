# Moonpet Relic Vault and state-refresh repair

Base: `0385a8d67ec8e84cc95d527c22357fc82a39f5d7` (PR #1354).

## Changes

- Relic Vault reads the existing `unlocked_at` column, retaining the API's `acquired_at` name as an alias. Account filtering is unchanged. A failed read returns `relics_available: false` and the UI explicitly says the vault is temporarily unavailable; it no longer presents an outage as an empty collection.
- Guidance notices are inserted with one prepared statement using bound JSON. Existing and already-shown notices remain unchanged.
- Achievement synchronization uses one prepared upsert for all definitions. The original owner/pet/season guards and monotonic progress remain in SQL. Unchanged rows are no longer rewritten on every refresh; unlock and update timestamps remain stable.
- State recovery has centrally defined source-record quotas for each queue: two Standard endings, one final Daily ending, one early Daily ending, twenty specialist sources, two Weekly Boss finishes, twenty Journey source events, and two awards for each of Daily and Weekly Journey. Quotas are reserved by queue, so a care backlog cannot take a boss or run queue's allowance.
- Historical care evidence is rebuilt before the bounded Daily award pass, avoiding a repeated Growth Mark finalization attempt for every care event. Direct gameplay still finalizes its own evidence immediately. Weekly recovery retains its existing check that all missing source evidence for the earning week has been repaired before fixing the original qualification date.
- Daily final-ending and early-ending queues persist separate account cursors in the existing `telegram_settings` table. Each query wraps around pending sources after the last attempted day/run. A compare-and-set advances the cursor before settlement, including failures or interruptions, so one broken source cannot monopolize a one-record allowance. An overlapping refresh with a stale cursor yields. Failed sources remain pending and are retried after wraparound; the cursor is scheduling data, never proof of reward completion.
- Recovery always finishes each existing atomic/idempotent repair. It does not interrupt a transaction at a SQL-count cutoff. Remaining source records stay eligible for later state requests; no guessed completion marker, migration or reward deletion is introduced.

Limits constrain source records, not an exact universal SQL count. A recovered boss/run can perform additional bounded work. Direct action/retry paths retain their existing recovery defaults. This change does not alter gameplay costs, cooldowns, reward amounts or XP caps.

## Measurements

Same isolated SQLite account and fixture before/after, with every executed statement counted, including statements inside batches:

| Scenario | Before | After |
| --- | ---: | ---: |
| First state request | 201 | 174 |
| Warm state request | 196 | 169 |
| 50-source backlog, refresh 1 | 1,017 | 549 |
| 50-source backlog, refresh 2 | 317 | 549 |
| 50-source backlog, refresh 3 | 257 | 359 |
| Total to drain that backlog | 1,591 | 1,457 |

The first backlog response drops by 46%; warm responses drop by 14%. Both versions finish this fixture in three refreshes. Binding calls on its first refresh drop from 623 to 363; total binding calls across the three requests drop from 1,039 to 989. These are local work counts, not claimed production response-time improvements.

The Daily fairness follow-up adds one cursor write per attempted Daily source (at most two on the state path), with no writes when those queues are empty. Cursor reads join the existing candidate queries, so the warm-state and care-backlog fixture counts above are unchanged.

## Regression coverage

- Full state response returns owned relics in timestamp order, excludes another account, identifies a transient read outage, and restores the same collection afterward.
- Mobile UI checks show an owned relic, an outage message, and the recovered relic at both supported test sizes.
- Warm state has a SQL budget assertion; unchanged achievement rows/timestamps survive repeated and overlapping requests, while accepted gameplay still advances achievements.
- One hundred guidance notices stay below D1's bound-parameter limit, insert once, and do not reappear after delivery.
- Fifty saved sources drain across bounded refreshes, an injected evidence-write failure and a pet switch. Source XP/receipts, original pet attribution and daily specialist caps remain intact.
- Existing Journey regressions retain original earning dates, season rollover, invalid-source exclusion, interrupted Mark/Crest settlement and eventual completion across multiple refreshes. Queue-size expectations now reflect the explicit smaller state allowance.
- Both Daily queues are tested through the full state path with two continuously failing older runs and a valid newer run, fresh D1 wrappers, forced overlapping selections and eventual retry after the faults clear. Newer records settle within three refreshes while failures persist; failed records then settle once, with no duplicate receipts/XP or cross-account cursor changes.
- Real HTTP state/action requests compile both recovery statements, both bulk writes and the relic query under D1-compatible compound-SELECT, parameter and SQL-function argument limits.

Final local and GitHub CI results are recorded in the PR.

## Deployment

Deploy `moonboys-api` after merging and allow GitHub Pages to publish the updated UI/cache version. No D1 migration or VPS restart is needed. Reopen the Mini App, inspect an account's earned relics, then verify normal care/quest actions and any saved reward recovery. No production account was inspected or modified during implementation.
