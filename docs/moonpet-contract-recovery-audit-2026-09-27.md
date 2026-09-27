# Moonpet Contract recovery audit — 27 September 2026

Base: merged PR #1343, `97414095c131184376c709762ad037b91c58018a`.
This audit uses the source and isolated SQLite/mobile players. It does not
modify production player data or establish that every live account is healthy.

## Confirmed defect and fix

A completed Contract can save its daily XP reservation before reward delivery
fails. The board previously listed pending bonuses only for the current pet and
season. The claim handler also required that same pet to remain active and
hatched. Switching pets hid the bonus; season rollover made it inaccessible.
An active egg additionally blocked recovery in both the client and dispatcher.

The regression completed a real Contract with interrupted reward delivery,
switched to an owned egg through the real slot-switch handler, and failed because
the saved bonus disappeared. A separate mobile regression caught the client
button's hatch gate after the backend and screen had been repaired.

Pending bonuses now appear across the account's original pets and seasons,
including when the current Contract board is locked for incubation. Play Now
links to the recovery controls. Each button sends the earning pet's ID. The
older API's current-pet-only pending format remains supported during deployment.

Claims require a completed Contract with an existing 20-XP reservation and an
exact owner/pet/season/slot match between the Contract, instance and season slot.
The reward transaction rechecks that authority. Archived sources are eligible;
active status and current incubation are not requirements for an already-earned
bonus. New starts and moves retain their active, hatched-pet restrictions.

The inbox filters invalid sources before selecting its oldest ten entries.
Settling entries reveals the next batch. Retry uses the existing unique reward
receipt; concurrent calls, reloads and interrupted local receipt updates cannot
pay twice. Recovery keeps the original reservation date and pet/season, never
switches the active pet, and cannot grant client-supplied rewards. Existing
settlement-day Pet XP caps and three account bonus reservations per UTC day
remain unchanged. Contracts still provide no Journey credit or extra currency.

## Current options, endings and rewards

| Player path | Ending and reward behavior |
| --- | --- |
| Care, jobs, activities, inventory and economy | Existing cooldown, energy, lifecycle, ownership and wallet gates; background activities continue while Contracts are played |
| Standard runs | Room choices, bosses, extraction and existing run rewards; qualifying finishes can advance Weekly Journey |
| Official Daily Run | One account attempt per UTC day, ten rooms, Alley King finale and existing rewards; final-boss and early-ending recovery remain covered |
| Continuing Contracts | Repeatable six/ten-room routes, six goals, three builds, three unlockable tiers, drafts, optional paths/encounters, final bosses and saved rank/route records; up to three 20-Pet-XP daily bonuses subject to normal caps |
| Practice | Unlimited local roguelite replays; no official XP, currency or Journey credit |
| Daily Journey | Three of five qualifying objectives earn the existing Growth Mark; source evidence and recovery remain server-owned |
| Weekly Journey | All five objectives earn the existing Crest, including the required cache days; historical recovery keeps threshold-crossing dates |
| Weekly Boss and seasonal raid | Existing fights, victory rewards and saved reward recovery; no new attack is required to recover an earned reward |
| Season tiers and pet completion | Existing XP tier claims; pet completion requires final evolution, 60 Growth Marks and 10 Weekly Crests |

The seven daily missions have no separate all-seven completion payout, and pet
season completion has no additional final boss. Breeding, post-season Traits,
Sanctuary, Lineage, Fusion and Prestige remain future/locked Mini App features.
The audit does not turn those unfinished systems on or promise endless economic
rewards. Repeatable Contracts and Practice provide play between daily timers.

## Verification and deployment

Contract tests cover real pet switching, rollover, archived sources, egg claims,
original-pet XP, malformed rows before the inbox limit, authority changes before
the award transaction, foreign/redirected/incomplete/unreserved claims,
simultaneous retries and receipt recovery. The existing 4,320 simulations cover
all 108 Contract setups. The player-loop suite covers 32 literal action buttons
and 900 Practice simulations. Full Worker/API and mobile results are recorded
in the PR; mobile tests run at 390×844 and 360×640 with a real SQLite-backed
dispatcher, including the saved-bonus click and its original-pet payout.

Recovery requires the durable Contract, instance and season-slot records. It
cannot reconstruct deleted authority or guarantee delivery during a persistent
database outage. No retention improvement is claimed without player metrics.

After GK approves merge, deploy `moonboys-api` from merged main using the
provenance wrapper and allow the matching GitHub Pages update to publish.
Verify `/deployment-info`, close/reopen the Mini App, and check saved bonuses in
Play Now and Contracts. No new migration or VPS restart is required.
