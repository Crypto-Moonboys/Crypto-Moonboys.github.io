# Moonpet Runtime Preview

`moonpet-runtime-preview.html` is a preview-only runtime test page. It proves the approved Moonbot spritesheet metadata can drive a simple game-like loop before anything is moved into the live Moonpet game.

It does not replace or modify:

- `moonpet-game.html`
- `js/moonpet-mini-app.js`
- `css/moonpet-mini-app.css`

## Data Loading

The preview loads:

1. `data/moonpet-approved-assets.json`
2. `output/manifests/moonpet-animation-sandbox.generated.json`, when present
3. `data/moonpet-animation-sandbox.sample.json`, when generated output is missing

Only approved records are selectable in the runtime controls. Built-in `attack` is rejected in the registry and is not used by the preview. Approved registry `sheet_path` and `atlas_path` values are tried first, so promoted static assets under `img/moonpets/` take priority over temporary generated output.

## Approved Base Animations

- `iso_idle_down` -> `base_idle`
- `iso_walk_down` -> `base_walk`
- `iso_run_down` -> `base_run`

The preview supports 25-frame, 256x256 spritesheets on 1280x1280 sheets. If atlas JSON is present, frame rectangles come from the atlas. If atlas JSON is missing, the preview falls back to a 5x5 grid based on the approved baseline format.

## Running Locally

Use a static server so browser `fetch()` can read JSON files:

```bash
npx serve .
```

Open:

```text
/moonpet-runtime-preview.html
```

No API key is required. The page does not generate AutoSprite assets.

## Promoted Assets

Generated files in `output/` are temporary artifacts. After review, promote approved assets:

```bash
node scripts/promote-moonpet-approved-assets.js
```

The script copies approved sheet/atlas files into:

```text
img/moonpets/moonbot-pet-visor-v1/
```

and updates `data/moonpet-approved-assets.json` with public paths such as:

```text
/img/moonpets/moonbot-pet-visor-v1/iso_idle_down.png
/img/moonpets/moonbot-pet-visor-v1/iso_idle_down.json
```

The runtime preview uses those promoted files on the public static site. If the registry has approved metadata but the promoted file is missing, the page shows `approved metadata found but sprite file missing.`

Existing promoted files are protected. Use `node scripts/promote-moonpet-approved-assets.js --force` only after explicitly approving an overwrite.

## Preview Controls

The page has three controls:

- Idle
- Walk
- Run

Each button maps to an approved animation record. If the spritesheet file is missing, the scene keeps running and shows a clear missing-asset message instead of crashing.

Debug fields show:

- `animation_kind`
- `role`
- approved status
- frame count
- frame size
- sheet path
- atlas path

## Adding Newly Approved Animations Later

After a new animation is reviewed:

1. Add or update its entry in `data/moonpet-approved-assets.json`.
2. Regenerate or refresh `output/manifests/moonpet-animation-sandbox.generated.json`.
3. Add a preview control only after the animation is approved and has a runtime role.
4. Keep rejected entries, such as `attack`, out of runtime controls.

## Before Live Game Integration

Before touching the live game:

- Confirm every required animation has an approved registry entry.
- Confirm local sheet and atlas paths resolve in the sandbox and runtime preview.
- Confirm frame count, frame size, and sheet size match the approved baseline.
- Add a separate integration manifest for the live game.
- Add visual/runtime regression checks.
- Move only approved assets into live runtime paths.
