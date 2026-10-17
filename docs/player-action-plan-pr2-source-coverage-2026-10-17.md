# Player Action Plan PR2 source coverage — 2026-10-17

Issue: #1552

Implementation baseline: `ca8caaf30758f2b08a1d8786fecbd6931d6459fb` (`origin/main`, including PR 1/6)

Endpoint: authenticated `POST /player/action-plan`

## Release boundary

This PR adds a read-only backend projection. It does not add the dashboard, deploy a Worker, run a migration, settle a reward, advance a timer, repair a record, or merge the branch. Every D1 statement issued by this route passes through a facade that accepts only `SELECT` or `WITH`, rejects mutation keywords, exposes no `run`/`batch` operation, and enforces an 80-statement budget.

Authentication is verified before owner-scoped reads. The request cannot choose a Telegram owner or pet. Pet and source references returned by the endpoint are one-way opaque hashes; Telegram IDs, D1 pet IDs, event IDs, and reusable credentials are not returned. Responses set `Cache-Control: no-store, private`, `Pragma: no-cache`, and `Vary: Origin`.

`implemented + verified by automated tests` below means repository-level behavior is covered by the PR2 automated suite. It does not mean the production deployment was queried or changed. `production verification` is deliberately a separate gate.

## Implemented + verified by automated tests (15)

| Source | Projection/evidence boundary |
|---|---|
| `onboarding.telegram` | Verified credential owner plus persisted identity presence. |
| `onboarding.faction` | Persisted owner membership; no browser selection is accepted. |
| `onboarding.pet-entry` | Lifetime Arcade XP and owner roster; spendable or Community XP is not substituted. |
| `telegram.daily-claim` | Immutable owner/day award receipt; advertised reward remains 20 Community XP. |
| `battle.missed-opportunities` | Persisted owner history only. |
| `arcade.daily-opportunity` | Existing daily row only; the route never creates the day. |
| `moonpet.daily-seven-missions` | Existing checklist bits; no completion row is created on read. |
| `moonpet.seven-of-seven-claim` | Existing checklist/claim receipt; 25 Pet XP, 50 Moon Gold, 1 Style Token kept distinct. |
| `moonpet.care` | Saved care snapshot plus accepted-action cooldown; decay is not settled on read. |
| `moonpet.claimable-rewards` | Pending saved claims only; nothing is awarded. |
| `moonpet.saved-run` | Owner-scoped open runs; task remains tied to its original opaque pet reference. |
| `moonpet.contracts` | Owner-scoped active saved contracts; no state transition. |
| `wiki.accepted-missions` | Accepted persisted owner/day completion count only. |
| `championship.verified-clout` | Materialized `championship-v1` daily snapshot; never recomputed and never mixed with other currencies. |
| `games.dead-run` | Persisted owner session/verified score projection. |

Automated checks cover authentication failure, caller-supplied owner/pet rejection, zero- and one-pet projections, exact 28-source parity, opaque references, no mutating SQL, query budget, partial/missing tables, bounded cursor pagination, `no-store`, top-action eligibility, UTC/BST/GMT rollover, and ISO week-year rollover. The runtime supports up to three roster slots; production verification below must exercise a real three-pet account.

## Implemented but still needs production verification (9)

| Source | Production check required |
|---|---|
| `faction.weekly-war` | Confirm live membership/war rows and copy against the current season. |
| `battle.wtf-windows` | Confirm persisted window timestamp shapes; schedule-only fallback stays `preview`. |
| `moonpet.adoption-incubation` | Exercise egg, hatch, active-slot, retired, and historical original-owner records. |
| `moonpet.daily-journey` | Exercise accepted objectives and accepted receipt at the 3/5 boundary. |
| `moonpet.weekly-journey` | Exercise legacy-quarter and created-at ownership weeks, including post-quarter week 14+. |
| `moonpet.jobs` | Confirm saved timer metadata and account-to-active-pet display policy. |
| `moonpet.bosses-combat` | Confirm current boss/week keys and original-pet victory attribution. |
| `moonpet.garden-kitchen-gym` | Exercise absent, growing, ready, and harvesting garden states. |
| `moonpet.evolution` | Exercise permanent stages, marks/crests, and a completed evolution chain. |

## Advisory only (3)

| Source | Reason |
|---|---|
| `faction.daily-missions` | Browser progress is a client mirror. The task can direct the owner but cannot claim verified Clout or completion. |
| `faction.seasonal-mission` | Same client-mirror boundary; membership is verified separately. |
| `arcade.roguelite-objectives` | Client objective state has no independent accepted receipt, so it remains `preview`. |

Advisory tasks never set `evidence.verified_completion=true` and cannot enter `top_actions`; immediate recommendations require server-receipt or server-projection evidence in addition to a live, actionable, unblocked state.

## Blocked (0)

No registered source is silently omitted. Missing tables and query failures are returned per source as `migration_pending` or `query_failed`, with affected tasks changed to `sync_unavailable` rather than guessed.

## Deferred (1)

| Source | Boundary |
|---|---|
| `games.nbg-london` | A verified personal record can be read, but the broader competition/action recommendation remains preview/deferred pending the registry’s release gate and production verification. |

## Source accounting

The runtime manifest and `data/player-action-plan-source-registry.v1.json` are asserted to have the same keys in the same order.

| Classification | Count |
|---|---:|
| Implemented + automated verification | 15 |
| Implemented; production verification required | 9 |
| Advisory only | 3 |
| Blocked | 0 |
| Deferred | 1 |
| **Total** | **28** |

## Known limitations and follow-ups

