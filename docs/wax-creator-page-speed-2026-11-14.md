# JOIN US ON THE WAX BLOCKCHAIN — mobile PageSpeed remediation (14 Nov 2026)

**Baseline:** the saved mobile PageSpeed Insights HTML for `https://cryptomoonboys.com/`, captured at 09:40 UTC on 14 Nov 2026. That snapshot was made **before** PR #1782 moved the heavy homepage content to `/join-us-on-the-wax-blockchain.html`. The report is a diagnostic baseline, **not** a fresh test of the second page.

## Specific audit findings and relevant fixes

| Saved report finding | Original diagnostic observation | Change in this PR | What remains |
| --- | --- | --- | --- |
| Enormous transfer weight | 42,612 KiB total; the Marilyn Graffiti MP4 alone was ~21,620 KiB | MP4 `<source>` has `data-src`, never `src` until the visitor presses Play; native playback still uses the original full-resolution source | Re-run live PageSpeed; browser controls and poster must be visually checked |
| Unused third-party JavaScript | ~5,216 KiB estimated unused JS, dominated by five YouTube embeds (plus Rumble) | Six iframe embeds have inert `data-src`; lightweight clickable video thumbnails with 16:9 reserved dimensions load their specific iframe only on activation | A YouTube thumbnail still requires a small third-party image request; only the clicked provider loads |
| Main-thread JS | ~20.6 seconds reported main-thread work, with multiple YouTube player scripts among top consumers | Removes YouTube/Rumble player startup CPU and network work from the initial render | Game/UI shell and builder JS remain; measure whether further splitting is justified |
| Image dimension / layout instability | Gallery and full-width artwork were reported without dimensions | Adds the actual source image width/height to 26 HTML image elements, including both marquee sets. Source dimensions were read from existing GitHub image blobs, not estimated | One large Graffiti Kings PNG remains unmeasured; some reported CLS also came from the former splash route, now retired |
| Image transfer efficiency | ~8,417 KiB potential savings in old report, including Bad Days artwork | First gallery image switched from eager to lazy, and the video placeholders load only lightweight thumbnails | JPEG-to-WebP/AVIF and responsive variants are **not** part of this PR; old Bad Days images are now on a different route |

## Behavior and safety

The user must **click Play** before any video provider iframe or large MP4 source becomes network-active. YouTube/Rumble iframes are still present in the document as hidden, title-bearing elements, but without a `src` until activation. An allowlist limits iframe activation to HTTPS YouTube or Rumble embed URLs. The MP4 source is local and validated by pathname before loading. All video titles, sources, playback affordances and original editorial sections are preserved.

The scrolling gallery, source artwork, Moonboy Builder, WAX links, site shell, gameplay, login and economy logic are otherwise unchanged. No backend, Worker, D1 or migration changes.

## Verification

New `scripts/wax-video-performance.test.mjs` checks inert initial sources, six dedicated player buttons, the MP4 button, URL allowlist and single-player activation. The visual browser hero test now checks no startup video `src` and tests click-to-load. Both are wired into the visual CI group.

Commands:

```bash
node --test scripts/wax-video-performance.test.mjs
node scripts/homepage-hero-parity.test.mjs
node scripts/homepage-build-moonboy-hero.test.mjs
npm run test:avatar-builder
npm run seo:test
node scripts/prepare-pages-artifact.mjs public-site
npm run seo:audit -- --root public-site
npm run ci:visual
```

**Important:** source checks and syntax checks are not equivalent to full browser CI. Test the live page on desktop/mobile to ensure the button launches exactly its own player and that the Marilyn video plays via the native controls.

**Success criterion:** after merge and deploy, run a **fresh mobile PageSpeed Insights** report on `https://cryptomoonboys.com/join-us-on-the-wax-blockchain.html` and compare transfer size, YouTube CPU, LCP, TBT and CLS to the historical homepage report. Do not claim a new numeric score until measured. Stage 2 can generate responsive WebP/AVIF variants and audit remaining CSS/JS.

This PR must remain open until automated checks and manual playback tests pass. It does not touch the separate draft Moonpet PR #1783.
