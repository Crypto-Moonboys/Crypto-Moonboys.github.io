# MoonPet Pet House E1 — per-pet starter room

**Roadmap:** #1478 H11 / E1. **Release:** proposal only, not production evidence.

- One starter room per permanently retained pet, keyed by the original pet ID and ownership season.
- Wall: Warehouse Brick, Night Wall, Studio White. Floor: Concrete, Checkerboard, Steel.
- One furnishing: Sleep Mat, Record Deck, Plant Pot. These are starter visual themes, **not owned or bought inventory objects**.
- All nine options are free. Changing decor does not alter Moon Gold, Gems, Style, XP, stats, guild, quest or earned receipts.
- The current Profile panel shows a lightweight CSS preview and buttons. Home has an inexpensive shortcut; the data read is only on the authenticated, fully hydrated Profile view.
- Worker binds writes to the selected pet; D1 validates the slot/item allowlist and owner+pet/season tuple. No client-choice trust, price, random roll or coin-credit path. Duplicate selection remains harmless.
- Migration 092 adds `telegram_pet_house_layouts` with pet foreign key and bounded CHECK constraints. Existing pets or historical reward tables are not modified. Saved rows persist with that pet through competition seasons.
- Fast care polling and initial core state do not gain a D1 query. No background automation or passive reward is introduced.

## Acceptance and release

1. Validate local SQLite migration and foreign keys; free options, invalid values, cross-account/pet switch, old pet history, repeated choice and DB outage tests.
2. CI all five domains, guide synchronization, 360px and 390px layout, focus, image-free preview and reduced-motion.
3. Approve schema and economy neutrality.
4. **After merge only:** back up D1, apply migration 092, check pending migrations/foreign keys, deploy `moonboys-api` using provenance wrapper, check `/deployment-info`, then test a signed Telegram player with pets 1–3, egg and hatched.
5. Future E2: furnished room catalog with server-priced/owned items, slot placement and upgrades. Future E3–E5: optional Kitchen, Gym, Garden and other spaces based on existing game authority.

The room does not pretend that a full Sims-style system is shipped. Keep #1478 open.