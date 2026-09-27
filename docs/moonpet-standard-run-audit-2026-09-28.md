# Moonpet standard-run settlement audit — 28 September 2026

Base: merged PR #1345, `557ad401be80f9c151c1e8e059087c755bba330c`.
This follow-up audits the source and isolated SQLite/browser players. It does
not claim an inspection of every production account or a live deployment.

## Reproduced defects

1. Standard extraction can persist `extracted` before the reward batch. An
   interruption at that batch leaves no accepted reward event. Refresh previously
   hid the terminal run without recovering its XP, wallet rewards or quest credit.
   The new regression observed zero accepted extraction events after refresh.
2. A successful final standard step can persist depth 100 before banking. Refresh
   previously left this run `extractable`; a new step request could attempt room
   101, while extracting could classify the ending as extraction rather than a
   completion. The regression observed `extractable` instead of `completed`.
3. Failed standard runs wrote their consolation XP to the current calendar
   season, even when the run and earning pet belonged to an earlier season.
   The regression observed `pet-s2026-003` instead of `pet-s2025-001`. This also
   masked the event's pet on the new authority-checked public activity feed.
4. Standard-run item-consumption events omitted `pet_id` and also used the
   current season. Those records could not reliably identify the source pet.
5. A rejected final-step payout had its rejection reason overwritten by
   `run_completed`, obscuring the actual settlement result.

## Fixes

One bounded standard-run recovery path settles saved terminal work through the
existing reward authority. It runs before Mini App state is built, when starting
or resuming a standard run, and when step/extraction requests encounter a saved
final room. Already extracted runs retain extraction; saved final rooms retain
completion. A rejected payout retains its actual rejection reason.

The queue validates owner, pet, season, slot and the successful persisted source
step before its five-run limit. It excludes official Daily Runs and canonical
roguelite-room records, as well as already-awarded claims. Closed historical
short runs can recover from their saved completion depth; an active short run
is not promoted into a completed modern run. Invalid records cannot occupy the
queue ahead of valid recoverable records. Larger valid backlogs drain over
successive refreshes, and interruptions remain retryable.

Recovery preserves the banked reward snapshot, original pet/season, normal XP
caps and existing idempotency keys. It does not replay a room, consume another
item, add score or award another runtime step/extraction action. Mini App, bot
and legacy API handlers respect the recovery marker. A finishing button cannot
turn a saved completion into extraction-specific progress.

New failure XP and item events retain the run's season; item events also retain
its pet ID. The existing public projection can then display the correct pet.
No guessed historical XP or missing source records are backfilled.

## Quest, reward and display trace

| Path | Confirmed behavior |
| --- | --- |
| Standard Moon Runs | Recovered reward is accepted once; same-day adventure checklist and Weekly Journey see its accepted finish. Pet XP reaches daily/weekly, original season and account all-time totals; only awarded Community XP enters Community ranks |
| Failed standard runs | Existing capped consolation XP stays with the original pet and season; consumed item remains a single inventory debit and a source-attributed public event |
| Official Daily Run | Existing ten-room boss, ending recovery, one-attempt-per-account/day limit and original-pet Journey rules remain separate |
| Daily and Weekly Journey | Existing three-of-five daily Mark and all-five weekly Crest requirements remain. Standard completions/extractions qualify for Weekly Journey; Contracts and Practice do not |
| Weekly Boss / seasonal raid | Existing defeat evidence, reward claims and interrupted-settlement regressions remain covered; standard-run recovery does not fabricate canonical boss wins |
| Contracts / Practice | Saved repeatable Contracts and their capped bonuses remain separate from local, reward-free Practice; no additional attempts or currencies are created |
| Season rewards / pet completion | Existing tier claims and final-evolution/60-Mark/10-Crest completion rules remain unchanged |
| Website leaderboards and activity | The shared read-only projection from #1345 receives corrected events and recovered rewards without frontend changes |
| Website graphs | Wiki graph remains canonical wiki relationship data; Arcade graph remains driven by its selected Arcade leaderboard row. Pet XP and Journey awards are not graph inputs |

Daily/weekly XP uses the accepted reward's settlement window. Season XP belongs
to the saved source season. Historical recovery therefore need not increase
current-season XP. Quest evidence still has to satisfy its existing source-day
and season qualification rules.

The seven daily mission checklist still has no separate all-seven payout, and
pet season completion has no separate final boss. Future/locked expansion options
remain future/locked. These are product gaps, not newly enabled features.

## Validation

Ten focused real-SQLite cases cover:

- failure/item source attribution and public display after a pet/season switch;
- a real exception after extraction closes but before the reward batch;
- saved final-room recovery with no additional step;
- concurrent old-pet settlement, exact public totals and no duplicate reward;
- seven invalid candidates before a valid candidate;
- bounded backlog draining and retry after another interrupted reward;
- historical short completions and Pet/Community XP cap boundaries;
- non-throwing reward rejection and recovery;
- both step and extraction Mini App requests for a saved ending, with no extra
  runtime award or extraction event.

The mobile player-loop suite now injects the standard extraction interruption,
reloads the real Mini App and checks visible state, XP, wallet reward, no active
run and no second payout at 390×844 and 360×640. The existing six-screen gameplay,
Daily Run, Contract, boss, crafting, economy and seasonal recovery cases remain.
Full Worker/API, browser and final GitHub CI results are recorded in the PR.
Graph integrity passes: 337 nodes, 1,629 edges and 75 mobile nodes.

## Deployment and limits

Worker deployment only: deploy `moonboys-api` from clean merged main through
`node scripts/deploy-worker-with-provenance.mjs moonboys-api`, then verify its
`/deployment-info` commit. No frontend cache token change, D1 migration or VPS
restart. Reopen the Mini App to trigger recovery for its signed-in owner.

Recovery needs retained authoritative run/step/ownership data. It does not repair
already-paid historical events with the wrong season or missing pet ID; correcting
those requires a separate evidence-based data repair. No production player records
were changed by this audit. GK approval is required for merge and deployment.
