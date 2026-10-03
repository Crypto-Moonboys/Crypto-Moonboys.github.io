# Moonpet post-PR1423 audit — 3 October 2026

Historical audit evidence for the baseline below. The [consolidated fix report](moonpet-consolidated-audit-fixes-2026-10-03.md) records subsequent implementation and validation. Diagnostic scripts assert that historical baseline, not the fixed PR head.

Audited latest `main`: `cae48482af09f535ffddc0b1881d62f4a6b00e03`, including merged PR1423. Read `AGENT_EDITING_RULES.md` and `moonpet-source-of-truth.md`. Work is isolated on `sandbox/moonpet-post1423-audit-20261003`, with a backup branch.

**Twelve confirmed P2 / Medium bug families need fixes.** Round one established A1–A5; round two established A6–A9; round three established A10–A11 and confirmed another affected caller for A8; round four established A12 and extended A9 with duplicate-progression recovery. These findings precede any gameplay patches or PR. This is an audit, not a fix release. Evidence comes from source inspection, real in-memory SQLite, authenticated local Worker action requests, state-builder interleavings and browser fixtures. Production D1 and deployed account state were not inspected. Passing existing CI does not cover the newly reproduced failures below.

A6 reproduces during normal gameplay as well as an interrupted payout. A7–A9 reproduce under injected successful zero-row database writes; healthy writes and thrown-transaction controls were tested separately. These are confirmed handling/recovery defects, not claims that the injected faults have occurred in production.

Round three uses retained-state fixtures: incomplete/malformed resolved boss outcomes for A10 and an old rejected Journey receipt for A11. These are confirmed recovery/projection handling defects, not evidence that ordinary healthy writes produce those records or that production contains affected accounts. No new XP or wallet desynchronization was confirmed in round three. Round four confirms core-action settlement divergence under injected successful zero-row writes, with healthy/rollback controls; it does not establish occurrence in production.

## Complete confirmed bug list

| ID | Severity | Bug | Player impact |
| --- | --- | --- | --- |
| A1 | P2 / Medium | Seasonal Raid rewards use the claim quarter instead of the proven victory quarter. | Delayed claims move competition XP into a later quarter, affecting rankings and tier eligibility. |
| A2 | P2 / Medium | A full state response can mix old wallet/season XP with a newer leaderboard after a concurrent payout. | Header, shop affordability and leaderboard disagree in one successful response. |
| A3 | P2 / Medium | Contract settlement clears pending despite an ignored source acknowledgement. | A paid reward appears finished while its source remains pending and can block deletion. |
| A4 | P2 / Medium | Seasonal Raid settlement clears pending despite an ignored source acknowledgement. | A paid raid reward remains visibly unclaimed/recoverable despite a completed response. |
| A5 | P2 / Medium | A failed Daily Run room read is published as an empty room. | A valid unfinished run loses its three choices until a healthy refresh. |
| A6 | P2 / Medium | Pending Street Events outlive their challenge without a recovery ending. | An unaffordable rolled outcome or interrupted payout strands a reservation, consumes a reward slot and blocks source-pet deletion. |
| A7 | P2 / Medium | Crafting, upgrades and cosmetics can seal completed receipts despite missing output. | An ignored output write spends materials/currency without delivering the item, upgrade or cosmetic; retries cannot repair it. |
| A8 | P2 / Medium | Unproven Mark/Crest duplicates close activity or Weekly Boss follow-ups. | An activity can permanently lose its Growth Mark; a Weekly Boss finish can hide its missing Crest from refresh recovery. |
| A9 | P2 / Medium | District/story/raid progress and terminal receipts do not commit together. | Missing progress can be sealed; an ignored terminal marker instead lets recovery add district mastery or raid damage twice. |
| A10 | P2 / Medium | Daily boss recovery treats missing/non-boolean success as a victory. | Incomplete retained outcomes can receive boss drops, a victory record and a completed Daily Run without proven success. |
| A11 | P2 / Medium | An old rejected Weekly Journey receipt overrides verified objective counts. | Four valid objectives display as 5/5 with a ready Crest, while the server correctly rejects qualification. |
| A12 | P2 / Medium | Core care/item/trade receipts do not prove XP, wallet or item-debit writes. | Accepted actions can leave lifetime XP, competition rankings or Community XP inconsistent, miss promised Gold, or grant item/trade effects without consuming their cost. |

### A1 — Raid competition XP uses recovery time

Source: `workers/moonboys-api/pets/live-systems.js`, `claimPetSeasonalBossReward` (line 610); reward request around lines 625–629. The saved victory includes `defeated_at`, but the award request does not provide the authoritative earning timestamp for competition attribution.

Reproduction: save a qualified source pet's raid victory at `2026-09-30T23:59:59.999Z`; advance two milliseconds into Q4; select a third pet; claim the saved original pet's victory. The authenticated claim awards 150 Pet XP, 250 Gold and 8 Gems. Only Q4 receives 150 competition XP; Q3 receives none. The original pet correctly increases from 10,000 to 10,150 lifetime XP, the other two remain at 10,000, and ownership seasons remain unchanged.

