# MP-A01: suspend hidden-page refresh work

Reproduced on main 3dedb1725 in the isolated signed Worker/SQLite Chromium sandbox. The visibility handler stopped speculative hydration, but the independent live, season, cooldown and care-reconciliation paths continued to start requests. The thirty-second Home tick also rebuilt its DOM while hidden.

The fix guards passive refresh entry points and pending module retries, cancels the three queued refresh timers when hidden, and preserves dirty/pending state. Returning to visibility uses the existing signed authoritative refresh and requeues cancelled Home warmup only after a current core snapshot succeeds. Failed or superseded foreground reads do not start it. In-flight mutations are not aborted or replayed; Worker recovery, ownership, final economy checks and response contracts are unchanged.

## Evidence

The same 330,000ms virtual hidden-Home workload on main started one full HTTP read and emitted 24 screen child-list mutation records. A continuous-clock run observed two reads. The fixed Chromium regression reports zero reads and zero mutations, then verifies successful signed refresh and care after visibility returns. XP, Gold, Crystals and Style snapshots are identical throughout the hidden interval. Existing one/three/recovery signed-care progression hashes are unchanged from main.

Five new behavioural tests fail against main (53 existing tests pass, 5 new tests fail) and all 61 pass with the fix (including three foreground-warmup review regressions). They cover hidden Home, Work and Explore, queued module/cooldown work, dirty care state and authoritative resume. The existing PR7 Chromium suite includes the hidden-Home before/after regression. No timeout was increased and no assertion was bypassed.

Reproduce:

~~~sh
node --test scripts/moonpet-passive-refresh.test.mjs
node scripts/moonpet-pr7-home-browser.test.mjs
node scripts/ci-domain-runner.mjs worker-api
node scripts/ci-domain-runner.mjs visual
~~~

The sandbox audit register lives in the independent sandbox PR. This change fixes MP-A01; MP-A02 completion wording and MP-A03 full-response latency remain separate. This reduces unnecessary hidden-page work, not the latency of an individual active full-state response. Browser-native background throttling varies by platform; the test exercises the visibility boundary deterministically.

Deployment: static frontend release only after GK approval. No Worker deployment, D1 migration or VPS restart. No production action performed. Hold merge.

Copilot follow-up: a live poll already in flight could launch recovery after the tab became hidden. Visibility is now checked after the live response and after either recovery response; the last save is retained and foreground reconciliation remains pending. Eight regressions cover combat, activities, pet switching, ordinary live data and legacy full responses, including hiding during recovery itself.

Latest-head review also reproduced a season response applying after visibility changed during its request. Core and full season responses now retain pending reconciliation without publishing hidden state or scheduling warmup. Both new tests fail before the fix and pass afterward; the passive suite now contains 71 passing tests.

The same delayed-response reproduction confirmed care and cooldown reconciliation could publish hidden results. These reads now preserve pending/dirty work; discarded cooldown responses release their key for retry, and hidden care reconciliation does not recreate its cancelled timer. Both regressions fail before the fix; all 73 passive tests pass afterward.

A subsequent review reproduced foreground module hydration rendering and acknowledging unseen notices after hide. Successful and failed hidden results now retain foreground reconciliation, and exhausted retries do not render a hidden manual-retry panel. Four regressions cover success/failure with fresh/exhausted retry budgets, unchanged saved state, no notice acknowledgement and successful visible manual retry; all four fail before the fix.

Desktop and mobile Chromium also hold a signed foreground Work response until hidden, verify zero screen rebuilds and notice acknowledgements, then complete authoritative foreground loading. All 77 passive tests, 39 refresh-audit tests, player-loop/API compatibility tests and the extended signed browser suite pass.

Copilot follow-up: visibility reconciliation previously rendered the full save without delivering deferred notices, and the transport could retry passive reads after hide. Full visible reconciliation now invokes the existing source-bound notice delivery. Passive state callers opt into visibility checks before requests and retry backoff; deferral preserves foreground work without consuming failure budgets. Startup/manual reads retain their bounded retries, and mutation/401 handling is unchanged. Twenty-three regressions fail on a57d49fcc and pass after the fix; four compatibility cases verify startup/manual retries and mutation/authentication handling (104 passive tests total). Mobile/desktop Chromium checks use a genuinely pending Worker notice and verify no hidden acknowledgement, visible delivery and the saved acknowledgement receipt after resume.

Latest-head review also reproduced hidden 401 rendering. Authentication invalidation still happens immediately, but the expired-session UI waits for visibility return; passive callers do not schedule retries or failure messages with expired proof. Five caller-specific regressions fail before the fix and pass afterward, including exhausted care/cooldown/module retry budgets. Mobile/desktop Chromium verifies zero hidden screen changes and immediate foreground authentication display without an additional request.

Five visible-401 cases additionally verify no automatic care/module retry timer is recreated after terminal authentication failure. All 114 lifecycle regressions pass, along with 39 refresh-audit tests and player-loop/API compatibility checks.
