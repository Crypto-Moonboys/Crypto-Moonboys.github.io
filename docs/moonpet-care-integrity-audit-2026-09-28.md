# Moonpet care, quests and public synchronization audit — 28 September 2026

Base: merged PR #1347, `0c13584ea29c928b250dd78adbb4bebb1babd703`.
This records source inspection and isolated SQLite/browser checks. Production
accounts and the deployed Worker have not been inspected in this pass.

## Reproduced faults and fixes

- Two concurrent ordinary care requests bypassed the 45-second cooldown. The
  event reservation now checks that cooldown inside the transaction. Special
  actions retain their separate cooldowns and daily limits.
- Feed plus Play recorded 16 Pet XP but saved only 10 because both wrote an
  earlier full pet snapshot. Care and consumables now apply deltas to the
  current instance row, then mirror its owned stats to the selected profile.
  Decay, health, streak and the current visible level curve are applied there.
- Concurrent care could exceed both daily XP caps, and consumables could exceed
  the Pet XP cap. The transaction calculates the remaining allowance; event,
  claim, response and season totals use the actual applied amount. Stat effects
  still work at the XP cap.
- Care could overwrite the newly selected pet's compatibility profile during
  a switch. It now rechecks the active pet, equipment, Train energy and activity
  restrictions before accepting. Consumables preserve their existing captured
  pet behavior: a switch does not redirect the item or overwrite the new pet.
- Community XP was written after care committed. An interrupted XP-log write
  left a rewarded pet action missing from Community ranks. The care event, pet,
  wallet, season totals, XP log, user XP and Community season leaderboard now
  commit or roll back together. Retry pays once.
- An accepted Mini App care replay returned the currently selected pet, allowing
  specialist progress to be awarded again on another pet. Pet-scoped replays now
  return the original instance and retain the source earning day for specialist
  recovery. Existing legacy personality compatibility remains unchanged; missing
  historical pet IDs do not gain newly inferred specialist ownership.

## Gameplay and display checks

| Area | Checked behavior |
| --- | --- |
| Care and items | Same-action cooldown, different-action concurrency, caps, stat decay, levels, original-pet retries and timed-activity restrictions |
| Daily and weekly quests | Accepted care reaches Daily Care and Weekly Journey evidence; rejected cooldown retries do not add evidence; all active care cooldowns survive state refresh |
| Standard Moon Run | Existing 100-room endpoint, extraction, failure and saved terminal-reward recovery remain in the Worker regression suite |
| Official Daily Run | Ten-room Alley King ending, tactics, saved ending, clear/failure and the next UTC-day attempt remain covered |
| Contracts and Practice | Saved ten-room Contracts, four drafts, six goals, final boss and immediate replay; Practice remains separate from official rewards |
| Weekly boss / seasonal raid | Available choices, defeat/claim and reward recovery remain covered |
| Season progression | Tier claim rejection/recovery and qualified Mark/Crest completion remain covered; no new thresholds or payouts |
| Shop / market / crafting / jobs | Existing affordability, capacity, material routes, crafting goals, activity claims and reward recovery checks remain in place |
| Public Pet boards | Daily, weekly, seasonal and account all-time XP match the Mini App after overlapping care and consumables |
| Community board | Care's awarded Community XP matches the XP log, user and season leaderboard; zero-XP items do not inflate it |
| Public activity | Accepted care/item receipts identify their source pet and displayed XP |
| Website graphs | Wiki graph reads canonical `graph-data.json` / `entity-graph-lite.json`; Arcade graph follows the selected Arcade leaderboard row. Moonpet XP is not an input to those graphs |

The existing daily checklist has no extra all-seven payout, and season completion
has no separate final boss. Daily/weekly bosses and reward loops exist as listed
above. Future features remain gated. This patch fixes accounting and action
integrity without inventing new rewards or altering cooldown durations.

## Validation

Thirteen new real-SQLite regressions in `scripts/moonpet-care-integrity.test.mjs`
cover concurrency, fault rollback, caps, stat preservation, busy/energy gates,
pet switching, duplicate specialist credit, quest evidence and public outputs.
The suite is registered in `ci:worker-api`.

The API tests retain rollback fault injection against the new mirror statement.
Their existing midnight recovery tests now advance both server and request clocks
for Events as well as Kaiju; wall-clock decay must not masquerade as a partially
paid failed reward.

The Mini App browser loop passed at 390×844 and 360×640 across all six screens,
including quest routes, daily tactics, Contracts, boss endings, saved rewards,
crafting, markets, cooldowns and season claims. Required suite results and the
final tested commit are recorded in the PR.

## Deployment and limits

Worker deployment required; no new migrations, frontend deployment or VPS restart.
After GK merges, deploy clean merged main using:

```sh
node scripts/deploy-worker-with-provenance.mjs moonboys-api
```

Verify `/deployment-info` serves that merged commit, reopen the Mini App, perform
care and an item use, then compare its XP and activity with the website boards.
Existing production schema migrations must already be present.

Previously lost Community XP or pet snapshot increments are not retroactively
rewritten: those historical repairs require evidence about which projections
actually committed. The patch prevents new occurrences. Legacy unscoped receipts
retain their documented compatibility limits.

Backup: `codex/backup-moonpet-care-integrity-20260928-002234`.
Sandbox: `codex/sandbox-moonpet-care-integrity-20260928-002234`.
GK approval is required before merge or production deployment.