Required fix: derive the competition earning quarter from proven victory evidence and pass it through the award authority. Keep source ownership identity, receipts and existing account settlement-day caps separate from that competition clock. Reject unavailable or invalid attribution instead of substituting the claim clock. Do not rewrite ownership or delete history.

Required regressions: victory immediately before rollover and claim afterward; different selected pet; two/three owned pets; source ownership from an older quarter; interrupted payment and repeated claim; current-quarter control. Assert original-quarter XP and tier eligibility, lifetime XP, wallet and receipt idempotency independently.

### A2 — Economic projections lack a final consistency check

Source: `workers/moonboys-api/worker.js`, `buildPetMiniAppState` (line 10319), parallel leaderboard projection around line 10407, final validation around line 10552. `assertPetProjectionSource` (line 10108) validates ownership/selection/achievement provenance; `assertPetProjectionPeriods` validates period identities. Neither proves that economic values came from a consistent snapshot.

Reproduction: keep pet A selected in a three-pet account with zero Gold/Gems. Just before the full state's `WITH owned_pets AS` leaderboard read, make a real authenticated raid claim for pet B. The successful state returns header Gold/Gems **0/0** and guidance quarterly XP **0**, while the same-quarter leaderboard shows **150 XP, 250 Gold and 8 Gems**. Moon Kibble costs 45 Gold but remains `affordable: false` in `guidance.shop_items`. Stored wallet values are 250/8. The payment still belongs to B; no cross-pet XP transfer occurs.

Required fix: build related economic projections from one authoritative snapshot and validate it before publication, or return the existing stale/refresh response when concurrent settlement invalidates it. Checking a second-resolution timestamp alone cannot distinguish all concurrent mutations. Audit Full/Profile, Missions/Core, action hydration, leaderboard self rows, shop/inventory and recovery callers for the same assumptions. The demonstrated failure is in Full; Profile shares its builder.

Required regressions: interleave payout and spending between header, guidance/shop and leaderboard reads; both two- and three-pet accounts; selected-pet and other-pet rewards; a consistent pre-mutation response control; same-second mutations; unavailable refresh and successful retry.

### A3 — Contract acknowledgement accepts zero affected rows

Source: `workers/moonboys-api/pets/continuing-contracts.js`, `settleBonus` (line 364), source acknowledgement around lines 379–383. The mutation checks reject invalid/negative change counts but allow zero; pending status is then cleared based on the payment receipt.

Reproduction: seed a completed 20-XP Contract. Add a SQLite `BEFORE UPDATE OF reward_settled` trigger using `RAISE(IGNORE)`. An authenticated `contract_claim` returns accepted, pays 20 XP and reports `reward_pending: false`; the saved source still has `reward_settled = 0`, and its Contract board still has one pending reward. Remove the fault, switch to the third pet and retry: the marker repairs without more XP.

Required fix: require one acknowledged source-row mutation, or an authoritative reread proving that the exact source was already acknowledged with the correct credited amount. Until then, preserve the accepted payment with pending/refresh status. The existing receipt prevents duplicate payment and must be retained.

Required regressions: ignored, thrown and failed acknowledgement; concurrent already-completed acknowledgement; retry after selecting another pet; deletion blocker clears only when source acknowledgement is durable.

### A4 — Raid acknowledgement ignores mutation evidence

Source: `workers/moonboys-api/pets/live-systems.js`, `claimPetSeasonalBossReward`, marker update around lines 632–636. The `.run()` result is not checked for success or affected rows before returning the original completed result.

Reproduction: seed a proven raid victory and add a SQLite `BEFORE UPDATE OF reward_claimed_at` trigger using `RAISE(IGNORE)`. The authenticated claim pays 150 XP, 250 Gold and 8 Gems and returns `reward_pending: false`, while `reward_claimed_at` remains null. Remove the fault, select the third pet and retry: the response is a duplicate, balances and lifetime XP remain unchanged, and the marker repairs.

Required fix: validate mutation success and one acknowledged source row, or prove the exact claim is already durably marked. Preserve accepted payment plus pending/refresh if acknowledgement is unavailable. The zero-row failure is reproduced; the missing resolved-failure validation is also visible in the source.

Required regressions: zero-row, resolved failed and thrown acknowledgement; already-marked concurrent claim; interruption and retries after switching pets; historical raid instance and unchanged original ownership.

Control: the analogous Weekly Boss ignored-acknowledgement response correctly serializes `reward_pending: true`. Daily Completion and Finale acknowledgement regressions also pass. Those paths are not new findings here.

### A5 — Failed room reads become fake empty gameplay

