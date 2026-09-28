# Pet background

Hatched pets use the owner-uploaded `/img/BITTY BACKGROUND.jpg` as a static,
full-canvas background. Its 1280 × 880 dimensions match the 16:11 game canvas,
so the whole image fills the logical 320 × 220 world without cropping or borders.
Cover fitting preserves the aspect ratio if a future image has different dimensions.
The pet is drawn on top. The image is decoded once and reused.

The previous space sprite sheet is no longer loaded or animated.
Stage 0 and the hatch transition retain their existing secret-bot background.
While loading or on failure, the procedural background remains available.
Reduced-motion users receive a redraw when the image loads.

`MoonpetBetaAppearance.getBackgroundArtState()` reports mode
`bitty_background` and the image source once drawn.

The existing Mini App tests cover full-image drawing, aspect-ratio fitting,
single loading, reduced-motion redraw and failure fallback. Mobile browser
tests verify the real image on the hatched pet and preserve the egg background.
Run `npm test` before merge.

Deployment: GitHub Pages only. No Worker deployment, migration or VPS restart.
Reopen the Mini App after Pages publishes the cache-versioned client.
