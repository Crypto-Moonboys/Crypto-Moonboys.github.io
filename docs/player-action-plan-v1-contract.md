# My Moonboy — Action Plan v1 contract (design lock, PR 1)

**Owner:** #1552 · **Purpose:** shared private player plan + public faction operations.  
**State:** draft schema for PR 2; this file defines *minimum invariants*, not a deployed endpoint.

## A. API and shared-read boundaries
**Candidate:** `POST /player/action-plan`, JSON body `{"telegram_auth": "<signed structured evidence>", "view": "summary|tasks", "cursor": null}`. The actual proof payload is an object from the website identity gate; placeholder text is not an accepted credential. Validate with the existing Worker Telegram authentication path; account ID is **only** server-derived. No token, Telegram initData, hash or user ID in query strings. No `GET` alternative for private data. All responses `Cache-Control: no-store`. Auth-expired -> HTTP 401/403 with a client relink CTA; never anonymous tasks or cached cross-account data.

**Public faction view** must derive only public aggregate information; personal contribution view is separately authenticated. Do not expose per-pet details to visitors or to viewers of other factions. Keep `/dashboard.html` editorial.

The API must be **read-only**: `SELECT` statements only and no game state bootstrap, pet decay settlement, saved award recovery, mutation calls, reward generation or post-read writes. In particular **do not call** `buildPetMiniAppState` or `preparePetMiniAppState` from task reads; those run reconciliation/recovery. PR 2 shall add a projection-specific read path using existing immutable saved state and record failures as unknown.

## B. Normalized response (illustrative; no hard-coded reward values)
```json
{
  "ok": true,
  "schema_version": 1,
  "as_of": "2026-10-17T16:00:00.000Z",
  "utc_day": "2026-10-17",
  "identity": {"linked": true, "faction_id": "graffpunks", "display_name": "Player"},
  "summary": {"eligible_today": 0, "completed_today": 0, "claims_ready": 0, "urgent": 0, "unavailable_sources": 0},
  "source_status": {
    "faction": {"state": "live"},
    "moonpet": {"state": "live_empty"},
    "championship": {"state": "preview"}
  },
  "tasks": [{
    "task_id": "moonpet:owner-scope:pet-scope:2026-10-17:mission-key",
    "source_key": "moonpet.daily-seven-missions",
    "scope": "pet",
    "owner_ref": null,
    "pet_ref": null,
    "source_pet_ref": null,
    "period": {"kind": "utc_day", "key": "2026-10-17"},
    "title": "Example unfinished objective",
    "what": "Complete the source-defined action",
    "why": "Advance the correct saved pet mission",
    "progress": {"current": 0, "target": 1, "unit": "accepted_actions"},
    "availability": "ready",
    "blocking_reason_code": null,
    "available_at": null,
    "expires_at": "2026-10-18T00:00:00.000Z",
    "next_ready_at": null,
    "reward": {"kind": "none_declared", "amount": null, "confirmed": false},
    "evidence": {"kind": "server_projection", "source_event_id": null, "verified_completion": false},
    "destination": {"kind": "moonpet", "screen": "missions", "focus": "daily"},
    "read_at": "2026-10-17T16:00:00.000Z"
  }]
}
```
`owner_ref/pet_ref/source_pet_ref` should not be exposed as raw private IDs in public output; the API can omit these on delivery if the session already binds them, or use opaque task references. The sample time is an example only; no production state exists in this document. `confirmed=false` never implies that a shown XP number is payable.

