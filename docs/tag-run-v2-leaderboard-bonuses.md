# TAG RUN V2 leaderboard reward bonuses

The Community Pot remains a fixed daily draw funded from at most 1% of each
approved, unreserved token balance.

## Who can receive tokens

Every reward-eligible member with positive participation weight is included in
the lottery. The draw creates at most 20 bundles per token, so a daily payout
can reward some members rather than every member. No eligible member is removed
merely for being outside the top three.

## Top-three ticket bonuses

Bonuses increase lottery ticket weight only. They do not increase the treasury
budget or bypass the reward block list.

| Leaderboard | #1 | #2 | #3 | Applied |
| --- | ---: | ---: | ---: | --- |
| Daily | +15% | +10% | +5% | Every completed UTC day |
| Weekly | +10% | +7% | +4% | Sunday UTC close |
| Monthly | +7% | +5% | +3% | Last UTC day of month |
| Seasonal | +5% | +3% | +2% | Last UTC day of each calendar quarter |

A member can stack closing-period bonuses. The maximum possible combined boost
is 37%, and the unboosted ticket weight remains the member's earned Street Cred.
Historical rollover keeps its existing 50% ticket-class cap and is not
repeatedly boosted.

Rank ties are resolved deterministically by Telegram user ID after points.
Reward-blocked members continue earning Street Cred and remain visible on public
chat leaderboards, but they are excluded before reward standings and bonuses
are calculated.

## Commands

- `/top` or `/top weekly`
- `/top daily` or `/tagdaily`
- `/top monthly` or `/tagmonthly`
- `/top season` or `/tagseason`
- `/top all`

No D1 migration is required. The draw-rules domain is versioned so persisted v1
commit/reveal workflows remain replayable and verifiable.
