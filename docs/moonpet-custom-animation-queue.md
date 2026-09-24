# Moonpet Custom Animation Queue

The custom animation queue is the planning layer for Moonbot pet-state animations beyond the approved base movement pack.

It does not generate assets automatically.

## Current Baseline

Approved base animations:

- `iso_idle_down` -> `base_idle`
- `iso_walk_down` -> `base_walk`
- `iso_run_down` -> `base_run`

Rejected:

- `attack` -> side-scroller output

The rejected `attack` animation must not be used as a pet-state replacement.

## Queue File

The queue lives at:

```text
data/moonpet-custom-animation-queue.json
```

Custom states:

- `custom_sleep` - approved/promoted from manual AutoSprite website download
- `custom_eat` - current planned generation/review target
- `custom_play`
- `custom_clean`
- `custom_wave`
- `custom_sit`
- `custom_happy`
- `custom_sad`

`custom_sleep` is approved only for the current down-facing runtime direction:

- `/img/moonpets/moonbot-pet-visor-v1/custom_sleep.png`
- `/img/moonpets/moonbot-pet-visor-v1/custom_sleep.json`

The current Moonpet runtime is down-facing only. Other sleep directions are reserved for future 8-direction/isometric expansion and are documentation-only for now: northeast, northwest, left, right, up, southeast, and southwest.

Each item includes:

- `id`
- `role`
- `display_name`
- `source_character_name`
- `status`
- `approved`
- `prompt`
- `custom_required` or `animation_kind`
- `notes`
- `output_expectations`
- `promotion_target`

## Output Expectations

Custom pet-state animations should match the approved Moonbot baseline:

- `frame_count`: 25
- `frame_size`: 256
- `sheet_size`: 1280x1280

Promotion targets are under:

```text
/img/moonpets/moonbot-pet-visor-v1/
```

## Queue Checker

Run:

```bash
npm run moonpet:custom-queue:check
```

The checker validates:

- The queue JSON parses.
- All eight planned states are present.
- No item uses rejected `attack`.
- Roles are unique.
- Prompts exist.
- Promotion targets are defined.
- `custom_sleep` is allowed to be approved/promoted.
- The remaining custom states are not accidentally approved.
- Output expectations match the approved baseline format.

## What This Does Not Do

The custom queue does not:

- Call AutoSprite.
- Generate spritesheets.
- Promote assets.
- Change approved base assets.
- Change live game files.
- Enable approved sprites by default.

`custom_sleep` can appear in sandbox/runtime preview surfaces as the approved down-facing sleep animation, but it is not wired into the live game yet. Extra directional sleep sheets must not be added to the approved runtime loader until the runtime supports 8-direction/isometric animation selection.

`custom_eat` is the next target only. It must stay `planned`, `approved: false`, and `promoted: false` until a generated or manually imported down-facing sheet is reviewed. If promoted later, it should move to `promoted_pending_approval`, not directly to approved.

The next step, when explicitly requested, is to generate or import `custom_eat` and review it through the sandbox before approval.

The first enabled generation lane is documented in [Moonpet Custom Animation Generation](moonpet-custom-animation-generation.md).
