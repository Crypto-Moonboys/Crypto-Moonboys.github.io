# Moonpet post-PR1422 audited user options — 3 October 2026

Commit: `45bf372ca130c852911259eab7c7be2bfcf0bc6b`. Fresh lexical scan: **94 button call sites, 67 distinct visible mutation action keys**. The only conditional action expressions are Finale start/retry and Shop buy/equip. Every key resolves in the current dispatcher. All mutation clicks also send `request_id` and `displayed_pet_id`; immutable saved-source recovery routes intentionally validate their own recorded source.

This matrix records wiring/source and ending/retry tracing, not a claim that every random outcome was manually played. The post-1422 audit report and complete CI/browser validation record deeper outcome coverage and four confirmed defect families. The line numbers below refer to the audited base commit; backend line numbers move in the fix branch. No client action keys or menus change in this release. See [the fix report](moonpet-post1422-audit-fixes-2026-10-03.md) and its committed regression suites.

## Ownership / lifecycle

Saved ownership/lifecycle/callsign and new authoritative snapshot; stale selection, locked requirements or missing write rejects; paid space and deletion confirmations retain originals.

| Action | Client call line(s) | Dispatcher line(s) | Additional payload fields |
| --- | --- | --- | --- |
| `adopt` | 1523 | 10759, 10759 | None beyond common action envelope |
| `buy_pet_slot` | 1937 | 10770, 10806 | `slot_number` |
| `switch_pet_slot` | 1936 | 10770, 10807 | `pet_id`, `slot_number` |
| `delete_pet_slot` | 1942 | 10760 | `pet_id`, `pet_label` |
| `incubate` | 1532, 1532, 1532, 1532 | 10761 | `care_type` |
| `hatch` | 1532 | 10762 | None beyond common action envelope |
| `evolve` | 2567 | 10932 | `evolution_id` |
| `rare_morph` | 2619 | 10763 | None beyond common action envelope |
| `rename` | 2622 | 10812, 10812 | `pet_name` |

## Care / cache

Accepted event applies pet-owned stats/XP or stat-only care; per-action cooldown; fast response preserves selected identity and hydrates; failed/unknown response blocks further action until Refresh.

| Action | Client call line(s) | Dispatcher line(s) | Additional payload fields |
| --- | --- | --- | --- |
| `feed` | 1545 | 10808 | None beyond common action envelope |
| `play` | 1545 | 10808 | None beyond common action envelope |
| `clean` | 1545 | 10808 | None beyond common action envelope |
| `sleep` | 1545 | 10808 | None beyond common action envelope |
| `train` | 1545 | 10808 | None beyond common action envelope |
| `energy_drink` | 1533, 1546 | 10770, 10808 | None beyond common action envelope |
| `dance` | 1533, 1546 | 10770, 10808 | None beyond common action envelope |
| `cuddles` | 1533, 1546 | 10770, 10808 | None beyond common action envelope |
| `daily_chest` | 1547 | 10821, 10823 | None beyond common action envelope |

## Contracts

Saved contract/revision, then completed/failed/abandoned or pending reward; original pet/run/revision supplied; stale choices rejected; pending bonus retry retained.

| Action | Client call line(s) | Dispatcher line(s) | Additional payload fields |
| --- | --- | --- | --- |
| `contract_start` | 2104 | 10854 | `build`, `tier`, `side_goal`, `format`, `pet_id`, `sequence`, `goal` |
| `contract_step` | 2078, 2082, 2086, 2089, 2092, 2094 | 10854 | `pet_id`, `contract_id`, `revision`, `choice` |
| `contract_claim` | 2057 | 10770, 10854 | `pet_id`, `contract_id` |

## Daily / quarterly completion

Original saved day or competition-quarter source supplied; board supports resume/claim/retry; repeated delivered reward returns duplicate without new-gain copy.

| Action | Client call line(s) | Dispatcher line(s) | Additional payload fields |
| --- | --- | --- | --- |
| `daily_completion_claim` | 2130 | 10770, 10803 | `utc_day`, `pet_id` |
| `finale_start` | 2158 | 10770, 10804 | `pet_id`, `season_key`, `competition_season_key`, `revision`, `build` |
| `finale_step` | 2155 | 10770, 10804 | `pet_id`, `season_key`, `competition_season_key`, `revision`, `move` |
| `finale_retry` | 2158 | 10770, 10804 | `pet_id`, `season_key`, `competition_season_key`, `revision`, `build` |
| `finale_claim` | 2152 | 10770, 10804 | `pet_id`, `season_key`, `competition_season_key`, `revision` |
| `season_claim` | 2573 | 10770, 10931 | `tier_id`, `season_key` |

## Runs / exploration

Saved source pet, signed encounter or saved run/turn/checkpoint; terminal success/failure/extraction or saved reward recovery; closed source/energy/cooldown gates; post-victory weekly participation is explicitly not another victory payout.

