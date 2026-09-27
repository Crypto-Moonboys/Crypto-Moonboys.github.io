# Moonpet endings, bosses and reward audit — 27 September 2026

Base: merged PR #1341, `6f06e7929a8ce73cb7f8d47cf5b17e8fd1741f3a`.
Tests use isolated SQLite players and real Worker handlers. No production
account was modified, and no production deployment was performed.

## Confirmed defects

1. The official Daily Run saves room progress before boss payout and completion.
   An interruption after the final room left an active run at room 10. Retrying
   its original button returned `stale_daily_room`; a request using the refreshed
   index could generate an eleventh boss room. The new regression failed on the
   merged code with `stale_daily_room` instead of completion.
2. Boss payout and boss-win analytics are separate writes. A successful payout
   followed by an analytics failure could leave Daily Journey boss credit absent.
   Duplicate reward responses deliberately contain zero rewards, and previously
   skipped the missing win record entirely.
3. A rejected (non-throwing) boss payout did not stop completion. A closed run
   could then fail the normal active-run reward gate on every later retry. Its
   already-applied daily/seasonal boss totals and boss achievement could also
   remain missing after the payout was later recovered.

## Repair

One shared Daily Run ending path reads the persisted, resolved final boss room.
Steps and the existing extraction route use it after the final room, before
another room can be generated. It retries payout, completion and daily records
without advancing the room or score again. Rejected payouts remain pending.
Mini App refresh also retries up to five eligible saved endings and records the
original daily terminal event for Weekly Journey before rebuilding objectives.

Recovery requires matching owner, run, pet, season, slot and resolved final boss
room. The bounded queue filters source-backed candidates before its limit;
five older source-less endings cannot block a valid sixth candidate. Failed or
unowned runs cannot qualify. Older completed/extracted Daily Runs with missing
payouts have a narrow reward-authority exception requiring their own persisted
final boss win. Existing extracted statuses stay extracted. Standard runs and
other closed-run reward sources do not acquire a general payout bypass.

A duplicate boss payout repairs missing win analytics from the actual awarded
receipt. Existing win records remain unchanged; concurrent inserts are
idempotent. Materials, fragments, deterministic relic results and currencies
come from the recorded payout, not the empty duplicate response. No second
payment or second score increment is made. If an older terminal record was
already applied with no boss win, one atomic repair adds the missing daily
boss count, seasonal boss count and achievement, then marks that terminal
evidence as boss-defeated. Repeated/concurrent syncs cannot add it again.
Run counts and scores remain unchanged.

While an ending is still pending, the Mini App shows room 10/10, no new fight
choices, and **FINISH SAVED DAILY RUN**. Play Now and the owning pet's Daily
Journey link to the same saved result. This uses the existing `run_extract`
action to finish an already-won ending; the Worker preserves completed status
and records completed Weekly Journey evidence. Refresh can finish recovery
without a button press once the failure is gone.

Review follow-up: the finish button initially reached the extraction runtime
award handler, adding 24 Adventure XP to an already-won boss ending. Both the
Mini App and bot API now suppress that extraction award when the result is
`daily_run_completed`. Finish and refresh recovery only settle the saved
ending; ordinary boss steps retain their 10 Adventure XP and genuine early
extractions retain 24. Regressions exercise both action handlers, repeated
finish requests, unchanged specialist events/traits on recovery, and normal
step/extraction award plans, including their equipment action classification.

## What actually ends and what it pays

