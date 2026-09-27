# Moonpet quest credit audit — 27 September 2026

Base: merged PR #1342, `02fbbcf1e7b7dfd25fc3252461496e3be4288e96`.
This is a code and isolated-player audit. No production account was modified.

## Confirmed failures and repairs

1. **Accepted actions could lose Journey credit.** Care, training, cache, run
   and boss source events persist before Weekly Journey objective writes. A
   failed objective write can leave the action paid but absent from the Journey.
   Refresh previously retried awards only after objective evidence existed.
   The regression saved 14 qualifying source actions, interrupted their objective
   writes, then observed zero Weekly Journey progress after refresh. Missing care
   evidence also prevented the corresponding Daily Growth Mark.
2. **Early Daily Run endings could lose records and quest credit.** Extraction
   can commit before daily synchronization. The old refresh recovery required a
   won final boss, so an early extracted run disappeared from active play while
   its Daily Run row still said active. The regression reproduced that mismatch,
   with no extraction objective or Weekly Journey finish credit.

Refresh now reconstructs up to 50 missing source events per request using the
same objective authority checks as live actions. Sources must be accepted,
mapped to a qualifying action, and match the owner, original pet, season slot,
valid UTC day and canonical season. Invalid sources are filtered before the
limit. Daily care and weekly evidence retry independently; source XP, currencies,
inventory and runtime progression are not paid again.

Weekly evidence reconstruction defers the award until the existing award queue
derives each objective's first threshold-crossing day. A week with an unfinished
source backlog waits until that backlog is repaired. It is excluded before the
award limit so other complete weeks can settle. Existing awarded Crests keep
their recorded dates. Historical pet/day/week/season ownership survives switches
and season rollover.

A separate bounded queue synchronizes up to five early terminal Daily Runs per
refresh, alongside the existing five final-boss settlements. It requires owned
run/slot/room evidence and a saved extracted, failed or abandoned status before
the final room. It repairs daily objectives and terminal records; only extracted
endings qualify for Weekly Journey finish credit. It does not award a boss win,
repeat extraction rewards or change the saved run status.

## Player options and endings checked

| Path | Current behavior |
| --- | --- |
| Care, jobs, timed activities, shop and inventory | Existing cooldown, energy, lifecycle, wallet and ownership gates remain; literal Mini App action routes and mobile flows are covered by the player-loop suite |
| Standard runs | Energy-gated room choices, boss checkpoints and extraction; standard completions/extractions can count toward Weekly Journey |
| Official Daily Run | One account attempt per UTC day, ten rooms and final boss; Daily Journey goals use the source pet's official run. Saved final-boss recovery remains covered |
| Contracts | Repeatable server-owned roguelite quests, builds, route lengths, drafts, final bosses and rank records; daily XP bonuses remain capped. Contracts do not satisfy official Daily Run or Weekly Journey run objectives |
| Practice | Repeatable local roguelite play, with no official XP or Journey credit |
| Daily and Weekly Journeys | Existing three-of-five daily and all-five weekly requirements; this change repairs missing credit and the resulting Marks/Crests |
| Weekly Boss, seasonal raid, districts and story choices | Existing choices, boss/chain endings and reward recovery remain wired and covered by the backend/mobile suites |
| Season XP tiers and pet season completion | Existing tier claims and final-evolution/60-Mark/10-Crest completion rules remain unchanged; repaired historical progress retains its original season |

The earlier endings audit documents each mode's reward source in more detail:
`docs/moonpet-endings-audit-2026-09-27.md`.

## Content still not implemented

The seven daily mission checklist has no separate all-seven completion payout.
Pet season completion has no additional final boss. Breeding, post-season Traits,
Sanctuary, Lineage, Fusion and Prestige remain locked/future Mini App content.
No unfinished system has been enabled or presented as playable by this change.

## Verification and limits

Regressions cover lost objective writes, original dates/pets, repeated refresh,
unchanged source events and XP, invalid owner/season/date/type evidence before
the recovery limit, 51-event and 63-event backlogs, independent weekly settlement,
and early extraction synchronization without duplicate rewards or boss credit.
The existing player-loop suite covers 32 literal action buttons and roguelite
simulations; full Worker/API and mobile results are recorded in the PR.

Recovery requires durable source evidence. It cannot recreate missing source
events or prove every historical account/device is correct. Large backlogs drain
across refreshes; persistent database failures remain retryable. No reward amounts,
quest thresholds, attempts or economy caps are increased. This is not measured
retention or a production verification claim.

## Deployment

Deploy `moonboys-api` from merged main using the provenance wrapper. No frontend
asset change, new migration or VPS restart is required. Verify `/deployment-info`
against the merged commit, reopen the Mini App and inspect Journey progress and
any saved early Daily Run ending. GK approves merge and production deployment.