Source: `workers/moonboys-api/worker.js`, full-state Daily room projection around lines 10511–10532. The initial `roomQuery.first()` and the subsequent repair read do not validate failed-result envelopes before constructing the room projection.

Reproduction: start a Daily Run through the authenticated endpoint and verify three choices. Return `{ success: false, error: 'failed_daily_room_projection' }` from the exact `SELECT room_number, room_type, status, generated_data FROM telegram_pet_run_rooms` read. Full state still succeeds with `room: {}` and zero choices. Saved room rows remain identical. Restore the read and refresh: all three choices return.

Required fix: validate both reads and room shape; return unavailable/stale/refresh on failed or malformed reads. Only a genuine authoritative absence may initiate room reconstruction, using the original run authority and seed. Do not treat a truthy failure envelope as gameplay data.

Required regressions: thrown, resolved failed and malformed reads; genuine missing-room repair; retries and pet switches; stored room/outcome immutability; healthy refresh.

### A6 — Pending Street Events have no ending after challenge expiry

Source: `workers/moonboys-api/worker.js`, `reservePetRepeatRewardEvent` (line 2127), `processPetRandomEvent` (line 3684), reservation around line 3715 and outcome/payment around lines 3757–3775. Full state generates a fresh encounter around lines 10428–10448. The action verifies its challenge before attempting saved-event recovery around lines 10847–10853. `pets/mini-app-auth.js` issues a default 600-second challenge and rejects expired tokens; `pets/deletion.js` includes pending pet events in deletion blockers.

Normal-database reproduction: give the account 3 Gold. Black Market Tip's `follow_lead` choice is enabled with `affordability: 'conditional'`; its setback branch can cost 2–4 Gold. Force a valid normal outcome costing 8 Gold. The action rejects payment and leaves wallet/XP unchanged, but the already-reserved event remains `pending` with a `repeat_reward_slot:1` reservation. Refresh generates a new encounter without exposing the saved pending event. Advance 601 seconds, select another owned pet, refresh and retry the original signed challenge: it rejects with `mini_app_challenge_expired`. The original reservation remains pending and deletion of its source pet rejects with `pet_delete_blocked`.

An independently tested thrown `pet_event` payout batch after reservation produces the same dead end. Both failures reproduce with two and three owned pets. Pet switching still works and the other pets do not receive the source pet's XP; the demonstrated loss is the missing recovery/cancellation ending, occupied reward reservation and deletion blocker.

Required fix: preserve the authoritative encounter, choice, rolled outcome, costs, source pet and earning window before recoverable settlement. Expose an owner-validated saved-source recovery or cancellation path that does not require an expired new-action challenge. A provably unpaid unaffordable outcome must reach a terminal state with correct shared reward-slot accounting. The current bare reservation does not preserve enough evidence to safely reconstruct every old outcome; leave unprovable legacy cases in an explicit audit state rather than inventing rewards or rerolling. Preserve expired-token rejection for new actions and retain historical receipts.

Required regressions: conditional unaffordable roll; thrown/interrupted payout; retries before and after challenge expiry and UTC midnight; refresh with a different selected pet; wrong-owner rejection; once-only reward/reservation handling; legacy incomplete evidence; deletion after safe resolution. Healthy accepted-event expiry must remain a completed action.

### A7 — Completed purchase/craft receipts do not prove delivery

Source: `workers/moonboys-api/pets/live-systems.js`, `requireLiveMutationBatch` (line 27), `processPetCraftRecipe` (line 268; batch/check around lines 283–301), `processPetEquipmentUpgrade` (line 770; batch/check around lines 797–817), and `processPetCosmeticUnlock` (line 821; batch/check around lines 843–866). The batch validator accepts successful zero-row results. Output checks occur after transaction commit, and the completion marker does not depend on output delivery. The subsequent rejection cannot change a receipt already marked `completed`; retries trust its saved payload.

Reproduction uses SQLite `BEFORE` triggers with `RAISE(IGNORE)` on each required output write:

- Craft Street Rations: spends 2 Scrap Metal and 1 Moon Fabric, delivers zero Moon Snacks instead of two, and seals the source `completed`. The first response rejects with `crafting_settlement_conflict` even though its player-facing copy says nothing was spent. Removing the fault and retrying returns `crafting_already_completed`, without restoring the output.
- Upgrade Moon Kibble from level 1 to 2: spends 80 Gold and 2 Scrap Metal, leaves equipment at level 1 and seals a completed payload describing level 2. The rejected `upgrade_conflict` response says nothing was spent; a healthy retry reports the already-completed upgrade without repairing level 1.
- Unlock Profile Frame: spends 4 Gems and 80 Style Tokens but creates no owned cosmetic. The first response accepts `cosmetic_unlocked` with quantity zero; a retry accepts the saved quantity-one payload while ownership is still absent.

All three paths reproduce with two and three pets, including a retry after selecting another pet. Healthy controls deliver once. `RAISE(ABORT)` at the same output positions correctly rolls back costs and completion, and a healthy retry then delivers once. This finding concerns ignored required writes, not ordinary thrown transactions. Other pets' XP remains unchanged.