| System | Ending / boss | Rewards and next play |
| --- | --- | --- |
| Standard Moon Run | Up to 100 rooms, elite/boss checkpoints, or early extraction; failed rooms lose the unbanked bag | Banked rewards pass through existing caps/authority. Another standard run is available subject to energy |
| Official Daily Run | 10 rooms ending at the Alley King; early extraction or failure ends the one account/UTC-day attempt | Score and Daily Journey evidence; boss materials/fragment and deterministic relic chance. Saved ending recovery fixed here; no repeatable XP farming added |
| Contracts | Six or ten rooms. Current saves have final boss tactics and must also meet their selected main goal | Rank/records for clears, optional side-goal rank, up to three 20-Pet-XP bonus reservations per account/day subject to reward caps. Immediate replay remains available after bonuses are used |
| Practice | Local roguelite routes, upgrades, clear/failure and restart | Unlimited practice; no server XP, currency or official Journey credit |
| Seven daily missions | Accepted daily-action checklist; bank target uses current gold balance | Existing actions provide their own rewards. No separate seven-checklist clear payout exists |
| Daily Journey | Three of five objectives per original pet/season/UTC day | One qualifying Growth Mark, subject to existing authority; completed official-run goals credit the source pet |
| Weekly Journey | All five objectives; cache check-in requires two distinct UTC days | Weekly Crest through existing limits. Source pet, season-relative week and original earning dates remain authoritative |
| Weekly Boss | Daily attack choices accumulate damage against the weekly boss | Existing victory reward and saved-claim recovery; attack/rotation limits remain |
| Districts / story chains | District mastery boss checkpoints; authored story final choices and completed cycles | Existing material/reward settlement and repeat cycles, with daily gates |
| Seasonal raid | Boss phases and accumulated damage, with tactical energy choices | Existing per-pet defeated-boss reward and pending-claim recovery |
| Season XP tiers | Each configured XP tier unlocks its own claim | Central reward claims establish collected state; ready claims remain linked from Play Now |
| Pet season completion | Final evolution plus 60 Growth Marks and 10 Weekly Crests under current configuration | Existing completion marker. There is no newly invented season-final boss or unlimited reward source |

Live choices remain enabled according to their actual energy, cooldown, wallet,
level and ownership rules. Breeding, post-season Traits, Sanctuary, Lineage,
Fusion and Prestige still appear as locked/future expansion in current runtime;
they are not completed playable Mini App systems. This audit does not enable
unfinished endpoints merely to make every option look live.

## Verification and limits

Fault regressions cover failure before reward settlement, after payout/before
win analytics, before terminal commit, and during daily sync; non-throwing payout
rejection; legacy completed/extracted unpaid endings; pet switching; original
UTC-day/season/weekly credit; concurrent refreshes; unchanged score; one reward;
and no room above 10. Negative tests cover other owners, missing room pet IDs,
wrong seasons, failed rooms and unknown bosses, plus the recovery-queue limit.
An additional regression failed on stale boss totals, then passed after the
atomic record repair; repeated concurrent syncs leave one run and one win.
The foundation suite also checks exact receipt-based materials/relic analytics.

The mobile suite exercises all six screens at 390×844 and 360×640, including a
real interrupted boss payout, reload, saved-ending button, successful completion,
no duplicate currency, used daily attempt, and available Contracts/Practice.
Local Worker/API, Arcade, Wiki and WAX domains pass; focused tests were rerun
for the final guards and UI wording. Final GitHub CI and PR checks are recorded
in the PR. Screenshots were visually inspected.

This is not proof of every historical account or device, measured retention, or
live human matchmaking. Missing source evidence is not fabricated. Large queues
drain across refreshes; persistent failures remain retryable. Recovery does not
rewrite already-corrupt historical scores from old extra-room runs, or introduce
new rewards, attempts, quest thresholds or post-season systems.

## Rollout

Worker and Pages deployment are required after GK approval and merge. No new
D1 migration or VPS restart. Cache token: `20260927-endings-v1`. Existing Daily
Run, Journey, season and Contract tables remain prerequisites. Verify the merged
commit through `/deployment-info`, reopen the Mini App, and inspect any saved
final Daily Run: finish/reload should produce a completed run with one boss
reward and the original pet's Journey credit. GK approves production merge and
deployment; neither is performed by this PR.
