# MoonPet grounded street stage

Roadmap [#1478](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/issues/1478), C1 / H39. Baseline `af44dfa2bdb3635cbb62c71ac2db1aeedb399d07`, including merged Kaiju guidance from #1480.

## Verified gap and implementation

The loaded street-wall backdrop showed the hatched bot at the bottom canvas
edge, with no floor plane. The update paints a static paved strip in the bottom
22 logical pixels, before equipment effects and the companion sprite. A small
pixel contact shadow appears only once companion art is ready. The existing
320×220 logical canvas and readability shim handle mobile/desktop scaling.

The sprite remains at its existing baseline (219), center (160), fit box
(184×184) and pivot. The floor never paints over the sprite, changes its source
aspect ratio, alters the identity reveal, or moves the tap hitbox. The original
street-wall image, bot registry and sprite assets are reused. Paving uses 28
bounded rectangles and the contact shadow adds three; no new image request,
animation loop, timer, polling or gameplay action is introduced. Canvas state
is saved/restored so shadow opacity cannot leak into the companion.

Grounding is enabled only for an adopted pet with a hatched lifecycle and a
successfully loaded street backdrop. The egg chamber and hatch transition stay
untouched. A loading or failed street image retains the retro-space fallback
with no pavement. Missing pet/lifecycle data and unadopted screens do not invent
a grounded companion. Scene diagnostics clear the old floor when the scene
changes. Owned Style Lab trails and foreground frames retain their render order.

## Validation and release

Passed locally: Mini App rendering/authority tests; multi-bot registry and art
architecture; 31 art-loading/lifecycle tests; 84 action-guidance tests; 15 shared
guide/mission tests; player-loop and guide-sync checks; canon checks and graph
publishing integrity. The full Worker/SQLite game browser suite passed at
360/390px, with actual floor pixel checks from core state also at 1280px.
Mobile and desktop screenshots were inspected.


Executable Mini App tests check bounded paving/shadow geometry, opacity restore,
render order, pending art, hatch/egg presentation, missing backdrop, unadopted
views and unchanged save data. The existing real Worker/SQLite browser suite
checks the actual pavement pixel on the logical/rescaled canvas at 360/390/1280px,
preserves the sprite baseline/fit, verifies egg exclusion, and deliberately fails
and restores the street image to check fallback isolation. Existing lifecycle,
art-loading, registry and gameplay tests remain applicable.

Only the changed Mini App asset URL is versioned `20261011-street-floor-v1`.
Existing launcher URLs load the page and its new script. Pages-only release:
no Worker deploy, D1 migration, VPS change, new art file, economy or ownership
change. Rollback is a frontend revert with no saved-data rollback.

Signed production Telegram rendering is not verified in this session. After
release, check the loaded street backdrop at mobile/desktop widths, sprite feet,
SAY HELLO/tap, pet switching, eggs and hatch transition. H31 emotes, H43 tickle/
laugh and a persistent Pet House remain separate roadmap work; this floor is
presentation and does not claim to implement those systems. Keep #1478 open.
