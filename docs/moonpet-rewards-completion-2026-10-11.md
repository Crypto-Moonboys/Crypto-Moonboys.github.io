# Current Moonpet rewards and recovery — 11 October 2026

## Verdict and scope

Baseline: merged PR #1482, main `2b6d045bc382bbcdeb40e36008d06d3b207a8f77`.
This audit covers the existing game and its reward-bearing routes. It adds no
breeding, housing, clan or other new-phase gameplay. Existing server settlements,
permanent ownership, reward amounts, caps and expiry rules remain authoritative.

The current route/end/reward handlers are connected and covered by the existing
real-Worker/SQLite and browser suites. Three midnight defects were reproduced:
Bounty, Market and Expedition actions did not carry the date of the board the
player saw. The baseline handlers accepted unpaid old-day actions against the
new day's board, consuming new stock/attempts or claiming a new bounty.
The corrected handlers reject these with `economy_day_changed`, a fresh-state
request and no new cost/reward. Already-paid requests still acknowledge their
original receipt without paying or charging again, including after pet changes.

This is a tested current-game correction, not proof that every live historical
account or genuine Telegram client has completed QA. Production D1 migration
evidence and genuine Telegram gameplay remain release checks.

## Existing endings and reset rules

| Current system | When it ends and what pays | Reset / recovery |
| --- | --- | --- |
| Care | Accepted Feed/Play/Clean/Sleep/Train uses existing stat costs, cooldowns and capped XP; Energy Drink/Dance/Cuddles are stat-only | Server cooldowns and account daily limits; original accepted actions are not replayed on refresh |
| Daily Cache | One account/UTC-day claim; currencies and capped source-pet XP settle together | New Cache at 00:00 UTC; collected state comes from its receipt |
| Seven daily missions | All seven goals qualify one saved 7/7 bonus: up to 25 Pet XP, 50 Gold and 1 Style | New checklist at 00:00 UTC; complete unclaimed older days remain claimable |
| Daily Journey | Three of five validated objectives qualify one Growth Mark | UTC-day goals; automatic settlement and source-bound historical recovery, no additional claim button |
| Weekly Journey | All five objectives qualify one Weekly Crest | The pet's own seven-day qualification period, shown by its separate countdown; automatic settlement/recovery |
| Jobs / Adventures | One accepted outcome, displayed costs and capped rewards | Shared job cooldown / 30-minute Adventure cooldown; saved receipts and runtime progress recovery |
| Timed activities | Claim from five minutes, ending the activity; cancel earns nothing. Train caps at two hours, other timers at eight | Untouched activity expires 24 hours after its cap. A saved claim in recovery keeps its frozen reward; retry cannot accrue or pay again |
| Standard Moon Run | Extract, fail or reach the existing 100-room cap; failure loses the unbanked bag | Saved source-pet run and ending recovery; next run requires normal energy/eligibility |
| Official Daily Run | Extract, fail or finish the tenth room / Alley King; saved score and qualifying rewards | One account attempt per UTC day, including failure. Final-room delivery can recover without an eleventh room or second payout |
| Continuing Contracts | Clear only after the main goal and final boss; defeat/abandon earns no rank/bonus | Immediate replay without pet energy/cooldown. Rank continues; first three account/day clears reserve up to 20 XP each. Older reserved bonuses remain recoverable |
| Street Events | Resolve one saved authored choice and outcome | Original choice/reward recovery; repeated-play scaling and caps remain |
| Districts / stories | Accepted mission/checkpoint or story step/cycle | Existing daily limits; saved choices survive calendar changes and do not restart a settled outcome |
| Weekly Boss | Accepted daily attack or earned shared victory | Account attack/day; Monday 00:00 UTC rotation. Original victory claim needs no new attack/energy. Participation challenge grants journey evidence only |
| Seasonal Raid | Saved tactical hit; defeated rotation's earned reward | Pet attack/day and existing rotation. Old earned claims retain source pet/rotation and require no new hit |
| Arena / Kaiju | Saved match result, including existing terminal/deadline rules | Original participating pet settles once; refresh recovers saved endings. Queue expiry is not a paid win |
| Daily Bounties | Four rotating accepted-action targets, separately claimed | Claim before 00:00 UTC; unclaimed targets expire. Paid receipts remain paid and old-day acknowledgements cannot claim today's board |
| Crystal Expeditions | One displayed destination outcome with energy debit and capped rewards | Three account attempts/day. Paid retries recover the same receipt; unpaid dated old buttons cannot use a new day's attempt |
| Moon Market | One whole affordable/capacity-safe bundle per offer | Stock rotates at 00:00 UTC. Receipt/request replay cannot debit again; unpaid dated old stock cannot buy new stock |
| Shop / inventory / crafting / upgrades / styles | Existing ownership and cost validation; purchases and conversions settle once | Owned assets persist. Free equip changes grant no shopping credit/XP; costs, gates and recipes stay visible |
| Season XP tiers | One claim per unlocked tier in its earning competition quarter | Old unlocked quarters remain claimable; original account/quarter/tier receipt is authoritative |
| Signal Sovereign Finale | Saved turns; free retry after defeat; won battle has a separate once-per-pet/quarter claim | Active old-quarter fights and earned claims persist; no automatic retirement or forced pet reset |
| Evolution / morph | Existing validated progression gates | Upgrades rather than currency claims; lifetime progress persists across competition periods |

