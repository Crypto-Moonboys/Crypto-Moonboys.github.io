# Moonpet reconciliation batches — 2026-09-29

Starting commit: `e9cf22e` (after training/style/relic activation and dependency
repairs). This tracker responds to the external GPT audit. A report assertion is
not considered current until checked against that baseline's runtime.

## Batch 1 — public score integrity and current rules

Implemented in this change:

- Fixed `/telegram/leaderboard` silently replacing an empty Community season
  with all-time scores. No active date-containing season means all-time; a real
  empty active season stays empty. Reads and Community XP writes share
  date-range selection, ordered by start date descending then id descending.
- Season and score reads reject thrown errors, `success:false` and missing result
  arrays. They return a retryable 503 without cached zero/empty rankings.
- `/gkleaderboard` uses the same reader, so Telegram cannot substitute all-time
  scores for an empty/unavailable Community season either.
- Added a Community XP comparison chart using the exact same fetched entries as
  the ranking list. Explicit period labels, one refresh for both, retained last
  successful data with an outage warning, retry, escaped names and mobile layout.
- Distinguished original-pet Pet XP/specialist progress from Account Season XP,
  shared wallets and separate Community XP. The game and public guides use that
  vocabulary without renaming stored fields or changing reward amounts.
- Corrected the wiki's stale daily bonus, finale, Practice, Style Lab, relic,
  completion/Sanctuary and free gear-switching descriptions. Clarified Weekly
  Boss's shared daily attack allowance and Egg / Secret Bot / EGGYONE names.
- Added a public beta-history notice instead of claiming the old weekly/all-time
  discrepancy was repaired. Preserved dated audit findings as historical evidence.

The seven-goal reward and Signal Sovereign already existed on this baseline;
the how-to page already covered both. This batch repairs contradictory surfaces,
not duplicate reward systems. Practice already awards bounded official Pet XP;
cosmetic equipment and ten relic adaptations were already shipped in #1380.

## Batch 2 — gameplay authority and reachability (complete)

Implemented after the initial reconciliation:

- Centralized Arena and Kaiju gates across Mini App and direct Telegram start,
  join, CPU and card-lock paths: Kaiju requires a hatched active pet; Arena
  requires a hatched active pet at level 10.
- Legacy website Pet state, inventory, mission and personalized Shop reads now
  fail with a retryable 503 instead of presenting a database outage as no pet,
  no missions, an empty bag or an anonymous Shop. Website profile/checklist
  widgets retain their last valid state and expose Retry.
- Removed the unreachable pre-ledger Kaiju reward finalizer. Kaiju has one live
  reward path through the central capped/idempotent reward authority, and tests
  now assert that path rather than matching obsolete source below a return.
- Mutation replay, cooldown and recovery reads now fail closed across care,
  Shop/equipment event receipts, crafting, upgrades, cosmetics, timed work,
  activities, standard and roguelite runs, Daily Cache and Weekly Boss. A D1
  outage can no longer be interpreted as a fresh request, unused cooldown,
  missing run authority or absent saved payout.
- Roguelite start preserves explicit active/requested pet and season authority.
  Failed pre-write reads create nothing; a failed post-commit read leaves one
  idempotently recoverable run; boss-room reward lookup failures cannot become
  false “room not resolved” results.
- Weekly Boss reads for today's attempt, saved progress, victory attribution
  and accepted source evidence now propagate failure into the existing retry
  path before energy or rewards can move.
- Existing source-pet-switch, season rollover, equipment concurrency, finale,
  Daily Run, raid and bounded recovery suites remain authoritative and pass.
- Six-module reachability is covered by literal button-to-handler parity plus
  browser execution of all six screens, ready claims, saved endings, bosses,
  recovery paths, cooldowns, Shop/equipment, crafting and completion/finale.
  The audit found no dead user button or duplicate entry point to remove.

## Batch 3 — source evidence and post-commit recovery (complete)

