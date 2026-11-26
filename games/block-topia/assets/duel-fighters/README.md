**AGENT CHECK REQUIRED — Before changing this game or its assets, audit every wired runtime image and loading path. Confirm that master PNG/JPG files are preserved, smaller transparent WebP derivatives are used at runtime without lost dimensions or sharpness, non-critical art is staged or lazy-loaded where safe, duplicate or unused requests are removed, and gameplay and animation speed are not harmed. Report exactly what already passes, what still needs doing, the affected files and size/performance impact, and any test or visual check that could not be completed. Never assume optimization is finished.**

# Duel fighter art placeholders

This folder is a **drop-in replacement layer** for duel fighter visuals.

## Replace workflow

1. Keep transparent-background fighter images.
2. Replace any placeholder file here, or add new files.
3. Update `games/block-topia/data/duel-fighter-config.js` mappings only.
4. Do not change duel logic code for asset swaps.

## Included placeholders

- `fighter-player-placeholder.svg`
- `fighter-opponent-placeholder.svg`
- `fighter-fallback.svg`

All duel art in the overlay falls back to `fighter-fallback.svg` if an asset is missing.