Account Pet XP remains capped at 1,200 per UTC day. Community XP, specialist
progress, rank, materials, items, Marks and Crests have their existing separate
rules. A preview is not a promise of an uncapped payout. Read failures do not
invent an empty wallet, a completed objective or a claim.

## Corrections and UI checks

- Mini App and generated Telegram economy buttons carry their board day. Coach
  bounty shortcuts carry the same date. Previously paid Bounty receipts are read
  before current-day eligibility so their acknowledgements survive midnight and
  a pet switch. Market and Expedition retain their existing request receipts.
- Every adopted-state cooldown summary schedules the next UTC day and Monday
  competition/boss boundary, even without optional panels or used cooldowns.
  This schedules the existing serialized server refresh, never a client payout.
  A pet's separate Weekly Journey deadline remains independently scheduled.
- Every menu has a closed, dismissible **Rewards // Endings & Resets** panel;
  its open/closed choice survives normal redraws/navigation. It uses shared
  guide copy, reset countdowns and the existing accessible panel controls.
- Accepted duplicate responses say **Saved Result Confirmed** and **No Second
  Payment**, without presenting the old receipt as a new positive reward.
- Bounty and activity expiry are explicit. Automatic Journey awards, claims,
  upgrades and active sessions remain distinct; badges clear on confirmed state.
- Nested activity/receipt disclosure summaries have a 44px minimum touch target.
  Mobile layouts, costs, shop level explanations and review links use existing
  panels. Browser checks cover all six menus at 360/390/1280px; review links submit
  no mutation, help can be closed, and actual claims clear their badges.

Older clients that omit a board date retain the existing current-day protocol
for coordinated rollout. The updated Mini App and newly generated bot controls
use dated actions. No API path, reward amount or database schema is added.

## Read-only live release evidence

Observed 11 October 2026:

- Live `/moonpet-game.html` matches baseline main byte-for-byte. Served CSS,
  Mini App, shared guide and Play Options also match their committed main bytes.
  Live tokens: CSS / Play Options `20261011-menu-status-v2`, Mini App / Guide
  `20261011-menu-status-v1`.
- Worker `/health` returns `{ "ok": true }`. `/deployment-info` reports
  `63f371e5ce4715b77886be3faad85eafe7c79816`, deployed
  `2026-10-10T09:11:50.541Z`, production.
- That commit and baseline main have the identical `workers/moonboys-api`
  subtree `cdc5694b5098ae7991d8ffacea9fe18d6687e841`. A different repository SHA
  here does not mean different deployed Worker source.
- Baseline main's Pages deployment and Live Site Verify succeeded:
  [Pages](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/actions/runs/38149487255),
  [live verification](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/actions/runs/38149604363).
- Bot source and website launcher agree on the previous page token. This PR
  advances both to `20261011-rewards-v1`, together with changed CSS/app/guide
  assets. Play Options retains its unchanged token.
- The migration verifier/evidence request already required the complete existing
  migration history, but `deployments/production.json` omitted 30 of those
  requirements, including 076 Contracts and 077 completion/Finale rewards.
  The manifest now matches that existing exact gate. Historical migration names
  do not expose or enable retired gameplay. `verified_migrations` stays empty;
  no private database evidence was obtained or invented.
- The retained global Worker manifest predates the fresh endpoint evidence above;
  it is not substituted for current provenance. D1 status remains **unverified**.

This PR needs an approved Worker and Pages release, no new migration and no VPS
restart. Verify all existing prerequisite migrations using the repository D1
read-only evidence workflow before calling production fully verified. Following
GK release approval, deploy from freshly fetched main through the provenance
wrapper, confirm the exact merged commit at `/deployment-info`, check the new
asset tokens/launcher, and run the dedicated signed-account canary and genuine
Telegram mobile QA. No production action, merge or deploy occurred in this audit.

## Validation

Final command results are recorded in the PR. Dedicated regressions cover all
three old-board rejections, lost acknowledgements across midnight/pet switching,
unchanged receipts/wallet/XP/energy, failed receipt reads, leap/year boundaries
and dated Coach callback length. The existing Worker domain covers daily/weekly
source evidence, reward caps, original-pet recovery, saved endings and concurrency.
The Worker-backed browser loop exercises both mobile sizes, existing runs,
Contracts/bosses/raids, claims, jobs/timers, expeditions, crafting and all-menu
status clearing. Public/in-game guide tests cover 360/390/1280px and shared copy.
Native disclosure keyboard checks wait for an explicit save refresh before
typing, because a navigation-triggered read can replace the focused node. They
also verify that expanded help survives the refresh and dismissed help survives
review navigation, without weakening the 44px touch-target measurement.
