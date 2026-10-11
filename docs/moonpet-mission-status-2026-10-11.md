# MoonPet daily status and saved claim indicators

First implementation batch for [roadmap #1478](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/issues/1478): H04/H21/H24 and the daily-checklist portion of H33. Baseline: `8e2bd140f143f80386c3ae8667ee5c27a52530b9`.

## Observed gap and resulting behavior

The six dock buttons had static captions. Daily checklist and bonus details were
inside collapsed panels, with no persistent completion bar. The checklist's
NEXT text came from Daily Journey guidance, a separate five-objective system.

Missions now shows the seven-mission count and current incomplete goal above
its collapsible panels. It highlights the first unfinished goal in the server's
checklist order; its route still explains the live gates. The same goal is highlighted
inside the checklist. Navigation opens existing qualifying panels and submits
no gameplay mutation. Completion and confirmed payment have distinct visible
states; the bonus panel summary also explains its current state when collapsed.

The Missions badge counts distinct saved daily bonus days, Contract reward IDs
and won/unpaid Finale pet/competition-quarter pairs. It uses existing server
projections and existing claim controls. Saved rewards for earlier pets remain
visible; an egg cannot receive an unassigned daily bonus. A syncing/unavailable
feature never invents a claim. Journey awards are automatic and excluded, as
are claims whose controls belong to Home, Explore, Work, Economy or Profile.
An unconfirmed mutation requires Refresh and suppresses the claim badge until
the authoritative save is accepted. No polling or extra API request is added.

## Validation and release

- `scripts/moonpet-mission-status.test.mjs`: completion vs payment, missing/core
  authority, old pending days, egg gates, source-pet recovery, deduplication,
  unavailable features and automatic Journey exclusions.
- Existing SQLite-backed browser suite: 360/390px mobile and 1280px desktop tab
  readiness/current goal; real daily claim and Finale handlers, no-write review
  navigation, badge removal after payment and failed post-payment refresh.
- Shared guide copy is regenerated with `scripts/sync-moonpet-guide.mjs`.
  The modified browser test is explicitly included in visual change scoping.
- No Worker, D1, economy or canon change. Pages assets receive a new version.
  Rollback consists of reverting this frontend batch; no data rollback is needed.

Public checks on 11 October: the live page used the previous expected asset
versions; `/deployment-info` reported Worker commit
`63f371e5ce4715b77886be3faad85eafe7c79816`, deployed 10 October.
No dedicated signed Telegram canary credentials were available in this session.
These checks do not establish authenticated production correctness or migration
status. This batch does not claim to fix the unverified Radio/jobs/Moon Alley
reports. After release, verify the new indicator and daily claim sequence on
real Telegram Android/iOS/Desktop, including pet switching and UTC rollover.

The master roadmap stays open. Consistent indicators across the other five
menus and the remaining quest types are subsequent work, not shipped here.
