# MoonPet Pet House E1 — persistent main-canvas Home

**Roadmap:** #1478 H11 / E1. **Release:** proposal only, not production evidence.

- One starter room per permanently retained pet, keyed by the original pet ID and ownership season.
- Wall: Warehouse Brick, Night Wall, Studio White. Floor: Concrete, Checkerboard, Steel.
- One furnishing: Sleep Mat, Record Deck, Plant Pot. These are starter visual themes, **not owned or bought inventory objects**.
- All nine options are free. Changing decor does not alter Moon Gold, Gems, Style, XP, stats, guild, quest or earned receipts.
- The main MoonPet canvas renders the saved wall, floor and side furnishing behind the existing pet art. Profile is a HOME CUSTOMIZATION editor with ACTIVE/SAVED labels and BACK TO HOME. HOME links to CUSTOMIZE HOME; no standalone preview remains.
- Worker binds writes to the selected pet; D1 validates the slot/item allowlist and owner+pet/season tuple. No client-choice trust, price, random roll or coin-credit path. Duplicate selection remains harmless.
- Migration 092 adds `telegram_pet_house_layouts` with pet foreign key and bounded CHECK constraints. Existing pets or historical reward tables are not modified. Saved rows persist with that pet through competition seasons.
- Core/full state include the existing bounded selected-pet layout read so startup, reload and switching restore Home without additional client requests. Live polling remains unchanged. An unavailable layout read returns unavailable cosmetic state without blocking care; the editor remains disabled until refreshed. No background automation or passive reward is introduced.

## Main-canvas correction and release

Wall selections remain server-saved per pet but no longer paint any translucent layer, border, seam or brick-detail geometry over the base graffiti background; flooring stays aligned to the original 219px sprite baseline and shadow. Furniture stays outside the original pet/tap bounds. Existing animation and effects draw above these static layers. Eggs use the same saved Home; the hatch reveal retains its original chamber before restoring Home. Invalid or wrong-pet visual state falls back without changing the save.

Validate the original ownership/economy/layout tests, actual core and full projections, main canvas pixels for all three selections, per-pet switching/reload, egg and hatched art, Profile editor/confirmation, interactions and 360px/390px/desktop layouts. Run all five CI domains and synchronize the shared How to Play guide. Before/after screenshots use local SQLite-backed fixtures, never live player records.

After GK approves the final PR and merge, publish the frontend and deploy only `moonboys-api` through the existing provenance wrapper. A Worker deployment is necessary only because the original implementation deferred `pet_house` until Profile. No new or repeated D1 migration is required; existing migration 092, layout writes and records are unchanged. No economy or gameplay changes are introduced. Keep #1478 open for future phases; additional rooms and purchases are outside this correction.

## E2 follow-up — Furniture Shop (proposed PR)

E2 adds twelve permanent account-owned Moon Gold furniture purchases and three bounded per-pet placements on the **same existing canvas**. It does not change the nine free E1 choices. A paid item in the matching slot visually replaces the free furnishing until removed; the free selection remains saved. Fish Tank replaces Sleep Mat under the unchanged `sleep_mat` save key and draws on the LEFT; Plant Pot and Record Deck draw on the RIGHT. The tank presentation is a frontend-only change. E2 migration 094 adds account purchase receipts and per-pet placement records. No rewards, gameplay stats or pet lifecycle changes. Requires GK economy approval, migration 094 and matching Worker deploy before production.