## C. Required task invariants
1. Stable IDs namespaced by **canonical source + owner scope + source pet/period + immutable source objective ID**. Distinct account claims must never fan out once per pet. Historical source-pet awards cannot move when player changes the selected pet.
2. Every item must provide **what, why, progress, source, evidence grade, availability, source-period and source-derived deadline**, whether the action is optional, a validated destination and safe explanatory copy.
3. `availability` one of `ready`, `in_progress`, `waiting`, `blocked`, `complete`, `claim_ready`, `claimed`, `expired`, `sync_unavailable`, `preview`. A target reached is not the same as a settled reward; each source determines legitimate transitions. `claimed` requires accepted settlement evidence.
4. A source has status `live`, `live_empty`, `preview`, `migration_pending`, `query_failed`, `unavailable`, or client-only `offline`. No source state may be downgraded silently from query_failed to empty/complete.
5. `source_status.state=preview` and `evidence.kind=client_mirror` **forbid** `verified_completion=true`, official Championship scoring and `claim_ready` without a separate accepted event. A future adapter must prove the exact source before elevating.
6. `expires_at` is optional and **null** for permanent goals or where true expiration is unknown. `next_ready_at` means source says may be ready, not auto promotion. Server time controls window states; client countdown is cosmetic.
7. Period types: `once`, `utc_day`, `faction_week`, `pet_day`, `pet_journey_week`, `event_window`, `saved_timer`, `saved_claim`, `source_defined`, `utc_competition`, `permanent`. Never derive a MoonPet Journey week from ISO week; never reset lifelong pets on quarter rollover.
8. Keep `Pet XP`, `Community XP`, `Arcade XP` (lifetime vs spendable), `faction clout`, `Championship Clout`, Moon Gold/Gems/Crystals, Style Tokens, raw score and banked materials as separately labelled types.
9. Ranking: expiring **accepted** claims and windows -> saved session recoveries -> urgent eligible pet care -> ready daily missions -> weekly objectives -> long-term -> optional shops/cosmetics. Do not mark optional spending as urgent.
10. Overlapping evidence can contribute to multiple **existing** eligible objectives but cannot mint duplicate rewards. A task click navigates only; never dispatches a gameplay action, claim or payment.

## D. Owner-scoped caching and read failure
- Shared client layer keyed by **verified identity + UTC day + view + selected pet**, and API requests deduped. Logout/account switch clears all private state before showing new owner. Never store private full snapshots in public globals or public HTML.
- Invalidate on accepted faction, pet, wiki, Arcade, Telegram claim and identity events; do not use raw browser score as an accepted settlement. Future PR to define exact event/cooldown contract, including cross-application reconnect.
- Per-source fail closed with explicit `sync_unavailable`, last confirmed time and Retry; partial success is allowed. Never substitute stale cache as current live. Previously saved claim should not be reported absent solely due to a failed module read.
- Bound results and DB statement count. PR 2 must budget worst case for 0 / 1 / 3 pets, archived originals, outstanding claims and independent time windows; validate D1 read-only behavior and response times before rollout.
- Public faction standings may reuse public cache separately from the private plan; loading nine faction visitors must not cause full MoonPet state fetches.

## E. Acceptance fixtures PR 2+
| Scenario | Required result |
|---|---|
| Unlinked or expired auth | No private rows; explicit link/relink requirement |
| Different linked account on same browser | Previous owner's plan fully purged |
| Viewer on unjoined or another faction chamber | Public crew info only |
| 1/3 pets plus selected switch | correct owner, original source-pet and separate account claim |
| Seven daily missions complete, reward pending | `claim_ready` until accepted claim; no second award |
| Saved run after rollover | original source pet/season and saved claim remain |
| Egg, no adoption, older pet | exact entry and hatch/evolution eligibility |
| WTF schedule fallback | `preview`; never indicates checked-in or live persistence |
| Source query failure/partial response | `sync_unavailable` rather than false “0 remaining” |
| BST/GMT crossover and UTC midnight | source clocks unchanged, local labels correct |
| Existing Championship source partly trusted | no verified Clout until official accepted adapter |
| Navigation click | no database write, reward, action or fabricated deep-link |

## F. PR ownership / testing
- PR 1 commits only docs, machine catalogue and regression tests to ensure source references and the boundaries above remain legible.
- PR 2 implements auth/read-only projection plus SQL/contract/negative tests. **No migration assumed** until the exact query/schema impact is evidenced.
- PR 3–5 build UI and invalidation without changing game authorities; PR 6 verifies signed-account live behavior, provenance and releases after owner approval.
- Related #1478, #1530, #903 and #1513 govern original systems. This contract cannot override their gameplay/score/rights rules.
