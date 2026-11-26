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

PNG sheets remain the editable masters. Production manifests point at
pixel-identical lossless WebP derivatives built by
`npm run moonpet:runtime-images`. The loader fetches only the selected pet's
idle sheet at startup; each secondary action sheet loads on its first use and
is then reused for the rest of the session. Run `npm run moonpet:art:check`
after changing any wired Moonpet image or manifest and report both the source
and runtime payload totals in the PR.

Retired isometric, side-scroller, wearable-anchor, procedural-animal, sandbox and preview stacks have been removed. They must not be reintroduced into the live game.

Equipment remains gameplay state only; items are independent art objects. Bot appearance changes only through complete evolution character packs.
