# Moonpet post-deployment sanity audit — 29 September 2026

## Verdict

The daily, weekly and season reward loops are connected in the exercised source,
SQLite and browser paths. This is not an all-clear on live historical totals.
Three production leaderboard discrepancies remain, and this audit reproduced
one additional care-state bug in three economy actions.

Audited main and live Worker commit: `10fe6c8561de2d43869993b393e8e04e5cab079b`.
`/deployment-info` reported production deployment at `2026-09-29T10:13:07.704Z`.
The preceding Rename/Trade XP fixes and both rename review corrections are
present. Changes since that PR are NFT/feed generated data, not Moonpet gameplay.

## Confirmed defect and correction

Trade, Shop purchases and Daily Cache moved `last_decay_at` to now without
updating stored care stats. The initial read calculated decay in memory, but
settlement discarded the elapsed interval. A ten-hour-old pet with 80 energy
and 20 hunger returned 80 energy and 20 hunger instead of approximately 58
energy and 65 hunger. All three regression cases failed on deployed main.

These economy writes now leave the care clock unchanged. The existing decay
paths calculate/persist the elapsed change. This avoids stale absolute care
writes and preserves intervening care. Reward, currency, equipment, quest and
leaderboard settlement contracts are unchanged. The regression also checks a
fresh read and exactly one accepted source receipt.

Other care-clock writes were traced: care/consumable transactions apply decay,
run choices use source-state guards, and the normal source-pet reward wrapper
uses atomic decay before currency settlement. Legacy fallback paths are not a
claim of complete coverage for every possible historical database state.

## Player options and completion paths

| Surface | Ending and reward evidence |
| --- | --- |
| Care, incubation, hatch, roster and evolution | Ownership and lifecycle gates; busy/energy gates; cooldown and concurrent care regression suites |
| Dance, Energy Drink, Cuddles | Stat actions with their own limits; no official Pet XP or Journey care credit |
| Daily checklist | Seven goals; once-per-day 7/7 bonus up to 25 Pet XP, 50 Gold, 1 Style; completed unclaimed days survive midnight |
| Daily Cache, bounties and Daily Journey | Source receipts and single claims; Journey requires three of five objectives for a Growth Mark |
| Official Daily Moon Run | Ten-room route and Alley King; terminal payout recovery and source-pet attribution |
| Weekly Journey | All five objectives for a Crest; two check-ins must be on distinct UTC days; failed recovery batches rotate |
| Weekly Boss | Saved tactics/attempts, victory and recoverable reward; ordinary weekly attempt gates remain |
| Standard Run and Contracts | Saved steps, terminal failure/extraction/completion; Contracts have six/ten-room goals and final bosses, replay and reward recovery |
| Season | XP-tier claims; qualification through final evolution, 60 distinct-day Marks and 10 distinct-week Crests; optional Signal Sovereign finale |
| Finale | Three builds, saved revisions, defeat/retry, victory and single reward up to 100 Pet XP, 200 Gold, 5 Style; archived qualified pets retain source-season attribution |
| Jobs, timed activities, expeditions, districts, stories, raids | Costs, choices, saved completion/claim and interrupted reward recovery covered by the backend/browser suites |
| Arena and Kaiju | Source-pet battle and reward authority exercised in fixtures; no authenticated live human-opponent match performed |
| Shop, trade, crafting, upgrades, relics and cosmetics | Ownership, wallet/capacity and accepted receipts; care-clock bug corrected here; Relic Vault read failure remains visibly unavailable |

The literal button scan found 51 distinct single-line action keys with matching
Mini App dispatcher entries. This excludes dynamically constructed care,
finale-start/retry and local Practice controls; their existing runtime/browser
coverage was checked separately. A source string match alone is not a click test.

Practice is local and reward-free. Breeding, post-season Traits, Sanctuary,
Lineage, Fusion and Prestige remain unavailable in the Mini App. Style Lab
collects unlocks without visible equipment; passive relic powers are inactive.
These are existing limits, not new reward wiring failures.

## Website and leaderboard synchronization

The public website, bot and Mini App use the shared Pet leaderboard projection.
Daily/weekly totals use accepted Pet XP receipts; seasonal uses source-season
counters; all-time sums retained owned pets. Public activity is a recent receipt
feed, not a log of every click. Community XP and Contract Rank are distinct from
Pet XP. Wiki entity graphs and Arcade rankings are separate systems.

Fresh public responses at 10:17 UTC still showed:

| Player label | Seasonal XP | All-time XP | Difference |
| --- | ---: | ---: | ---: |
| Piga / PixelJourney | 9,077 | 6,935 | 2,142 |
| GKniftyHEADS.com | 4,099 | 4,027 | 72 |
| NBG Project / Charlie Buster | 2,400 | 1,901 | 499 |

These are the same outstanding historical discrepancies as the preceding audit.
Shared read queries do not repair divergent stored values. Public responses do
not establish which historical receipt, legacy baseline or write caused each
account's difference. Use `scripts/audit-moonpet-xp-ledger.sql` privately before
planning a repair. Do not overwrite totals or replay currency rewards from this
public comparison alone. No production records were changed in this audit.

## Verification and deployment

- Deployed-main backend domain passed.
- All 12 focused write regressions pass, including the three new cases that first failed on deployed main.
- Mobile gameplay passed at 390×844 and 360×640 across all six screens, including daily completion, finale, run/boss endings, interrupted claims and retries.
- Public leaderboard browser checks passed at 360, 390 and 1280 pixels: four periods, receipt identity, refresh, stale-data retention and outage recovery.
- Full patched suite result is recorded in the PR.

These are isolated gameplay fixtures plus read-only production checks, not a
claim to have exercised every real account. No production gameplay or private
D1 inspection was performed. After approved merge, deploy `moonboys-api` from
main using the provenance wrapper. No new D1 migration or VPS restart is needed.
The historical leaderboard discrepancy remains a separate reconciliation task.
