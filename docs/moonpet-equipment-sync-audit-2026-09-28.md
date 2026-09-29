# Moonpet equipment and public synchronization audit — 28 September 2026

> Historical audit: findings describe the build tested below. Later releases added
> the daily 7/7 bonus, Signal Sovereign finale, rewarded Practice, cosmetic
> equipment and relic effects. See [current rules](moonpet-source-of-truth.md) and
> the [reconciliation tracker](moonpet-reconciliation-2026-09-29.md). Historical XP
> discrepancies are not presumed repaired.

Base: merged PR #1351, `781afee30cc30bc20411995aaf098a86024a8d43`.
The production `/deployment-info` endpoint matched this commit, deployed at
`2026-09-28T03:20:30.950Z`. No production player account was changed.

## Reproduced faults and fixes

- Mini App and ordinary Telegram shop purchases equipped and charged for gear
  without creating its equipment progression row. Registration now commits in
  the same transaction as the accepted purchase. A failed registration rolls
  back the debit and equip. Authenticated state and the gear command also restore
  missing rows from owned pets and accepted purchase receipts without another
  charge. Earlier purchased gear remains registered after it is replaced.
- Specialist awards calculated equipment mastery but never persisted it. A
  qualifying use now writes one item XP and one mastery XP using the existing
  mastery-action registry, with generic care/run and timed-action aliases.
  Standard Run recovery retains the saved room choice for fight/sneak/rest/boss
  equipment use while keeping the original ten Adventure XP step award.
  Equipment receipts, counters, mastery tiers, specialist XP, traits and any
  material award commit together. Retrying the same source cannot pay twice.
  Paid upgrade levels remain authoritative; item XP does not bypass upgrade costs.
- Gear levels and mastery were displayed but ignored by the existing care,
  Standard Run and Arena formulas. Those established equipped-item bonuses now
  use the existing +8% per level and +3% per mastery tier multipliers. Level-one,
  zero-mastery behavior stays the same. Standard Run preview and resolution share
  the formula; Arena saves progression in its participant snapshot. Outfit and
  toy power contributions scale with paid levels and mastery alongside combat gear. Official
  Daily Run room balance remains governed by its fixed rules.
- Failed equipment or faction reads could silently close an incomplete specialist
  award. They now leave it uncredited for recovery. Training retains the faction
  bonus when the dependency becomes available.
- New primary care/job/run/reward receipts retain equipment snapshots. A later
  replacement, pet switch or refresh uses the source equipment. Immediate API
  and Telegram care/job awards also read the saved receipt through the recovery
  queue, so a purchase between primary settlement and follow-up cannot redirect mastery. Recovery of old
  receipts without a snapshot does not invent historical mastery. Already-paid
  specialist receipts are not replayed to manufacture missing historical gear XP.
- Arena completion and Kaiju victory specialist awards now use the source-backed
  recovery queue. A primary reward can stay paid while missing specialist
  progression is repaired once. Arena mastery uses its saved battle equipment.
- Completed equipment upgrades now appear in the public activity feed. They
  remain account inventory actions, add zero Pet/Community XP, and are not
  attributed to whichever pet happens to be active when somebody reads the feed.

## Gameplay and synchronization coverage

| Area | Current behavior checked |
| --- | --- |
| Care / jobs / cache / timed activities | Server gates and cooldowns; accepted receipts; original pet, day and equipment; interrupted settlement and replay |
| Seven daily missions / bounties | Accepted actions and upgrade receipts drive completion; claims retain their existing rewards; no extra all-seven completion bonus |
| Daily Journey | Three of five objectives award a Growth Mark; source recovery and UTC reset remain intact |
| Weekly Journey | All five objectives award a Crest; threshold-crossing dates and source-backed recovery remain intact |
| Official Daily Run | One account attempt per UTC day, ten rooms and Alley King; saved endings, extraction and failure paths |
| Standard Run | Up to 100 rooms; gear-aware previews and outcomes, extraction, final settlement and source-pet authority |
| Contracts / Practice | Six-/ten-room saved Contracts with endings, rank and bounded daily Pet XP; unlimited local Practice with no official rewards |
| Weekly Boss / raids / stories / districts | Existing attempts, choices, boss endings, rewards and recovery; no new reward amounts or cooldown bypasses |
| Season | Existing tier claims and final evolution plus 60 Marks / 10 Crests; no separate season-final boss |
| Gear | Purchase → ownership → action use → mastery → paid upgrade → actual bonuses; rollback, replacement and replay cases |
| Leaderboards / activity | Pet daily/weekly/seasonal/all-time totals, separate Community XP, source-pet display; upgrade activity without ranking inflation |

These checks use code tracing, local SQLite integration/fault injection and the
repository regression suites. They do not establish that every production
account's historical data has been inspected.

## Graph relationship

The public live verifier passed: 327 canonical wiki nodes and 1,629 edges, with
matching full/mobile graph data. The wiki graph reads generated wiki data.
`games/leaderboard.html` passes its selected Arcade entry to
`js/arcade-graph.js:setPlayerState`. Moonpet Pet XP, specialist XP and gear mastery
are not inputs to either graph. This patch does not manufacture that connection.

## Verification

- `node --test scripts/moonpet-progression-sync.test.mjs`: 79 passed, including
  25 new integration and fault-injection cases. All ten review regressions fail
  on the previous runtime and pass after the three review fixes.
- Worker, Arcade, Wiki and WAX suites passed on the runtime changes. The final
  complete `npm test` run and CI results are recorded in the PR.
- Moonpet browser loop passed at 390×844 and 360×640; public ranks/activity passed
  at 360, 390 and 1280px.
- The first full run exposed another avatar test reading an ARIA announcement
  before its scheduled animation frame. The two failure-announcement checks now
  await their expected text and retain the original assertions; avatar runtime
  code is unchanged.
- The focused per-pet fixture now includes the real equipment migration because
  gameplay profile reads consult equipment progression. No assertion was removed.
- `node scripts/live-graph-pets-verify.mjs`: production read-only check passed.

## Boundaries and deployment

Equipment remains account inventory; specialist XP remains per pet/season.
The mastery-action registry controls which equipped item gains use credit.
Legacy records without equipment evidence are not guessed. Daily caps, reward
amounts for bosses/quests, auth and season completion requirements are unchanged.
Upgrade effects now work, so upgraded pets can receive larger existing equipment
bonuses within the existing caps; this is an intentional gameplay correction.

After GK merges, deploy `moonboys-api` from clean merged main with
`node scripts/deploy-worker-with-provenance.mjs moonboys-api`.
No new D1 migration, frontend cache bump or VPS restart is required.
Verify `/deployment-info`, then reopen the Mini App, inspect owned gear, perform a
qualifying action and check its mastery plus public rankings/activity.

Backup: `codex/backup-moonpet-sync-audit-20260928-032200`.
Sandbox: `codex/sandbox-moonpet-sync-audit-20260928-032200`.
GK approval is required before final merge or production deployment.
