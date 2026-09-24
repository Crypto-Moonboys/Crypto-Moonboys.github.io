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

For the current base workflow, `use_existing_autosprite_character` is enabled. The generator lists `GET /api/v1/characters?limit=50`, finds the exact character name `MOONBOT PET VISOR V1`, saves the matched record to `output/manifests/autosprite/existing-character-moonbot-pet.json`, and uses that character ID instead of calling `POST /characters`. If `MOONBOT PET VISOR V1` is not found, the run fails clearly and does not create a replacement.

## Approved Assets

Approved Moonpet outputs are tracked in `data/moonpet-approved-assets.json`. This registry is the source of truth for outputs that must not be overwritten automatically.

The first approved baseline is:

- `character_name`: `MOONBOT PET VISOR V1`
- `animation_kind`: `iso_idle_down`
- `role`: `base_idle`
- `frame_count`: `25`
- `frame_size`: `256`
- `sheet_size`: `1280x1280`

The approved built-in movement pack for `MOONBOT PET VISOR V1` is:

- `iso_idle_down`
- `iso_walk_down`
- `iso_run_down`

Built-in AutoSprite `attack` is rejected for Moonbot because it produces side-facing output that does not match the approved isometric set. It is recorded in `data/moonpet-approved-assets.json` under `rejected` and the generator fails locally if that rejected animation is requested for the Moonbot base character.

Before downloading a sheet or atlas, the generator checks the registry for the same `character_name` and `animation_kind`. If an approved output exists, the default behavior is to skip the write and log `approved output exists; skipping overwrite`. Use `--force-approved` only when intentionally replacing an approved asset after review.

Generated assets under `output/` are temporary artifacts. After review, approved assets must be promoted into `img/moonpets/moonbot-pet-visor-v1/`:

```bash
node scripts/promote-moonpet-approved-assets.js
```

The promotion script copies only approved sheet/atlas pairs, renames them by `animation_kind`, and writes public `sheet_path` and `atlas_path` values back to `data/moonpet-approved-assets.json`. Rejected and pending assets are never promoted. Sandbox and runtime preview pages use the promoted static files first.

Existing promoted files are protected. Use `node scripts/promote-moonpet-approved-assets.js --force` only after explicitly approving an overwrite.

Promotion source paths come from generated manifests, not from the approved registry. The generator writes `generated_sheet_path`, `generated_atlas_path`, `sheet_path_source`, and `atlas_path_source` for downloaded files under `output/moonpets/spritesheets/`. The promotion script checks both `output/manifests/moonpet-animation-sandbox.generated.json` and `output/manifests/moonpet-spritesheets.generated.json`, matching records by `character_name` and `animation_kind`.

GitHub Actions also has a `build-approved-pack` phase. It generates `iso_idle_down`, `iso_walk_down`, and `iso_run_down` from the existing `MOONBOT PET VISOR V1` AutoSprite character, promotes the approved results in the same run, and uploads `output/manifests/`, `output/moonpets/`, `img/moonpets/`, and `data/moonpet-approved-assets.json`.

The `auto_commit_promoted_assets` input defaults to `false`. With the default, the workflow only uploads artifacts. When set to `true`, the workflow commits only `img/moonpets/moonbot-pet-visor-v1/` and `data/moonpet-approved-assets.json` with the message `feat: promote approved Moonbot spritesheets`. It does not commit `output/`, API responses, temporary manifests, API keys, or rejected assets.

## Custom Pet States

Combat `attack` is not part of the Moonbot base pack. The next animation work should use custom isometric pet-state animations instead. These are planned in `data/moonpet-traits.json` under `custom_pet_state_animations` and surfaced in generated manifests, but they are not generated by default.

Planned custom pet-state animation names:

- `custom_sleep`
- `custom_eat` (current planned target)
- `custom_play`
- `custom_clean`
- `custom_wave`
- `custom_sit`
- `custom_happy`
- `custom_sad`

`custom_sleep` is currently approved from the manually downloaded down-facing AutoSprite website sheet and promoted to:

- `/img/moonpets/moonbot-pet-visor-v1/custom_sleep.png`
- `/img/moonpets/moonbot-pet-visor-v1/custom_sleep.json`

The current Moonpet runtime is down-facing only. Other sleep directions are reserved for future 8-direction/isometric expansion only: northeast, northwest, left, right, up, southeast, and southwest. Do not add those directional sheets to the approved runtime loader yet.

`custom_eat` is the next down-facing-only target. It must remain planned, unapproved, and unpromoted until a generated or manually imported sheet is reviewed.

## Initial Batch

