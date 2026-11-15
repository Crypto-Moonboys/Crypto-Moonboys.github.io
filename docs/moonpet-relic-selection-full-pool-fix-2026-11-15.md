# Moonpet relic-selection full-pool fix — 2026-11-15

## Problem

Alley King's existing deterministic `stableContentRoll(`${rollKey}:relic`) % 10` draws only even-indexed relics for the official Daily Run ID shape. Five of ten relic IDs become unreachable from the Moon Alley boss, making the Legendary ten-distinct-relic collection requirement unattainable through Alley King alone.

The cause is correlated low-order bits in the FNV-derived hash. Its original boss drop gate is `stableContentRoll(`${rollKey}:chance`) % 10000 < relic_chance_bps`.

## Scoped fix

- Keep the original `:chance` hash and **Alley King 2,500 bps (25%) drop probability** unchanged.
- Only after a drop is eligible, mix the raw `:relic` hash as `(raw ^ (raw >>> 16)) >>> 0` before indexing the unchanged relic pool.
- Keep the same boss pools, ten distinct relic IDs, rarity/effects, run ownership checks, and unique account inventory rows.
- Preserve `roguelite_boss` claim source, idempotency key `room_id:boss_id`, replay and ledger persistence. Existing awarded claims stay authoritative.
- No D1 schema migration, retroactive granting, XP change, evolution threshold change, or new entitlement.

## Evidence

The new `scripts/moonpet-relic-selection-v2.test.mjs` imports the **actual production reward builder** via the existing read-only test hook, verifies its drop decisions against the unchanged old `:chance` hash for 365 hypothetical *successful boss rewards* per test owner, and checks that all ten IDs are reachable. Its run ID sequence is deterministic but **does not simulate successful combat, a full 365-day progression, or actually award inventory**.

The existing `scripts/telegram-pets-roguelite-foundation.test.mjs` covers concurrent boss reward callbacks and exact-once receipt/inventory effects. Rerun it on the branch, plus full Moonpet Worker regression tests and the virtual-year sandbox separately.

## Premerge validation

```bat
git fetch origin
git switch fix/moonpet-relic-selection-full-pool-20261115
git pull --ff-only
node --test scripts\moonpet-relic-selection-v2.test.mjs
node --test scripts\telegram-pets-roguelite-foundation.test.mjs
node --test scripts\telegram-pets-season-completion.test.mjs
git diff --check origin/main
```

Node 24 is required by the existing repository test suite. CI and live deployment remain separate gates. Keep the PR unmerged until test evidence and review confirm replay compatibility.

## Release safety

This change changes deterministic **future, first-time boss relic selection**. It intentionally does not overwrite historical wins or previously stored account relics. Before deployment, validate equivalent results for already-awarded claims, failed runs, repeat callbacks, and source-pet switches. If production has unsettled or pending claims across deployment, verify persisted payout authorization ensures no double credits. Roll back Worker code if any claim mismatch is observed. No data rollback should be required because the fix is not a migration.

The full year-long Legendary experience still requires 365 age days, 240 Growth Marks, 44 Weekly Crests, Level 50, boss victories and resources. This PR fixes only deterministic relic-pool reachability; it does **not** prove a player can obtain every requirement in 365 calendar days.