Required fix: make debit, exact output and terminal receipt mutually dependent inside the atomic transaction, or retain a durable recoverable state until delivery is proven. Checking affected rows after commit cannot undo a partial purchase. Prove concurrent already-completed output against the exact source before treating a zero-row write as a duplicate. Audit both cost and output mutations across these paths. Preserve historical evidence; repair a paid missing output only when its payment and missing delivery can be proven.

Required regressions: healthy, thrown, resolved failed and successful zero-row cost/output/marker mutations; capacity/affordability and stale quotes; two-/three-pet retries; once-only debit and delivery; missing-output recovery without double delivery or fabricated ownership; truthful rejection/pending messages.

### A8 — Missing Marks/Crests are reported as existing duplicates

Source: `workers/moonboys-api/pets/season-completion.js`, `awardPetGrowthMark` (line 73; insert/read/result around lines 84–103). It reports `duplicate: !accepted` when the insert changes zero rows even if both exact-source and same-day mark reads return no existing mark. `workers/moonboys-api/worker.js`, `claimPetActivitySession` (line 6674), accepts this duplicate around lines 6783–6786 and writes `claim_state: 'settled'` around line 6803. Activity recovery selects unfinished settlement states, excluding this falsely settled claim.

Reproduction: start a Work activity, advance 301 seconds and ignore the Growth Mark insert with `RAISE(IGNORE)`. Claim accepts and pays 3 Pet XP, 1 Community XP and 12 Gold, but saves zero Growth Marks and marks the activity settled. Remove the fault, select another pet and refresh: no pending recovery appears. Retrying the saved session returns `no_active_activity`; the original pet still has zero marks. Currency and XP are paid once, without crediting another pet.

Both two- and three-pet accounts reproduce. A healthy claim earns one mark. A legitimate already-earned same-day mark remains one mark and permits settlement. A thrown mark insert correctly retains `claiming`; after removing the fault, refresh and saved-session retry recover the source mark without repeating payment. The zero-row path loses this existing recovery behavior.

Round-three extension: `awardPetWeeklyCrest` in the same module (line 109) also reports a duplicate from zero affected rows without proving an existing Crest. `finishPetWeeklyBossVictory` in `worker.js` (line 17453) trusts that response and inserts a completed `weekly_boss_finish` source. `pets/weekly-boss-recovery.js` excludes completed finishes from recovery.

Reproduction: seed the exact owned winning attack, account progress and victory tuple for `2026-W41`; ignore the Crest insert. The authenticated saved-victory claim pays once, saves no Crest and writes a completed finish. Remove the fault, switch through the real API to the second/third pet and refresh twice: the original pet still has no Crest. An explicit retry of the original `weekly_boss_claim` repairs it without another payout, but refresh has excluded its finish and the paid reward no longer appears as a pending claim. This extends the existing family; it is not counted as a twelfth defect. Healthy, thrown-write and legitimate already-owned-week Crest controls pass. A thrown insert leaves no completed finish and refresh recovers normally.

Required fix: report a duplicate only after proving an exact existing Mark/Crest or the legitimate same-pet/day or same-pet/qualification-week limit. A no-op insert with no such evidence must remain unavailable/pending. Do not seal activities or Weekly Boss follow-ups until authoritative award evidence exists. Audit Growth Mark and Crest callers in Daily/Weekly Journey, evolution, bosses and completion for the same duplicate assumption. Preserve paid-source evidence for recovery rather than inventing historical awards; previously completed finishes with a provably missing Crest need evidence-backed recovery.

Required regressions: zero-row, thrown and resolved failed mark writes and unavailable reads; exact duplicate and legitimate same-day cap; recovery after payment; original pet/date attribution; two-/three-pet switches; no duplicate XP, currency or marks.

Additional Crest regressions: missing award after a no-op insert; exact Crest and legitimate same-week cap; completed-finish exclusion; automatic recovery after a thrown write; explicit saved-source retry after pet switching; no second payment or second Crest.

### A9 — District/story/raid receipts complete despite missing progression

Source: `workers/moonboys-api/pets/live-systems.js`, district progress and completion batch around lines 499–513, story progress/completion around lines 585–597, and raid progress/completion around lines 670–683. Each validates the batch and completion-marker change count, but not the required progression change. `recoverPetLiveSystemEndings` (line 706 onward) recovers pending/rejected/settling sources; the false completed marker excludes the missing progress from recovery.

Reproduction ignores the required progression write with SQLite `RAISE(IGNORE)`:

