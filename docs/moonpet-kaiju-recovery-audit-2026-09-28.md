# Moonpet follow-up sanity audit — 2026-09-28

Baseline: merged PR #1365, commit `3c8c26c7d070dbf0046151f468fdfd80a1b063e5`.
The public Worker reports the same deployed commit. This follow-up traces prior
stuck-action, interrupted-payout, wrong-pet and false-empty-read defects into
other paths, using isolated SQLite fault injection and the real dispatchers.

## Confirmed defects and fixes

| Finding | Repair |
| --- | --- |
| Kaiju saves a card, then a failed completion leaves it permanently locked | Mini App and Telegram share one card continuation. Retries use the saved card, rival card and category. They cannot reroll or replace either player's choice. |
| Refresh never repairs Kaiju endings; lobby expiry can discard fully locked cards | Ready matches and unpaid completed matches enter bounded recovery. Expiry still removes abandoned lobbies, but preserves fully locked choices for settlement. |
| A cancellation wins the completion race but the losing request still pays | Completion reloads the committed match and requires a completed, valid result before awarding anything. |
| A failure before reward reservation lets switching pets redirect the payout and energy cost | Each accepted card atomically saves its source pet, season and equipment in the existing match JSON. Rewards, energy and repeat limits use that source, including an inactive retained pet. The current compatibility profile changes only if it still represents that pet. |
| Telegram Kaiju catches failed active-match/profile reads as empty results | Required reads propagate failure; an unavailable table cannot authorize another match. Receipt reads also retain errors rather than masquerading as absent receipts. |
| Fractional ISO timestamps parse as zero because the timezone suffix is duplicated | Preserve the timezone once. A regression reproduces an older profile reducing a pet from 10,000 XP to 200 XP before the fix, and confirms newer pet state survives after it. |

Arena and Kaiju share one rotating combat recovery slot per refresh. Accepted
receipts remain the payment authority; the cursor only schedules work. This
keeps one combat backlog from permanently excluding the other and reserves room
for normal state rendering and care recovery. No schema migration is required.

## Gameplay and synchronization checks

The existing executable suites were rerun for care and cooldowns, roster/switching,
timed activities/jobs, shops and equipment, daily checklist/7-of-7 claims, Daily
Journey/Cache, Weekly Journey and Boss, Standard Run, official Daily Run, Contracts,
season progression/finale, story/district choices, raids and the public boards.
See [the prior coverage inventory](moonpet-full-sanity-2026-09-28.md) for the
individual ending/reward contracts; this patch preserves those game rules.

Daily Run still ends at room 10 with Alley King; Standard Run has its 100-room
ending and extraction; Contracts have six/ten-room goals and end bosses; season
completion leads to Signal Sovereign with saved builds/turns and a once-per-pet
season reward. Practice and explicitly planned/locked options retain their
existing status. No fake playable controls or invented XP were added.

The new Kaiju fixtures verify one accepted receipt, original-pet attribution,
once-only energy/XP, public daily Pet leaderboard totals and activity visibility
through real HTTP handlers. Existing public-sync tests also cover weekly,
seasonal, all-time and run-depth boards, Community XP and retained pets.
Pet XP, Community XP and Arcade XP are distinct systems. The website graph is
wiki-driven; it does not claim to update from pet XP.

## Validation

- All five original Kaiju reproductions failed before the fixes and pass after.
  The fractional-timestamp reproduction also failed before its fix.
- `node --test scripts/moonpet-combat-sanity.test.mjs`: 40 passing cases,
  including 14 new regressions/control cases. Covers both players, Telegram,
  retries, timeout, cancellation, switching, original gear, legacy receipts,
  public synchronization and mixed backlogs.
- `node --test scripts/moonpet-combat-sanity.test.mjs scripts/moonpet-action-sync.test.mjs scripts/moonpet-progression-sync.test.mjs`:
  178 passing tests. Existing source-pet and original-day accounting assertions
  remain in place; fixtures now supply the provenance required by the real flow.
- `node scripts/telegram-pets-api.test.mjs`: passed, including XP caps,
  reservation/energy idempotency and original-day leaderboard recovery.
- The real HTTP SQL test compiles 249 captured Mini App statements under D1's
  compound-select, parameter and function-argument limits.
- Mixed Arena/Kaiju/50-care recovery used 526 and 565 statements across its two
  refreshes. The two-player Arena repair remains below the 600-statement test
  budget at 589. Warm-state and ordinary backlog budget checks pass.
- Read-only `node scripts/live-graph-pets-verify.mjs`: passed, 327 wiki nodes and
  1,629 graph edges, with public Pets/graph consistency checks.
- `CHROMIUM_EXECUTABLE_PATH=/tmp/moonpet-chromium/chromium npm test`: passed
  across arcade, Worker/API, wiki, WAX and visual domains, including both mobile
  viewports, all six Mini App screens, boss/ending retries and season completion.

## Limits and release

No authenticated production gameplay, private account inspection, D1 mutation,
merge or deployment was performed. Historical Kaiju payouts with an existing
source-pet reservation can recover. A historical match with neither a source
snapshot nor a source-pet receipt cannot safely be attributed; it remains unpaid
rather than charging or crediting today's selected pet.

Worker deployment is required after GK approves the merge. There is no D1
migration, frontend change or VPS restart. Verify `/deployment-info`, play one
solo Kaiju and one matched battle, refresh a saved choice/result, switch pets,
and compare XP/activity with the website after deployment.

Backup: `codex/backup-moonpet-recovery-audit-20260928-153500`.
Sandbox: `codex/sandbox-moonpet-recovery-audit-20260928-153500`.
GK approval is required before production merge.
