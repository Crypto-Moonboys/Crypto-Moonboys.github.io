# Moonpet gameplay, recovery and leaderboard audit — 2026-09-28

Baseline: merged and deployed `9ea0b6e8f2a1cb2ecba7c00dd5f1d08f68f26cde` (#1364).
The audit follows the earlier cooldown, wrong-source reward, interrupted ending,
false-empty state and D1-limit bugs into current gameplay. It uses isolated
SQLite fixtures, actual Mini App dispatch, browser flows and read-only public
production endpoints. It does not inspect or play every private account.

## Confirmed defects fixed

| Defect | Result of the repair |
| --- | --- |
| Arena/Kaiju database failures are interpreted as no match, queue or result | Required reads now fail into the existing retry path. The client retains its previous state; failed guards cannot permit another match. Failed Kaiju queue writes cannot report a successful join. |
| An Arena move remains locked after a CPU move or round write fails | Replays keep the original move and finish its missing work. Round outcome, HP, turn advancement and terminal status commit together. Refresh can repair saved moves, including older partially saved rounds. |
| Arena terminal payout fails, but subsequent actions reject the completed battle | Owned action retries and bounded refresh recovery deliver the original participant's reward through the existing idempotent authority. Switching pets cannot redirect it. Public XP/activity receives one accepted receipt. |
| A failed matchmaking response requeues players already attached to a saved match | Recovery checks committed Mini App matches before restoring queue entries; unrelated Telegram chats cannot consume a Mini App queue claim. Kaiju matchmaking saves both participants in its initial insert, preventing an orphan host when the join write is interrupted. |
| A delayed Arena round can overwrite a concurrent forfeit | Terminal outcomes are committed atomically and round updates require the same active turn. A delayed write cannot replace the settled winner, HP or reward. |

Arena recovery uses a rotating cursor, one battle per refresh, so an older
unrecoverable source cannot starve a later valid payout. Missing source-pet
authority is never replaced with the currently selected pet. When combat repair
runs, runtime recovery uses six source slots instead of twenty to leave room for
both participants' awards. Remaining sources continue on subsequent refreshes.

## Gameplay coverage

The current dispatch and executable suites cover these paths. Existing mission
design and reward limits are preserved.

| Surface | Ending and reward contract checked |
| --- | --- |
| Roster, egg and care | Owned slots, hatch/evolution gates, switching, care cooldowns, busy/energy gates, shared wallet and per-pet progression. |
| Daily checklist | Seven goals and durable 7/7 claim; once per UTC day, including interrupted payout recovery. |
| Daily Journey and Cache | Qualified objective evidence, Growth Mark, accepted receipt, claimed/reset display and retry behavior. |
| Weekly Journey and Boss | Five objectives, distinct check-in days, threshold earning dates, one Crest, saved boss damage/victory and original-pet rewards. |
| Standard Run | Choices, extraction/failure, 100-room ending, source gear/mastery, concurrent rewards and retained-pet recovery. |
| Official Daily Run | Ten rooms, Alley King, saved tactics and condition, one official daily attempt, start/room/ending repair and records. |
| Continuing Contracts | Repeatable six/ten-room goals, drafts, end boss, saved choices/reload, records and bounded rewards. |
| Season progression and finale | Growth Marks/Crests, XP claims, final evolution/completion, Signal Sovereign builds/turns, defeat/free retry, victory and once-per-pet/season payout. |
| Other options | Timed activities/jobs, story and district choices, raids, trade, bounties, expeditions, market, crafting/materials, gear, relics and combat. |
| Website synchronization | Shared leaderboard projection; daily/weekly settlement windows, source-season XP, retained-pet all-time XP, run depth, activity identity and public privacy. |

Practice is local and does not award official XP. Unimplemented expansion systems
remain locked; cosmetic collection does not imply an implemented equip feature.
Pet XP, Community XP, Arcade XP, Contract Rank and Journey currency have separate
authorities. Public activity displays supported accepted receipts, not every
button click. The website entity graph follows wiki content rather than Pet XP.

## Verification

- 26 new SQLite regressions/control cases cover read/write faults, saved moves,
  atomic settlement, concurrent forfeit, foreign owners, switched pets,
  matchmaking recovery, cursor fairness and public payout visibility. All pass.
- Expanded the real HTTP D1 compiler regression from six selected queries to all
  more than 240 captured statements across state, care, pet switching, Arena and Kaiju.
  SQLite enforces compound SELECT limit 5, parameter limit 100 and function
  argument limit 32, with a failing six-term control.
- Mixed care backlog and combat recovery peaks at 587 SQL statements for a
  two-player ending, below the existing 600-statement test budget. Normal warm
  state retains its 180-statement regression limit.
- Full repository validation status is recorded in the PR handoff. Mobile browser
  loops cover 390×844 and 360×640, including all six screens, new completion
  features, bosses, saved endings, reward retries and activity options.
- Live Worker health, all five Pet leaderboard periods and activity return 200.
  Deployment provenance matches the baseline above. Graph/Pets verification
  passes with 327 wiki nodes and 1,629 edges, with full/mobile graph agreement.

No authenticated production actions or D1 mutations were performed. Historical
combat rows without provable source ownership remain unpaid rather than assigning
rewards to a guessed pet. Private-account and live fault recovery need a manual
post-deployment check.

## Release

Worker deployment required; no new migration, frontend deployment or VPS restart.
After GK approves the merge, update the checkout and run:

```text
npm ci
node scripts/deploy-worker-with-provenance.mjs moonboys-api
```

Check `/deployment-info`, refresh the Mini App, play one Arena turn and one Kaiju
match, verify queue/result continuity, then compare earned XP/activity on the
website. This audit does not merge or deploy production.
