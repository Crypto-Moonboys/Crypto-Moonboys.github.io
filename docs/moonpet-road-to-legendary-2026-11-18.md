# Moonpet Road to Legendary + private-beta reset — 18 November 2026

## Status

This branch adds **player-facing, navigation-only Road to Legendary guidance** after the approved private-beta Moonpet gameplay reset.

It does **not** change Moonpet XP rates, Daily/Weekly Journey rules, boss/relic probabilities, material costs, evolution requirements, Arcade XP, TAG RUN, WAX payouts, Telegram identity, D1 schema, Worker routes or production feature flags.

The reset was a separately authorised production data operation performed before this feature branch. It is documented here so the fresh beta start and the new guidance have one durable handover.

---

## Verified progression baseline

The merged 365-day Worker-backed audit proved that the existing rules can reach Stage 5 without lowering any gate:

- 365 elapsed days
- 121,454 Pet XP / Level 56
- 365 Growth Marks
- 52 Weekly Crests
- 10 distinct relic IDs
- 122 Alley King victories
- Stage 5 Legendary Moon Guardian
- 11,316 accepted actions / 0 rejected
- final Stage-5 debit persisted as exactly 60 Scrap Metal + 40 Evolution Fragments

The tested legal routine used genuine Daily/Weekly Journey progress, official Daily Runs/bosses, timed Explore, the highest server-eligible job, real relic/material collection and server-authorised evolution.

The new UI **does not reproduce that schedule automatically**. It only helps a player understand which real panels advance the same authoritative requirements.

---

## Production private-beta Moonpet reset

GK explicitly approved resetting **all Moonpet beta users**. Scope was deliberately limited to Moonpet-owned beta gameplay/state.

### Preserved systems

The reset did **not** clear:

- Telegram users/login/authentication
- lifetime Arcade XP progression
- spendable Arcade XP wallets
- TAG RUN Street Cred/member state/WAX reward state
- faction/other game state
- Championship Clout/shared reward records
- five Moonpet migration/correction/forensic ledgers

### Reset contract used

Current `main` reset authority:
- `scripts/moonpet-v1-beta-reset-tables.mjs`
- 93 reviewed Moonpet-prefixed tables
- 88 clearable gameplay/state tables
- 5 protected ledgers:
  - `moonpet_beta_xp_quarantine`
  - `moonpet_beta_xp_rebaseline`
  - `moonpet_beta_xp_rebaseline_v2`
  - `moonpet_identity_authority_cutovers`
  - `telegram_pet_runtime_cutovers`

### Live preflight

Production D1 `wikicoms` was inspected before deletion:

- 93/93 reviewed Moonpet tables present
- 0 missing / 0 unexpected Moonpet-prefixed tables
- 88 clearable tables
- 16,239 clearable gameplay/state rows
- 291 protected-ledger rows
- 0 non-Moonpet tables with a `pet_id` column
- 0 non-Moonpet foreign keys pointing into Moonpet tables
- 0 DELETE triggers on clearable Moonpet tables
- 0 Moonpet-backed Championship Clout source rows
- 0 Moonpet-backed Championship Clout effect rows
- 0 Moonpet Daily Clout projections
- identity authority cutover marker present exactly once
- runtime cutover marker present exactly once
- 193 Moonpet FK rows yielded an 88-table child-before-parent deletion order
- no FK cycle
- protected ledgers had no FK dependency on cleared gameplay tables

### Backup and rollback proof

Before deletion:

- a complete D1 SQL export completed successfully
- Cloudflare D1 Time Travel bookmark was captured
- restore/rollback was exercised against the pre-reset state and the logical row counts/markers were re-read unchanged
- immediate pre-delete bookmark retained for rollback:
  `000096a9-00000000-00005127-1be9211471025a0a63d9be8878e71c61`

Do not publish or commit the temporary signed export download URL.

### Live reset result

The 88 reviewed DELETE statements were sent as one D1 batch transaction.

Result:
- 88/88 statements successful
- **16,239 Moonpet beta gameplay rows removed**
- 0 failed statements

