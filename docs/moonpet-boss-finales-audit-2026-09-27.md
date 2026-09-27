# Moonpet bounty routing and boss finale audit — 27 September 2026

Base: merged PR #1337, `e5547b42df86686f7b4fdadba9eade15388fc8c2`.
The public Worker reported that commit deployed at `2026-09-27T17:03:27.093Z`.
Only public deployment metadata was read. All gameplay verification uses local
SQLite accounts and real Worker handlers, not live player mutations.

## Confirmed dead end

Play Now picked the most-progressed bounty without checking whether any of its
qualifying routes could currently be played. A base reproduction with locked
Kaiju and available care recommended Kaiju; the assertion requiring care failed.
It also always chose the first route for a multi-route bounty, even if an
Adventure was ready while the Moon Run was blocked.

The recommendation now filters for playable qualifying routes before sorting by
progress. It checks normal care/work cooldowns, the Sleep/Train busy gate and
Train energy, saved run-source availability/energy, available Adventures, ready
activity claims, unclaimed Daily Cache, usable inventory and Kaiju capabilities.
Saved extraction remains eligible at zero energy. Official Daily Runs are not
used as a substitute for standard run events. Switching pets uses the original
run pet's energy, not the newly selected pet's energy.

The bounty board keeps every target visible and describes unavailable routes.
Its buttons remain navigation links, so a player can review a requirement.
When no bounty has a playable route, Play Now continues to offer Contracts and
Practice. Client suggestions never submit progress, override a server gate or
give a reward. Server validation remains necessary if state changes after render.

Review follow-up: ordinary Feed/Play/Clean/Sleep/Train cooldowns were enforced by
the Worker but missing from its Mini App snapshots. The existing accepted-event
query now also reads all five care actions, using the same account scope and
45-second window as action validation. Each response and fresh reload includes
every still-active care cooldown alongside the existing special-action entries.
Expired entries are omitted; pending or rejected care events cannot extend them.
SQLite regression tests first reproduced the missing Feed cooldown, then verified
sequential actions, reloads, rejected retries, expiry and bounty route readiness.
Mobile tests click Feed, Play and Clean during a background activity and verify
that all five care buttons remain disabled after subsequent responses and reload.

## New v8 Contract finales

Players see their final boss before starting, while building their run and in
the last room. Each boss has three named tactics using the existing cover, bold
and search actions. Displayed chances, salvage and damage include boss rules,
build, tier, room depth, upgrades, path and optional preparation.

| Goals | Final boss | Tactics |
| --- | --- | --- |
| Scout / Escort | Shield Warden | Flank the Shield, Break the Guard, Cut the Power |
| Recon / Resupply | Signal Hound | Hide the Signal, Rush the Tracker, Jam the Relay |
| Salvage / Breach | Vault Breaker | Dodge the Rig, Strike the Drive, Raid the Vault |

| Boss | Cover modifiers | Bold modifiers | Search modifiers |
| --- | --- | --- | --- |
| Warden | +10pp chance, -4 failure damage | -8pp, +12 salvage, +6 failure damage | +4pp, +6 salvage |
| Hound | -4pp, +2 failure damage | +6pp, +4 failure damage | +12pp, +8 salvage |
| Breaker | +4pp, -2 salvage | +10pp, +10 salvage | -8pp, +12 salvage, +4 failure damage |

Final chances remain between 30% and 98%. These replace the old final-room scene
modifier rather than stacking a second scene on top. Route previews and the
actual resolution use the same data. A successful final tactic AND the main
objective are required. A failed final tactic ends the contract with no rank or
XP even if route HP remains; that risk appears on the final tactic buttons as
well as the boss panel. Supply rest is disabled in the final room, with an
explanation. Scout Ahead or Field Patch remain optional before committing.

Boss choice/outcome are derived and saved by the Worker. The final move uses the
same owner/pet/season/revision guard as other moves. Parallel clicks settle once;
client-supplied boss identity, completion flags, rank or rewards cannot override
it. There is no separate boss claim or boss payout. Another contract is available
immediately after success, failure or abandonment, with no pet energy cost or
cooldown. The 108 collection setups, rank formula, tier unlocks and first three
account/day up-to-20-Pet-XP bonuses remain unchanged. Normal Pet XP caps apply.
No Growth Marks, Weekly Crests, currencies, items or official Daily Run credit
are added. Existing v1–v7 saves retain their former final-room setback/rest rules.

## Scope and follow-on choices

The repository suites audit literal Mini App action dispatch and the existing
care/lifecycle, daily/weekly evidence, runs, Contracts, Practice, bounties, timed
activities, jobs, districts, stories, Adventures, bosses, raids, expeditions,
market, crafting, inventory, equipment, Arena/Kaiju and season-slot authorities.
Real mobile fixtures exercise the six screens and principal solo player loops.
There was no live human-opponent session or test of every historical account,
Telegram client or network failure. Passing simulations establish mechanics and
reachable setups, not measured player retention or real-world win rates.

Boss finales fit multi-room Contracts because players can plan their build,
perks and last path around the ending. Care clicks remain predictable; capped
daily missions are not relabelled as unlimited. A useful later extension is a
choice of authored mid-run encounters that trade contract supplies, health and
salvage. That is a proposal, not part of this PR.

## Validation and rollout

Focused tests cover the reproduced bounty failure, alternative routes, all-blocked
fallbacks, run-source energy, all three bosses, outcome/preview equality, paths
and preparations, legacy final rooms, forged input, parallel final moves and
bounded rewards. Contract tests simulate 4,320 mixed-outcome runs and confirm
that all 108 setups are completable; Practice runs another 900 simulations.
Mobile checks cover final-room reloads, exact displayed boss chances, locked
supply rest, a successful ten-room finish and a failed finale awarding zero XP
followed by an immediately available new quest. Final test/CI results are
recorded in the PR. Local Arcade, Worker/API, Wiki and WAX domains passed.
The final local visual run passed both Moonpet mobile sizes, then stopped in
unchanged Avatar Builder because its expected Playwright headless browser was
unavailable. The standard browser download returned an invalid archive in this
environment; Moonpet was verified with separately provisioned Chromium 153.
No local full-suite pass is claimed. Standard GitHub CI is required before merge.

GK approval is required before merge and production deployment. After merge,
deploy `moonboys-api` with the provenance script from clean main. Pages publishes
`20260927-boss-finales-v1`. No new D1 migration or VPS restart is required;
existing migration 076 remains the Contracts prerequisite. Start a new contract
to see a boss ending. Verify the deployed commit, bounty route selection, final
tactic previews, saved reload and single bounded finish reward.
