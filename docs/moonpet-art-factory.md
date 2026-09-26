# Moonpet Art Factory — Current Runtime

Moonpet production art now uses only the eight front-facing AutoSprite bot packs and their future full evolution packs.

## Current production path

1. Discover an existing AutoSprite character with `scripts/discover-autosprite-character.js`.
2. Download its existing 15 front-facing sheets with `scripts/download-botty-front-animations.js`, or generate a new approved front pack with `scripts/generate-botty-front-animations.js`.
3. Visually review the complete character.
4. Promote reviewed sheets with `scripts/promote-moonpet-bot-front-pack.js`.
5. Register the character/evolution in `data/moonpet-bot-art-registry.json`.

The runtime uses:

- `js/moonpet-art-resolver.js`
- `js/moonpet-bot-art-loader.js`
- `js/moonpet-bot-art-renderer.js`
- `data/moonpet-bot-art-registry.json`
- `data/moonpet-rare-background-registry.json`
- `data/moonpet-item-art-registry.json`

Retired isometric, side-scroller, wearable-anchor, procedural-animal, sandbox and preview stacks have been removed. They must not be reintroduced into the live game.

Equipment remains gameplay state only; items are independent art objects. Bot appearance changes only through complete evolution character packs.
