# Crypto Moonboy Pets — Mini App Artwork Pack

This directory is the canonical production home for the Crypto Moonboy Pets Mini App and Moon Alley vertical-slice artwork.

## Locked visual identity

- Adult cyberpunk graffiti game art.
- Deep black and midnight-indigo base.
- Electric cyan, ultraviolet, hot magenta and controlled gold highlights.
- Bold readable silhouettes, clean dark outlines and polished cel shading.
- Spray texture and distressed concrete used as accents rather than visual noise.
- Mobile-first composition with clear negative space for live interface elements.
- No financial promises, cash-out language or token-price imagery.

## Canonical Moonpet

The recurring mascot is a compact moon-cat creature with charcoal-grey fur, large pointed ears, bright star-shaped golden eyes, a mischievous confident smile, chunky paws and a short tail. The Moonpet wears a small black streetwear jacket with cyan and magenta details and a black cap carrying a glowing cyan crescent-moon mark.

The mascot proportions, face, ears, eyes, jacket and cap must remain recognisable across every state and scene.

## Required screen artwork

| Asset key | Intended file | Format | Use |
| --- | --- | --- | --- |
| `home_hideout` | `screens/pets-home-hideout.png` | 16:9 PNG | Main Mini App home/dashboard |
| `care_bay` | `screens/pets-care-bay.png` | 16:9 PNG | Feed, play, clean, sleep and train |
| `moon_alley_map` | `screens/moon-alley-route-map.png` | 16:9 PNG | Five-step roguelite route |
| `battle_hub` | `screens/pets-battle-hub.png` | 16:9 PNG | Pet Arena and Kaiju access |
| `gear_workshop` | `screens/pets-gear-workshop.png` | 16:9 PNG | Equipment, mastery and upgrades |
| `missions_collection` | `screens/pets-missions-collection.png` | 16:9 PNG | Missions, season and permanent records |
| `upgrade_hoverboard` | `screens/pets-upgrade-hoverboard.png` | 16:9 PNG | Upgrade comparison and material-cost screen |

## Moon Alley encounter artwork

- `encounters/lost-delivery-drone.png`
- `encounters/graffiti-wall-request.png`
- `encounters/moon-crate-found.png`
- `encounters/alley-scrapper-boss.png`
- `encounters/moon-alley-extraction.png`

Encounter compositions must reserve a clean lower section for choices and results. Avoid baked-in wording so the Worker can supply authoritative live copy.

## Moonpet state artwork

Transparent PNG states:

- idle
- happy
- hungry
- dirty
- tired
- injured
- training
- exploring
- arena-ready
- victory

## Equipment artwork

Transparent PNG item renders and reusable card crops:

- Crystal Bowl
- Hoverboard
- Crown Jacket
- Cyber Armor
- Moon Blaster
- Lucky Charm

## Currency and material icons

- Moon Gold
- Moon Crystals
- Style Tokens
- Scrap Metal
- Moon Fabric
- Crystal Shard
- Battery Cell
- Spray Core
- Kaiju Fragment
- Arena Token

## Interface icon groups

- Care
- Adventure
- Battle
- Gear
- Missions
- Collection
- Route risk
- Extraction
- Boss
- Reward
- Locked
- Completed

## Export rules

1. Screen art: minimum 16:9 master, composed for a 390–430 px-wide mobile viewport.
2. Characters, items, currencies and overlays: transparent PNG.
3. No essential detail within the outer 6% safe area.
4. No generated text, fake statistics or UI numbers baked into art.
5. Preserve one consistent palette, rim-light direction and outline weight.
6. Optimise final web files after visual approval; retain lossless masters outside the production web bundle.

## Implementation boundary

This pack supplies artwork only. Gameplay outcomes, balances, costs, timers, rewards and player state remain server-authoritative and must be rendered by the Mini App from the existing Worker/API.