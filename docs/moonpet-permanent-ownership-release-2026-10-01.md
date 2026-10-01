# Permanent Moonpet ownership release

This change removes quarterly starter replacement and automatic Sanctuary retirement.
Owned pets and paid spaces are listed across creation seasons. IDs, ownership tuples,
XP, lifecycle, identity, equipment, source events and receipts stay unchanged.

Migration 085 preserves all weekly evidence while allowing weeks beyond 13. Historical
weeks keep their original boundaries; new weeks continue after the creation quarter.
Daily Run, care, items, chests and boss evidence use the participating pet's saved tuple.
Competition calendars, XP caps, prices and evolution requirements are unchanged.

Migration 086 restores only archived records whose saved pet/owner/source tuple matches
both a resident Sanctuary snapshot and a completion record. It repairs partial archives,
never revives retired records, and leaves account balances and active pointers alone.
Earlier active pets and paid spaces need no data rewrite; the roster includes them.
A rollout egg remains saved and selected until the player chooses another pet.

New purchases are capped at three active owned pets across all creation seasons. If
recovery reveals more than three, all existing saves remain visible and selectable;
further purchases are blocked. No automatic deletion or unproven reconstruction occurs.
A paid slot with a missing instance remains owned but cannot be selected or repurchased.

## Operator release after approved merge

These commands are for the repository root. Production has not been migrated or deployed
by this PR. Merge and production operations require GK's approval.

1. Pull the approved main commit and install its locked dependencies.
2. Export the current database, then deploy the new Worker to stop the old replacement
   and retirement code before reactivating historical pets.
3. Immediately apply pending migrations, including 085 and 086. Accepted source events
   from the short deployment interval remain saved and can recover weekly credit on refresh.
4. Confirm no pending migrations, check foreign keys, and refresh Profile/Missions.

```bat
git switch main
git pull --ff-only origin main
npm ci
npx wrangler d1 export wikicoms --remote --config workers/moonboys-api/wrangler.toml --output ../moonpet-before-permanent-pets.sql
node scripts/deploy-worker-with-provenance.mjs moonboys-api
npx wrangler d1 migrations apply wikicoms --remote --config workers/moonboys-api/wrangler.toml
npx wrangler d1 migrations list wikicoms --remote --config workers/moonboys-api/wrangler.toml
npx wrangler d1 execute wikicoms --remote --config workers/moonboys-api/wrangler.toml --command "PRAGMA foreign_key_check;"
```

Keep the exported database private and outside source control. If migration application
fails, keep the new Worker deployed to prevent further automatic retirement and resolve
the migration failure before treating recovery as complete. Do not deploy the previous
Worker against recovered pets. Migration 086 is idempotent; migration 085 runs once through
the migration ledger.

Visible verification: Profile shows original pets and paid spaces alongside any rollout
egg. Selecting an old pet restores its own XP and lifecycle. Daily/Weekly Journey and
Daily Run credit remain with that pet. Completed pets stay playable. Changing calendar
quarters or years creates no replacement or free pet space.

The 1,000 Arcade XP entry gate, year-long evolution pacing and delete control remain
separate follow-up work. No lost pet is recreated from another pet's profile or snapshot.
