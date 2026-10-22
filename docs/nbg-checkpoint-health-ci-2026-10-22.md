# NBG checkpoint-health CI correction — 2026-10-22

## Root cause and reproduction

Failing job: https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/actions/runs/39842969038/job/120048665990

The complete job log ends at scripts/nbg-level1-browser-validation.mjs:1154:
`checkpoint respawn fall damage must reduce health once`, actual 1, expected 2.
The run uploaded no browser-state artifacts. All preceding NBG syntax and unit checks passed.

The same unmodified validation fails on main 3dedb1725513de0f57ae20a4fc7562ded5100474.
Its NBG runtime, browser script, package lock and NBG workflow are identical to PR #1611 head
7403f52416dcd1e1997bf8aa3be0a219a3963b25. This establishes independence from MoonPet.

CI uses Ubuntu 24.04, Node 22.23.3, Playwright 1.59.1 and Chromium
147.0.7727.15 (revision 1217). Local reproduction uses Windows, Node 24.14.0
and the same locked Playwright and Chromium headless-shell revision.
Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to that bundled headless shell on Windows;
the existing script otherwise selects a system browser when available.
Run `npm run test:nbg-level1` from the checkout root.

A temporary listener on the existing nbg-player-hit event captured:

| Point | Health | Evidence |
| --- | --- | --- |
| After separate pig rendering scenario | 3 | Main player x=469.874, vx=4.2; right input still held |
| Prior movement hits the first rat | 2 | enemy=rat, x=612.683, run elapsed=2216.6 ms |
| Checkpoint entered | 2 | Prior rat hit remains; test never resets health |
| Forced fall | 1 | enemy=fall, run elapsed=4566.4 ms |
| Respawn | 1 | x=1240, y=180, invulnerability approximately 933 ms |

The flying-pig canvas scenario was inserted between keydown and keyup in #1551
(commit 2e45d46df). The main game continues moving during those unrelated browser
operations. Their duration determines whether it reaches the rat. The test then
teleports that already damaged player to the checkpoint and assumes spawn health.
This is timing-dependent fixture contamination, not double fall damage, restored
save health, a MoonPet change or a Linux-only failure. NBG reset initializes health
to 3; checkpoint respawn intentionally preserves remaining health. The runtime
has no saved checkpoint-health restoration path.

## Correction and regression coverage

- Run the isolated pig canvas scenario before starting the main player.
- Reset through NBGLevel1Runtime.reset() before the checkpoint scenario, assert
  full starting health and zero earlier hit events, and reset movement velocity
  when positioning the player. No direct health write supplies this fixture.
- Use Playwright-controlled frames for checkpoint activation and falls; resume
  normal browser time before subsequent gameplay scenarios.
- Retain the original expected health of 2 after the first fall. Additionally
  assert exact respawn position, exactly one fall hit, unchanged health while
  invulnerable, a later 2-to-1 fall, continued gameplay and exactly 250 checkpoint
  XP throughout repeated respawns.
- Run the entire existing Level 1 validation three consecutive times in CI.
  Bash fails the job on any failing invocation; this is not a retry-until-pass.
  No timeout, gameplay, reward, ownership, authentication or production data changes.

## Verification

- Unmodified main: reproduced the exact health assertion; event-traced reproduction
  independently confirmed the prior rat hit and single fall hit.
- Corrected complete Chromium Level 1 suite: passed locally; repeated exact-head
  CI results are recorded in the corrective PR and PR #1611.
- All 12 NBG unit/source-trust/course-gate tests passed locally.
- Complete Arcade CI group passed locally (37 commands).
- Syntax and git diff --check passed.

The existing complete browser suite also covers restart, terminal health/game-over,
keyboard/touch movement, jumps, enemies, hazards, rendering, rewards, auth races,
score submission and replay protection. No production runtime file is changed.

## Integration and release

The corrective PR targets main independently. The same corrective commit can be
included in #1611 for exact integration CI without merging either PR. Preserve all
MoonPet commits and review fixes; #1612 and #1613 remain separate. GK approval is
required before any merge. No Worker deployment, migration or server restart is
required; this change only affects validation and its documentation.