Implemented after the gameplay-authority batch:

- Weekly Journey source-event, pet-scope, objective-progress, accepted-receipt
  and existing-Crest reads now propagate D1 failures. An outage cannot be
  reported as missing evidence, zero progress or an absent reward.
- Egg incubation, hatch and rare-morph receipt reads now fail closed. A failed
  receipt read cannot authorize a second lifecycle transition.
- Incubation Growth Mark settlement is no longer best effort. If lifecycle
  progress commits and Mark settlement fails, the request reports failure;
  replaying the same action key repairs exactly one daily Mark without applying
  lifecycle progress again. Receipt recovery follows the original pet/season
  tuple even after an active-pet switch or hatch.
- Identity source-event and explicit pet-scope reads now preserve the difference
  between missing authority and unavailable authority. Post-commit personality
  response reads surface failure while event-key replay remains idempotent.
- Evolution replay and post-reservation reads no longer translate D1 outages
  into `requirements_not_met`. Duplicate evolution authority remains stable.
- Duplicate Growth Mark lookups now fail closed instead of returning a null
  authoritative Mark ID. Exact and same-day duplicate paths are covered.

This batch changes no schema, balances, historical counters or leaderboard
totals. The Community XP chart remains the already-shipped totals comparison;
Pet XP is not injected into unrelated website/Arcade graphs.

## Batch 4 — Telegram presentation read integrity (complete)

Implemented after the source-evidence batch:

- Legacy Telegram status, Details, Coach, Missions, Progress, Identity,
  Achievements, Season, Evolution, Streak, Gear, Bag, Economy, Bounties,
  Expedition, Market and Shop views now preserve the difference between a
  successful missing-pet result and an unavailable D1 read.
- Required presentation reads use one retry boundary. An outage reports that
  Moonpet data is temporarily unavailable and confirms that no new player
  action was applied;
  it cannot tell an existing player to adopt again.
- Evolution guidance no longer converts failed inventory, material, boss or
  relic reads into zero progress. Gear and achievement reads likewise cannot
  become empty collections during an outage.
- Guidance and Economy profile reads now propagate failure. The Mini App keeps
  its existing retry/last-good-state handling, while legacy Telegram commands
  receive explicit retry copy.
- Optional reaction/media decoration remains best effort. It cannot change
  game state, qualification or reward authority.

This batch changes no schema, balances, cooldowns, rewards, XP caps,
leaderboard formula or future-feature availability.

## Batch 5 — historical evidence and final documentation reconciliation

- Reconcile private ledger evidence before any historical counter repair. The
  supplied migration checks proved three seasonal corrections applied, not full
  reconstruction of every old reward. Missing source pet/time/receipt fields
  must not be guessed. No users or historical records are reset by this batch.
- Define an explicit repair/quarantine decision for unverifiable beta history,
  with a dry-run report, before a separately reviewed migration.
- A Community XP history/source breakdown still requires complete event evidence.
  The new chart compares current player totals; it does not invent historical
  points. Wiki relationship graphs and Arcade score charts remain separate.
- Review dated docs and navigation summaries against the final authority matrix.
  Advanced Traits, Breeding, Lineage, Fusion, Sanctuary gameplay expansion and
  Prestige remain future work; do not build these ahead of the above repairs.

## Validation and deployment

Regression coverage: Community API score periods, ties, bounds, empty seasons,
season changes and all three D1 failure forms; existing real pet settlement to
Community/Pet leaderboard parity; browser chart/list parity, empty/zero results,
outage/retry and escaping at 360, 390 and 1280 pixels.

No schema migration or asset regeneration is needed for the gameplay changes.
Regenerate the standard wiki publishing surfaces after editing the wiki. After
merge, deploy `moonboys-api` with the repository's provenance script; the website
ships through GitHub Pages. Deploy the Worker first for explicit chart period
labels. An older Worker response remains readable but is labelled “period not
supplied,” since its fallback cannot reliably establish the score period.
