# Moonpet Custom Animation Generation

This document covers the first custom pet-state generation lane for Moonbot.

The first custom state is:

- `custom_sleep`

`custom_sleep` is now approved from the manually downloaded down-facing AutoSprite website sheet. No other custom states should be generated yet.

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

`custom_sleep` is now:

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

Promotion targets:

```text
/img/moonpets/moonbot-pet-visor-v1/custom_sleep.png
/img/moonpets/moonbot-pet-visor-v1/custom_sleep.json
```

## Dry Run

Dry run remains available for future testing, but it should not be used to replace the approved manual sleep sheet without explicit review:

```bash
npm run moonpet:custom:dry
```

## Generate One Future Custom Animation

Real generation requires explicit execution. Do not run this for `custom_sleep` now that the manual down-facing sheet is approved. Use this flow only for a future remaining state after the queue enables it, or for an explicitly approved replacement review:

```bash
AUTOSPRITE_API_KEY=replace_me node scripts/generate-moonpet-custom-animation.js --id <future_custom_id> --execute
```

The custom generation script:

- Reads the custom queue.
- Validates that the requested future item is planned, unapproved, and custom-required.
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

Approval remains a later manual review step after sandbox/runtime inspection for any future custom state. The already approved manual `custom_sleep` asset should stay on the stable public paths unless a replacement is explicitly approved.

## GitHub Actions

The Moonpet Art Factory workflow has a `generate-custom-animation` phase for future explicit generation tests.

The previous enabled test input was:

```text
custom_animation_id=custom_sleep
```

Do not use this phase to replace the approved manual `custom_sleep` asset unless a follow-up task explicitly asks for a replacement review. Future workflow use should switch to a remaining planned state before generation. The workflow:

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
