# Block Topia PFP Fighter Asset Contract (Plug-n-Play)

Use these exact filenames when replacing placeholder art so no code changes are needed:

- `fighter-common.svg`
- `fighter-rare.svg`
- `fighter-epic.svg`
- `fighter-glitch.svg`

## Required format

- Canvas size: **1024 x 1024**
- Background: **fully transparent** (no solid background layer)
- Coordinate system: `viewBox="0 0 1024 1024"`
- Recommended safe area for face/body: center 760x760 region
- File type: SVG (preferred for first drop-in pass)

## Runtime mapping

`/games/block-topia/data/pfp-trait-passives.json`

```json
"assets": {
  "common": "/games/block-topia/assets/pfp-fighters/fighter-common.svg",
  "rare": "/games/block-topia/assets/pfp-fighters/fighter-rare.svg",
  "epic": "/games/block-topia/assets/pfp-fighters/fighter-epic.svg",
  "glitch": "/games/block-topia/assets/pfp-fighters/fighter-glitch.svg"
}
```

Replace files in place and keep the paths unchanged.

## Trait key checklist

Trait keys consumed from `pfp-trait-passives.json` should remain snake_case.
Current keys:

- `moon_eyes`
- `visor`
- `neon_hair`
- `mask`

If adding new trait keys, append only (do not rename existing keys).
