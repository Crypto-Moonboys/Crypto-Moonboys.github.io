# PR #1644 final CI blocker investigation

Baseline main: `cc9446322728a4561f0b4c81925377ca05aadd7e`.
PR before corrections: `0b83fcc48ff13f694dda7765e31c1ed851a5fe89`.

Two independent complete checkouts were used. The baseline was cloned from
unchanged current main and remained clean after reproduction. The PR checkout
started from the same main and overlaid all 17 PR files, verifying each Git blob
SHA against GitHub before copying. No production account or database was used.

## Reproduced failures

| Command | Unchanged main | Original PR | Confirmed cause and correction |
| --- | --- | --- | --- |
| `node scripts/sparky-telegram-gate.test.mjs` | Failed | Failed | Retired `START WITH CHATGPT` button wording. Assert the current `BRING YOUR OWN IP` link to `/gpt-users.html`, explicit ChatGPT Creator Studio delivery and optional PC installation wording. Keep every retired-chat/auth guard. |
| `node scripts/homepage-hero-parity.test.mjs` | Failed at `markupMatches` | Same failure | Main now intentionally has distinct top/builder messages, a featured video and two added artworks. Pin both approved messages, keep computed typography/effects parity, test the video placement/source/aspect ratio, and verify all artwork at natural aspect ratio. |
| `npm run test:avatar-builder` | Failed at old CTA wording | Same failure | Obsolete HODL Warrior headline and a broad mission selector that now matches two sections. Pin the current heading and target `#how-it-works`; assert the distinct top introduction remains. All builder layout, interaction, export, accessibility, request and failure checks remain. |
| `node scripts/homepage-build-moonboy-hero.test.mjs` | Four assertions failed | Same four failures | Old headline, supporting line, creator-route prose and a false positive from the approved artwork's alt text. Pin the current headline/pulse and both creator routes. Continue rejecting obsolete visible builder copy while allowing truthful artwork descriptions. |

These are inherited assertion/selector failures following main's homepage edits,
not MoonPet integration regressions. Updated browser checks pass without changing
`index.html`, styles, scripts or assets. The approved copy fixture points to the
main commit above and is independent of the page under test.

The image check warms lazy artwork by scrolling it into view before decoding;
waiting for an offscreen lazy image's decode alone does not initiate its load.
No timeout was increased. No test was disabled and no safety assertion was
removed to manufacture a pass. Obsolete equality/adjacency/copy assumptions were
replaced with specific assertions for the current implementation.

## Validation and preservation

The correction changes tests, a test contract fixture and this investigation
record only. MoonPet runtime source hashes must still match the committed
performance report. The 13 beta safety regressions, sandbox stress cases and
all 14 complete signed response/every-table parity scenarios are retained.

```powershell
npm run ci:worker-api
npm run ci:visual
npm run test:avatar-builder
node scripts/sparky-telegram-gate.test.mjs
node scripts/homepage-hero-parity.test.mjs
node scripts/homepage-build-moonboy-hero.test.mjs
node --test scripts/moonpet-beta-streamline.test.mjs scripts/moonpet-sandbox-stress.test.mjs
$env:MOONPET_PERF_DELAY_MS='0'
$env:MOONPET_PERF_SCENARIOS='zero,new,warm,three,heavy,archived,day_rollover,week_rollover,month_rollover,quarter_rollover,lifetime_rollover,activity,concurrent,failed'
node scripts/moonpet-pr8-full-state-benchmark.mjs BASELINE_MAIN_ROOT OUTPUT_JSON
```

Local browser verification uses installed Chrome through a temporary launcher
shim because the Playwright browser download is absent. The shim is outside the
repository and is not a CI modification. Hosted CI uses the repository's normal
browser installation when it runs.

Completed final counts, exact hosted run/check URLs and latest-head Codex review
are recorded in the PR conversation. Green local checks do not substitute for
the user's required green GitHub Actions run on the final SHA.

The GitHub connector exposes run reads and reruns but no new workflow dispatch.
Direct `gh api` access was also tested and rejected by the session network
policy. A final-head branch update and PR label event can request the existing
pull-request workflow; success must be verified from actual runs/checks. No
workflow, deployment setting, Cloudflare configuration or migration is changed.

PR #1644 stays open for GK. No merge, deployment, migration, economy change or
beta reset is authorized or performed.
