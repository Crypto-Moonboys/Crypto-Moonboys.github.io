# Moonpet Side-Scroller Preview

The side-scroller preview is a static, preview-only page for testing the Moonpet autonomous action-flow model before any live game integration.

Open:

```text
moonpet-side-scroller-preview.html
```

## Purpose

This page proves the new production model from `Moonbot Side-Scroller Update - Sprite Bible V2`:

- Moonpet is the game/system name.
- Moonbot is the art subject.
- Gameplay remains autonomous and button-driven.
- Side-scroller means side-view camera, side-view sprites, side-view environment, and a bounded left/right movement lane.
- Side-scroller does not mean player-controlled platforming.
- Moonbot should be large, mobile-readable, and staged with bold props.

## What The Preview Shows

The preview uses a procedural placeholder Moonbot because side-scroller sprites have not been generated yet. It intentionally makes Moonbot much larger than the first preview pass and lets it travel across more of the rooftop stage. It shows a neon rooftop stage with action buttons:

- Idle
- Eat
- Play
- Clean
- Sleep
- Train

Each button starts a scripted flow:

- Idle: Moonbot idles near the centre.
- Eat: Moonbot detects food, walks across the stage, meets food drones, triggers a giant burger gag, eats, reacts, then returns to idle.
- Play: Moonbot runs or bounces toward the toy, plays with moving props, then returns to idle.
- Clean: Moonbot walks to the cleaning spot, plays bubbles/polish animation with sponge/soap props, then returns to idle.
- Sleep: Moonbot walks to the bed spot and sleeps.
- Train: Moonbot walks to the training spot, performs a non-combat train animation, then returns to idle.

The prop planning shown here includes burgers, hotdogs, pizza, donuts, soda, beach balls, bubbles, dumbbells, beds, sponge/soap, food drones, and a giant food event. These are preview-only procedural props, not generated assets.

## Control Model

There are no direct movement controls. The page does not bind keyboard movement, jumping, or platformer controls. Users select care/action buttons and the Moonbot moves automatically inside a bounded stage.

The preview intentionally has:

- No keyboard/player movement controls.
- No player-controlled jump.
- No collision-platforming gameplay.
- No combat loop.

## Future Use

When generated side-scroller sprites exist, this preview can be adapted to render promoted sheets from:

```text
/img/moonpets/moonbot-pet-visor-v1-side/
```

Until then, the procedural Moonbot keeps the action-flow model testable without AutoSprite, generated assets, or live game changes.

## Safety

This preview does not modify:

- `moonpet-game.html`
- `js/moonpet-mini-app.js`
- `css/moonpet-mini-app.css`

It does not call AutoSprite and does not generate assets.