- District mission: pays the normal reward and returns an accepted complete/setback outcome with `reward_pending: false`; source is completed, but `region_mastery_json` remains empty. Healthy refresh does not repair it, and retry reports `district_completed_today`.
- Story chain: pays the normal reward and returns `event_chain_advanced` with pending false; no saved chain step exists, but its completed source makes retry report `event_chain_step_used_today`. The day's attempt is consumed without the promised advance.
- Seasonal Raid: spends 18 Energy and returns `seasonal_boss_hit` describing 235 damage, but no boss progress is saved. Source is completed and retry reports `seasonal_boss_attempt_used`, leaving that attack's damage missing.

All three reproduce with two and three pets. After dropping the fault, advancing beyond the recovery lease and refreshing with another pet, progression remains missing. Other-pet XP and repeat-payment controls pass. Healthy writes advance normally. A thrown progress mutation rolls back the progress/completion batch, keeps the source `settling`, and healthy recovery restores source progress once without repeating payment. Successful zero-row progress writes incorrectly bypass that recovery.

Round-four extension tests the reverse interruption: ignore the terminal `status='completed'` update while allowing progression to save. The first response correctly reports accepted/pending/refresh, but its source remains `settling`. After removing the fault, waiting 181 seconds and selecting another pet through the real API, refresh repeats the saved decision. District mastery increases from 20 to 40 for the same source, and a saved raid hit of 235 becomes 470 total damage. The final payload still describes a single 20-mastery/235-damage outcome. Rewards are not paid again and energy is not charged again; the duplicate is progression. This can advance district gates or raid defeat sooner than the proven actions warrant.

The 18 marker cases cover district/story/raid, two/three pets, and healthy/ignored/thrown terminal writes. Story writes an absolute next step and stays at step 1, so this duplicate-addition claim applies only to district and raid. Healthy markers retain one application. Thrown markers roll back their progression batch, and recovery applies it once. Repeated refresh and explicit retries after the recovered completion do not add a third application. This remains A9, rather than a new numbered finding.

Required fix: only write a terminal receipt when exact source progression is durably applied or authoritatively proven already applied. Otherwise keep the source recoverable and publish pending/refresh status. Guard progress and source acknowledgement together so replay cannot add mastery, story steps or damage twice. Audit checkpoint bosses, story cycle boundaries, raid victory attribution, recovery and deletion consumers of these receipts. Preserve source ownership, paid receipts and historical progress.

Required regressions: zero-row, thrown and failed progression/marker writes after payment; ignored terminal marker after an applied mastery/raid increment; source-specific once-only progress independent of terminal acknowledgement; concurrent already-applied progress; recovery across day/rotation/quarter boundaries; two-/three-pet refresh and retry; once-only energy/reward/progression; correct boss eligibility after recovered damage.

### A10 — Daily boss recovery does not require proven success

Source: `workers/moonboys-api/pets/daily-moon-run.js`, `getPersistedDailyRoom` (line 238), `recoverDailyMoonRunEnding` (line 453) and its success check around line 465. Parsing absent or malformed outcome JSON yields `{}`; the check rejects only literal `success === false`. The automatic recovery candidate query around lines 493–502 uses `COALESCE(json_extract(f.outcome_data,'$.success'),1)<>0`, treating a missing success field as success. The downstream boss reward and memory writers consume this inferred victory.

Reproduction: start a real authenticated Daily Run, retain its owned run/seed and canonical generated final boss room, and seed the interrupted final-room position with a `resolved` saved outcome containing `{}` or JSON `null`. Request `run_extract` or build full state. Both recover a boss payout, record one Alley King victory and finish the run as `completed`, even though neither saved outcome proves success. A string-valued `success: 'false'` also wins through both paths. Manual extraction additionally accepts invalid JSON and numeric `success: 0`; the automatic scanner excludes those last two, showing inconsistent admission rules. Literal boolean `false` rejects without new gameplay awards; a saved boolean `true` succeeds normally.

The 28 cases cover both paths, seven outcome shapes and two-/three-pet accounts. Saved room evidence remains untouched and rewards/victories remain once-only on repeated extraction/refresh. Other pets receive no XP. In these fixtures the Daily boss reward grants materials, including the evolution drop; Pet XP, Gold and Gems do not increase. The confirmed defect is invented success, material drops, a boss victory and a Daily Run completion record, not an XP payout bypass.

Required fix: require authoritative successful boss-outcome evidence with validated types and intact owner/run/pet/room/choice provenance before new payout, victory or terminal completion. Use one proof rule for direct extraction, action retries, refresh/background recovery and reward authorization. Older incomplete outcomes may use another exact authoritative victory source when it exists; otherwise retain an explicit audit/recovery state. Do not infer success from absence, reroll the room, delete historical evidence or revoke already-awarded historical ownership/rewards.

Required regressions: absent/null/empty/malformed outcomes; false, string and numeric flags; canonical successful/failed final rooms; exact alternate legacy proof and missing proof; wrong owner/source; two-/three-pet retries; source-room immutability; no invented drops/victories or duplicate settlement. Healthy resolved boss endings must remain recoverable.

### A11 — A rejected Weekly receipt creates false completion/readiness

