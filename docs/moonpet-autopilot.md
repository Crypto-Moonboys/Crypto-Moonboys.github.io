# Moonpet Autopilot

Moonpet Autopilot is a repo-controlled verification pass for the approved Moonbot sprite pipeline. It checks the public runtime inputs, writes a pass/fail report, and keeps asset generation separate from validation.

Current checkpoint: the base Moonbot system is passing when `npm run moonpet:autopilot` reports `PASS`.

Production art direction checkpoint: the next Moonpet gameplay art pipeline is side-scroller first. The existing isometric/down-facing assets remain archived/reference-only, while the new side-scroller queue is validated separately from the current live game checks.

## What It Checks

The autopilot checks:

- `data/moonpet-approved-assets.json` exists and parses.
- Approved promoted Moonbot assets exist under `img/moonpets/moonbot-pet-visor-v1/`.
- `iso_idle_down`, `iso_walk_down`, and `iso_run_down` are approved and promoted.
- The promoted PNG and atlas JSON files exist for each approved animation.
- Built-in `attack` remains rejected.
- `moonpet-animation-sandbox.html` exists.
- `moonpet-runtime-preview.html` exists.
- `js/moonpet-approved-asset-loader.js` exists.
- `js/moonpet-approved-sprite-renderer.js` exists.
- `moonpet-game.html` exists.
- The live approved sprite feature flag defaults off.
- The public runtime does not require `output/` generated folders.
- No real AutoSprite API key appears in repo files.
- The custom animation queue is valid.
- `custom_sleep` may be approved/promoted as the down-facing manual sheet only.
- `custom_eat` is the current planned, unapproved, unpromoted custom target.
- The latest custom animation review report is non-blocking unless it indicates a corrupt generated asset or rejected-state promotion risk.
- Remaining custom states remain planned and unapproved.

## What It Does Not Do

Autopilot does not:

- Call AutoSprite.
- Generate spritesheets.
- Promote generated assets.
- Approve custom animation art.
- Change live game behaviour.
- Enable approved sprites by default.
- Remove or replace the procedural renderer.
- Commit `output/`.

## How To Run

Run the check:

```bash
npm run moonpet:autopilot
```

Generate the JSON report:

```bash
npm run moonpet:autopilot:report
```

The report is written to:

```text
output/manifests/moonpet-autopilot-report.json
```

## How To Read The Report

The report includes:

- `timestamp`
- `overall_status`
- `custom_queue_status`
- `planned_custom_states`
- `custom_queue_errors`
- `latest_custom_animation_review`
- `latest_custom_animation_review_status`
- `runtime_sprite_requirements_status`
- `runtime_sprite_action_modes`
- `runtime_sprite_errors`
- `visual_rejected_side_assets`
- `checks`
- `approved_assets`
- `rejected_assets`
- `next_recommended_action`
- `files_required_for_public_runtime`
- `files_not_required_for_public_runtime`

Each check has:

- `id`
- `label`
- `status`
- `detail`

If `overall_status` is `pass`, the approved Moonbot public runtime files are present, the guarded live integration is still default-off, the custom sleep asset is valid when present, the custom animation queue is valid, and the current live action modes have an explicit sprite requirement map. A pass does not mean the side-scroller build is live-ready; check `visual_rejected_side_assets` and `runtime_sprite_action_modes` for remaining regeneration/install work. If it is `fail`, fix the failed checks before using `?approvedSprites=1` for live-game visual testing or before starting custom animation generation.

## GitHub Actions

`.github/workflows/moonpet-autopilot.yml` runs manually and on a daily schedule. It:

- Checks out the repo.
- Sets up Node.
- Runs `npm ci`.
- Runs syntax checks for Moonpet preview and live integration JavaScript.
- Generates and uploads the autopilot report.
- Runs the autopilot check.
- Runs `npm run moonpet:custom-queue:check`.

The workflow does not call AutoSprite and does not generate new art.

## Next Layer: Custom Animation Queue

The next automation layer is the custom pet-state queue:

```text
data/moonpet-custom-animation-queue.json
```

It tracks planned custom states such as sleep, eat, play, clean, wave, sit, happy, and sad. The queue is validated with:

```bash
npm run moonpet:custom-queue:check
```

Autopilot now includes this queue as a monitoring check. It fails if the queue JSON is invalid, a planned item uses rejected `attack`, roles are duplicated, prompts or promotion targets are missing, or any planned item is accidentally approved.

The custom queue does not generate assets automatically. It is a planning and validation layer, now allowing the manually approved down-facing `custom_sleep` while keeping `custom_eat` as the current planned/unapproved generation target and the remaining custom states separate from the approved base idle/walk/run system.

The custom generation operator is documented in [Moonpet Custom Animation Autopilot](moonpet-custom-animation-autopilot.md). That operator can run one queued item, write a mechanical review report, and optionally promote a passing asset to `promoted_pending_approval`; it still does not set `approved: true`.

The current Moonpet runtime is down-facing only. Other directional sleep sheets, including northeast, northwest, left, right, up, southeast, and southwest, are reserved for future 8-direction/isometric expansion and are not part of the current approved runtime loader.

## Next Production Direction: Side-Scroller

The new production art source is documented in:

```text
docs/moonpet-side-scroller-sprite-bible.md
docs/moonpet-side-scroller-migration-plan.md
data/moonpet-side-scroller-art-system.json
data/moonpet-side-scroller-animation-queue.json
```

The older approved isometric/down-facing assets are not deleted and remain useful as v1 reference/experiment assets:

- `iso_idle_down`
- `iso_walk_down`
- `iso_run_down`
- `custom_sleep`

They should not be expanded for current gameplay. New gameplay animation planning should use the side-scroller queue and the production rule:

```text
Build side. Test side. Ship side.
```

Run the side-scroller queue validator with:

```bash
npm run moonpet:side-queue:check
```

This check is separate from the current live-game autopilot. It does not call AutoSprite, does not generate assets, and does not approve or promote side-scroller art. It only validates that the planned side-scroller queue is complete, unapproved by default, uses stable public target paths, and avoids isometric/down-facing animation naming.

The current Telegram runtime requirements are tracked separately in:

```text
data/moonpet-runtime-sprite-requirements.json
docs/moonpet-runtime-sprite-audit.md
```

Run that guard with:

```bash
npm run moonpet:runtime-sprites:check
```

That check maps the live mini-app action families before side-scroller sprites are installed. It also records which generated side-scroller sheets visually passed, which were rejected, and which current runtime states still need new art or an intentional procedural fallback.

## Why This Reduces Manual Work

Before visual testing, the user no longer has to manually confirm every registry entry, promoted file, rejected asset, feature flag guard, and runtime dependency. Autopilot turns that list into a repeatable command and a GitHub Actions artifact.
