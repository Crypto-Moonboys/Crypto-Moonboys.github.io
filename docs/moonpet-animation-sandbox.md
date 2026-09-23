# Moonpet Animation Sandbox

The Moonpet Animation Sandbox is a repo-local preview tool for AutoSprite output. It is intentionally separate from the live Moonpet game runtime.

Open:

```bash
moonpet-animation-sandbox.html
```

For browser `fetch()` support, serve the repo locally:

```bash
npx serve .
```

Then open the local URL and browse to `/moonpet-animation-sandbox.html`.

## What It Loads

The sandbox reads:

- `data/moonpet-approved-assets.json` for approved and rejected registry status.
- `output/manifests/moonpet-animation-sandbox.generated.json` when the generator has produced it.
- `output/manifests/moonpet-spritesheets.generated.json` as a generated-output fallback.
- `data/moonpet-animation-sandbox.sample.json` when no generated output exists.

The page displays each animation as a loop, reads atlas JSON frame data when an atlas is available, and falls back to the approved 25-frame, 256px, 1280x1280 grid format when atlas files are missing. Approved registry `sheet_path` and `atlas_path` values are tried first.

## Promote Approved Assets

Generated assets in `output/` are temporary workflow artifacts. Approved assets must be promoted into public static paths before the sandbox and runtime preview can display them on the site:

```bash
node scripts/promote-moonpet-approved-assets.js
```

The promotion script reads `output/manifests/moonpet-animation-sandbox.generated.json`, copies only approved sheet/atlas pairs into `img/moonpets/moonbot-pet-visor-v1/`, renames them by animation kind, and updates `data/moonpet-approved-assets.json`.

Rejected assets are never promoted, pending assets are never promoted, and the script fails clearly if a source sheet or atlas is missing. Existing promoted files are not overwritten unless the script is run with `--force` after explicit approval.

## Dry Run

Dry-run does not call AutoSprite and does not require an API key:

```bash
node scripts/generate-moonpet-assets.js --dry-run
```

This writes:

- `output/manifests/moonpet-assets.generated.json`
- `output/manifests/moonpet-animation-sandbox.generated.json`

## Generate One Animation

Real generation is one animation at a time:

```bash
AUTOSPRITE_API_KEY=replace_me node scripts/generate-moonpet-assets.js --phase=test --execute --limit 1 --animation iso_walk_down
AUTOSPRITE_API_KEY=replace_me node scripts/generate-moonpet-assets.js --phase=test --execute --limit 1 --animation iso_run_down
```

Do not use built-in `attack` for Moonbot. It is rejected because it produces side-facing output and does not match the approved isometric pack.

## Preview In Sandbox

After dry-run or generation:

1. Start a local static server.
2. Open `/moonpet-animation-sandbox.html`.
3. Review the cards labeled `approved`, `pending review`, or `rejected`.
4. Check frame count, frame size, sheet size, sheet path, atlas path, job ID, and spritesheet ID.
5. Use the status filter and speed slider for focused review.

## Approval And Rejection

Approval is registry-driven. Update `data/moonpet-approved-assets.json` after human review.

Approved Moonbot base movement:

- `iso_idle_down` -> `base_idle`
- `iso_walk_down` -> `base_walk`
- `iso_run_down` -> `base_run`

Rejected:

- `attack` -> `rejected_side_scroller_output`

Rules:

- Approved assets must not be overwritten unless `--force-approved` is passed.
- Rejected assets must not be promoted.
- Generated PNGs and atlas files stay in `output/` for review until approved; do not auto-commit raw output folders.
- Promoted approved files live under `img/moonpets/` and are the static files used by public previews.
- Live game runtime files must remain untouched until a separate integration step.

## Moving Toward Game Integration

Later integration should copy only approved assets into the live Moonpet runtime paths, add a runtime manifest consumed by the game, and include visual regression checks. That is a separate step after sandbox review confirms framing, direction, frame count, and animation quality.
