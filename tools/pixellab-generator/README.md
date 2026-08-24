# NBG London Graffiti Run PixelLab Generator

Purpose: controlled generation pipeline for production game assets.

## Rules

- Use approved NBG London reference sheets as style source.
- Never generate random replacements after approval.
- Store prompts, seeds, job IDs and outputs.
- Keep API credentials outside the repository.

## Generation Flow

1. Load asset manifest.
2. Submit PixelLab generation request.
3. Store returned job ID.
4. Poll job status.
5. Download generated PNG.
6. Validate dimensions and transparency.
7. Save metadata.

## First Batch

- player_nbg_runner_sheet.png
- xp_coin_sheet.png
- enemy_rat_sheet.png
