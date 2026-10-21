# My Moonboy — final signed progression tracking PR 4

## Purpose and dependency

Completes the current **read-only, source-backed account progression and wallet summary** on `/my-moonboy.html`, following merged PRs #1589, #1592 and #1593. Extends existing saved owner data; does **not** add game rewards, change settlement rules, mint currencies or imply the entire source catalogue is fully integrated.

## Source-of-truth and scope

| Field | Authoritative saved source | Semantics |
| --- | --- | --- |
| BlockTopia XP | `blocktopia_progression.xp` | Account-specific BlockTopia progression, **not** Arcade/Community XP |
| BlockTopia Gems | `blocktopia_progression.gems` | Account-specific saved Gems, **not** Moon Crystals |
| Faction XP | `blocktopia_progression.faction_xp` | Only shown for a verified joined canonical faction, not a legacy `telegram_faction_members` row |
| Arcade XP earned (wallet) | `arcade_xp_wallets.arcade_xp_earned` | Cumulative wallet inflows, distinct from all-time Arcade XP |
| Arcade XP spent (wallet) | `arcade_xp_wallets.arcade_xp_spent` | Cumulative wallet outflows |
| Arcade XP spendable | `arcade_xp_wallets.arcade_xp_spendable` | Preserved from PR 2; `earned = spendable + spent` required for all three wallet measures |
| Accepted Wiki missions today | `wiki_mission_completions` filtered by `telegram_id` and today's UTC `mission_window` | **Receipt count**, not Wiki XP earned and not proof of unclaimed awards |
| Community XP | `telegram_users.xp` | Preserved from PR 3; never summed with legacy Community XP receipt logs |
| MoonPet account currencies | `telegram_pet_profiles` after wallet reconciliation award | Preserved from PR 2 |

The canonical faction membership read is extended with adjacent `xp` and `gems` columns from **the same owner row**, without introducing a second read or changing the shared faction/status SQL contract. Wiki uses the existing bounded, owner-scoped completion COUNT. Arcade earned/spent reuse the wallet snapshot already fetched by PR 2.

## Safety invariants

- All values appear **only after fresh Telegram owner verification** within the private no-store `POST /player/action-plan` response. Anonymous sessions and owner/pet selector parameters never receive these totals.
- Strict nonnegative safe integers for each progression quantity. Absent rows, missing migrations, read failures, unaligned faction, invalid counters, unreconciled Arcade wallet, and stale/offline snapshots are **Not confirmed**, not a fabricated zero.
- A verified Wiki `COUNT(*)=0` is a legitimate zero accepted-mission count; a failed Wiki read is `null` instead.
- The frontend clears all new values on logout/identity changes. Neither browser storage nor external analytics persist owner balances.
- `actionPlanSnapshotToken` and task pagination remain unchanged: owner summary additions are read-only and do not mutate task ranks, claim readiness or source identities.
- Existing 80-statement bounded D1 budget and query/deadline control remain active; no D1 writes are added.

## Explicitly not claimed complete

Historical trend charts, precise faction contribution-credit attribution by receipt, retroactive Wiki award reconciliation, pet-token accounting beyond the canonical profile, rewards conversion and cross-game economics need separate authority policies and verification. This PR does not invent these, nor blend the BlockTopia and Arcade systems.

## Acceptance and rollout

Before merging: exact-head Worker/API tests (including invalid/missing sources, 0 Wiki receipts, canonical-faction parity, 80-statement limit), mobile Playwright browser tests (390px, signed values, offline, fresh refresh, logout, unavailable values), complete required CI and Codex/Copilot review. GK owner to verify signed-account values against canonical BlockTopia, Wiki, Arcade and faction screens with 0/1/3 pets, guest, switched account and at least one real accepted Wiki mission.

After merge and accepted release:
- GitHub Pages publishes frontend.
- Deploy **moonboys-api** only from clean updated `main` with `node scripts/deploy-worker-with-provenance.mjs moonboys-api`.
- **No D1 migration, no bot change, no VPS restart.**
- Do **not** deploy blocked/unconfigured BlockTopia Workers.

**Merge gate: HOLD until all current-head checks and explicit GK approval.**
