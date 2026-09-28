# Custom space background

Source: `/img/bg-bg23999-v1.png`, uploaded to main by the owner. The PNG is
unchanged by this integration.

The export is 1280 × 1280: a row-major 5 × 5 grid with 256 × 256 cells. The useful
landscape artwork fits inside a fixed 256 × 176 region starting at cell-local
`(0, 40)`. Drawing that region at 320 × 220 preserves the game's 16:11 world ratio
without stretching the square padding or clipping the visible artwork.

Playback uses zero-based frames `0, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
20, 21, 22, 23, 24`, at 250 ms per frame (4 FPS; 4.25 seconds per loop). Frames
1–8 are visibly pale grey compared with the blue/purple source and are excluded
to avoid a large brightness jump. The original 25-frame sheet remains intact.

The export has transparency rather than an opaque starfield. Each render clears
to dark navy, draws a subdued static starfield, then draws the selected cell.
The pet stays on top. The image is loaded once per page, with pixel smoothing
disabled for its draw. No separate animation timer is added.

This is the shared background for hatched pets across all six game screens.
Stage 0 and the hatch transition retain the existing secret-bot background.
Reduced motion always selects frame 0 and redraws after the image finishes
loading. While loading, on failure, or if dimensions differ from the expected
sheet, the existing procedural space background remains available.

`MoonpetBetaAppearance.getBackgroundArtState()` exposes the current source,
selected frame, loop duration and reduced-motion state for inspection.

Validation lives in the existing Mini App regression and mobile browser suites:
crop coordinates, frame order/wrap, transparent clearing, single loading,
reduced-motion completion, broken/wrong-sized fallback, and real image playback
in the game at 390 × 844 and 360 × 640. Run `npm test` before merge.

Deployment: GitHub Pages only after merge. No Worker deployment, database
migration or VPS restart. Reopen the Mini App after Pages publishes the updated
HTML and cache-versioned client script.