Source: `workers/moonboys-api/worker.js`, `buildPetMiniAppJourneySummary`: the latest-receipt query around lines 9835–9840 admits any status, and `weeklyCompleted` around line 9881 takes the maximum of verified progress, that receipt's saved count and accepted receipt history. Rejected history is therefore treated as current completion evidence. `js/moonpet-mini-app.js`, `weeklyJourneyNextAction` (line 1260) and `weeklyJourneyMarkup` (line 1289), use that inflated count to announce completion and a ready Crest.

Reproduction: retain four fully accepted source-backed objectives and an old incorrectly attributed Weekly Boss payout/objective. The current source validator correctly excludes that payout from the boss-attempt goal. Retain the old rejected Journey receipt with `completed_objectives = 5` and no Crest. Full and Missions both publish five complete objectives, while their own objective list shows only four complete and `weekly_boss_attempt` at 0/1. The actual client helpers render `5/5 OBJECTIVES`, a 100% meter, `WEEKLY CREST READY FOR SERVER SETTLEMENT` and “Weekly Journey complete.” A real finalization request correctly returns four completed objectives and rejects the award. Repeated refreshes retain the contradiction.

The 16 cases cover Full/Missions, two-/three-pet accounts and no-receipt, rejected-history, wrong-pet receipt and accepted-history controls. With no stale receipt, the display correctly shows 4/5. A different pet's receipt cannot inflate the selected pet; real API switches show its independent empty progress, then reproduce the original pet's false 5/5 on return. Accepted historical award evidence remains preserved. Completing the missing goal with a real accepted source subsequently earns one Crest; retry does not duplicate it. Wallets, Pet XP, other-pet progression and the old rejected receipt remain unchanged.

Required fix: derive live qualification/readiness from validated objective evidence. Keep rejected/unavailable receipt counts as diagnostic history, separate from completion and earned-award evidence. Preserve accepted historical rewards without making rejected history an eligibility shortcut. Make summary, meter, next-action guidance and objective rows agree in both partial and full projections; retain pet/ownership/qualification-week boundaries.

Required regressions: rejected high-count history with an invalidated source; valid current source counts; accepted historical award preservation; wrong pet/week/ownership receipts; Full/Missions/client rendering; repeated refresh and switches; a later legitimate completion and once-only Crest. Never delete retained erroneous rows or grant an award merely to match the old count.

### A12 — Core action acceptance does not prove economic settlement

Source: `workers/moonboys-api/worker.js`, `processPetAction` (line 6864; receipt acceptance/result around lines 7082–7089), `processPetUseItem` (line 3350; debit around lines 3430–3440 and acceptance/payment checks around lines 3460–3482), and `processPetGoldTrade` (line 7327; acceptance/result around lines 7446–7453). Required lifetime/care and Community XP writers are in `pets/care-writes.js`, `petCareDeltaStatements` (line 7) and `petCareCommunityStatements` (line 45). These batches authorize their terminal receipt from a pending source/existing ownership rather than proof of each required economic mutation. Item-use validates failure envelopes but permits a successful zero-row debit or XP write. Care/trade rely on their final receipt. A later duplicate reads acceptance instead of repairing the missing effect.

Reproduction ignores one required write with a SQLite `BEFORE` trigger using `RAISE(IGNORE)`:

- Feed reports 6 Pet XP and 2 Community XP, and daily/weekly/quarterly rankings each receive 6. When the lifetime write is ignored, the original pet stays at 10,000 XP and all-time account XP stays at 20,000/30,000 rather than increasing by 6. The core care update, including its stat changes, is also omitted by this trigger.
- Ignore the competition-state insert instead: lifetime, daily and weekly XP increase by 6, but the quarterly leaderboard shows zero. This is a durable discrepancy, separate from A2's mixed snapshots during a concurrent payout.
- Ignore Feed's Community user-XP update: the user retains zero Community XP, but the Community leaderboard and action receipt record 2. Ignore the Gold credit: Feed records/reports its 5 Gold reward but the wallet stays at 1,000.
- Use a Moon Snack with its lifetime write ignored: one item is consumed and the receipt/rankings record 4 XP, but the source pet gains zero. Ignore the inventory debit instead: the 4 XP and effects are granted while the same snack remains owned. A genuinely new use under the same injected debit fault grants another 4 XP without consuming that snack.
- A winning 50-Gold trade records/credits 37 Gold and 1 Gem, with 6 competition XP, but grants no lifetime XP when that write is ignored. A losing 50-Gold trade with its wallet debit ignored still closes as a loss and grants 1 XP while charging zero Gold.

All eight mutation positions reproduce in two- and three-pet accounts. These **48 cases** include healthy, ignored and thrown writes. Remove the fault, retry the exact authenticated action, switch away/back through the real API and refresh: the accepted missing-credit/cost state remains. Daily, weekly, quarterly and all-time leaderboard reads confirm the XP discrepancies. Other pets' XP remains unchanged. Healthy writes settle once; a thrown required write rolls back the whole action and a healthy retry settles once. The finding is conditional on the injected no-op; it is not a claim of a healthy free-item/trade exploit or of known affected production accounts.