- The endpoint is stateless, but the existing Worker rate limiter is isolate-local memory. It provides immediate abuse resistance, not a globally exact distributed quota.
- D1 requests cannot be cancelled after dispatch. Source failures are isolated and surfaced; the statement budget bounds total work. A future platform-level timeout can be added without changing task truth semantics.
- The response is a projection, not a second authority. Canonical game routes remain responsible for mutations, cooldown enforcement, eligibility, claims, and settlement.
- Production verification must cover real 0/1/3-pet accounts, an original historical pet with a saved run/contract, missing-table behavior on a staging binding, day/week rollover, and concurrent identical requests producing equivalent read-only output.
- Block Topia is intentionally not added as a 29th source in this PR. It can use the generic external-source adapter pattern after a reviewed registry addition.

## PR2 audit corrections (17 October 2026)

- The initial projection omitted older pending completion bonuses. The read now follows the game's current-day + prior earned/unclaimed rule, with no read-side settlement.
- The historical MoonPet UI calls the completion bonus **7/7**, but its live `progress_bits=255` authority represents **eight distinct flags**. This read model exposes the eight factual flags and preserves the original 7/7 reward name; it does not manufacture a seven-goal alternative.
- Saved run and contract references are now keyed by immutable source IDs instead of result-list index. JWT/Telegram credentials and raw pet IDs remain private.
- Weekly Journey progress now requires a matching accepted source event, proper objective event mapping and the legacy boss-proof predicate, not merely an accepted objective row.
- Separate persisted faction mission rows and WTF windows are shown individually. Where daily faction rotation has not produced persisted server rows, a `preview` task remains; completing/crediting all three from browser-only state would be dishonest.
- Wiki completion is scoped by `mission_window` (not a timestamp substring). Without an eligible server mission listing, uncompleted Wiki work remains preview instead of a fabricated verified task.
- Existing D1 `schema.sql` does not include every later migration-era table. The SQL fixture creates the required migration-added columns/tables for tests. It does not add a production migration.
- Task statuses and source health now preserve verified receipts, true empty reads and failure states separately. Production signed-in verification remains outstanding.


## October 17 late review follow-up — save/read parity and source boundaries

The late Copilot + Codex review exposed additional read-only guidance edge cases. The PR now:

- Uses `applyPetCareDecay({ ...savedPet }, now)` with `last_decay_at` from the roster query. Only an in-memory copy changes; no pet state/health settlement is performed by the action-plan endpoint.
- Reads today's completion separately from a **bounded** 100-item historical unclaimed-reward preview and counts the whole unclaimed backlog. When history exceeds the preview, `source_status['moonpet.seven-of-seven-claim']` reports `partial`, `historical_pending_total`, `historical_pending_in_preview`, and `historical_pending_not_listed`. An explicit game-inbox task covers the extra saved rewards; no earned record is treated as expired or erased. Source-level historical pagination is a future UI/API improvement, not falsely claimed as available here.
- Uses `json_extract(CASE WHEN json_valid(metadata) THEN metadata ELSE '{}' END, '$.claim_state')` so corrupt/legacy metadata cannot throw merely because SQLite evaluates predicates in a different order.
- Uses actual `ends_at` and the canonical **24-hour grace period** (second-precision comparison) for unprocessed active activities; expired or invalid sessions must never enter recommended ready-to-claim actions. Interrupted completed claiming sessions are still recoverable.
- Shows completed `telegram_pet_contracts` with `reward_xp=20 AND reward_settled=0`, including their original pet references. It never creates an unsettled reward by reading.
- Shows defeated/unclaimed weekly-boss rewards from saved progress joined to the victory's original pet/season, even after the ISO week changes; pending rewards and post-victory participation are separate from active combat readiness.
- Reads accepted boss participation within **each pet's ownership-Journey bounds**, not only an account-wide daily attempt. A completed participation cannot be recommended again in the same ownership week.

The tests use fixed-clock mocks, SQLite malformed-JSON evaluation, and a 137-day outstanding-claim fixture; they are not a substitute for signed live owner verification. The number of new queries remains bounded under the existing action-plan request budget, and no changes to the gameplay economy or migrations were made.

## Codex follow-up — 17 October: exact activity availability and owner state

- **Activity claim start versus expiry:** A saved activity may be claimed after the canonical five-minute minimum from `started_at`; `ends_at` stores a longer two-to-eight-hour cap and, separately, anchors the 24-hour last-claim grace. Task `claim_ready` and `next_ready_at` now use the *start plus minimum*, while expired sessions still fail closed using the *end plus grace*. Both boundaries have regression tests.
- **Per-pet Journey anchor:** `getPetOwnershipPeriod` now receives the actual `telegram_pet_season_slots.created_at` timestamp, independent of the instance's repaired/backfilled `created_at`. Saved care decay still uses the instance clock.
- **Victory attribution at ownership-week rollover:** A current ISO-week boss victory is considered participation for a pet only when the accepted victory's original saved day belongs to that pet's current ownership-week bounds (or when the pet has a matching accepted participation event). A previous ownership week's victory cannot suppress a new participation objective.
- **WTF player evidence:** Live event rows are scoped through a left join to the verified account's `daily_wtf_player_events` record. Completed windows show `complete`, check-ins show `in_progress` and neither is advertised as a fresh active Top-3 action. Public schedule alone does not prove attendance. Missing/failed owner-state queries fail closed rather than pretending participation was checked.

These are source-side projections and automated tests only. The PR does not modify gameplay settlements, reward economics, pet ownership, D1 schema or deployment status.
