# Moonpet objective and reward recovery audit — 27 September 2026

Base: merged PR #1339, `c9aec190ca9fc01a616b61889a5dfd0cec7873dd`.
All gameplay verification uses isolated SQLite accounts and real Worker handlers.
No production player state was changed and no deployment was performed.

## Confirmed defects and fixes

1. Accepted Journey evidence and its award receipt are separate writes. An
   interruption could leave fully qualified goals waiting indefinitely until
   another qualifying action happened. A new regression failed on the original
   code: a refresh left the already-earned daily mark without its receipt.
   Mini App state now retries fully qualified, unsettled Journey scopes from
   persisted server evidence before building the displayed progression. If a
   final Crest saved before season completion failed, recovery repairs that
   completion marker before settling the receipt. This additional interruption
   also failed in a regression before the fix and passes afterward.
2. Official daily objective buttons ignored the account's daily reservation.
   After a failed or extracted attempt, unfinished goals still looked actionable.
   They now say **DAILY ATTEMPT USED** and explain the next UTC reset. Active
   attempts distinguish the original pet and run from another selected pet or
   an older saved run. Weekly care, training, cache, boss and run links similarly
   explain cooldown, energy, reset and source-pet restrictions.
3. Unclaimed season tiers were available only deep in Profile. Play Now now
   links directly to ready claims, shows XP remaining to the next tier, or
   acknowledges that all current tiers were collected. Navigation issues no
   gameplay request; claiming still requires the existing explicit action.

## Authority and reset audit

| Track | Accepted progress and reset | Result of this audit |
| --- | --- | --- |
| Seven daily missions | Accepted daily actions; equipment upgrade also counts for shop; bank goal is a live balance | Existing evidence/navigation and dispatch regressions retained; no invented extra reward |
| Daily Journey | Three of five goals, per source pet / season / UTC day; official run objectives plus accepted care | Recover partial awards; exhausted account attempts no longer appear playable |
| Weekly Journey | All five goals, per source pet / season qualification week; cache needs two UTC days | Recover partial awards and original week; route labels reflect current gates |
| Season rewards | Account season XP unlocks tiers; central awarded claims determine collected state | Ready claims and next XP target exposed in Play Now; rejected payments remain claimable |
| Pet season completion | Existing Growth Mark, Weekly Crest and evolution authority | Recovered awards keep original pet, season and earning window; existing limits remain |
| Standard / official runs | Standard uses original pet energy; official attempt is account/day limited | Existing source-pet, zero-energy extraction, daily tactics and reward tests retained |
| Contracts / Practice | Saved Contract builds, quests, paths, drafts, field encounters and ranks; local Practice | Repeatable options remain after daily/weekly goals or reward caps; neither substitutes for official Journey evidence |

Weekly Journey qualification uses season-relative weeks, including the final
calendar-quarter tail. Weekly Boss rotation uses its existing calendar week.
This patch preserves those independent reset authorities and the existing
boundary tests; it does not promise an extra daily attempt or cache per pet.

Recovery is owner-scoped, with strict slot/instance ownership joins and no
client-supplied progress, pet or period. Each refresh attempts at most five
daily and five weekly scopes. Accepted receipts and settled duplicate limits
leave the queue. An interrupted scope remains retryable; other candidate
scopes can still settle. Old pets and earlier periods are included. Weekly
earning dates use the latest of each objective's first threshold-crossing days,
computed in accepted source-day order with the configured additive/max rules.
Later surplus actions cannot move that date; every required objective must
have a source-backed crossing. Existing Crest timestamps remain unchanged. Daily
receipts require a verified mark and can repair a legacy missing mark link.
Existing unique mark/crest constraints and finalizers prevent repeat awards.

This recovery covers persisted objective evidence. It does not reconstruct
arbitrary missing historical source actions or missing objective rows. A large
backlog drains over successive refreshes. A continuing database outage remains
pending rather than being represented as a successful award.

## Verification and rollout

Focused SQLite regressions cover receipt interruption, interruption before
weekly award insertion, owner isolation, previous-period/season recovery,
original earning dates, repeat refreshes, missing daily receipt links, and
interrupted season completion after the tenth Crest and sixtieth Growth Mark.
The review regression spans multiple source days, delivers run evidence out of
day order, then records surplus actions for every objective while award writes
fail. Recovery must retain 5 January, not the later actions on 7 January.
Route tests cover exhausted daily attempts, other source pets, unavailable run
sources, care cooldowns, active activities, cache reset waits and season tiers.
The mobile suite exercises all six screens at 390×844 and 360×640, including
real daily extraction followed by the exhausted-goal label, disabled second
attempt, season navigation with no auto-claim, and explicit reward recovery.

The existing Worker/API suite also checks action dispatch, care and growth,
missions, bosses, activities, economies, combat, slots, seasons and leaderboards.
These checks establish code behavior, not measured retention or successful
operation of every historical account, physical device or live human match.
Final local and GitHub CI results are recorded in the PR.

Worker deployment is required after GK approves and merges. Pages assets use
`20260927-objective-recovery-v1`. No new migration or VPS restart is required;
existing Journey tables and migration 076 for Contracts remain prerequisites.
After deployment, verify the commit in `/deployment-info`, refresh an account
with Journey progress, inspect daily/weekly route labels, and follow a ready
season claim from Play Now. GK approval is required before production merge.
