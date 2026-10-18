# PR 4 / issue #1552 — Faction chambers + Community operations

**Scope:** Add public Crew Operations Today and private My Contribution Today to all nine faction chambers and Community. Preserve existing lore, mission/digest, standing, proof, reward and editorial dashboard routes. This PR does not change game economies, token/reward rules, gameplay authority, faction-war scoring or worker SQL.

## Authorities and evidence grades

| Data | Existing source | Status meaning |
|---|---|---|
| Three daily crew mission definitions, target, description, possible faction-war contribution | Existing faction-missions module via window.MOONBOYS_MISSION_DATA published by the faction bridge | **Local catalogue preview only.** Never proof of completion or awarded reward. |
| Long-term crew objective | Same published local mission catalogue | Preview; no fake completion or reward |
| Weekly rank, clout and member count | Bridge weekly faction standings when explicitly source=server | Source-backed faction totals; never personal or verified Championship Clout |
| Shared WTF event and UTC/local start/end | Existing Daily Loop singleton daily_wtf_status, current day, source_status=live only | Source-confirmed public event window; preview never advertised as active |
| Next UTC reset | Daily Loop next_utc_reset_at on current-day source read | Server timestamp; fallback says policy midnight UTC without an invented exact instant |
| Member faction | Fresh signed Daily Loop state with identity.telegram_id matching linked user, faction_state source healthy | Verified private membership, not a local cached faction selector |
| Member missions | Current UTC day's Daily Loop daily_missions.items and healthy source_status | **Server-saved advisory progress** matching only this faction's three catalogue IDs; missing rows unknown, not incomplete or zero |
| Today contribution | faction_state.today indexed by persisted faction_table_id | Server-saved Faction Signal contribution, never Community XP, Arcade/Pet XP or Championship Clout |
| Personal MoonPet route | Link to My Moonboy MoonPet tab only | No private MoonPet details disclosed on public pages |

## Singleton / bridge reconciliation

The pre-existing faction bridge owns public standings/feed plus distinct legacy Roguelite Daily State/Missed History endpoints for existing older panels. Those endpoints have payloads that are **not interchangeable** with the Daily Loop aggregator. PR 4 does not break or silently downgrade those existing data fields by removing the legacy calls. The new PR 4 component consumes cached public faction mission data from the bridge and the verified private daily-source state from window.MOONBOYS_DAILY_LOOP.

**Zero new independent network endpoints or polling loops:** the PR4 renderer has no fetch; it subscribes once and consumes the shared Daily Loop singleton getState once. Retry, account transitions and UTC-day rollover use the same singleton's deduplicated refresh. Existing bridge/legacy fetches retain their separate contracts. The renderer cannot award, complete, spend or submit any game actions.

## Rendering and identity

- Exactly one reusable JS renderer and scoped stylesheet on all nine existing chambers and Community. Crew Operations and My Contribution appear above the existing missions/digest details.
- Community guest sees nine public faction routes. Signed member sees their server-confirmed faction's crew catalogue and a compact private view. Other-faction viewers see public facts only; no private owner or pet details from any other faction.
- Personal status appears only if the current linked identity matches the signed Worker Daily Loop identity, same UTC day, and faction assignment matches the viewed chamber. The local mission mirror never upgrades readiness or completion.
- No-data, failed-source, preview, unaligned, other-faction, and auth-required states are distinct. No false 0/3 and no implied competitive receipts from mission progress.
- Account switches and logout clear in-memory private snapshot and rendered owner data synchronously. A stale subscriber response from a previous owner is ignored. No credential, owner ID, private mission, pet ID or token added to a URL, new storage or analytics.
- Simple safe links to Arcade, own faction chamber and /my-moonboy.html?tab=faction; generic MoonPet tab CTA has no private payload.

## Automated tests

The registered Visual CI file scripts/faction-operations-browser.test.mjs checks all nine chamber HTML pages and Community, placement before existing content, 360px/390px/1280px, guest public-only rendering, wrong-faction and unaligned cases, saved versus local-progress distinction, a verified source day, same-ID source agreement, contribution unit separation, source failure and retry, identity switch/logout with stale subscriber responses, and no direct fetch/action writes.

Browser fixtures are regression evidence, not signed production evidence.

## Runtime and release gates

- Changes: static GitHub Pages frontend HTML/CSS/JS, Visual tests and documentation only.
- Worker deploy required: **No.**
- D1 migration required: **No.**
- VPS restart required: **No.**
- Pages publish required after approved merge: **Yes.**
- Manual signed-account QA required before release signoff: real linked/unaligned/wrong-faction status, saved mission data and empty source, UTC boundary, all nine factions, Community and mobile accessibility.
- Merge decision: **Hold** pending CI, review, verified signed-account evidence and explicit GK approval. No deployment performed.

PR 5 covers wider accepted gameplay/claim event invalidation and notification polishing; PR 6 covers final deployment provenance and full QA.
