# Moonpet Runtime Sprite Audit

This audit maps the current Telegram Moonpet runtime before side-scroller art is installed. It prevents preview-only or mechanical-pass-only work from being treated as a complete live build.

## Current Runtime

- `moonpet-game.html` is the current Telegram mini-app page.
- `js/moonpet-mini-app.js` owns the canvas renderer, action routing, feedback states, and feature-flagged legacy approved-sprite hook.
- `css/moonpet-mini-app.css` constrains the app to a mobile/Telegram layout.
- The current production default is still the procedural canvas renderer.
- The existing `MOONPET_USE_APPROVED_SPRITES` / `?approvedSprites=1` path is default-off and currently targets the older isometric/down-facing approved assets.

## Action Modes Found

The current runtime maps live actions into these animation families:

- `idle`
- `feed`
- `play`
- `clean`
- `sleep`
- `train`
- `travel`
- `work`
- `equip`
- `evolve`
- `trade`
- `celebrate`
- `interact`
- `blocked`
- `battle`

The current runtime does not use player-controlled platformer movement. Jump is not a current live input requirement. Up/down directional sprites are not required for the current side-scroller plan. Left/right travel should use right-facing side-view sheets plus safe mirroring when needed.

## Generated Side-Scroller Batch

GitHub Actions run `35967240742` generated nine side-scroller sheets and mechanical review passed for all of them. Mechanical pass does not equal visual approval.

Visual audit decisions:

- Candidate visual pass: `side_idle`, `side_walk`, `side_run`, `side_eat`, `side_clean`, `side_train`
- Visual reject: `side_sleep`, `side_play`, `side_hurt`

Rejected reasons:

- `side_sleep` looks like a standing/idle sheet, not a sleep pose with bed, pillow, or ZZZ.
- `side_play` does not show an obvious toy, ball, or play prop.
- `side_hurt` looks neutral/idle-like and does not show cartoon hurt, dizzy, sparks, or stars.

## Coverage Gaps

The nine generated side-scroller sheets are not enough for the full current runtime. These live modes still need approved side-scroller art or an explicit intentional fallback before side sprites can become the default:

- `work`
- `equip`
- `evolve`
- `trade`
- `celebrate`
- `interact`
- `battle`

Battle deserves special care: the new Moonpet direction is an autonomous Moonbot visual format, not a combat loop. Arena/Kaiju currently exist in the live UI, so that path needs a non-combat feedback strategy or procedural fallback until a proper side-scroller treatment is approved.

## Rule Before Install

Do not enable side-scroller sprites in the current live build until:

- rejected generated sheets are regenerated or replaced
- missing live action modes have approved art or deliberate fallback mapping
- public runtime paths exist under `/img/moonpets/moonbot-pet-visor-v1-side/`
- a side-scroller renderer/loader is tested behind a flag
- mobile/Telegram smoke tests pass

The machine-readable requirement map lives in `data/moonpet-runtime-sprite-requirements.json`.
