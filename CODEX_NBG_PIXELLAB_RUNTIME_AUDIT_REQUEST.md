# Codex Audit Request — NBG London Graffiti Run PixelLab Pipeline

## Objective

Audit the repository and provide the complete information required to replace prototype game visuals with production PixelLab-generated assets.

Do not generate art. Do not redesign gameplay. Audit only.

## Required Output

Provide:

1. Exact active game folder(s) for NBG London Graffiti Run.
2. All HTML entry points.
3. All JavaScript bootstrap files.
4. All preload/import/image loading locations.
5. Current placeholder asset filenames.
6. Runtime paths where each replacement asset must be placed.
7. Animation names expected by code.
8. Frame sizes expected by code.
9. Any missing assets required before replacement.
10. Any conflicts between planned PixelLab sheets and current runtime.

## PixelLab Assets To Map

- player_nbg_runner_sheet.png
- xp_coin_sheet.png
- enemy_rat_sheet.png
- enemy_pigeon_sheet.png
- enemy_graffiti_bot_sheet.png
- graffiti_wall_tileset.png
- street_platform_tileset.png
- london_sky_stars.png
- london_skyline_far.png
- london_landmarks_mid.png
- checkpoint_flag.png
- finish_flag.png
- london_props_sheet.png
- effects_sheet.png
- game_ui_sheet.png

## Rules

- Visual replacement only.
- Do not change scoring.
- Do not change progression.
- Do not change gameplay logic.
- Identify code paths before any asset replacement PR.

## Deliverable

Return one complete asset integration map suitable for implementation.
