# Moonpet action and reward synchronization audit — 28 September 2026

Base: merged PR #1346, `c8a0be2417e7463b20f0ced8d18341d6cb4f39a6`.
This is a source audit and isolated SQLite/browser verification, not a claim
that every production account or the current live deployment was inspected.

## Reproduced problems and fixes

- Shop and gold-trade receipts omitted the pet ID. Their public activity could
  not identify the source pet reliably. Both now persist the pet and its season;
  trade season totals use that same season.
- Two overlapping purchases of the same item both debited the wallet. A switch
  during checkout could equip the old pet and the new compatibility profile.
  Checkout now rechecks active ownership, level, equipment and wallet inside
  the transaction. A losing request does not debit or equip either pet.
- Timed rewards used an account-only receipt, bypassing the pet's existing XP
  allowance: the regression granted 26 XP after 1,200 XP had already been earned.
  Sessions now save pet/season in their existing metadata and settle against
  that immutable target. A legacy pending session pins its protected active pet
  before settlement. New starts also check the active pointer and pending work
  in the insert statement.
- Activity Growth Marks used the active pointer after settlement. They now
  use the reward's pet. A failed Mark write keeps the paid activity in its
  recoverable state; retry reuses the reward receipt and awards the Mark once.
  The original applied rewards, source pet and current account wallet remain
  available in recovered responses.
- Bounty, market and season-tier receipts omitted the claiming pet. They now
  identify it without introducing XP to those currency/item rewards.
- New Kaiju reservations now retain pet/season. Their energy debit updates the
  pet instance and compatibility profile together, checks the active pointer,
  and occurs once. Recovery settles XP and runtime progress against the saved
  reservation even after a pet switch, retaining its original accounting window.

## Gameplay, quests and public displays

| Path | Verified behavior |
| --- | --- |
| Care and timed activities | Cooldowns and activity-busy gates remain; capped rewards, interrupted settlement, Growth Mark retry and original-pet attribution are tested |
| Shop / trade / market | Affordability, equipped state, cooldown, exact-fit inventory capacity and retry receipts remain enforced; new public events identify the source pet |
| Bounties / daily checklist | Accepted actions continue to provide progress; bounty claims stay once per account/day/key; the Trade checklist sees accepted trades |
| Daily Journey / Weekly Journey | Existing three-of-five daily Mark and all-five weekly Crest requirements, source evidence and recovery tests remain in the Worker suite |
| Standard Moon Run | Existing 100-room completion, banked extraction/failure rewards and saved-ending recovery from #1346 remain covered |
| Official Daily Run | Existing ten-room Alley King ending, reward recovery and one official account attempt per UTC day remain covered |
| Contracts / Practice | Repeatable saved Contracts, checkpoint choices, final boss and capped bonus remain; local Practice has no official XP |
| Weekly Boss / seasonal raid | Existing defeat, claim and interrupted-settlement paths remain tested |
| Arena / Kaiju | Eligibility and reserved battle rewards remain; new Kaiju receipts, retry ownership, energy and XP are covered |
| Season tiers / completion | Tier rewards remain idempotent; completion still requires final evolution, 60 qualified daily Marks and 10 qualified weekly Crests |
| Pet leaderboards | Daily/weekly accepted XP, source-season XP and summed account all-time XP stay aligned after switching; zero-XP purchases do not create Pet XP |
| Community leaderboard | Only awarded Community XP increases ranks; retries do not duplicate the XP log or rank total |
| Public activity | Corrected receipts pass the existing owner/pet/season checks and display the earning pet after a switch; owner IDs remain private |
| Website graphs | Wiki relationship graphs use canonical wiki data; the Arcade graph uses the selected Arcade leaderboard entry. Moonpet XP is not an input to either graph |

There is still no extra all-seven-daily-checklist payout and no separate season
completion boss. Future/locked features remain locked. This patch does not add
new reward amounts, shorten cooldowns or change quest thresholds.

## Validation

`scripts/moonpet-action-sync.test.mjs` adds ten actual SQLite regressions covering
the failures above, public API output, old-season rewards, legacy paid receipts,
zero-XP claims and Kaiju recovery. It runs in `ci:worker-api`.

The activity and browser fixtures now load the existing season-completion and
calendar-qualification schema needed to check real Marks. The large API suite
uses pet-scoped cap/streak fixtures for the corrected paths, targets reward-batch
faults directly, and keeps its simulated daily-limit sequence within one UTC day
so running near midnight cannot make its sixth action fall on a new day.

The real Mini App browser loop runs at 390×844 and 360×640 across all six screens,
including quest routes, boss endings, saved rewards, crafting, market, cooldowns,
daily resets and season claims. Full commands/results and final CI are in the PR.

## Deployment and remaining limits

Deploy `moonboys-api` from clean merged main with
`node scripts/deploy-worker-with-provenance.mjs moonboys-api`, then verify the
served `/deployment-info` commit and reopen the Mini App. Worker deployment is
required; there are no new migrations, frontend changes or VPS restarts. Existing
production migrations, including 058 and 061, must already be applied.

Historical receipts without pet identity are not guessed or rewritten. Already
paid legacy activities remain replayable without paying twice; pre-upgrade
unscoped Kaiju reservations retain their existing compatibility settlement path.
Those historical records can still display UNKNOWN. A historical data repair
would need retained evidence and separate review. Missing/corrupt ownership or
season schema can leave a reward pending rather than fabricating its target.

Backup: `codex/backup-moonpet-action-sync-20260927-234129`.
Sandbox: `codex/sandbox-moonpet-action-sync-20260927-234129`.
GK approval is required before merge or production deployment.
