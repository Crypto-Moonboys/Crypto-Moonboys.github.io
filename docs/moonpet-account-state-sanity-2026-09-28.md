# Moonpet account state and reward consistency audit — 2026-09-28

Baseline: merged/deployed `bf1a0a26d72479015bbc7d3c456b41844016f6ae` (#1363).
Scope: trace earlier false-empty reads and interrupted/replayed reward bugs through
remaining game, mission and public-display paths. Reproduce confirmed defects in
SQLite, fix them, then run the complete repository and browser suites. Production
checks are read-only; no private player account was played, modified or reset.

## Confirmed defects and repairs

| Finding | Reproduction | Repair |
| --- | --- | --- |
| Standard Run can erase an overlapping care reward | Pause either a successful or failed Standard step before its batch; commit Feed; resume the stale step. The old absolute pet write overwrites the new care XP, while the accepted Feed receipt and leaderboard totals remain. | Check all captured pet-owned fields inside the step reservation. A conflict writes no step, spends no wallet/item cost, and advances no room; refresh/retry uses the new pet state. Daily, weekly, seasonal and all-time XP agree after the retry. |
| Missing read evidence can change a Standard outcome | Fail source-pet, inventory, wallet or daily-XP lookup. Old code reports the pet missing, assumes an empty bag/wallet, or treats already capped daily XP as zero. | Required reads propagate failure before resolution. Retry retains original source ownership and normal inventory consumption/XP caps. |
| Pending work can be bypassed when changing pets | Persist an active Run, Arena or Kaiju session, then fail only its pending-work query while switching to another owned pet. | The shared switch/season-preparation guard propagates failures. The active pointer remains unchanged; a healthy retry still sees the saved blocker. |
| Roster and Arcade options can falsely reset | Fail roster adoption, selected pointer, owned-pet list, lifetime Arcade XP or spendable Arcade XP. Previously the roster could select slot one, show no purchasing balance, or disappear from full state. | Required roster evidence reaches the normal display retry path. Legitimately empty balances still display zero. Per-pet progression retains its existing explicit unavailable card. |
| Journey settlement can look missing | Fail Daily objective/latest/accepted-receipt reads after a saved Mark receipt, or the Weekly latest-receipt query. | Daily required reads preserve the last good full state through retry. Weekly uses its existing authority-syncing state. Saved claims and reward limits are unchanged. |

The shared wallet and atomic pet reads now distinguish database errors from a
successful missing-row lookup. Best-effort recovery queues, optional reaction
text and panels with an explicit unavailable state retain their existing behavior.
No blanket removal of recovery catches, reward redesign or art regeneration.

## Gameplay and synchronization coverage

The current source routes and existing executable suites were rechecked, including
full SQLite-backed Mini App browser flows. This is evidence for the tested paths,
not a claim that every possible production account or outage was exercised.

| Surface | Checked contract |
| --- | --- |
| Egg, roster and care | Adoption/incubation/hatch, per-pet ownership, species/evolution gates, slot purchase/switch, Feed/Play/Clean/Sleep/Train and the three special care actions; cooldown and busy/energy gates. |
| Daily checklist | Seven goals, durable completion evidence and once-per-UTC-day 7/7 bonus; repeated or interrupted claims cannot add a second payout. |
| Daily Journey and Cache | Qualified objective evidence, one Growth Mark per pet/day, accepted receipt display, daily chest claimed/reset state and retries. |
| Weekly Journey | Care/training/run/boss/check-in routes, five objectives, source pet/season/week, once-per-week Crest and receipt recovery. |
| Weekly Boss | Unlock/attempt rules, saved damage and victory, boss finish recovery and original-pet rewards after selection changes. |
| Standard Run | Room choices, 100-room ending, extraction/failure, source gear, currency/item spending, bounded paid-ending recovery and overlapping care reward protection. |
| Official Daily Run | Ten rooms, Alley King, one account attempt/day, saved condition/tactics, interrupted start/room/ending repair and public records. |
| Continuing Contracts | Repeatable six/ten-room goals, drafts, end boss, saved reload, failed/completed run records, reward limits and payout recovery. |
| Season progression | Growth Marks/Crests, evolution and completion authority, XP-tier claims and retained-pet rewards. |
| Signal Sovereign finale | Qualification, three builds, saved turns/reload, defeat/free retry, victory achievement, once-per-pet/season payout and interrupted reward recovery. |
| Other play options | Timed jobs/activities, district and story choices/checkpoint bosses, seasonal raids, Arena/Kaiju, trade, bounties, expeditions, market, crafting/use, equipment/mastery and relic display. |
| Public ranks/activity | Website/Mini App/shared API projection; daily/weekly settlement windows, source-season XP, all-time retained pets, run-depth rankings, source-pet display identity, replay/privacy filters. |
| Practice and future systems | Practice remains local without official rewards; unimplemented expansion systems stay unavailable. Owned cosmetics remain collection unlocks rather than an implemented equip feature. |

Pet XP, Community XP, Arcade XP, Contract Rank and Journey Marks/Crests are
separate authorities. Every click is not a public XP event. The public activity
feed reflects accepted supported receipts. The website entity graph reflects
wiki entities/relationships and is not a Pet XP graph.

## Verification

- Added 19 regression/control cases: 18 fail against the unpatched baseline;
  the empty-state control passes. All 19 pass with these fixes.
- All 181 tests in the three expanded progression/run suites pass and cover the previous recovery, cross-pet,
  historical-season, hatch-gate and required-state-read regressions as well.
- The race tests exercise both success/failure outcomes, no partial step commit,
  safe retry, agreement of all four Pet XP leaderboard periods, and the D1
  100-bindings limit.
- The isolated per-pet migration fixture now creates its existing pending-work
  and Arcade tables before invoking switching. Previously missing fixture tables
  were hidden by the very error swallowing removed here.
- Full `npm test`: passed across arcade, Worker/API, wiki, WAX and visual
  domains. Browser loops cover 390×844 and 360×640; public board/activity
  browser coverage also includes desktop.
- State-budget regression: warm refresh remains within 180 SQL statements;
  50 pending sources drain with a measured peak of 569, below the 600 bound.
- `git diff --check` and syntax checks for changed JavaScript.

Live checks on 2026-09-28:

- `/health` 200/ok; `/deployment-info` matches the baseline commit.
- Daily/weekly/seasonal/all-time/run-depth Pet boards all return 200 (2/2/3/5/3
  entries at inspection); public activity returns 20 items.
- The game page, Mini App client, play-options and practice assets match main;
  the public Pets client also matches main.
- Live graph/Pets verifier passes: 327 wiki nodes, 1,629 edges; full/mobile graph
  and wiki surface agree. No graph changes are necessary for this Worker patch.

## Deployment

After merge, pull main, run `npm ci`, then:

```text
node scripts/deploy-worker-with-provenance.mjs moonboys-api
```

Worker deploy required: **Yes**. New D1 migration: **No**. VPS restart: **No**.
Frontend/assets: **unchanged**. Confirm health and deployed commit, then reopen
or refresh the Mini App. Verify the selected roster pet, wallet, Daily/Weekly
Journey receipts and a normal Standard Run action. This PR itself does not deploy.
