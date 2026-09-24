# Moonpet Custom Animation Autopilot

The Moonpet Custom Animation Autopilot is the controlled operator for one queued custom animation at a time. It can generate, mechanically review, optionally promote to pending approval, and write a clear report without changing the live Moonpet game.

Current target:

- `custom_eat`

Already approved:

- `custom_sleep` / `iso_custom_sleep_down`

Rejected:

- `attack` / side-scroller output

## What It Does

The operator reads:

```text
data/moonpet-custom-animation-queue.json
```

Then it validates one requested item:

- The id is enabled.
- The queue item exists.
- The status is `planned` or `generated_pending_review`.
- `approved` is still `false`.
- The item is not rejected.
- The item is not `attack`.
- The output targets are stable public paths.

When execution is enabled, it calls the custom generator for only that item. For `custom_eat`, generated files should land at:

```text
output/moonpets/custom/custom_eat.png
output/moonpets/custom/custom_eat.json
```

The future public target is:

```text
img/moonpets/moonbot-pet-visor-v1/custom_eat.png
img/moonpets/moonbot-pet-visor-v1/custom_eat.json
```

## Mechanical Review

The review checks are mechanical, not artistic judgment:

- PNG exists.
- PNG size is greater than 50KB.
- Atlas exists.
- Atlas has 25 frames.
- Atlas frames are 256x256.
- Sheet size is 1280x1280.
- Animation id is not `attack`.
- Manifest id matches the requested custom id.
- Generated sheet and atlas paths exist.
- Stable output paths are used.
- Rejected states are not promoted.
- PNG is not fully transparent.
- PNG is not blank.
- Most frames contain visible pixels.
- The sheet does not look like a repeated single static frame.

Passing these checks means the asset is technically reviewable. It does not mean the artwork is approved.

## Report

The operator writes:

```text
output/manifests/moonpet-custom-animation-review.generated.json
```

The report includes:

- `custom_animation_id`
- `source_character_name`
- `prompt`
- `generation_status`
- `review_status`
- `reason`
- `checks`
- `output_png_path`
- `output_atlas_path`
- `frame_count`
- `frame_size`
- `sheet_size`
- `recommendations`

## Local Usage

Dry review without calling AutoSprite:

```bash
npm run moonpet:custom:autopilot
```

Run mechanical review only:

```bash
npm run moonpet:custom:review
```

Execute generation for `custom_eat` explicitly:

```bash
AUTOSPRITE_API_KEY=replace_me node scripts/moonpet-custom-animation-autopilot.js --id custom_eat --execute
```

Promote only if mechanical checks pass:

```bash
AUTOSPRITE_API_KEY=replace_me node scripts/moonpet-custom-animation-autopilot.js --id custom_eat --execute --promote-if-passed
```

Promotion moves the queue state to `promoted_pending_approval`. It does not set `approved: true`.

## GitHub Actions

Use the Moonpet Art Factory workflow with:

```text
phase=generate-custom-animation
custom_animation_id=custom_eat
execute_custom_generation=true
auto_review_custom_animation=true
auto_promote_if_passed=false
```

Safe defaults are:

- `execute_custom_generation=false`
- `auto_review_custom_animation=true`
- `auto_promote_if_passed=false`

With defaults, the workflow does not call AutoSprite. With execution enabled, it generates only the selected queue item and uploads `output/manifests/` and `output/moonpets/` artifacts.

## Approval Policy

Automated checks can recommend review readiness. They do not approve art by default.

Final approval still requires an explicit follow-up that marks the queue item approved after visual review. The live Moonpet game remains unchanged, and approved sprites remain disabled by default unless the existing live feature flag is explicitly enabled.