| Action | Client call line(s) | Dispatcher line(s) | Additional payload fields |
| --- | --- | --- | --- |
| `random_event` | 2213 | 10825 | `choice`, `challenge_token` |
| `adventure` | 2217 | 10833, 10834 | `adventure_key`, `challenge_token` |
| `run_step` | 2233 | 10845 | `run_id`, `choice_key`, `expected_step_index` |
| `daily_run_tactic` | 2241 | 10844 | `run_id`, `checkpoint`, `tactic_id` |
| `run_extract` | 2252 | 10862 | `run_id` |
| `run_start` | 2256 | 10842 | None beyond common action envelope |
| `daily_run_start` | 2256 | 10843 | None beyond common action envelope |
| `district_mission` | 2332, 2337 | 10897 | `region_key`, `approach_key` |
| `event_chain` | 2348, 2350 | 10906 | `chain_key`, `choice_key` |
| `seasonal_boss` | 2362 | 10913 | `pet_id`, `move` |
| `seasonal_boss_claim` | 1466 | 10770, 10921 | `pet_id`, `boss_key`, `season_instance` |
| `weekly_boss` | 2373 | 10784, 10792, 10929 | `move`, `pet_id` |
| `weekly_boss_claim` | 1459 | 10770, 10930 | `pet_id`, `boss_id`, `week_key` |

## Arena / Kaiju

Queue, active saved battle/card choice, terminal result, or explicit cancellation; IDs/round ownership supplied; unavailable evidence retains snapshot and rejects mutation.

| Action | Client call line(s) | Dispatcher line(s) | Additional payload fields |
| --- | --- | --- | --- |
| `arena_matchmake` | 2270, 2297, 2299 | 10964 | `accept_any_rank` |
| `arena_start` | 2270, 2299 | 10947 | None beyond common action envelope |
| `arena_move` | 2287 | 10973 | `battle_id`, `expected_round`, `move` |
| `arena_ready` | 2293 | 10966 | `battle_id` |
| `arena_forfeit` | 1482, 2266, 2293, 2294 | 10980 | `battle_id` |
| `arena_queue_cancel` | 1483, 2267, 2297 | 10965 | None beyond common action envelope |
| `kaiju_matchmake` | 2316, 2326 | 10999 | None beyond common action envelope |
| `kaiju_start` | 2316, 2326 | 10985 | None beyond common action envelope |
| `kaiju_card` | 2322 | 11002 | `match_id`, `card_key` |
| `kaiju_match_cancel` | 1486, 2311 | 11001 | `match_id` |
| `kaiju_queue_cancel` | 1487, 2312, 2325 | 11000 | None beyond common action envelope |

## Work

Job receipt or saved timed session; claim/cancel include immutable session ID; pending claim preserved; cancel explicitly forgoes session rewards; registered activity recovery tests and fresh probes cover stat and specialist follow-ups.

| Action | Client call line(s) | Dispatcher line(s) | Additional payload fields |
| --- | --- | --- | --- |
| `work` | 2404 | 10817 | `job_key` |
| `activity_claim` | 2410 | 10871, 10874 | `session_id` |
| `activity_cancel` | 2410 | 10871 | `session_id` |
| `activity_start` | 2422, 2423 | 10870 | `activity_type` |

## Economy / equipment / style

Canonical cost/asset/recipe/route, atomic account debit/credit, source pet effects where applicable; ownership/capacity/cooldown gates; upgrade carries target and catalog quote; free equip/unequip retains permanent ownership.

| Action | Client call line(s) | Dispatcher line(s) | Additional payload fields |
| --- | --- | --- | --- |
| `bounty_claim` | 2466 | 10770, 10894 | `bounty_key` |
| `market_buy` | 2471 | 10896 | `offer_key` |
| `equip` | 2474, 2506 | 10814 | `item_key`, `pet_id` |
| `buy` | 2474 | 10813 | `item_key`, `pet_id` |
| `use_item` | 2479 | 10815 | `item_key` |
| `expedition` | 2490 | 10895 | `expedition_key`, `pet_id` |
| `gear_upgrade` | 2509 | 10926 | `item_key`, `target_level`, `quote_version` |
| `craft` | 2517 | 10927 | `recipe_key` |
| `style_equip` | 2530 | 10770, 10853 | `pet_id`, `cosmetic_key`, `enabled` |
| `cosmetic_unlock` | 2531 | 10928 | `cosmetic_key` |
| `trade` | 2543 | 10816 | `wager` |

## Account settings

Committed ON/OFF only; failed or unknown read/save shows unavailable/retry; control cannot project an unsaved preference.

| Action | Client call line(s) | Dispatcher line(s) | Additional payload fields |
| --- | --- | --- | --- |
| `notification_set` | 2554, 2555 | 10770, 10878 | `enabled` |

