# Moonpet Side-Scroller Migration Plan

The Moonpet production art direction is moving to a 2D side-scroller virtual-companion format. The attached `Moonbot Side-Scroller Update - Sprite Bible V2` is now the production source of truth for gameplay animation.

The older broad brand/trait sheet and the first side-scroller bible remain useful references, but V2 sets the current gameplay readability target: bigger Moonbot, more horizontal movement, stronger props, mobile-first staging, and bigger action comedy.

## Terminology And Animal-Drift Guard

Moonpet is the game and system name. Moonbot is the character and art subject.

Future sprite/art generation prompts should describe the character as:

- Moonbot
- white glossy robot companion
- chibi cyber mascot
- black visor
- pink LED eyes
- rounded bot body
- mitten hands
- chunky robot feet

Do not describe the generated character as a pet body, animal, creature, puppy, cat, or anything with tails, ears, paws, snouts, fur, whiskers, or claws.

Where negative prompt fields are supported, use:

```text
No tail, no ears, no snout, no animal body, no fur, no paws, no whiskers, no claws.
```

## Why Side-Scroller

AutoSprite supports side-scroller animation more reliably than the custom isometric/down-facing care-state experiments. The isometric base tests produced useful reference material, but custom states such as eat drifted into side/profile output anyway. Rather than fighting the toolchain, the game should now use the direction AutoSprite can generate consistently.

The production rule is:

```text
Build side. Test side. Ship side.
```

All current gameplay animation planning should assume clean side-view sprites, autonomous Moonbot movement inside a bounded stage, left/right visual logic, and mirrored movement where practical.

## V2 Production Focus

The V2 art direction pushes Moonbot larger and more readable on mobile/Telegram. The character should use roughly one third of the mobile stage height when active, with oversized readable props and strong neon contrast.

Production staging should include:

- Bigger Moonbot scale on screen.
- More stage travel during action flows.
- Neon rooftop and city-stage backgrounds with horizontal exploration.
- Prop-heavy interactions for food, toys, cleaning, rest/music, and training.
- Bold props such as burgers, hotdogs, pizza, drinks, toys, beds, dumbbells, boomboxes, and cleaning tools.
- Occasional funny chaos moments such as food drones, giant food events, flying props, and oversized burgers.
- Mobile-first readability over dense detail.

## Autonomous Pet, Not Player-Controlled Platformer

Side-scroller describes the visual format, not the control model. Moonpet remains an autonomous virtual pet.

Users do not directly move the pet with left/right/jump controls. There should be no Mario-style keyboard movement, collision-platforming gameplay, manual jumping, or combat loop.

The correct interaction model is:

- The user presses care/action buttons.
- Moonbot performs the selected action animation.
- Moonbot may move left/right automatically inside the stage during that action.
- Moonbot may walk, run, jump, play, eat, sleep, clean, or train inside the viewport as scripted autonomous behavior.
- After the action completes, Moonbot returns to idle.

Examples:

- Eat button: Moonbot walks to snack or bowl, eats, then returns to idle.
- Play button: Moonbot runs or bounces toward a toy, plays, then returns to idle.
- Clean button: Moonbot moves to a cleaning area, plays bubbles/polish animation, then returns to idle.
- Sleep button: Moonbot walks to a sleep spot, lies down, and sleeps.
- Train button: Moonbot walks to a training spot and performs a non-combat train animation.

Prop-chaos examples:

- A food drone teases Moonbot with a burger, then drops it near the food spot.
- A burger grows oversized for a few seconds.
- A giant burger briefly swallows Moonbot as a comedy beat, then resets and returns Moonbot to normal.
- Toys bounce through the lane during play, while Moonbot reacts autonomously.
- Cleaning props throw bubbles across the scene, then clear.

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
- Use the black visor, pink LED eyes, glossy white robot body, mitten hands, chunky robot feet, and soft shaded chibi cyber mascot style.
- Prioritize big silhouettes and mobile readability.
- Let props drive actions, staging, and comedy beats.
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

## Side Idle Generation Foundation

The first side-scroller generation target is `side_idle` only. It uses the existing AutoSprite character `MOONBOT PET VISOR V1`, requests the built-in `idle` animation kind, and writes temporary review artifacts to:

```text
output/moonpets/side-scroller/side_idle.png
output/moonpets/side-scroller/side_idle.json
output/manifests/moonpet-side-scroller.generated.json
```

Dry-run locally without calling AutoSprite:

```bash
npm run moonpet:side:dry
```

Manual GitHub Actions generation uses:

```text
phase: generate-side-scroller
side_animation_id: side_idle
execute_side_generation: true
```

Keep `execute_side_generation` false for validation-only runs. The side-scroller generator does not approve or promote output automatically.

## Overnight Autopilot

The side-scroller autopilot can run the planned production sequence while still stopping safely on the first failed gate:

```text
side_idle -> side_walk -> side_run -> side_eat -> side_sleep -> side_play -> side_clean -> side_train -> side_hurt
```

For each animation it confirms the queue item exists, performs a dry-run validation, optionally calls AutoSprite when `execute_side_generation=true`, runs mechanical review, writes `output/manifests/moonpet-side-scroller-autopilot.generated.json`, and continues only when the current animation passes. Mechanical review is not final visual approval.

Generated review artifacts stay temporary unless promotion is explicitly enabled:

```text
auto_promote_side_scroller_assets: false
```

When promotion is enabled, passing assets are copied to `/img/moonpets/moonbot-pet-visor-v1-side/` for later preview/review. Live game integration is still a separate future task.

Local validation-only run:

```bash
npm run moonpet:side:autopilot:dry
```

## Testing Before Live Integration

Before any live-game change:

- Run `npm run moonpet:side-queue:check`.
- Run `npm run moonpet:side:dry`.
- Run `npm run moonpet:side:autopilot:dry`.
- Confirm the queue contains only side-scroller states.
- Confirm no side-scroller asset is approved or promoted by default.
- Preview promoted side assets in a sandbox or runtime preview page.
- Verify side idle, walk, run, jump, eat, sleep, play, clean, train, and hurt frame timing.
- Verify action-button flows, not player movement controls.
- Confirm no keyboard/platformer control path was introduced.
- Confirm the existing live game still runs with its current renderer.

Live integration is a later controlled task. Do not modify `moonpet-game.html`, `js/moonpet-mini-app.js`, or `css/moonpet-mini-app.css` for this foundation step.
