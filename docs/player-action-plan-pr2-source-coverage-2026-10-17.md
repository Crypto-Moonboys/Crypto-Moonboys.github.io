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
