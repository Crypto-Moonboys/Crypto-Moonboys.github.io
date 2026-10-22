# MoonPet sandbox audit and defect register

Base: main 3dedb1725 (merged PR #1610), 22 October 2026. This is an evidence register, not a claim that finite testing proves the absence of every bug. No production account, database, currency or reward was accessed or changed.

## Reproduce the isolated game

Use Node 24 with the repository dependencies and Playwright Chromium installed.

~~~sh
node scripts/moonpet-sandbox.mjs historical
node scripts/moonpet-sandbox.mjs established --interactive
node scripts/moonpet-sandbox-browser.test.mjs
node --test scripts/moonpet-sandbox-stress.test.mjs
node scripts/moonpet-sandbox-background-probe.mjs
node scripts/ci-domain-runner.mjs worker-api
node scripts/ci-domain-runner.mjs visual
~~~

The sandbox extracts and reuses the PR7 signed-browser harness, existing SQLite adapter, production schema, migration seeds, Worker fetch handler and real frontend. It does not create another game implementation. Each player gets an in-memory SQLite database. Telegram signatures use a synthetic fixture secret. Worker outbound fetch is rejected, browser external traffic is aborted, service workers are blocked, and the loopback asset server only serves public game assets. No Cloudflare credentials, remote binding, deployment or migration command is involved. Close the interactive window or press Ctrl+C to discard that player.

Players: new (zero permanent pets), established (one), two (two), advanced (three), historical (three including archived original and unpaid historical Journey/boss evidence), and stage-0 through stage-5 (saved evolution unlock evidence). The new player starts before ownership bootstrap. These synthetic records complement the existing migration-rehearsal and corrupted-source fixtures; they are not production data exports. Clock-sensitive fixtures run serially because the existing clock helper controls process time.

The browser matrix visits all six sections at 360×640, 390×844 and 1280×900, opens disclosures, inventories enabled/disabled actions, verifies stage contracts, pet counts, runtime errors and horizontal overflow. This inventory does not claim to click every possible reward/action combination. The established mobile player additionally performs 60 navigation transitions with garbage-collected DOM/listener counts. Set MOONPET_AUDIT_OUTPUT to save the complete control inventory as JSON.

## Prioritised register

| ID | Severity | Confirmed evidence and reproduction | Root cause / affected systems | Status |
|---|---|---|---|---|
| MP-A01 | P2 | Run background probe: a hidden Home over 11 × 30-second virtual clock advances starts a full-state HTTP request and produces 24 screen child-list mutation records. A continuous-clock run started two full reads. | Visibility handler cancels speculative hydration, but season/cooldown/live/fast refresh entry points and the 30-second Home render do not check visibility. Wastes signed state/recovery work while the game is hidden. | Fixed in open PR #1612; awaiting GK approval. |
| MP-A02 | P3 | renderMissions displays saved completed missions as [OK] and earned achievements as [UNLOCKED]; it never emits the requested ✅ Completed wording. Daily/weekly objective rows use similar legacy markers. | Presentation consistency gap; not evidence of lost completion or fabricated rewards. | Confirmed; focused completion-label fix next. |
| MP-A03 | P2 performance target | Merged PR8 reproducible 100ms/D1 model reports warm signed complete response p50 5,208ms, recovery-heavy 14,804ms. See moonpet-pr8-performance.md and raw fixture. | Bootstrap plus required historical recovery and projection remain above the three-second objective. | Open optimisation backlog. Do not skip recovery or call staged Home a complete response. |

No new P0/P1 ownership, XP-loss, duplicate-reward or double-spend defect was reproduced in this pass. This means none was observed in the tested workloads, not that untested combinations are proven safe.

## Actual automated evidence

- Baseline complete Worker/API domain: 164 commands passed. Existing mandatory failure and source-owner tests remain enabled.
- Signed replay burst: 1,000 requests, five concurrent; 29 handled duplicates and 971 correctly throttled; full permanent-state snapshots identical after each batch; SQLite stays at 540 pages.
- Rate-limit-respecting session: 1,000 handled duplicates, five concurrent, over 39 × 61 seconds of clock advances; zero throttles, no second payment, unchanged permanent ownership, XP, wallets, Growth Marks, Crests, materials and receipts; SQLite stays at 540 pages. Every application table is snapshotted, including events, behaviour, daily challenge and weekly Journey evidence. Natural care decay and its pet timestamps are explicitly excluded from long-session equality; telegram_users.updated_at is separately asserted to equal the current signed-request time before normalization. The fixed-time burst compares all these values too.
- Expanded browser matrix: 33 player/viewport combinations × six sections passed (198 screen visits), inventorying 4,380 rendered action controls. All six saved evolution stages verified. After 60 additional mobile navigation transitions, garbage-collected listener count stayed 61 → 61 and DOM nodes changed 1,635 → 1,565. Raw results: scripts/fixtures/moonpet-sandbox-audit-results.json.
- Existing PR7 browser regressions passed after extracting the shared fixture: slow/full failure, action during hydration, switching, ownership change, visibility return, auth failure and bounded retries.

## Coverage map (executed by the complete CI domains)

| Area | Existing behavioural suites reused |
|---|---|
| Adoption, signed auth, incubation, identity, all stages and permanent slots | telegram-pets-api; telegram-website-auth; telegram-pets-species-lifecycle; telegram-pets-identity-expansion; moonpet-permanent-ownership; moonpet-entry-lifetime; moonpet-paid-onboarding; new sandbox matrix |
| Original/archived ownership, migrations and incomplete history | telegram-pets-roguelite-migration-rehearsal; moonpet-history-retention; moonpet-retained-proof-slots; moonpet-consolidated-proofs; moonpet-beta-xp-quarantine; moonpet-style-migration-091 |
| Care, XP, currencies, concurrency, equipment and crafting | moonpet-care-integrity; moonpet-care-frequency; moonpet-consolidated-atomicity; telegram-pets-equipment-progression; telegram-pets-economy-phase-3; moonpet-shop-sanity; new replay stress |
| Home, furniture, rooms, garden, art and rendering | moonpet-house-layout; moonpet-furniture-e2; moonpet-home-e3; moonpet-home-canvas-browser; moonpet-companion-wings-browser; moonpet-multi-bot-browser-smoke |
| Missions, daily/weekly Journeys, achievements and rollover | moonpet-mission-status; moonpet-daily-outcome-integrity; moonpet-weekly-authority-regressions; moonpet-completion-acknowledgements; moonpet-weekly-payout-period; moonpet-season-rewards-rollover |
| Runs, contracts, adventures, Street Events and timed jobs | moonpet-contracts; moonpet-legacy-event-close; moonpet-run-authority-1419; moonpet-job-activity-authority; moonpet-activity-options; moonpet-player-loop-browser |
| Arena, Kaiju, seasonal bosses and failed settlements | moonpet-arena-mutation-integrity; moonpet-combat-integrity; moonpet-kaiju-deadlines; moonpet-specialist-settlement; moonpet-live-ending-recovery; moonpet-reward-delivery-integrity |
| Notifications, leaderboards and menu affordances | moonpet-guidance-notification-scope; moonpet-notification-settings; moonpet-mini-app-leaderboard-sql; moonpet-guide-browser; moonpet-player-loop-browser |
| Slow requests, response ordering, offline/auth recovery | moonpet-pr7-home-browser; moonpet-passive-refresh; moonpet-pr8-full-state; moonpet-action-sync; moonpet-public-sync-browser |

The existing player-loop browser suite actually exercises paid capacity checks, crafting/use, saved drafts, contracts, daily runs, raids, jobs, claims, fail/retry, deletion confirmation and saved replay, beyond the new navigation inventory. It uses older fixture dispatch in some paths; the new matrix and stress tests add the actual signed HTTP boundary rather than treating that older dispatch coverage as authentication coverage.

## Remaining audit limits

- SQLite/D1-compatible binding tests and local Chromium do not emulate Cloudflare scheduling, real Telegram webviews or production D1 geography. No production latency claim is made.
- A burst plus a 40-minute virtual session is not a multi-day soak of every activity interleaving. Arena/Kaiju multi-device and settlement races remain covered by the focused existing fixtures, not a new thousand-player simulation.
- No dead code was deleted merely because text search found no caller. Legacy recovery has active historical consumers and remains intact. Worker routes, economy, schema, dependencies, bot routing and Wiki are unchanged by sandbox tooling.
- Canvas frame stability under real mobile hardware and every asset download failure remain device-validation work. Browser listener checks cover repeated navigation, not proof of zero memory leaks in all game features.
- All changes require review and GK release approval. No merge, deployment or migration is authorised by this audit.
