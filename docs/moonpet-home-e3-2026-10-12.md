# MoonPet Home E3 — Interactive Kitchen, Gym & Garden

**Status:** implementation PR. E1/E2 Home appearance and permanent pets remain unchanged.

## Scope

E3 makes three fixed stations on the existing 320×220 MoonPet Home canvas interactive. It does **not** create another room, route or pet life cycle.

### Kitchen
The Kitchen exposes the three existing cooked-meal crafting recipes in Home:

- Pizza Night → 2 Street Pizzas.
- Moon Grill → 2 Moon Burgers.
- Veggie Patch → 2 Garden Veggie Boxes.

Recipe level gates, material costs, bag capacity, crafting receipts and meal effects remain owned by the existing Worker crafting authority. E3 does not clone or rebalance those recipes.

### Gym
The Gym points at the existing Train systems:

- **Train Now** is the current Care Train action: 18 Energy cost, existing reward/stat changes and the existing care cooldown.
- **Timed Training** opens the existing Work activity system. It does not create a second training reward path.

### Garden
Each persistent pet gets one server-authoritative garden plot.

- Planting is free and starts one **6-hour** growth timer.
- The only crop is the existing `garden_veggies` item.
- A mature harvest adds exactly **1 Garden Veggie Box** to the existing Bag/Food Counter.
- Planting and harvesting award **no Pet XP, Community XP, Gold, Crystals, Style, mission credit or competition credit**.
- Eating the harvested Garden Veggie Box later uses the existing meal action, effects, Pet XP cap and shared 45-second Feed/meal cooldown; the Garden itself is only the timed item source.
- Harvest receipts are bound to the original crop's `planted_at`, so stale/concurrent retries cannot harvest a later crop.
- Pet switching keeps plots separate. Deleting a pet removes only that pet's active plot; completed harvest receipts remain as account reward history.
- Garden readiness uses the existing cooldown refresh scheduler; there is no new live-state poll or background network timer.

## Canvas interaction

Kitchen, Garden and Gym are fixed built-in Home stations in a narrow top strip, outside the companion's interaction bounds and outside E2 left/right/wall furniture slots. Tapping a station scrolls to its accessible Home control panel. Existing pet tapping still greets the companion.

## Migration and deploy

Migration **095_moonpet_home_garden.sql** must be applied before deploying the matching `moonboys-api` Worker.

Release order:

1. Back up production `wikicoms`.
2. Apply migration 095 and verify foreign keys / migration ledger.
3. Deploy `moonboys-api` from clean matching `main`.
4. Verify signed Telegram Home on 360px, 390px and desktop.
5. Test cooking, Train Now, timed training, plant → wait/force-ready in QA → harvest, reload and pet switching.

No VPS restart is required.
