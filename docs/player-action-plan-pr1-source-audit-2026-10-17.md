# Player Action Plan: PR 1 source audit and gap register

**Master:** #1552 · **Baseline main:** `2e45d46df8ba6b16ed15e6f8dd9382ad8cc53934` · **Audit:** 17 October 2026  
**Classification:** repository code/documentation review; **NOT** evidence of a production Worker deployment, D1 records, or a verified Telegram session.

## 1. Finding / product decision
Build **both** `/my-moonboy.html` (private, cross-game owner-scoped activity) and the nine existing faction chambers (public crew work plus a small owner-only member view). Keep editorial `dashboard.html` unchanged. Both must read the **same trusted task projection**, not recompute progress and not add reward or economy logic.

The source catalogue `data/player-action-plan-source-registry.v1.json` is **design input only**. It is not a task feed and must never be published as evidence that a particular user's task is actionable or complete.

## 2. Current source inventory
| Category | Exists now | Authoritative read / source | Personal-plan gap | Classification |
|---|---|---|---|---|
| Identity & join | Identity gate, website linking, member faction status | `js/identity-gate.js`, `js/faction-alignment.js`; Worker linked `/daily-loop/state` | owner-scoped onboarding and auth-expired states | **EXISTS IN CODE; ADAPTER NEEDED** |
| Faction daily/seasonal | Three rotating daily missions per faction + seasonal progress and display | `js/arcade/systems/faction-missions.js`, `js/battle-chamber-faction-bridge.js` | Local progress mirror may differ from accepted server facts | **PARTIAL VERIFICATION** |
| Faction standings / public proof | Weekly/monthly/seasonal standings, public activity | `js/faction-chamber-page.js`, `/battle-chamber/factions/standings` | private player contribution separated from public crew | **EXISTS; ADAPTER NEEDED** |
| Daily UTC shared state | Owner-linked daily missions, wiki completion rows, Arcade daily opportunity, WTF events, digest and missed history | `workers/moonboys-api/routes/daily-loop-state.js` + `js/core/daily-loop-state.js` | No full MoonPet recommended-next state; legacy bridge does additional fetches | **EXISTS; ADAPTER NEEDED** |
| Timed WTF | Six every-4h preview schedule slots and D1 event rows when present | Daily Loop `daily_wtf_status` | Only persisted check-in can prove player attendance | **SCHEDULE PREVIEW VS LIVE** |
| Arcade | Games, daily opportunities, run guidance and XP streams | `games/index.html`; `js/arcade-meta-system.js` | score/client verification differs by game; do not trust it for verified Clout | **PARTIAL VERIFICATION** |
| MoonPet baseline | Account, selected pet, per-pet lifecycle, care, claims, runs, missions, timer/route guidance | `POST /telegram-pets/app/state`, `js/moonpet-play-options.js` and `pets/player-guidance.js` | no compact, owner-authenticated, zero-mutation cross-page summary | **EXISTS IN GAME; READ ADAPTER NEEDED** |
| MoonPet website legacy | Summary and mission list fetched using `GET /telegram-pets/state?telegram_id=` and `/telegram-pets/missions?telegram_id=` | `js/crypto-moonboy-pets.js`, Worker GET branches | owner ID alone is not authentication for private detailed view | **SECURITY REVIEW REQUIRED** |
| MoonPet long term | Permanent pets; distinct Growth Marks/Crests, five evolution gates and saved ownership | `pets/season-completion.js`; `pets/ownership-period.js`; `docs/moonpet-source-of-truth.md` | pet-specific clock and origin-pet selection | **EXISTS; ADAPTER NEEDED** |
| Wiki contributions | Saved wiki mission-completion rows | Daily Loop `wiki_missions`; `wiki_mission_completions` | accepted source != eligibility for Championship | **PARTIAL FOR COMPETITION** |
| Championship | Policy + pilot adapters in repo per #1530 | `workers/moonboys-api/championship/` | do not treat planned or incomplete adapters as production verified | **GATED / VERIFY RELEASE** |
| Dead Run / NBG London | Game work and records, separately reviewed under #1513 and #1530 | `workers/moonboys-api/routes/dead-run.js`; NBG source trust guard | task adapter only after replay/owner/eligibility proofs | **DEFER OFFICIAL CREDIT** |

