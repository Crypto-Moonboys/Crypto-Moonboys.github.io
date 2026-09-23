# Moonpet Autopilot

Moonpet Autopilot is a repo-controlled verification pass for the approved Moonbot sprite pipeline. It checks the public runtime inputs, writes a pass/fail report, and keeps asset generation separate from validation.

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

## What It Does Not Do

Autopilot does not:

- Call AutoSprite.
- Generate spritesheets.
- Promote generated assets.
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

If `overall_status` is `pass`, the approved Moonbot public runtime files are present and the guarded live integration is still default-off. If it is `fail`, fix the failed checks before using `?approvedSprites=1` for live-game visual testing.

## GitHub Actions

`.github/workflows/moonpet-autopilot.yml` runs manually and on a daily schedule. It:

- Checks out the repo.
- Sets up Node.
- Runs `npm ci`.
- Runs syntax checks for Moonpet preview and live integration JavaScript.
- Generates and uploads the autopilot report.
- Runs the autopilot check.

The workflow does not call AutoSprite and does not generate new art.

## Why This Reduces Manual Work

Before visual testing, the user no longer has to manually confirm every registry entry, promoted file, rejected asset, feature flag guard, and runtime dependency. Autopilot turns that list into a repeatable command and a GitHub Actions artifact.
