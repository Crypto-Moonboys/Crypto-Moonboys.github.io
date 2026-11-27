# Automatic runtime image pipeline

Upload and preserve the largest clean master available. The website and games must load a separately generated WebP derivative rather than downloading the master and shrinking it in the browser.

## Zero-touch default

1. Work on a feature branch, never `main`.
2. Name new artwork `name-master.png`, `name-master.jpg`, `name-master.jpeg` or `name-master.webp`.
3. Push the branch.
4. **Runtime Image Derivatives** registers the master, creates `name-runtime.webp`, updates the lock file and commits the generated files back to that branch.
5. Wire the game or page to `name-runtime.webp`. Keep the master in the repository.

The automatic default preserves the source dimensions. Sprite sheets, atlases, pixel art, UI, icons and logos default to lossless WebP. Other art defaults to high-quality lossy WebP with lossless alpha.

## Non-negotiable repository rule

Every pull request receives the required **Runtime Image Policy** check. Any newly added or modified PNG, JPG, JPEG or WebP must be either a registered `*-master` source or its declared `*-runtime.webp` output. Legacy raster names, unregistered masters, hand-made runtime files, stale derivatives, missing lock state and failed quality checks make the PR fail.

The `main` branch ruleset must require a pull request and the **Runtime Image Policy** check with no human/admin bypass. Human direct commits to `main` are therefore rejected before they land. The check also runs after `main` pushes as evidence and defence in depth. If the generator commits a derivative with GitHub's workflow token, it explicitly dispatches the policy workflow for that generated head because token-authored pushes do not create follow-up workflow events. Automated operational actors may receive only the minimum explicit bypass needed for their existing non-image jobs; they do not bypass the runtime image check on pull requests.

The browser cannot safely determine the required source resolution from CSS or canvas display size. Close zoom, high-density screens and sprite frame geometry make that guess unsafe. When the runtime copy should be smaller than the master, declare the required dimensions in [runtime-image-manifest.json](../data/runtime-image-manifest.json):

```json
{
  "source": "games/example/runner-master.png",
  "output": "games/example/runner-runtime.webp",
  "mode": "lossy",
  "quality": 86,
  "width": 2000,
  "height": 2000,
  "preserveAlpha": true,
  "minPsnr": 34,
  "minSavingsPercent": 20,
  "sprite": {
    "columns": 4,
    "rows": 4
  }
}
```

Both source and target dimensions must divide cleanly by the declared sprite grid. The pipeline rejects aspect-ratio changes, clipped paths, output names without `-runtime.webp`, changed alpha, stale derivatives and files that miss the configured saving or quality floor. Animated or multi-frame masters are rejected instead of being silently flattened; keep animations on their dedicated animation workflow until frame timing and loop metadata can be preserved end to end.

## Commands

```bash
npm run images:runtime
npm run images:runtime:check
npm run test:runtime-images
```

To register one or more conventionally named masters locally:

```bash
node scripts/build-runtime-images.mjs --register "games/example/runner-master.png"
npm run images:runtime
```

The builder prints the source size, runtime size, saving, dimensions and measured PSNR. Lossless entries report `lossless` instead of a PSNR value. Generated state is recorded in [runtime-image-lock.json](../data/runtime-image-lock.json), allowing checks to detect a changed master, manifest setting or runtime file.

## Automatic workflow boundary

The narrowly scoped generator runs only for repository-owner pushes to non-production branches that change a `*-master` image, the runtime manifest or the pipeline itself. The separate read-only policy check runs on every PR but exits before dependency installation when no raster or pipeline file changed. Neither workflow runs the broad CI suites, merges a PR, publishes Pages or deploys a Worker. GitHub Actions receives no image-service keys or application secrets.

If a conversion is not materially smaller, fails its quality floor or cannot preserve sprite geometry, the job stops and reports the exact asset. The master remains untouched.
