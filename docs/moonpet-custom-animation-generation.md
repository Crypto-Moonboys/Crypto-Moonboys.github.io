# Moonpet Custom Animation Generation

This document covers the first custom pet-state generation lane for Moonbot.

The first enabled custom state is:

- `custom_sleep`

No other custom states should be generated yet.

## Current Safety Rules

- Do not generate all eight planned custom states.
- Do not use rejected `attack`.
- Do not approve `custom_sleep` automatically.
- Do not change the live game.
- Do not enable approved sprites by default.
- Do not call AutoSprite during normal checks.

## Queue Source

The queue item lives in:

```text
data/moonpet-custom-animation-queue.json
```

`custom_sleep` must remain:

- `status: planned` before generation
- `approved: false`
- `custom_required: true`
- `source_character_name: MOONBOT PET VISOR V1`

Expected output format:

- `frame_count`: 25
- `frame_size`: 256
- `sheet_size`: 1280x1280

Promotion targets:

```text
/img/moonpets/moonbot-pet-visor-v1/custom_sleep.png
/img/moonpets/moonbot-pet-visor-v1/custom_sleep.json
```

## Dry Run

Dry run validates the queue item and writes a generated manifest entry without calling AutoSprite:

```bash
npm run moonpet:custom:dry
```

## Generate One Custom Animation

Real generation requires explicit execution:

```bash
AUTOSPRITE_API_KEY=replace_me node scripts/generate-moonpet-custom-animation.js --id custom_sleep --execute
```

The script:

- Reads the custom queue.
- Validates that `custom_sleep` is planned, unapproved, and custom-required.
- Finds the existing AutoSprite character `MOONBOT PET VISOR V1`.
- Sends one custom animation request using `kind: custom` and the queue prompt.
- Downloads the generated PNG into `output/moonpets/custom/`.
- Downloads the atlas JSON when available.
- Generates a local atlas JSON when AutoSprite only returns a PNG.
- Writes `output/manifests/moonpet-custom-animation.generated.json`.

## Promotion

Promotion is explicit and separate:

```bash
npm run moonpet:custom:promote
```

The promoter copies only `custom_sleep` from:

```text
output/moonpets/custom/
```

to:

```text
img/moonpets/moonbot-pet-visor-v1/
```

It updates the queue item to `status: promoted`, sets `promoted: true`, and records public `sheet_path` and `atlas_path`.

It does not set `approved: true`.

Approval remains a later manual review step after sandbox/runtime inspection.

## GitHub Actions

The Moonpet Art Factory workflow has a `generate-custom-animation` phase.

For now, the only allowed input is:

```text
custom_animation_id=custom_sleep
```

The workflow:

- Runs the custom queue check.
- Generates `custom_sleep`.
- Uploads `output/` artifacts.
- Does not auto-commit generated or promoted custom assets.

## AutoSprite Custom Animation Payload

The custom generation request uses:

```json
{
  "animations": [
    {
      "kind": "custom",
      "prompt": "..."
    }
  ],
  "videoTier": "turbo",
  "frameCount": 25,
  "frameSize": 256,
  "removeBg": "ultra"
}
```

AutoSprite's API docs describe custom animations as `kind: "custom"` with a required prompt. If that API response changes, the script must fail clearly rather than fake a successful generation.
