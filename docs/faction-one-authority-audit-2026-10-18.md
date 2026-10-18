# One canonical faction status across My Moonboy, Battle Chamber and Community

**Problem:** A signed player sees their current GraffPUNKS seasonal lock in Battle Chamber but is asked to join a faction in My Moonboy. The legacy `telegram_faction_members` community table is not kept in sync with the authoritative `blocktopia_progression.faction` that `POST /faction/status` reads.

## One authoritative read, without mutating the account

- **Battle Chamber:** `window.MOONBOYS_FACTION.loadStatus()` reads signed `POST /faction/status`. That endpoint reports saved `blocktopia_progression.faction`. Current season locks are enforced by `telegram_faction_season_locks` on join. No join, unlock, migration, XP or membership mutation is performed by this PR.
- **My Moonboy:** `POST /player/action-plan` now uses the **same `blocktopia_progression.faction`**, through its existing bounded, read-only, verified Telegram owner D1 projection. The legacy community membership table is no longer used to decide whether the user should join. If the canonical table/query is missing, invalid or fails, membership and its task are **unavailable**, not unaligned or ready.
- **Community / nine faction chambers:** these views use the existing signed `MOONBOYS_DAILY_LOOP` singleton. The daily loop now reads exactly the same canonical owner-scoped `blocktopia_progression.faction`, not the unrelated community-membership row. A matching `telegram_factions` record can supply the numeric ID for contributor signal records, but it cannot choose a different faction. Existing mission status and contribution authority remain separate from a genuine receipt.
- **Shared header / old full panels:** the shared faction API and cached state continue to derive from `/faction/status` and the existing singleton. Local `moonboys_faction_status_v1` now refuses caches without an explicit matching Telegram ID, preventing old canary/guest/other-account membership from being shown. It is never used as authority for the read-only Action Plan or daily loop.
- **Telegram website profile, bot `/profile`, signed player-state and daily digests:** their existing shared Worker `getUserFaction` now uses the same canonical progression read. The independent daily-digest route uses it too. A legacy numeric community faction ID is only optional profile metadata; normalization uses the canonical faction *name*, not its numeric ID. An unreadable source cannot be silently interpreted as unaligned.
- **Other games:** separate faction-specific gameplay/rank records and legacy Telegram community membership tables remain intact. We do not overwrite records merely to force them to agree. Discordant legacy rows are reported in tests and ignored by the verified membership label, not migrated or deleted.

## Safety and acceptance

- Nine canonical faction identifiers and recognized aliases tested.
- Signed account with `graffpunks` in progression and an unrelated legacy row must show **joined GraffPUNKS** in both personal projections.
- Signed account with `unaligned` progression cannot inherit another account's legacy record.
- Missing canonical progression table, failed query and invalid faction value produce **unavailable** source status, no false CTA to join, and no player rewards or data mutations.
- Existing seasonal `telegram_faction_season_locks` remain unchanged. No D1 migration is added. A Worker deployment **is required** after approval and merge to update both signed read projections.
- Signed live verification: compare `/faction/status`, `/daily-loop/state` and `/player/action-plan` with the same owner/session; confirm GraffPUNKS on My Moonboy, Community and Battle Chamber, including reload and account switch. Confirm real season-lock rejection still works without attempting a faction switch from the live personal account.

**Merge hold:** Final-head Worker/API and Visual CI, source review, signed-account live verification and explicit GK approval. Do not merge/deploy from this PR without approval.
