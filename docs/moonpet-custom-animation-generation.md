# Moonpet Custom Animation Generation

This document covers the current custom pet-state generation lane for Moonbot.

Already approved:

- `custom_sleep`

Current target:

- `custom_eat`

`custom_sleep` is approved from the manually downloaded down-facing AutoSprite website sheet. The next automation target is `custom_eat` only. No other custom states should be generated yet.

## Current Safety Rules

- Do not generate all eight planned custom states.
- Do not use rejected `attack`.
- Do not approve future custom states automatically.
- Do not change the live game.
- Do not enable approved sprites by default.
- Do not call AutoSprite during normal checks.

## Queue Source

The queue item lives in:

```text
data/moonpet-custom-animation-queue.json
```

`custom_sleep` is:

- `status: approved`
- `approved: true`
- `promoted: true`
- `animation_kind: iso_custom_sleep_down`
- `custom_required: true`
- `source_character_name: MOONBOT PET VISOR V1`

The approved files are:

```text
img/moonpets/moonbot-pet-visor-v1/custom_sleep.png
img/moonpets/moonbot-pet-visor-v1/custom_sleep.json
```

Source filenames:

```text
MOONBOT PET VISOR V1-iso_custom_sleep_down-v1.png
MOONBOT PET VISOR V1-iso_custom_sleep_down-v1.json
```

The previous API-generated `custom_sleep` attempt is rejected/not used.

The current Moonpet runtime is down-facing only. Other sleep directions are reserved for future 8-direction/isometric expansion and must not be added to the approved runtime loader yet:

- northeast
- northwest
- left
- right
- up
- southeast
- southwest

Expected output format:

- `frame_count`: 25
- `frame_size`: 256
- `sheet_size`: 1280x1280

`custom_eat` must remain planned and unapproved until a generated or manually imported sheet is reviewed:

- `status: planned`
- `approved: false`
- `promoted: false`
- `role: custom_eat`
- `animation_kind: iso_custom_eat_down`
- `custom_required: true`
- `source_character_name: MOONBOT PET VISOR V1`

Prompt direction:

```text
Create a down-facing isometric custom eat animation for MOONBOT PET VISOR V1. Keep the exact Moonbot body, white glossy helmet, black visor, pink LED eyes, proportions, and approved sprite style. The pet should eat or receive food in a cute readable way while remaining down-facing/isometric. No side-scroller view, no attack pose, no extra background, no text.
```

Promotion targets for `custom_eat`:

```text
/img/moonpets/moonbot-pet-visor-v1/custom_eat.png
/img/moonpets/moonbot-pet-visor-v1/custom_eat.json
```

## Dry Run

Dry run is safe and does not call AutoSprite:

```bash
npm run moonpet:custom:dry
```

## Generate One Future Custom Animation

Real generation requires explicit execution and should target `custom_eat` only:

```bash
AUTOSPRITE_API_KEY=replace_me node scripts/generate-moonpet-custom-animation.js --id custom_eat --execute
```

The custom generation script:

- Reads the custom queue.
- Validates that `custom_eat` is planned, unapproved, unpromoted, and custom-required.
- Finds the existing AutoSprite character `MOONBOT PET VISOR V1`.
- Sends one custom animation request using `kind: custom` and the queue prompt.
- Downloads the generated PNG into `output/moonpets/custom/`.
- Downloads the atlas JSON when available.
- Generates a local atlas JSON when AutoSprite only returns a PNG.
- Writes `output/manifests/moonpet-custom-animation.generated.json` with `status: generated_pending_review`.

The safer operator wrapper is documented in [Moonpet Custom Animation Autopilot](moonpet-custom-animation-autopilot.md). Prefer that wrapper for GitHub Actions because it generates one queued item, runs mechanical checks, and writes a review report.

## Promotion

Promotion is explicit and separate:

```bash
npm run moonpet:custom:promote
```

The promoter copies only `custom_eat` from:

```text
output/moonpets/custom/
```

to:

```text
img/moonpets/moonbot-pet-visor-v1/
```

It updates the queue item to `status: promoted_pending_approval`, sets `promoted: true`, and records public `sheet_path` and `atlas_path`.

It does not set `approved: true`.

Approval remains a later manual review step after sandbox/runtime inspection. Promotion alone must not set `approved: true`.

## GitHub Actions

The Moonpet Art Factory workflow has a `generate-custom-animation` phase for explicit `custom_eat` generation.

Current enabled input:

```text
custom_animation_id=custom_eat
```

Do not use this phase to replace the approved manual `custom_sleep` asset. The workflow:

- Runs the custom queue check.
- Generates `custom_eat`.
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
