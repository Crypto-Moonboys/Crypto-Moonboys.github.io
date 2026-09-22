# Moonpet Art Factory

Moonpet Art Factory is a repo-local asset generation pipeline for Crypto Moonboys Pets. It prepares a small, controlled AutoSprite test batch without changing the live game.

## Visual Direction

The base character is a glossy white blank Moonpet body with a big rounded head, small rounded body, rounded arms, chunky feet, and no face by default. The style is built to support cyber bot, graffiti, streetwear, neon, and cute collectible pet game assets.

Every prompt asks for:

> single full-body game asset, transparent background, centered, consistent front view, glossy cute cyber pet mascot, large rounded head, small rounded body, chunky feet, clean silhouette, no text, no environment.

## AutoSprite Workflow

AutoSprite is a character and spritesheet pipeline, not a one-shot PNG generator. The generator follows this sequence:

1. `POST /api/v1/characters` with `{ "name": "...", "prompt": "..." }`.
2. Save the returned character ID.
3. `POST /api/v1/characters/{CHARACTER_ID}/spritesheets` with the documented spritesheet payload.
4. Save every returned `workflows[]` entry. Each animation has its own `{ jobId, kind, videoId }`.
5. Poll each workflow `jobId` with `GET /api/v1/jobs/{JOB_ID}` until `status` is `succeeded` or the poll timeout is reached.
6. Also poll fallback endpoints: `GET /api/v1/jobs?characterId={CHARACTER_ID}&limit=10` every 60 seconds and `GET /api/v1/characters/{CHARACTER_ID}/spritesheets` after 2 minutes.
7. Read returned or listed sprite sheet IDs.
8. Fetch each sprite sheet record and download `sheetUrl` and `atlasUrl` into `output/moonpets/spritesheets/`.

Every raw AutoSprite API response is saved under `output/manifests/autosprite/`.
Failed job polling responses are also saved under `output/manifests/autosprite/poll-errors/` with the job ID and exact endpoint used. HTTP 500 responses from the jobs endpoint are treated as transient until the 10-minute polling timeout is reached.

AutoSprite character prompts must be 600 characters or less. The generator builds compressed API prompts targeted under 450 characters and validates every prompt locally before any request is sent. Longer local art direction and trait descriptions stay in repo manifests only; they are not sent in the AutoSprite character creation body.

AutoSprite character names are versioned with `style_version` from `data/moonpet-traits.json`, currently `28Bit V1`, while local IDs such as `default_white_moonpet` stay unchanged. If AutoSprite returns `409 DUPLICATE_CHARACTER`, the script does not retry the same name; it writes the conflict response to `output/manifests/autosprite-errors.generated.json` and suggests the next version name, such as `28Bit V2`.

For the current base test, `use_existing_autosprite_character` is enabled. The generator lists `GET /api/v1/characters?limit=50`, finds the exact character name `MOONBOT PET`, saves the matched record to `output/manifests/autosprite/existing-character-moonbot-pet.json`, and uses that character ID instead of calling `POST /characters`. If `MOONBOT PET` is not found, the run fails clearly and does not create a replacement.

## Initial Batch

The first approved batch is intentionally small: 3 reusable AutoSprite characters. The first test animation is `idle` only via `autosprite_test_animations`; do not request `walk`, `run`, or `attack` until idle works end to end.

Skins:

- `default_white_moonpet`
- `starcap_moonbot`
- `street_graff_moonbot`

First requested AutoSprite animation:

- `idle`

Later AutoSprite animations:

- `walk`
- `run`
- `attack`

Game action mapping comes later:

- `eat` = `idle` with a food prop later.
- `play` = `run`/`walk` variation later.
- `sleep` = separate static asset later.
- `clean` = separate static asset later.
- `train` = `attack`.

Do not expand beyond this batch until the test outputs have been reviewed.

## Files

- `data/moonpet-traits.json` defines the visual direction, skins, actions, limits, and output folders.
- `scripts/generate-moonpet-assets.js` creates characters, requests spritesheet jobs, polls jobs, fetches sprite sheet records, downloads PNG/atlas files, and writes manifests.
- `scripts/build-moonpet-contact-sheet.js` builds `output/moonpets/moonpet-contact-sheet.png` from downloaded spritesheet PNG assets where available.
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

The script uses resume mode by default. Existing character IDs and job IDs in the generated manifests are reused where possible.

Optional flags:

- `--limit <n>` caps the character count. Use `--limit 1` for a single-character smoke run.
- `--rate-limit-ms <n>` overrides the delay between character pipelines.
- `--poll-interval-ms <n>` is legacy; job polling now waits 5s, 10s, 15s, then every 20s.
- `--poll-timeout-ms <n>` overrides the max time to wait for one spritesheet job.
- `--no-resume` creates fresh characters/jobs instead of reusing saved IDs.
- `--resume-jobs` reads `output/manifests/autosprite-jobs.generated.json` and polls existing job IDs again without creating new characters or jobs.
- `--debug-payload` prints sanitized AutoSprite request bodies only. It never prints request headers or `AUTOSPRITE_API_KEY`.

Failed AutoSprite HTTP responses are summarized in the logs and saved to `output/manifests/autosprite-errors.generated.json`.

Generated manifests:

- `output/manifests/moonpet-assets.generated.json`
- `output/manifests/autosprite-characters.generated.json`
- `output/manifests/autosprite-jobs.generated.json`
- `output/manifests/moonpet-spritesheets.generated.json`
- `output/manifests/autosprite-errors.generated.json`

Build a contact sheet after a real generation run:

```bash
node scripts/build-moonpet-contact-sheet.js
```

## GitHub Actions

The manual workflow defaults to `phase=dry-run`, so it will only build prompts and a manifest. To create the 3 real AutoSprite characters and request their spritesheets, manually run the workflow with `phase=test`. The workflow reads `AUTOSPRITE_API_KEY` from GitHub Actions secrets and never prints it.

## Safety Rules

- Do not hardcode or log API keys.
- Do not commit `.env`.
- Keep generated assets out of the live game until reviewed.
- Keep size, framing, proportions, and silhouette consistent before promoting anything into game runtime paths.
- Keep the first run to 3 characters only.