Required fix: seal acceptance/payment only when exact source XP, competition XP, Community XP, wallet and consumable-cost effects are proven committed together. Required zero-row writes must abort before commit or retain evidence-backed recovery; checking results after commit cannot roll back an already accepted partial action. Preserve legitimate zero awards from caps, gear-independent stat effects, wallet saturation and source-specific retry semantics. Audit Mini App and Telegram care, item and trade callers plus downstream Journey/checklist/runtime follow-ups that trust accepted receipts. Historical repair must prove both the missing mutation and any already-applied effects rather than replaying the entire reward.

Required regressions: healthy, thrown, failed-envelope and zero-row required mutations; no-op lifetime/competition/Community XP and wallet/item cost writes; exact duplicate versus a genuinely new item use; shared caps and capped zero awards; selected/source pet ownership and real two-/three-pet switches; all four ranking periods; truthful reward/pending status; evidence-backed recovery without double credit, charge or progress.

## Player options, endings and multi-pet controls

Fresh client scan found 94 button call sites and 67 distinct visible mutation actions. Client action wiring has not changed since the [complete option matrix](moonpet-post1422-options-2026-10-03.md), which also lists 42 pet-related Telegram aliases and the navigation/settings surfaces. All visible actions resolve in the dispatcher. Breeding remains planned, not live gameplay.

Coverage includes care/incubation/evolution; permanent spaces/deletion; daily cache/checklist/Journey/Run; weekly Journey/shared boss; quarterly tiers/Finale; standard runs/extraction/failure; Contracts/districts/chains/raids; activities/jobs/adventures; Arena/Kaiju; bounties/expeditions/market; inventory/crafting/upgrades/style/trade; alerts and reward recovery. Completion, defeat, extraction, abandon, cancellation, expiry and pending-payment outcomes were checked where supported.

Healthy supplemental controls on this main:

- All 108 Contract goal/build/format/tier configurations reach their authored goal and boss.
- Every Finale kit has a winning move sequence. Three pets across two competition quarters produce six once-only rewards; interrupted payouts remain recoverable.
- 108 story-scene completions retain original source ownership through retries and switches.
- All six district regions and three approaches complete, with 18 checkpoint-boss checks and once-only energy charges.
- Quarter rollover, saved reward receipts, wrong-owner rejection, currency/XP caps, spend recovery and two-/three-pet combat/source isolation pass the existing and supplemental checks.

These controls do not prove every random seed or live production account is correct. A1–A12 are the confirmed gaps across these four audit passes, not a claim that the game is otherwise defect-free. In rounds two through four, no other-pet XP redirection or duplicate payment was observed in the tested retries; lost source progression and falsely completed endings still affect those multi-pet accounts.

### Shared limits are intentional

Gold, Gems, Style Tokens, inventory/material ownership and competition totals are account-wide. Pet XP/evolution, identity and pet-owned progression remain permanent and individually attributed. Rankings score XP; the currency fields display current account balances rather than separate Gold/Gem rankings.

The official Daily Run is **one per account per UTC day**, not one per pet. Daily Cache, daily XP caps, weekly boss reward limits and quarterly account-tier claims also remain shared. A Daily Journey is pet-owned, but its official-Daily-Run objectives therefore cannot all be completed by three pets on the same day under the published rule. This is an eligibility constraint, not evidence that one pet's progress is being copied into another. Weekly Journey progress and rewards retain their source pet/week; Finale eligibility is once per pet per competition quarter.

The tested rewards settle to their proven source pet even when a second or third pet is selected. Purchased spaces, three current spaces, the 1,000 Arcade XP entry gate, lifetime progression and permanent ownership remain intact; pets do not automatically reset or expire.

## Repeatable evidence and validation

Run the local diagnostic from the repository root:

```sh
node scripts/moonpet-post1423-audit-probes.mjs > /tmp/moonpet-post1423-audit-evidence.json
```

It uses in-memory SQLite and authenticated local Worker actions, prints the five reproduced defects plus the healthy Weekly Boss acknowledgement control, and checks original-source payment and retry invariants. This is a diagnostic reporting current observations, **not a newly passing CI regression suite or a fix**. It is deliberately not registered in CI.

The second diagnostic runs 50 additional cases across two- and three-pet accounts: six Street Event cases, 18 crafting/upgrade/cosmetic cases, eight activity-mark cases and 18 district/story/raid cases. It asserts the current defective observations alongside healthy, thrown-write and retry controls; passing it records reproduction, not fixed behavior.

```sh
node scripts/moonpet-post1423-audit-round2.mjs > /tmp/moonpet-post1423-audit-round2.json
```