## 3. Critical integrity details discovered
1. **MoonPet full state is not a pure read.** `buildPetMiniAppState` calls `preparePetMiniAppState` and recovery routines (saved run endings, rewards, runtime, etc.). PR 2 **must not** import this as an innocent GET/read-side projection or fan it out for every faction visitor. Use a strictly read-only DB query/projection with a controlled call budget.
2. **Browser MoonPet and Telegram bot guidance are separate engines.** `js/moonpet-play-options.js` exposes `recommendations(snapshot)`; Worker `pets/player-guidance.js` provides `choosePetNextAction`. Rank actionable saved/accepted routes without duplicating eligibility math; server rejects mutations as before.
3. **Faction mission authority is not yet uniform.** Local storage tracks progress, then `/player/daily-missions/progress` and `/battle-chamber/event` are separately called. The Battle Chamber proof event explicitly uses `clout_delta: 0`. Show mirrored/advisory progress as such, not an independently verified claim.
4. **Daily Loop is an aggregator.** Its `source_status` distinguishes persisted results, legitimate empty reads, schedule previews, failures and missing tables. `js/battle-chamber-faction-bridge.js` still fetches `/roguelite/daily-state` independently. PR 4 must consolidate read authority without breaking public standings.
5. **Time contracts differ.** Site day is UTC midnight; ISO competition week differs from per-pet ownership/Journey week; saved timers are absolute UTC instants; 365-day pet evolution is lifetime without expiry. DST only changes user display, not source deadlines.
6. **Claim vs complete is distinct.** MoonPet 7/7 missions can be completed while bonus remains `claim_ready`; some saved boss/contract rewards persist past their earning period. “0 tasks” from a missing module is **not** completion.
7. **Single client action can advance overlapping targets** but must not trigger a second paid settlement or manufacture new Championship credit. Existing original pet ID and original season key remain immutable attribution.
8. **Legacy /telegram-pets GET endpoints accept a caller-specified numeric Telegram ID** in the handler. They are not an acceptable signed-authority source for private detailed dashboards. Security follow-up must assess whether legacy reads overexpose other players before reusing.
9. **No personal gaming dashboard currently exists.** `dashboard.html` is site editorial analytics; keep it unchanged.

## 4. Scope/authority truth rules
Definitions for `data/player-action-plan-source-registry.v1.json`:
- `server_receipt`: source records can prove an awarded/completed event **after** verifying owner, original pet and accepted receipt. Not a blanket claim that every UI row is verified.
- `server_projection`: state is computed/returned by Worker but its arrival does not itself prove a payment, a completion or public ranking.
- `client_mirror`: local/browser-driven source may show helpful advisory progress, never official proof or verified Championship Clout.
- `schedule_preview`: generated schedule or deferred integration; no personal attendance proof.
- `readiness_adapter`: source can be read but personal task projection has **not** been built.
- `verification_review`: do not mark official before authentic upstream event proof and signed user/period checks.
- `deferred`: feature or trusted proof path not available yet; no ready task.

Each adapter must separately establish **current eligibility**, authoritative completion, explicit claim state, actual reward type/cap, source clock and expiry, blocker reasons, event/receipt ID, original pet/owner identity and safe navigation path. The registry may list a source whose dashboard adapter is not yet built; that is not evidence of completion.

## 5. PR 2 integration decisions to confirm before any runtime edit
- **Proposed** private route `POST /player/action-plan`, but inspect API routing and Worker split/provenance constraints before implementation.
- Validate fresh signed Telegram auth **in the POST body** and derive the account from the verified ID; never trust `?telegram_id`. No private page data in shared public caches or URLs. Read-only DB reads, no automatic recovery/claims/season creation.
- Prefer low-cost summary and paginated details; no calls to pet state once per pet × nine faction pages; share client requests and invalidate on source-approved events.
- Task state has one canonical owner, pet/source-run scope and period; no manually checked authoritative boxes.
- Preserve guest public faction views; private summaries only to the verified same-faction member. For missing data, show unknown/unavailable, not complete.
- Distinguish verified receipt, source projection, preview and client advisory via both `source_status` and explicit per-task evidence.

## 6. Release gates / future verification
| PR | Decision / test requirement |
|---|---|
| PR 1 | Audit, typed status/clock/task contract, catalogue, CI static coverage. **No production writes**. |
| PR 2 | Signed read-only adapter; owner/pet/season/privacy, source fail closed, query budget, contract and D1 tests |
| PR 3 | Personal page; identity switch clears data; current pet and source pet separate; accurate deadlines/claims |
| PR 4 | Nine factions with public-safe + private member modules; bridge Daily Loop single-source refactor |
| PR 5 | Accepted event invalidation, no false countdown readiness, cross-game settled claim parity |
| PR 6 | Real signed-player proof; deployed SHA and Worker provenance; D1 migrations if required, mobile/a11y/performance, GK sign-off |

**Related:** #1552 (owner); #1530 (Championship policy/receipts); #1478 (MoonPet); #903 (HUD); #1513 (Arcade). Source audits and files are current-`main` evidence only; no claim of QA or live rollout.
