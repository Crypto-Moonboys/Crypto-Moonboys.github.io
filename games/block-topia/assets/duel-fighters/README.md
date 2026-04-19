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
