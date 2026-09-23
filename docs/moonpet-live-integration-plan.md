# Moonpet Live Integration Plan

This plan describes how to bring the approved Moonbot spritesheets into the live Moonpet game without replacing the current game runtime.

## 1. Current Pipeline Summary

The Moonpet Art Factory now has a working controlled asset pipeline:

- AutoSprite generation uses the existing `MOONBOT PET VISOR V1` character.
- Generated spritesheets are reviewed in `moonpet-animation-sandbox.html`.
- Approved promoted assets are copied into `img/moonpets/moonbot-pet-visor-v1/`.
- `data/moonpet-approved-assets.json` is the approval registry and public asset source of truth.
- `moonpet-runtime-preview.html` proves the approved spritesheets can animate in a game-like scene.
- The live Moonpet game now has a feature-flagged adapter path that defaults off and falls back to the existing procedural renderer.

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

Live integration happens behind a feature flag.

Required approach:

- Add a Moonpet approved asset loader for `data/moonpet-approved-assets.json`. Done in `js/moonpet-approved-asset-loader.js`.
- Add a renderer adapter. Done in `js/moonpet-approved-sprite-renderer.js`.
- Keep the feature flag off by default.
- Preserve the existing canvas game and procedural Moonpet renderer.
- Load approved sprites only when the flag is explicitly enabled.
- If asset loading fails, fall back to the current procedural renderer.
- Do not remove or rewrite current canvas logic during the first live integration step.
- Do not use rejected `attack`.

Recommended feature flag shape:

```js
window.MOONPET_USE_APPROVED_SPRITES = false;
```

Testing override:

```text
?approvedSprites=1
```

Default production behaviour remains unchanged unless the flag is explicitly enabled.

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
- Confirm the live game does not load approved sprite adapter scripts when the flag is off.

## 6. Test Checklist

Before enabling the flag anywhere:

- Run `npm run moonpet:autopilot` and confirm it passes.
- Run `npm run moonpet:autopilot:report` if a JSON artifact is needed.
- Open the live game with the feature flag off and verify the current game behaves unchanged.
- Open the live game with `?approvedSprites=1` in a controlled local or staged run.
- Verify idle animation renders from `iso_idle_down`.
- Verify walking state can map to `iso_walk_down`.
- Verify faster movement can map to `iso_run_down`.
- Verify missing PNG or JSON files fall back to the procedural renderer.
- Verify rejected `attack` is never selected.
- Verify no console errors appear during normal startup.
- Verify console logs show `approved sprite mode disabled` when the flag is off.
- Verify console logs show `approved sprite mode enabled` when `?approvedSprites=1` is present.
- Verify console logs show `approved sprite fallback used` when adapter loading or rendering fails.
- Verify mobile viewport still renders correctly.
- Verify save/state logic is unaffected.

## 7. Rollback Plan

Rollback must be simple:

- Remove `?approvedSprites=1` or set `window.MOONPET_USE_APPROVED_SPRITES = false`.
- The game should immediately use the existing procedural renderer.
- If needed, revert only the guarded adapter wiring in `js/moonpet-mini-app.js`.
- The dynamic loader means `moonpet-game.html` does not need a script rollback for this integration.
- Keep promoted assets and registry data in place; they are inert while the flag is off.
- Do not delete approved art assets during rollback unless the registry itself is proven corrupt.

## 8. Files That May Be Touched Later

Touched for the current guarded integration:

- `js/moonpet-approved-asset-loader.js`
- `js/moonpet-mini-app.js`
- `js/moonpet-approved-sprite-renderer.js`

Only in a future controlled follow-up:

- `css/moonpet-mini-app.css`, only if needed for layout or debug presentation

The first implementation should prefer adding a separate loader/adapter file and making the smallest possible guarded connection to the live game.

## 9. Files That Must Not Be Touched Yet

Do not touch unless a later integration specifically requires it:

- `moonpet-game.html`

The current integration dynamically loads adapter scripts from `js/moonpet-mini-app.js` only when the flag is enabled, so the live HTML entry point remains unchanged.

## 10. Next Implementation Step

Verify the feature-flagged live path locally and in a controlled staging pass.

The live path should:

- Keep the flag off by default.
- Use [Moonpet Autopilot](moonpet-autopilot.md) as the first preflight check.
- Use `?approvedSprites=1` for explicit testing.
- Draw approved idle, walk, and run sprites only when `renderApprovedMoonpet(...)` returns `true`.
- Keep procedural drawing as the fallback for every failed or disabled case.

Only after this guarded path is verified should any broader live art replacement be considered.
