# Moonpet Side-Scroller Migration Plan

The Moonpet production art direction is moving to a 2D side-scroller pet format. The attached `Crypto Moonboys Pets - Side-Scroller Sprite Bible V1.0` is now the production source of truth for gameplay animation.

## Why Side-Scroller

AutoSprite supports side-scroller animation more reliably than the custom isometric/down-facing pet-state experiments. The isometric base tests produced useful reference material, but custom states such as eat drifted into side/profile output anyway. Rather than fighting the toolchain, the game should now use the direction AutoSprite can generate consistently.

The production rule is:

```text
Build side. Test side. Ship side.
```

All current gameplay animation planning should assume clean side-view sprites, left/right gameplay logic, and mirrored movement where practical.

## Existing Isometric Assets

Do not delete the v1 isometric/down-facing assets. They remain archived reference and experiment assets only:

- `iso_idle_down`
- `iso_walk_down`
- `iso_run_down`
- `custom_sleep`

These assets should not be expanded further unless a future explicit 8-direction/isometric mode is created. They remain useful for reference, style comparison, and rollback analysis, but they are no longer the active production animation path.

## New Production Rule

New gameplay sprites should be side-scroller first:

- Use side-left and side-right Moonbot proportions as the gameplay baseline.
- Use front/back references only for trait consistency, not runtime animation.
- Keep left/right sprite logic compatible with mirroring.
- Keep every animation on a stable ground line.
- Use the black visor, pink LED eyes, glossy white body, chunky feet, and soft shaded cyber-pet style.
- Generate, review, promote, and then integrate.

## Staged Migration

1. Document the side-scroller production bible.
2. Add a side-scroller art-system JSON file.
3. Add a side-scroller animation queue with planned base states only.
4. Validate the queue locally and in CI without generating assets.
5. Generate one side-scroller state at a time in a future explicit generation phase.
6. Mechanically review each generated sheet and atlas.
7. Promote passing assets to `/img/moonpets/moonbot-pet-visor-v1-side/` for preview.
8. Add a preview-only side-scroller runtime page or extend the sandbox.
9. Integrate into the live game behind a new feature flag only after preview validation.

## Testing Before Live Integration

Before any live-game change:

- Run `npm run moonpet:side-queue:check`.
- Confirm the queue contains only side-scroller states.
- Confirm no side-scroller asset is approved or promoted by default.
- Preview promoted side assets in a sandbox or runtime preview page.
- Verify side idle, walk, run, jump, eat, sleep, play, clean, train, and hurt frame timing.
- Confirm the existing live game still runs with its current renderer.

Live integration is a later controlled task. Do not modify `moonpet-game.html`, `js/moonpet-mini-app.js`, or `css/moonpet-mini-app.css` for this foundation step.