## Non-mutation and dynamic choice controls

| Control | Choices and ending |
| --- | --- |
| Navigation | HOME, MISSIONS, EXPLORE, WORK, ECONOMY, PROFILE; module hydrate/retry retains last valid source and sends correct mode. |
| Care variants | Incubate: warm, talk, music, rest; adult care: feed/play/clean/sleep/train; bounded stat-only energy drink/dance/cuddles; daily cache. |
| Roster | All three current permanent spaces; current marker; explicit owned pet switch; paid next-space unlock; delete confirmation/cancel and replacement source. Historical duplicate source-slot numbering is deliberately mapped to current displayed ordinals. |
| Contract setup | Server formats/builds/max tiers/goals/optional side goals; setup presets alter selectors without starting; start sends all selected values. |
| Contract play | Offered route, rest, preparation, checkpoint path, optional field decision, draft choice/redraw, boss tactic and abandon all use the saved contract ID/revision. |
| Run decisions | Server-provided choices; Daily checkpoint tactic; original run ID and expected step; extract or finish pending terminal settlement. |
| Boss choices | Weekly strike/outsmart/endure, post-victory participation; server-listed Seasonal Raid attacks; Finale server builds/moves/retry/claim and competition season. |
| Combat choices | Arena server move/round previews; ready/queue/forfeit/locked states; Kaiju offered cards with saved match ID; cancel stale queue/match. |
| Economy choices | All server shop items, owned gear, target-level upgrades, recipes/material/output capacity, market offers, expedition routes, consumables and wager options. |
| Style | Three live account unlocks: profile frame, victory pose, run trail; per-pet free equip/unequip; unavailable loadout locks switching. |
| Callsign | Stage-3 gate, 32-character input, draft retained only for same rendered pet; accepted rename discards draft; server validates current pet. |
| Notifications | Server ON/OFF controls; read unavailable is distinct from OFF; delivery/scan issues documented separately. |
| Guidance notice | Source-filtered display; one shown notice acknowledged with key/scope/pet/source season; no reward claim. |
| Audio and radio | Device-local toggles; saved OFF preserved; gesture/autoplay and failed-source retry states. |
| Crafting goal | Per-immutable-pet device-local recipe choice and clear; validates known recipe; saving is not crafting or spending. |
| Refresh | Manual sync, automatic cooldown/season/multiplayer/timed refresh, and module retry; replay reads, not unconfirmed paid actions. |
| Guide / leaderboard | Utility overlay opens/closes/focus trap; period selection issues generation-guarded leaderboard read; external full guide opens separately. |
| Companion greeting | Tap, keyboard Enter/Space and Say Hello animate only; no reward or gameplay mutation. |
| Local panels | Expand/collapse and More Recommended options persist in memory by pet/screen/panel; route focus waits for hydration. |

## Telegram command mapping

Wrangler enables `PET_MINI_APP_ENABLED = "true"`. All 42 registered aliases launch their Mini App destination before retained rollback handlers. `pet:` callbacks likewise launch screen/focus routes, and `/start` accepts validated Moonpet screen/focus tokens.

| Command | Screen | Focus |
| --- | --- | --- |
| `/moonpet` | home | Default screen |
| `/pet` | home | Default screen |
| `/petcoach` | home | recommended |
| `/petprogress` | profile | tracks |
| `/petachievements` | missions | achievements |
| `/petseason` | profile | season |
| `/petboss` | explore | weekly-boss |
| `/petevolve` | profile | evolution |
| `/petgear` | economy | equipment |
| `/adopt` | home | care |
| `/feed` | home | care |
| `/play` | home | care |
| `/clean` | home | care |
| `/sleep` | home | care |
| `/train` | home | care |
| `/petstart` | work | timed-activity |
| `/petclaim` | work | timed-activity |
| `/petcancel` | work | timed-activity |
| `/petactivity` | work | timed-activity |
| `/pettrade` | economy | trade |
| `/petname` | profile | callsign |
| `/petmissions` | missions | missions |
| `/petshop` | economy | shop |
| `/peteconomy` | economy | Default screen |
| `/petbounties` | economy | bounties |
| `/petexpedition` | economy | expedition |
| `/petmarket` | economy | market |
| `/petbag` | economy | inventory |
| `/petbuy` | economy | shop |
| `/petuse` | economy | inventory |
| `/petwork` | work | jobs |
| `/petdaily` | home | care |
| `/petevent` | explore | street-event |
| `/petarena` | explore | arena |
| `/petkaiju` | explore | kaiju |
| `/kaiju` | explore | kaiju |
| `/petrun` | explore | moon-run |
| `/petextract` | explore | moon-run |
| `/petadventure` | explore | moon-run |
| `/petnotify` | profile | alerts |
| `/petleaderboard` | profile | leaderboard |
| `/petscore` | profile | leaderboard |
