# Moonpet Side-Scroller Migration Plan

The Moonpet production art direction is moving to a 2D side-scroller pet format. The attached `Crypto Moonboys Pets - Side-Scroller Sprite Bible V1.0` is now the production source of truth for gameplay animation.

## Why Side-Scroller

AutoSprite supports side-scroller animation more reliably than the custom isometric/down-facing pet-state experiments. The isometric base tests produced useful reference material, but custom states such as eat drifted into side/profile output anyway. Rather than fighting the toolchain, the game should now use the direction AutoSprite can generate consistently.

The production rule is:

```text
Build side. Test side. Ship side.
```

All current gameplay animation planning should assume clean side-view sprites, autonomous pet movement inside a bounded stage, left/right visual logic, and mirrored movement where practical.

## Autonomous Pet, Not Player-Controlled Platformer

Side-scroller describes the visual format, not the control model. Moonpet remains an autonomous virtual pet.

Users do not directly move the pet with left/right/jump controls. There should be no Mario-style keyboard movement, collision-platforming gameplay, manual jumping, or combat loop.

The correct interaction model is:

- The user presses care/action buttons.
- The pet performs the selected action animation.
- The pet may move left/right automatically inside the stage during that action.
- The pet may walk, run, jump, play, eat, sleep, clean, or train inside the viewport as scripted autonomous behavior.
- After the action completes, the pet returns to idle.

Examples:

- Eat button: pet walks to snack or bowl, eats, then returns to idle.
- Play button: pet runs or bounces toward a toy, plays, then returns to idle.
- Clean button: pet moves to a cleaning area, plays bubbles/polish animation, then returns to idle.
- Sleep button: pet walks to a sleep spot, lies down, and sleeps.
- Train button: pet walks to a training spot and performs a non-combat train animation.

Side-scroller means side-view camera, side-view sprites, side-view environment, a left/right movement lane, and consistent side-view animation generation. It does not mean player-controlled platforming.

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
- Keep autonomous left/right sprite logic compatible with mirroring.
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
- Verify action-button flows, not player movement controls.
- Confirm no keyboard/platformer control path was introduced.
- Confirm the existing live game still runs with its current renderer.

Live integration is a later controlled task. Do not modify `moonpet-game.html`, `js/moonpet-mini-app.js`, or `css/moonpet-mini-app.css` for this foundation step.
