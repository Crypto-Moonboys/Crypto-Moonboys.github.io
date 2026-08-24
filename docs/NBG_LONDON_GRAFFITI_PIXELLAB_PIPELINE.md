# NBG London Graffiti Run — PixelLab Asset Pipeline

## Purpose

Production asset replacement pipeline for the NBG London Graffiti Run arcade platform game.

The attached approved sprite sheets and concept sheets are the visual source of truth.

## Locked Art Direction

- SNES / 16-bit pixel art
- London graffiti street culture
- Dark neon night palette
- Strong pixel outlines
- Transparent sprite backgrounds
- Limited colour palette
- No vector appearance
- No realistic rendering
- No uncontrolled style changes

## PixelLab Workflow

Every generated asset must:

1. Use approved reference sheets.
2. Submit generation request through PixelLab API.
3. Store returned job ID.
4. Poll asynchronous job completion.
5. Export PNG output.
6. Record prompt, seed, model and references used.
7. Lock approved seeds for future matching assets.

## Asset Build Order

### Batch 1

- player_nbg_runner_sheet.png
- xp_coin_sheet.png
- enemy_rat_sheet.png

### Batch 2

- graffiti_wall_tileset.png
- street_platform_tileset.png
- london_props_sheet.png

### Batch 3

- london_sky_stars.png
- london_skyline_far.png
- london_landmarks_mid.png

### Batch 4

- enemy_pigeon_sheet.png
- enemy_graffiti_bot_sheet.png
- effects_sheet.png
- game_ui_sheet.png
- checkpoint_flag.png
- finish_flag.png

## Player Specification

Frame size: 32x48

Rows:

- Idle: 4 frames
- Run: 6 frames
- Jump: 1 frame
- Fall: 1 frame
- Spray: 4 frames
- Hurt: 2 frames
- Victory: 2 frames

## Environment Specification

Tile size: 16x16

Layers:

1. Sky and stars
2. London skyline
3. Landmarks
4. Graffiti wall
5. Ground/platform
6. Foreground details

## Runtime Rule

Generated filenames must match the game asset manifest and existing runtime preload paths. Do not create parallel asset systems.

## Security

PixelLab credentials must remain environment variables and must never be committed to the repository.

## Status

Pipeline specification added. Asset generation and runtime replacement are next steps.
