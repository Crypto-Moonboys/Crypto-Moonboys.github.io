# Moonpet Live Integration Plan

This plan describes how to bring the approved Moonbot spritesheets into the live Moonpet game without replacing the current game runtime yet.

## 1. Current Pipeline Summary

The Moonpet Art Factory now has a working controlled asset pipeline:

- AutoSprite generation uses the existing `MOONBOT PET VISOR V1` character.
- Generated spritesheets are reviewed in `moonpet-animation-sandbox.html`.
- Approved promoted assets are copied into `img/moonpets/moonbot-pet-visor-v1/`.
- `data/moonpet-approved-assets.json` is the approval registry and public asset source of truth.
- `moonpet-runtime-preview.html` proves the approved spritesheets can animate in a game-like scene.
- The live Moonpet game has not been changed.

Generated `output/` assets are temporary build artifacts. Approved game-ready files must be promoted into `img/moonpets/` before any runtime integration uses them.

## 2. Approved Assets

The current approved Moonbot base movement pack is:

- `iso_idle_down` -> `base_idle`
- `iso_walk_down` -> `base_walk`
- `iso_run_down` -> `base_run`

Baseline format:

- `frame_count`: 25
- `frame_size`: 256
- `sheet_size`: 1280x1280
- Atlas source: promoted JSON atlas beside each PNG

## 3. Rejected Asset

Rejected for the isometric Moonbot base pack:

- `attack`

Reason: AutoSprite built-in `attack` produces side-scroller output and does not match the approved isometric set.

Combat-style built-in animations should not be promoted into the Moonbot base pack. Future pet states should use custom isometric pet-state animations instead.

## 4. Integration Strategy

Live integration should happen behind a feature flag.

Required approach:

- Add a Moonpet approved asset loader for `data/moonpet-approved-assets.json`.
- Keep the feature flag off by default.
- Preserve the existing canvas game and procedural Moonpet renderer.
- Load approved sprites only when the flag is explicitly enabled.
- If asset loading fails, fall back to the current procedural renderer.
- Do not remove or rewrite current canvas logic during the first live integration step.
- Do not use rejected `attack`.

Recommended feature flag shape:

```js
const MOONPET_APPROVED_SPRITES_ENABLED = false;
```

The flag can later be wired to a query parameter, local development toggle, or staged rollout mechanism, but the initial default must remain off.

## 5. Risk Checklist

- Confirm approved asset paths exist under `img/moonpets/moonbot-pet-visor-v1/`.
- Confirm `data/moonpet-approved-assets.json` has `promoted: true` for idle, walk, and run.
- Confirm rejected `attack` is ignored by the live loader.
- Confirm feature flag defaults off in production.
- Confirm procedural rendering still works when sprite loading fails.
- Confirm no API key or AutoSprite runtime dependency is introduced into the live game.
- Confirm sprite loading is static-site compatible.
- Confirm atlas parsing handles the current 25-frame, 256px, 1280x1280 format.
- Confirm cache behavior does not trap stale sprites after promotion.

## 6. Test Checklist

Before enabling the flag anywhere:

- Open the live game with the feature flag off and verify the current game behaves unchanged.
- Open the live game with the feature flag on in a controlled preview branch or local run.
- Verify idle animation renders from `iso_idle_down`.
- Verify walking state can map to `iso_walk_down`.
- Verify faster movement can map to `iso_run_down`.
- Verify missing PNG or JSON files fall back to the procedural renderer.
- Verify rejected `attack` is never selected.
- Verify no console errors appear during normal startup.
- Verify mobile viewport still renders correctly.
- Verify save/state logic is unaffected.

## 7. Rollback Plan

Rollback must be simple:

- Turn the feature flag off.
- The game should immediately use the existing procedural renderer.
- If needed, revert only the sprite adapter and loader wiring.
- Keep promoted assets and registry data in place; they are inert while the flag is off.
- Do not delete approved art assets during rollback unless the registry itself is proven corrupt.

## 8. Files That May Be Touched Later

Only in a controlled follow-up:

- `js/moonpet-approved-asset-loader.js`
- `js/moonpet-mini-app.js`
- `css/moonpet-mini-app.css`, only if needed for layout or debug presentation

The first implementation should prefer adding a separate loader/adapter file and making the smallest possible guarded connection to the live game.

## 9. Files That Must Not Be Touched Yet

Do not touch in this planning task:

- `moonpet-game.html`

The live HTML entry point should remain unchanged until the adapter has been proven preview-only.

## 10. Next Implementation Step

Add a feature-flagged sprite renderer adapter, preview-only first.

The adapter should:

- Read approved promoted assets from `data/moonpet-approved-assets.json`.
- Filter to `approved: true`, `promoted: true`, and non-rejected records.
- Load PNG and atlas data for idle, walk, and run.
- Expose a small renderer interface that can draw a selected animation frame onto an existing canvas context.
- Return a clear failure state so the live game can keep using the procedural renderer.

Only after that adapter works in isolation should `js/moonpet-mini-app.js` be touched in a controlled follow-up.
