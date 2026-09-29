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

## Batch 2 — gameplay authority and reachability (in progress)

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

Remaining Batch 2 work:

- Audit source pet/season/day authority and retry settlement across care, shop,
  upgrades, timed work, quests, runs, raids, Weekly Boss, daily bonus and finale.
  Include active-pet switches, rollover, concurrent equipment changes and D1
  resolved read failures. Expand tests only for concrete gaps.
- Check the six-module navigation and every actionable option against actual
  endpoint behavior, especially ready claims, endings, boss access and recovery.
  Simplify the entry points without removing working activity choices.

## Batch 3 — historical evidence and remaining presentation

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