Post-reset verification:

- all 88 clearable tables: **0 rows**
- five protected ledgers: **291 rows retained**
- identity cutover marker: **1**
- runtime cutover marker: **1**
- `telegram_pet_profiles`: **0**
- `telegram_pet_instances`: **0**
- `telegram_users`: **660 retained**
- `arcade_progression_state`: **5 retained**
- `arcade_xp_wallets`: **4 retained**
- `tag_run_member_totals`: **3 retained**
- Championship Clout Moonpet sources: **0**

This is a fresh Moonpet beta start, **not** a reset of global accounts or Arcade/TAG RUN progression.

---

## Road to Legendary UI

### `js/moonpet-play-options.js`

Adds `legendaryRoadmap(snapshot)`.

It is read-only and fail-closed. It reads only current saved state:

- saved evolution stage (0 for the Secret Bot through 5 for the Legendary Moon Guardian)
- level
- Pet XP
- Growth Marks earned / required
- Weekly Crests earned / required
- distinct owned relic IDs
- Scrap Metal
- Evolution Fragments
- current server-projected next evolution
- missing evolution requirements, including the pet age, Growth Marks and Weekly Crests required for its next form
- highest-base-Pet-XP job that the server marks `available:true` in the current snapshot
- whether the server currently offers timed `explore`

For an egg, the roadmap opens the Worker’s recommended incubation or hatch step in Home. After hatching it offers seven destinations:

1. Daily Journey
2. Weekly Journey
3. official Daily Run / bosses. Extracting ends the account’s attempt for that UTC day. The repeatable Moon Run banks its XP bag on extraction.
4. timed Explore when the server offers it, otherwise the timed-activity board
5. the current highest-base-XP **eligible** job, otherwise the jobs/unlock board
6. relics/materials
7. evolution

No returned route contains a gameplay `action`.

### `js/moonpet-mini-app.js`

Missions now includes a **ROAD TO LEGENDARY** panel.

It shows the saved lifetime progression, current evolution blockers and route buttons to the real game panels. If the full read fails, Missions can still load Daily Journey and Contracts through its lightweight read. Refresh retries the full roadmap.

The panel explicitly states that it does not play for the user. It never calls an action endpoint, awards XP, invents a Mark/Crest, chooses a boss result or evolves a pet.

---

## Validation performed in this session

Direct current-branch evaluation:

- `js/moonpet-play-options.js` parses and executes as CommonJS: **PASS**
- `legendaryRoadmap()` projection fixture: **PASS**
  - the second of six forms (Stage 1)
  - Level 27
  - 28,942 Pet XP
  - 90/240 Growth Marks
  - 13/44 Weekly Crests
  - duplicate relic IDs de-duplicated to 2
  - 112 Scrap Metal / 22 Evolution Fragments
  - exactly seven expected navigation destinations
  - no route has an `action` property
- eligible-job selection uses only server `available:true` rows and ranks their published base `pet_xp`
- timed Explore is labelled only when `guidance.activity_options` actually advertises `explore`
- legacy `season_complete` alone cannot produce `LEGENDARY COMPLETE`; permanent `lifetime_complete` is required
- `js/moonpet-mini-app.js` JavaScript parse: **PASS**
- ad-hoc non-module parse of `scripts/moonpet-mission-status.test.mjs`: **not valid as a verification method** because the test legitimately uses ESM `import.meta`; this was not treated as a product failure or a pass.

### Still required before merge

Run on a real checkout:

```bat
node --test scripts\moonpet-mission-status.test.mjs
node --test scripts\moonpet-player-loop.test.mjs
```

Because the Mini App presentation changed, run the Visual domain before final merge approval:

```bat
npm run ci:visual
```

If final/release-level assurance is requested, dispatch **Full Linux Test Suite** on this feature branch.

---

## Release boundary

No D1 migration is introduced by this branch. No Worker deployment is required by the Road-to-Legendary code itself unless later changes add Worker logic.

GitHub Pages deployment would occur only after an approved merge to `main`.

**Merge/deploy/migrate remains pending GK approval.**
