# MoonPet Home E2 — Furniture Shop & Placement

**Source:** #1478 H11/H38. **Status:** PR proposal; not a production deployment.

## Player experience

The existing **main MoonPet Home canvas** remains the pet's only room. Profile contains the free E1 wall/floor/furnishing editor and a collapsible Furniture Shop. No new canvas, route, room, currency, gameplay stat or pet animation loop is introduced.

**Twelve one-time purchases**, priced in Moon Gold (account-owned forever):

| Slot | Item | Gold |
|---|---|---:|
| Left | Neon Lamp | 120 |
| Left | Speaker Stack | 240 |
| Left | Arcade Cabinet | 360 |
| Left | Graffiti Tool Chest | 190 |
| Right | Street Sofa | 390 |
| Right | Retro Television | 290 |
| Right | Crystal Display | 610 |
| Right | Gold Throne | 900 |
| Wall | Graffiti Frame | 150 |
| Wall | Moon Clock | 170 |
| Wall | Neon Sign | 350 |
| Wall | Trophy Shelf | 470 |

These are **cosmetic** items. A purchase has no pet XP, Arcade XP, missions, energy, skill, rare-drop, mining, crafting, income, XP multiplier or cash-out effect.

Players can place one owned item per pet in each of three fixed positions: LEFT, RIGHT, WALL. Placement and removal are free. The item remains owned by the account and may be used by multiple owned pets. The old free E1 furnishing is still saved and drawn in the right corner whenever no paid RIGHT item is placed. All existing E1 wall/floor/furnishing selections and history remain intact. Egg pets can purchase/place furniture.

## Server authority and transaction integrity

- Migration **094_moonpet_home_furniture.sql** creates account ownership receipts (\`telegram_pet_furniture_unlocks\`) and per-pet placements (\`telegram_pet_furniture_placements\`) with unique keys, constraints and composite pet ownership foreign keys.
- \`furniture_buy\` uses a fixed server price. A conditional Gold debit and one-time unlock insert execute inside **one D1 batch transaction**. Duplicate requests confirm ownership without another charge. An insufficient wallet cannot purchase; SQL failure rolls back both steps.
- \`furniture_place\` requires the current active pet, correct slot, and existing account ownership. A saved placement is never treated as a purchase. \`furniture_remove\` deletes only the selected pet's placement.
- All mutations use the existing selected-pet D1 scope and its in-transaction stale-pet guard. No source-pet switching race may transfer a placement or debit the wrong player.
- The state projection returns a small bounded catalogue, account-owned keys and the selected pet's three slots in one read. Core/full/profile include it; high-frequency live and Missions paths do not add furniture reads.
- A missing/unavailable furniture table fails closed to a disabled shop and safe canvas defaults. **Migration 094 must be applied and verified before the new Worker is deployed.**
- The purchase record retains the original price and unique request event key. No new generic item-inventory type or duplicate market reward path is introduced.

## Acceptance / release

- Verify idempotent concurrent purchases, exact Gold debit, insufficient balance, malicious price/key/slot, D1 rollback, account ownership, egg and hatched pets, pet switching, removal and saved state reload.
- Validate all twelve graphics fit inside 320×220 canvas coordinates and avoid the existing pet sprite bounds. Mobile browser tests at 360, 390 and desktop; reduced-motion, single canvas, no extra network polling.
- Re-run the economy reachability audit, original E1 layout tests, full CI, guide synchronization and release integrity.
- **GK must approve the economy prices before merge.** After approval: back up D1 \`wikicoms\`, apply migration 094, check foreign keys and retained E1 rows, then deploy \`moonboys-api\` from matching \`main\`. Verify signed Telegram players and provenance. No VPS restart.
- Furniture upgrades, multiple rooms, kitchen, gym, garden and interactive arcade equipment are **not included** in E2.

The 12-item catalogue is a first-phase shop, not the full H38 10× expansion. Keep #1478 open.
