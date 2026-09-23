# Moonpet Approved Sprite Renderer

The approved sprite renderer is an adapter layer for testing the promoted Moonbot spritesheets before they are connected to the live Moonpet game.

It is not a live-game replacement.

## Feature Flag

The adapter is controlled by:

```js
window.MOONPET_USE_APPROVED_SPRITES = false;
```

Default behavior is off. If the flag is not explicitly set to `true`, the renderer reports fallback mode and `renderApprovedMoonpet(...)` returns `false`.

The isolated runtime preview opts in for testing. The live Moonpet game does not.

## Files

Adapter files:

- `js/moonpet-approved-asset-loader.js`
- `js/moonpet-approved-sprite-renderer.js`

Preview harness:

- `moonpet-runtime-preview.html`
- `js/moonpet-runtime-preview.js`

Live game files remain untouched.

## Asset Loader

`js/moonpet-approved-asset-loader.js` reads:

```text
data/moonpet-approved-assets.json
```

It loads only approved, promoted, non-rejected records for:

- `base_idle` -> `iso_idle_down`
- `base_walk` -> `iso_walk_down`
- `base_run` -> `iso_run_down`

The rejected `attack` asset is not loaded and is not exposed as a supported role.

The loader fetches each promoted PNG and atlas JSON with a cache-busting token from `promoted_at` or `window.MOONPET_COMMIT_HASH`.

## Renderer API

The renderer exposes:

```js
await window.MoonpetApprovedSpriteRenderer.initApprovedMoonpetSpriteRenderer();

const didRender = window.MoonpetApprovedSpriteRenderer.renderApprovedMoonpet(
  ctx,
  animationRole,
  x,
  y,
  scale,
  time
);
```

For convenience, the same render function is also exposed as:

```js
window.renderApprovedMoonpet(ctx, animationRole, x, y, scale, time);
```

Supported `animationRole` values:

- `base_idle`
- `base_walk`
- `base_run`

Unsupported roles, rejected roles, missing assets, failed image loads, failed atlas loads, or disabled feature flags all return `false`.

## Fallback Behaviour

The renderer never fakes success.

`renderApprovedMoonpet(...)` returns:

- `true` only when a real approved promoted spritesheet frame was drawn.
- `false` when the feature flag is off, assets are missing, the role is unsupported, or rendering fails.

Future live integration should use `false` as the signal to keep drawing with the existing procedural renderer.

Renderer state can be inspected with:

```js
window.MoonpetApprovedSpriteRenderer.getApprovedMoonpetSpriteRendererState();
```

The state includes:

- `enabled`
- `ready`
- `fallback`
- `reason`
- `errors`
- `assetsByRole`

## Runtime Preview

`moonpet-runtime-preview.html` opts into the feature flag and uses the adapter to render the approved Moonbot in a test scene.

This preview is intentionally separate from the live game. It exists to prove that the adapter can load and render approved sprites without touching production gameplay code.

## Future Live-Game Integration Path

The next controlled integration step should:

- Keep `MOONPET_USE_APPROVED_SPRITES` off by default.
- Add the loader and renderer scripts only in a controlled live-game follow-up.
- Initialize the adapter during game startup only when the flag is enabled.
- Call `renderApprovedMoonpet(...)` from a small renderer branch.
- Continue using the current procedural renderer when the adapter returns `false`.
- Avoid using rejected `attack`.

Do not replace the existing live renderer until the feature-flagged adapter has passed local and staged testing.
