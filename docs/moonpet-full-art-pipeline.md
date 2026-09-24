# Moonpet Full Art Pipeline

This pipeline turns the final Crypto Moonboys Pets asset sheet into repo-controlled Moonpet art data, review surfaces, promoted static assets, and later live game integration. The live game is not changed by this pipeline until a separate integration step is approved.

## Approved Base Animation Set

Approved Moonbot base movement:

- `iso_idle_down` -> `base_idle`
- `iso_walk_down` -> `base_walk`
- `iso_run_down` -> `base_run`

Rejected:

- `attack` -> `rejected_side_scroller_output`

The built-in AutoSprite `attack` animation is rejected because it produces side-facing output and does not match the approved isometric Moonbot set.

## Trait System

The final art sheet categories are captured in `data/moonpet-trait-system.json`:

- base character
- face / visor expressions
- animation states
- outfits / bodies
- hats / headwear
- eye / visor styles
- accessories
- traits / elements
- rarity frames
- environment sets

This file is staged pipeline data. It does not drive the live game yet.

## Custom Pet-State Animations

Combat animations are not the path for Moonbot pet states. New pet-state work should use custom isometric states such as sleep, eat, play, clean, wave, sit, happy, and sad.

`custom_sleep` is already approved from the manually downloaded down-facing AutoSprite website sheet:

- `img/moonpets/moonbot-pet-visor-v1/custom_sleep.png`
- `img/moonpets/moonbot-pet-visor-v1/custom_sleep.json`

The current Moonpet runtime is down-facing only. Other directional sleep sheets are reserved for future 8-direction/isometric expansion: northeast, northwest, left, right, up, southeast, and southwest.

Future custom states must be generated one animation at a time, reviewed in the sandbox, and promoted only after approval. Do not replace the approved manual `custom_sleep` sheet without explicit review.

## Generating Traits

Trait generation should be driven by `data/moonpet-trait-system.json` and added in controlled batches. Start with one category and one small batch at a time. Do not generate broad combinations until base movement, framing, and visual consistency have been proven.

## Promotion

Generated files in `output/` are temporary artifacts. Approved assets are promoted into public static paths:

```bash
npm run moonpet:promote
```

The promotion script:

- reads `data/moonpet-approved-assets.json`
- reads `output/manifests/moonpet-animation-sandbox.generated.json`
- reads `output/manifests/moonpet-spritesheets.generated.json`
- copies only approved PNG/atlas pairs into `img/moonpets/moonbot-pet-visor-v1/`
- renames them by animation kind
- updates `sheet_path`, `atlas_path`, `promoted`, and `promoted_at`
- refuses rejected and pending assets
- refuses overwrites unless `--force` is used after explicit approval

The approved registry stores public destination paths. Temporary generated source paths are resolved from generated manifest fields such as `generated_sheet_path`, `generated_atlas_path`, `sheet_path_source`, and `atlas_path_source`.

## One-Click Approved Pack Build

The Moonpet Art Factory GitHub Actions workflow includes `phase=build-approved-pack`.

That phase:

1. Generates `iso_idle_down`.
2. Generates `iso_walk_down`.
3. Generates `iso_run_down`.
4. Promotes approved sheet/atlas files into `img/moonpets/moonbot-pet-visor-v1/`.
5. Uploads `output/manifests/`, `output/moonpets/`, `img/moonpets/`, and `data/moonpet-approved-assets.json`.

`auto_commit_promoted_assets=false` is the default and only uploads artifacts for review.

`auto_commit_promoted_assets=true` commits only:

- `img/moonpets/moonbot-pet-visor-v1/`
- `data/moonpet-approved-assets.json`

The commit message is `feat: promote approved Moonbot spritesheets`. The workflow does not commit `output/`, API responses, temporary manifests, API keys, or rejected assets.

## Sandbox Review

Use `moonpet-animation-sandbox.html` to inspect generated or promoted sprite output. The sandbox labels assets as approved, rejected, or pending review. It reads atlas JSON when present and falls back to the approved 25-frame, 256px, 1280x1280 layout when needed.

## Runtime Preview

Use `moonpet-runtime-preview.html` to prove approved sprites can run in a simple game-like scene. This page is separate from the live Moonpet game. It uses promoted static files under `img/moonpets/` when available and shows clear missing-asset warnings when files are absent.

## Later Live Game Integration

Before live integration:

- all required animations must be approved
- promoted files must exist under `img/moonpets/`
- sandbox and runtime preview must render real sprites
- frame count, frame size, and atlas data must be verified
- a live runtime manifest must be prepared
- regression checks must be added
- integration must be done in a separate approved task

Do not replace `moonpet-game.html`, `js/moonpet-mini-app.js`, or `css/moonpet-mini-app.css` as part of the art pipeline staging work.