The base animation workflow is intentionally small and advances one animation at a time. The approved first animation uses the documented isometric kind `iso_idle_down`; this avoids the side-scroller `idle` mode while keeping the test to one animation.

Skins:

- `default_white_moonpet`
- `starcap_moonbot`
- `street_graff_moonbot`

Approved AutoSprite animation:

- `iso_idle_down`

Next AutoSprite generation order:

- `iso_walk_down`
- `iso_run_down`

Game action mapping comes later:

- `eat` = planned `custom_eat`.
- `play` = planned `custom_play`.
- `sleep` = approved down-facing `custom_sleep`.
- `clean` = planned `custom_clean`.
- `train` = custom pet-state animation later; do not use built-in `attack`.

Do not expand beyond this batch until the test outputs have been reviewed.

## Files

- `data/moonpet-traits.json` defines the visual direction, skins, actions, limits, and output folders.
- `scripts/generate-moonpet-assets.js` creates characters, requests spritesheet jobs, polls jobs, fetches sprite sheet records, downloads PNG/atlas files, and writes manifests.
- `scripts/promote-moonpet-approved-assets.js` promotes approved generated sheet/atlas files into `img/moonpets/`.
- `scripts/promote-moonpet-approved-assets.test.js` validates manifest-to-promotion path resolution with a local fixture.
- `scripts/build-moonpet-contact-sheet.js` builds `output/moonpets/moonpet-contact-sheet.png` from downloaded spritesheet PNG assets where available.
- `moonpet-animation-sandbox.html` previews approved, rejected, and pending spritesheets without touching the live game runtime.
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
- `--animation <kind>` overrides `autosprite_test_animations` for one run. Use this to generate exactly one next animation.
- `--rate-limit-ms <n>` overrides the delay between character pipelines.
- `--poll-interval-ms <n>` is legacy; job polling now waits 5s, 10s, 15s, then every 20s.
- `--poll-timeout-ms <n>` overrides the max time to wait for one spritesheet job.
- `--no-resume` creates fresh characters/jobs instead of reusing saved IDs.
- `--resume-jobs` reads `output/manifests/autosprite-jobs.generated.json` and polls existing job IDs again without creating new characters or jobs.
- `--debug-payload` prints sanitized AutoSprite request bodies only. It never prints request headers or `AUTOSPRITE_API_KEY`.
- `--force-approved` allows an approved registry entry to be overwritten. Default behavior protects approved outputs.

Next animation examples:

```bash
AUTOSPRITE_API_KEY=replace_me node scripts/generate-moonpet-assets.js --phase=test --execute --limit 1 --animation iso_walk_down
AUTOSPRITE_API_KEY=replace_me node scripts/generate-moonpet-assets.js --phase=test --execute --limit 1 --animation iso_run_down
```

Failed AutoSprite HTTP responses are summarized in the logs and saved to `output/manifests/autosprite-errors.generated.json`.

Generated manifests:

- `output/manifests/moonpet-assets.generated.json`
- `output/manifests/moonpet-animation-sandbox.generated.json`
- `output/manifests/autosprite-characters.generated.json`
- `output/manifests/autosprite-jobs.generated.json`
- `output/manifests/moonpet-spritesheets.generated.json`
- `output/manifests/autosprite-errors.generated.json`

Build a contact sheet after a real generation run:

```bash
node scripts/build-moonpet-contact-sheet.js
```

## GitHub Actions

The manual workflow defaults to `phase=dry-run`, so it will only build prompts and a manifest. To request a real spritesheet, manually run the workflow with `phase=test`, `limit=1`, and optionally `animation=iso_walk_down` or `animation=iso_run_down`. Do not use built-in `attack` for Moonbot. The workflow reads `AUTOSPRITE_API_KEY` from GitHub Actions secrets and never prints it.

Use `phase=build-approved-pack` for the one-click approved Moonbot base build. Use `auto_commit_promoted_assets=false` to review uploaded artifacts first, or `auto_commit_promoted_assets=true` to commit only the promoted public assets and approved registry.

Use `phase=generate-custom-animation` for the one-item custom operator. The current enabled id is `custom_eat`. Safe defaults keep `execute_custom_generation=false`, `auto_review_custom_animation=true`, and `auto_promote_if_passed=false`. Enable `execute_custom_generation=true` only when you want the workflow to call AutoSprite for the selected custom queue item. Mechanical review writes `output/manifests/moonpet-custom-animation-review.generated.json`; final approval still requires a separate explicit approval step.

## Safety Rules

- Do not hardcode or log API keys.
- Do not commit `.env`.
- Keep generated assets out of the live game until reviewed.
- Keep size, framing, proportions, and silhouette consistent before promoting anything into game runtime paths.
- Keep the first run to 3 characters only.
