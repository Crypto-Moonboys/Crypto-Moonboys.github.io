# Balloon Girl sprite repair — 24 October 2026

Both supplied PNGs already have real alpha. Neither needs colour-key removal.
The old walking colour key used RGB 0/0/0 from a transparent corner, deleting
the black dress, hair, legs and outlines. The release PNG has green RGB in
transparent pixels, which is also not an opaque background to remove.
This repair passes the original images directly to the renderer. No source
artwork, palette, transparency or sprite sheet has been rewritten.

## Verified source configuration

| Property | Walking | Release / burst |
| --- | --- | --- |
| Original | `bber-walk-v2.png` | `bber-sdgd-v1.png` |
| Dimensions | 512 × 512 | 512 × 512 |
| Grid / cell | 4 × 4 / 128 × 128 | 4 × 4 / 128 × 128 |
| Valid cells | 0–13; last two cells empty | 0–15; all occupied |
| Order | Row-major | Row-major |
| Frame interval | 100 ms, unchanged | 90 ms, unchanged |
| Reference person height | 93 source pixels | 54 source pixels |
| Uniform display scale | 52 / 93 | 52 / 54 |
| Body anchor X within cell | 62 | 38 |
| Vertical anchor | Bottom of occupied artwork | Bottom of occupied artwork (feet) |

Each cell's occupied alpha bounds are measured once at asset load. Rendering
crops those bounds without resampling or changing source pixels. The crop's
offset from the body anchor is preserved, so the balloon can travel without
recentering the person. Horizontal mirroring uses that same body anchor.
The ground anchor is `enemy.y + enemy.h + FOREGROUND_VISUAL_OFFSET_Y`.
The display remains nearest-neighbour and uniformly scaled in both axes.

The person measured 50.32–52.96 game pixels tall across all rendered poses.
The old fixed 96-pixel cell rendered the walking person about 68–70 pixels tall
but the release person only about 40–41 pixels tall. Both now fit the existing
52-pixel combat height. Collision dimensions remain 42 × 52; the balloon is
visual artwork, not an additional hitbox.

## Visual evidence inspected

The images below are captures of the actual browser/runtime, not a substitute
renderer. The source comparison additionally replays the intercepted runtime
draw arguments on a neutral background beside the untouched source cell.

| Evidence | Screenshot |
| --- | --- |
| Original walking/release frames beside actual render crop/scale, including light details and both walking directions | [Source versus render](source-vs-render.png) |
| Desktop layout: walking then release | [Desktop layout](desktop-layout.png) |
| Desktop animation switch, directly adjacent game frames: walking above, release below | [Desktop switch](desktop-switch.png) |
| Desktop two full release/burst cycles | [Desktop cycles](desktop-two-cycles.png) |
| Desktop unchanged collision rectangle and visible foot line (green diagnostic overlay) | [Desktop alignment](desktop-collision.png) |
| Mobile page layout: walking on left, release on right | [Mobile layout](mobile-layout.png) |
| Mobile adjacent animation switch frames | [Mobile switch](mobile-switch.png) |
| Mobile two full release/burst cycles | [Mobile cycles](mobile-two-cycles.png) |
| Mobile unchanged collision rectangle and visible foot line | [Mobile alignment](mobile-collision.png) |

Cycle sheets read left-to-right, top-to-bottom: the first four rows are cycle 1,
frames 0–15 facing left; the next four rows are cycle 2, frames 0–15 facing right.
Each tile is a crop of the actual game screenshot around Balloon Girl.
Both sources were also inspected against a light grey background before editing.
The dark clothing and small light highlights in the evidence match the supplied
artwork. No white clothing has been invented or painted over the original dress.

## Actual verification

- `npm run test:nbg-level1` — PASS, complete existing Level 1 browser suite,
  including speed boxes, Graffbot fire, triple-jump backflip, collision/combat,
  finite balloon releases, XP and desktop/mobile regressions.
- `node scripts/nbg-balloon-rendering-validation.mjs` — PASS, real Chromium
  desktop 1280 × 800 and mobile emulation 390 × 844 with touch start.
  Captures 14 walking frames in both directions and every release frame in
  each of the two cycles; confirms no third release, defeat and one XP award.
- Browser-decoded source versus runtime RGBA — zero changed pixels in both
  images, on both viewports. Walking retains 1,310 light pixels, 22,142 dark
  pixels and 6,131 partially transparent pixels. Release retains 393 light,
  3,937 dark and 6,552 partially transparent pixels.
- Per-draw assertions — uniform aspect ratio, body-height range, stable body
  anchor, feet on ground and unchanged 42 × 52 collision dimensions.
- `node --test scripts/nbg-london-replay.test.mjs scripts/nbg-london-source-trust-gate.test.mjs`
  — PASS, seven tests. The deterministic fixture awarded 8,346 XP once in each
  viewport; the unchanged reward range remains 10–10,000.
- `node --check game/nbg-level1.js` and the new validation script — PASS.
- `git diff --check` — PASS.

Raw measurements are in [results.json](results.json). To recapture evidence,
run the new validation command from the repository root after `npm ci` and
installing Chromium with Playwright. It writes to `output/nbg-balloon/` by default;
`NBG_BALLOON_OUTPUT` can override that directory.

Local verification used Chrome on Windows. Mobile coverage is browser emulation,
not a physical handset test. Hosted CI and GK's final visual review remain pending
when this report is prepared. No merge or deployment has been performed.

Original asset SHA-256 values:

```text
bber-walk-v2.png  8b504068718ced7c0998ce399932098e7d152367e4729a17368680f77da338ea
bber-sdgd-v1.png  f7b931eee5ef81e6bddfcc3b9c72f3549ecb95133f8f393468e3ee660fa5bca3
```
