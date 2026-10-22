# MoonPet Performance PR7 — faster verified Home

Base: main 80a77cb2fc1e2aed65f45843d323ec788d15c9bf (merged PR6). References #1607.

## Runtime change

Existing core-first loading is retained. Telegram discovery and website auth restoration now overlap; discovery can finish on the next 50 ms tick once a website proof is restored. Native Telegram launches retain priority over website credentials while their signed context arrives, and can proceed without awaiting a stalled website-auth backend. The Worker still authenticates every request. Verified core state immediately dismisses decorative boot typing instead of waiting for its animation or covering the companion with another success animation. Art initialization stays asynchronous.

The full warmup is queued after two animation frames following the verified render. Speculative reads have one attempt and a 20-second deadline; foreground requests retain their existing retry/deadline policy. New foreground reads and actions cancel only the speculative read transport and advance the request generation. They immediately release its bookkeeping, and old cleanup cannot clear a newer request. No gameplay action or settlement is automatically retried or canceled.

Speculative full responses check current generation, signed-session identity and displayed pet/season/competition period. A source change schedules an authoritative read instead of splicing accounts or pets. Home cooldown/care/visibility reads can preempt warmup; visible core Home refreshes stay in core mode. Hidden pages stop speculative warmup. Non-Home loading/retry panels start expanded so the state and retry are visible. Existing counters, completed flags and progression contracts are unchanged.

Only the static client changes. No Worker source, bot routing, XP economy, recovery algorithm, ownership proof, receipt rule, Wiki or schema changes. Update the client asset query token in moonpet-game.html; the six matching token assertions follow that version.

## Reproducible browser evidence

Windows / Node v24.14.0 / headless Chromium, 360x640, normal motion. Same real Worker and fixed-clock SQLite fixture, first one/three pets and then three pets with five historical accepted-event recovery sources. Each binding call has a 25 ms injected wait; each API route has a 100 ms injected transport delay. Static scripts/art are served locally. Both revisions use identical valid Telegram HMAC proofs; the website flow restores a valid signed fixture login through the existing identity-provider interface. It models client loading, not production OIDC/network performance.

The Home timer runs from navigation to the verified care panel with the companion boot overlay dismissed and the real pet renderer ready. The test then expands care, clicks a real action, requires its signed Worker response to be accepted, and waits for SAVE CONFIRMED. No spinner, locally invented pet or optimistic reward counts as success. Feed is used normally; recovery uses Clean because the historical Feed evidence correctly retains its cooldown.

| Auth / fixture | Verified usable Home ms (before → after) | Care confirmed ms from navigation | Work ready ms after navigation to Work |
|---|---:|---:|---:|
| telegram / one | 1473 → 958 | 3584 → 3080 | 1873 → 1868 |
| telegram / three | 1428 → 877 | 3512 → 2961 | 1878 → 1879 |
| telegram / recovery | 1440 → 885 | 3529 → 2971 | 1889 → 3427 |
| website / one | 2668 → 933 | 4736 → 3008 | 1882 → 1888 |
| website / three | 2669 → 911 | 4738 → 2988 | 1875 → 1879 |
| website / recovery | 2640 → 913 | 4723 → 2985 | 1897 → 3428 |

Home improves by about 0.55 seconds in Telegram and 1.73 seconds in the website flow in this model. Repeated earlier runs showed the same direction (Telegram Home 1440–1577 → 880–946 ms; website Home 2638–2699 → 912–928 ms). These are controlled fixture measurements, not production claims.

**Full-tab limitation:** ordinary Work hydration is approximately unchanged. Recovery-heavy Work takes longer after the earlier action/navigation because the new client reaches it before the existing historical recovery has finished; canceled read transport does not cancel server settlement. This PR does not claim faster recovery or universally faster full tabs. The signed Home and care improvements are independent of that debt. No historical work was removed to improve the figures.

All six final before/after cases have identical saved-progression hashes covering wallet currencies/XP, per-pet stats/XP, receipt counts by source/status, and accepted event counts/awarded XP. Full payload and source/ownership behavior remain covered by the existing Worker and browser suites. Timings use actual navigation and server acceptance, not fewer D1 calls.

Reproduce using the same test from the PR checkout with dependencies installed:

~~~powershell
$env:MOONPET_PR7_CLIENT_ROOT = 'D:/workspace/moonpet-pr7-baseline' # checkout of 80a77cb2f
node scripts/moonpet-pr7-home-browser.test.mjs --benchmark
$env:MOONPET_PR7_CLIENT_ROOT = (Get-Location).Path
node scripts/moonpet-pr7-home-browser.test.mjs --benchmark
~~~

Compare the six PR7_BROWSER_RESULT rows by auth/scenario; progression_hash must match. The optional owner parameter in the existing fixture isolates signed test accounts while retaining real rate limiting. Test teardown drains server work before closing SQLite.

## Verification

- Signed browser regressions at 360x640 and 1280x900: slow full state, confirmed care during warmup, late/out-of-order full responses, all six sections, in-flight pet switching, website account switching, hidden/visible, 20-second timeout, bounded 503 failures/manual retry, invalid startup auth, expired session, and delayed native Telegram context with website restoration stalled for eight seconds. Passed.
- Unit hydration/request tests cover owner/pet/period changes, cancellation ignored by fetch/body reads, old finally versus a newer request, foreground preemption and confirmed care refresh. Passed.
- Existing mobile player-loop tests cover archived-source recovery, completed versus claimable outcomes, idempotent receipts and the complete gameplay loop.
- Complete Worker/API and visual CI commands: node scripts/ci-domain-runner.mjs worker-api and node scripts/ci-domain-runner.mjs visual. Final status and latest-head review are recorded in the PR validation comment. The workflow-step test parser normalizes CRLF before matching; its Windows failure was reproduced on unchanged main before this test-only portability fix.

## Release

Hold merge for GK. Static GitHub Pages publication only after approval/merge. No Worker deploy, D1 migration or VPS restart is required. Verify live Telegram and website signed Home/companion usability and saved completion status after publication; fixture timings are not a substitute for that verification.