Round two also reran these five existing focused suites: **145 tests passed** (12, 28, 36, 44 and 25 respectively):

```sh
node scripts/moonpet-write-sanity.test.mjs
node scripts/moonpet-reward-delivery-integrity.test.mjs
node scripts/moonpet-shop-catalog.test.mjs
node scripts/moonpet-live-ending-recovery.test.mjs
node scripts/moonpet-job-activity-authority.test.mjs
```

Round three's diagnostic passed **52 cases**: 28 Daily boss-proof cases, 16 Weekly projection/client cases and eight Weekly Boss Crest cases extending A8. Like the earlier diagnostics, it asserts current defective observations and healthy controls; it is deliberately outside CI until fixes introduce actual regressions.

```sh
node scripts/moonpet-post1423-audit-round3.mjs > /tmp/moonpet-post1423-audit-round3.json
```

All five existing focused suites rerun in round three passed:

```sh
node scripts/telegram-pets-daily-moon-run.test.mjs
node scripts/moonpet-daily-outcome-integrity.test.mjs
node scripts/moonpet-weekly-payout-period.test.mjs
node scripts/telegram-pets-weekly-journey.test.mjs
node scripts/moonpet-quest-public-sync.test.mjs
```

Daily Run includes its 10,000-run economy simulation; outcome integrity reports 17 passing tests and quest/public sync reports nine. The other three scripts report their successful assertion-suite completion. No new runtime code was changed.

Round four's diagnostic passed **66 cases**: 48 core economic settlement cases (A12) and 18 progression-acknowledgement cases extending A9. It intentionally asserts the current defects alongside healthy/thrown/retry controls; it is not a fixed-behavior CI suite.

```sh
node scripts/moonpet-post1423-audit-round4.mjs > /tmp/moonpet-post1423-audit-round4.json
```

All five existing focused suites rerun in round four passed: **258 Node tests** (47 action sync, 26 care integrity, 141 progression sync and 44 ending recovery), plus the public synchronization assertion suite.

```sh
node scripts/moonpet-action-sync.test.mjs
node scripts/moonpet-care-integrity.test.mjs
node scripts/moonpet-public-sync.test.mjs
node scripts/moonpet-progression-sync.test.mjs
node scripts/moonpet-live-ending-recovery.test.mjs
```

The progression command initially stalled in the restricted process sandbox while sending input to its Python compiler subprocess. A temporary file-input transport attempt also failed with `spawnSync python3 EPERM` (140 tests passed, one compiler check blocked). The unchanged, exact progression command above then passed outside that sandbox: all 141 tests and 254 actual SQL statements compiled under the production compound-SELECT limit. No test assertions or tracked files were changed for this workaround.

All **197 registered CI commands passed in round one on this unchanged runtime baseline**. Rounds two through four added only audit artifacts and used the focused suites above; they did not rerun all five CI domains:

| Domain | Registered commands | Result |
| --- | ---: | --- |
| Worker/API | 117 | PASS |
| Arcade | 24 | PASS |
| Wiki | 24 | PASS, isolated rerun |
| WAX | 17 | PASS |
| Visual | 15 | PASS |

Exact complete-domain commands:

```sh
npm run ci:worker-api
npm run ci:arcade
npm run ci:wiki
npm run ci:wax
PLAYWRIGHT_BROWSERS_PATH=/tmp/moonpet-playwright CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run ci:visual
```

Worker/API covers action synchronization, public rankings, quests/progression, Daily Journey/Run, Weekly Journey/bosses, combat/completion/Finale, season rewards, deletion/recovery, player loop, webhook authentication and notifications. Visual includes the local Worker/SQLite browser loop. Wiki was rerun separately because a WAX fallback fixture temporarily changes a shared published page; the isolated complete Wiki run passed and the fixture restored the file.

Seventeen existing supplemental workspace probes also passed against this main. Their exact commands were `node /tmp/moonpet-post1421-NAME.mjs`, for `NAME` equal to: `xp-reconciliation`, `xp-channels`, `community-probe`, `standard-choice-matrix`, `daily-choice-matrix`, `journeys-probes`, `journeys-districts`, `journeys-endings`, `evolution-probe`, `care-options`, `catalog-options`, `adventure-style`, `bounty-options`, `spend-recovery`, `trade-cancel-endings`, and `optional-modules-repro`; plus `node /tmp/post1421-combat-multipet.mjs`. The optional-module browser probe uses the same Playwright/Chromium environment variables as Visual. These are ephemeral supplemental controls, not newly committed regression tests.

## Audit-only handoff

Only this report and its four diagnostic scripts were added. No runtime, schema, migration, public asset or cache version changed. No site-index regeneration is needed for these internal audit artifacts. No historical ownership, receipt or reward data was deleted or modified. No production deployment, merge, issue or PR was performed for this audit. Further audit passes should extend this list before a consolidated fix branch/PR is prepared.
