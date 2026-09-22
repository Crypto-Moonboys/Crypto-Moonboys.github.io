# Moonpet Art Factory

Moonpet Art Factory is a repo-local asset generation pipeline for Crypto Moonboys Pets. It prepares a small, controlled AutoSprite test batch without changing the live game.

## Visual Direction

The base character is a glossy white blank Moonpet body with a big rounded head, small rounded body, rounded arms, chunky feet, and no face by default. The style is built to support cyber bot, graffiti, streetwear, neon, and cute collectible pet game assets.

Every prompt asks for:

> single full-body game asset, transparent background, centered, consistent front view, glossy cute cyber pet mascot, large rounded head, small rounded body, chunky feet, clean silhouette, no text, no environment.

## Initial Batch

The first approved batch is intentionally small: 3 skins x 6 actions = 18 assets.

Skins:

- `default_white_moonpet`
- `starcap_moonbot`
- `street_graff_moonbot`

Actions:

- `idle`
- `eat`
- `play`
- `sleep`
- `clean`
- `train`

Do not expand beyond this batch until the test outputs have been reviewed.

## Files

- `data/moonpet-traits.json` defines the visual direction, skins, actions, limits, and output folders.
- `scripts/generate-moonpet-assets.js` creates the generation plan, calls AutoSprite when explicitly enabled, saves PNGs and response JSON, and writes `output/manifests/moonpet-assets.generated.json`.
- `scripts/build-moonpet-contact-sheet.js` builds `output/moonpets/moonpet-contact-sheet.png` from generated PNG assets.
- `.github/workflows/moonpet-art-factory.yml` runs manually with `workflow_dispatch`.
- `.env.example` documents the required local variable without committing a real key.

## Local Usage

Dry-run is the default and does not require an API key:

```bash
node scripts/generate-moonpet-assets.js --dry-run
```

Real generation requires `AUTOSPRITE_API_KEY` and is locked to the initial `test` phase:

```bash
AUTOSPRITE_API_KEY=replace_me node scripts/generate-moonpet-assets.js --phase=test --execute
```

The script uses resume mode by default. If the PNG and `.autosprite.json` response already exist for a job, that job is skipped.

Optional flags:

- `--limit <n>` caps the current plan.
- `--rate-limit-ms <n>` overrides the delay between API calls.
- `--no-resume` regenerates even when local files exist.

Build a contact sheet after a real generation run:

```bash
node scripts/build-moonpet-contact-sheet.js
```

## GitHub Actions

The manual workflow defaults to `phase=dry-run`, so it will only build prompts and a manifest. To generate the 18 real assets, manually run the workflow with `phase=test`. The workflow reads `AUTOSPRITE_API_KEY` from GitHub Actions secrets and never prints it.

## Safety Rules

- Do not hardcode or log API keys.
- Do not commit `.env`.
- Keep generated assets out of the live game until reviewed.
- Keep size, framing, proportions, and silhouette consistent before promoting anything into game runtime paths.
- Keep the first run to 18 assets only.
