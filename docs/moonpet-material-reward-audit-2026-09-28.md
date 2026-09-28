# Moonpet material rewards and public activity audit — 28 September 2026

Base: merged PR #1352, `c0f2cb00f14e7dc189c149b74839565eb479cda0`.
Production `/deployment-info` matched that commit and reported deployment at
`2026-09-28T04:09:18.640Z`. No production player account was inspected or changed.

## Findings and fixes

1. The specialist runtime had weighted material tables and an atomic inventory
   writer, but no live caller supplied a server-owned draw. Jobs, timed Work,
   run extraction, Arena completion, Kaiju victories and weekly/raid victories
   therefore never reached that configured material award.
   The Worker now derives one draw from the committed source receipt, owner and
   action. The source receipt ID is read from D1, never from request fields. A
   SHA-256 digest fixes the draw across retries, refresh, pet switches and API
   surfaces. Existing table weights remain unchanged. One material unit is
   awarded, subject to the existing 9,999 stack cap, in the same transaction as
   the specialist receipt, XP, traits and equipment mastery.
2. A failed timed-claim source lookup could still close the specialist award
   without its saved inputs. It now leaves the activity recoverable until the
   accepted receipt can be read. Material-write failures also leave the entire
   specialist award unpaid; the primary action is not repeated.
3. Material hints advertised routes such as individual run fights/loot rooms,
   an Arena daily claim and ordinary events that do not award those materials.
   The state now lists the actual district, expedition, market, Daily boss and
   raid routes. Weighted-draw source labels come from the same action/table
   mapping as settlement. A material listed as a draw is a possible result,
   not a guaranteed specific material.
4. Public activity omitted completed crafting and Style Lab purchases even
   though their completed receipts existed. The public read now includes them
   once alongside equipment upgrades. Pending, rejected and settling receipts
   stay hidden. Text describes crafting/collecting and adds no Pet or Community
   XP. These are account inventory actions, not the currently selected pet's
   achievement.

## Reward paths

| Accepted source | Existing table now reached | Frequency |
| --- | --- | --- |
| Pet job / timed Work claim | Scrap Metal 60%, Moon Fabric 30%, Spray Core 10% | One draw per accepted source |
| Standard or Daily early extraction | Crystal Shard 45%, Battery Cell 35%, Spray Core 15%, Kaiju Fragment 5% | One draw per accepted extraction |
| Weekly Boss / seasonal raid victory | Same run table | One draw per victory specialist receipt |
| Arena win, draw or loss | Arena Token 75%, Scrap Metal 20%, Crystal Shard 5% | One draw per completed participant reward |
| Kaiju victory | Kaiju Fragment 80%, Crystal Shard 15%, Spray Core 5% | One draw per accepted victory |

Ordinary Standard/Daily room steps still use their step progression; they do not
become extraction or weekly-boss awards. Daily boss materials remain their
existing primary rewards. Care, Practice, Contracts, defeats in Kaiju and
unaccepted actions do not receive a new draw. Existing cooldowns, costs, daily
limits and specialist caps remain in force. Material draws can still occur when
specialist XP is capped; the material stack cap remains authoritative.

Already-paid specialist receipts are not replayed for historical loot. A
recoverable unpaid specialist award can receive its one draw when its accepted
source receipt exists. Legacy records without a source receipt cannot receive
an invented draw. Full material stacks do not create a claim that can be reopened
later by spending inventory.

## Gameplay and synchronization coverage

| Area | Checked behavior / boundary |
| --- | --- |
| Care / jobs / timed activities | Server gates, cooldowns, source pet and date, primary receipts, specialist recovery and replay |
| Daily missions / bounties | Accepted action evidence, reset/claim behavior, existing seven missions; no extra all-seven bonus |
| Daily Journey | Three of five objectives for a Growth Mark |
| Weekly Journey | All five objectives for a Crest; original threshold-crossing dates and source recovery |
| Official Daily Run | One account attempt per UTC day, ten rooms and Alley King; extraction, failure and saved ending recovery |
| Standard Run | 100-room ending; choice-specific gear mastery, banked rewards and final-step recovery |
| Contracts / Practice | Six-/ten-room saved Contracts with rank and bounded daily XP; unlimited local Practice without official rewards |
| Weekly Boss / raids / districts / stories | Existing authored choices, endings, source-backed reward claims and recovery |
| Season | Tier claims and final evolution plus 60 Marks / 10 Crests; no separate season-final boss |
| Equipment / crafting / Style Lab | Shared inventory, paid upgrade effects, material use/caps, single settlement and completed public activity |
| Public rankings | Daily/weekly accepted Pet XP, seasonal XP, all-time owned-pet XP and separate Community XP; materials and collection actions do not inflate scores |

The checks combine source tracing, real SQLite transactions, fault injection and
the repository's Worker/browser regression suites. They are not a claim that
every production account's historical data has been examined.

## Website graph relationship

The read-only live verifier passed with 327 wiki nodes and 1,629 edges. Full and
mobile graph data agree. The wiki graph consumes canonical wiki data; the Arcade
graph consumes its selected Arcade leaderboard row. Moonpet materials, Pet XP and
specialist XP are not inputs to those graphs. No artificial link is introduced.

## Verification

- `node --test scripts/moonpet-progression-sync.test.mjs`: 93 tests passed,
  including 14 new cases plus stronger Daily extraction and client-roll rejection
  assertions. Covers deployed API requests, material failures, stable recovery,
  pet switching, canonical extraction keys, timed claims, Arena outcomes, Kaiju,
  weekly/seasonal bosses, stack caps, public activity and unchanged ranking XP.
- Complete `npm test` and final CI results are recorded in the PR.
- `node scripts/live-graph-pets-verify.mjs`: passed against production.
- Syntax and whitespace checks are recorded in the PR.

## Deployment

Worker deployment is required after GK merges:
`node scripts/deploy-worker-with-provenance.mjs moonboys-api` from clean merged main.
No new D1 migration, frontend cache bump or VPS restart is required.
Verify `/deployment-info` against merged HEAD, then reopen the Mini App. Complete
an eligible action, check one material draw and replay protection, craft an item,
and confirm its public activity entry without an XP increase.

Backup: `codex/backup-moonpet-game-audit-20260928-041200`.
Sandbox: `codex/sandbox-moonpet-game-audit-20260928-041200`.
GK approval is required before final merge or production deployment.
