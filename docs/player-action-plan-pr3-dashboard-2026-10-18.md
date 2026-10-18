# Issue #1552 / PR 3 of 6 — My Moonboy private headquarters

**Implementation boundary:** This PR adds the personal **/my-moonboy.html** page on top of PR 2's authenticated **POST /player/action-plan** and includes a narrowly scoped duplicate-evidence Worker warning cleanup. It does not add the PR 4 faction-chamber widgets or change gameplay/reward authority.

## Live contracts consumed

- The client uses the existing **MOONBOYS_IDENTITY.getFreshTelegramAuth()** gate. It will never place auth proofs, hash, raw Telegram ID, raw pet ID or initData into a URL, localStorage, DOM data attribute or public global.
- Private action data comes only from authenticated POST /player/action-plan with signed body credentials, no-store, no URL selectors and credentials omitted. The response must have a supported schema version and authenticated owner.
- Up to 100 ranked tasks are read per page. The server's pagination cursor appears as **Load more**, rather than silently hiding claims. Top 3 uses server-verified immediate actions only, with checks against preview and unavailable data.
- No new D1 queries are introduced by PR 3's additive owner response fields; they reuse the PR 2 roster, evolution, faction and Arcade XP reads. Each active MoonPet has an opaque pet reference, active slot, stage/phase, level and Pet XP. Failed roster read yields null, not fabricated zero.
- Original pet attribution of saved runs, contracts and boss rewards stays opaque. Historical earners are separate, not assigned to whichever pet is currently selected.
- Species identity is not revealed in this API; the canonical Mini App still owns stage-3 reveal. No guessed names or undocumented Telegram Mini App deep links.
- Faction membership is shown only when the owner projection proves it; public crew operations and all nine chambers belong to PR 4.
- Arcade lifetime XP, selected Pet XP, Community XP and Championship Clout remain separately labelled. Absent values are not confirmed, never assumed zero. Championship score is not claimed as production-verified solely from this snapshot.

## Correctness and UI behaviour

- Tabs: Now, Today (same saved UTC day), Claims, MoonPet, Faction, Arcade & Games, Weekly, Long-term and History.
- Search and filters use loaded pages. Load more remains accessible until the server returns no continuation.
- Every task shows source, what/why, progress, declared reward/cost, evidence grade, blocked reason and local plus UTC deadline. Missing deadline says no recorded expiry.
- Countdown uses saved server time and monotonic elapsed time. It never changes source readiness, completion, claimability or expiry without a new authenticated read.
- Logout/account switch aborts reads, drops all in-memory private plan state and clears all owner-specific DOM. Old in-flight responses cannot repaint the new account.
- Refresh failures clearly mark the previously confirmed snapshot stale and suppress Top 3. Retry exists before first success and after a failure.
- The site-shell shows MY MOONBOY for linked players only. Guest visits show login guidance but never a private API call.
- OPEN TASK is navigation only: never a reward, claim, pet-switch or spend action.

## Requested Wrangler duplicate evidence cleanup

The deployed PR 2 Wrangler build warned of a duplicate object key in **workers/moonboys-api/player-action-plan/sources.js**: the task helper defined evidence twice. PR 3 removes the earlier duplicate and retains the final canonical merge after the input spread. Automated regression checks exactly one evidence field and read-only API evidence behaviour. No gameplay rules changed.

## Testing and release gates

- **scripts/player-action-plan-api.test.mjs**: 0/3-pet owner projection, no ID leaks, original-pet mapping, failed roster, read-only 80-query budget and duplicate-key guard.
- **scripts/my-moonboy-browser.test.mjs**: 360/390/1280 Chromium, signed projection fixtures, browse-only task links, pagination, keyboard tabs, guest protection, account switching, logout and stale-API suppression.
- **scripts/ci-domain-runner.mjs**: registers browser tests in the Visual domain.

**Production signoff:** Real signed OIDC/Telegram test accounts and genuine 0/1/3 pets, egg, historical claims, DST/day rollover, missing sources and slow API must still be checked. Browser fixtures are automated regression evidence, not production verification.

**Runtime impact:** static Pages HTML/CSS/JS **and** a minimal additive Worker read-only projection change/duplicate warning fix. **No D1 migration, no VPS restart.** After owner-approved merge only, run the provenance wrapper for moonboys-api and verify deployment-info. A plain Wrangler deploy is not approved. Pages/Worker provenance and manual validation are PR 6 release gates.

**Merge decision:** Hold until all Worker API, Arcade, Wiki, Visual, WAX and PR checks pass, review comments are addressed and GK approves. No deployment or migration is performed from this PR. PR 4 owns public Crew Operations and private My Contribution across all nine faction chambers; PR 5 owns broader invalidation and notification polish.
