# Telegram Moonboy media — PR1 foundation (NOT live)

Parent issue: #1726.

## Reused source of truth

- Homepage `index.html` renders `js/avatar-builder-test.js`.
- The authoritative builder catalog is `data/avatar-builder-manifest.json` (version 1).
- Nine drawing categories, bottom-to-top: `background`, `body`, `tattoos`,
  `clothes`, `chains`, `face`, `hat`, `left-arm`, `right-arm`.
- One static image selected from **each of the nine** categories. The shipped
  catalog has **912 static WebP layers** and **12 animated canvas backgrounds**.
  PR1 excludes animated-only backgrounds because they do not contain a
  compositable full-size still layer. Never substitute animated thumbnails
  for full 1,000 × 1,000 builder layers.
- The homepage builder uses 1,000 × 1,000 aligned WebP layers. PR1 uses the
  same files and stacking order, scaling every layer uniformly to 640 × 640.

## Files and behaviour

`workers/moonboys-api/telegram/moonboy-portrait.js` provides three functions:

- `loadHomepageMoonboyManifest(fetchImpl)`: reads only the fixed HTTPS manifest
  location, validates catalog version/category order, maximum 2,000 traits
  and absolute byte limit of 600 KB.
- `chooseTelegramMoonboyTraits(manifest, seed, cryptoImpl)`: cryptographically
  hashes a stable logical-message seed independently for each builder category,
  then selects exactly one static trait in each. Input is deterministic and
  bounded; it does not change the website builder.
- `composeTelegramMoonboy({images,manifest,seed,fetchImpl,cryptoImpl})`:
  fetches only validated paths on `https://cryptomoonboys.com` with redirects
  rejected. Each of nine WebP layer inputs must be no more than 850 KB;
  compositing is performed in source order using the Cloudflare **Images
  binding** `.input().transform().draw().output()` pipeline. It returns a
  flattened 640px JPEG with bounded retries at 76/62/48 quality and a **hard
  final byte limit of 500,000 bytes**. Oversize or failed inputs throw.

The module performs **no Telegram sends, no D1 writes, no signing and no
wallet calls**. This PR does not add `[images] binding = "IMAGES"` to
`wrangler.toml` or enable paid transformations, a new endpoint or a feature
flag. The module is not called by the production Worker.

## Validation

Run the focused suite:

```powershell
node --test scripts/telegram-moonboy-portrait-pr1.test.mjs
echo $LASTEXITCODE
```

It checks the actual homepage manifest, nine source-backed categories,
deterministic selection, animated-background exclusion, wrong IDs/paths,
oversized source/manifest/output payloads, the order of all eight overlays,
output JPEG dimensions/size, missing bindings and disabled live integration.

**Known remaining verification:** This is a mocked Images binding test and
does not prove Cloudflare's real image codec behaviour. The photo should
receive a separate visual parity check and high-fidelity Images binding test
before enabling it. The Workers local low-fidelity Images emulator does not
support all overlay features. Billing may apply to each unique transformation
when the binding is enabled; separately approve cost and provision it before
PR2/3 integration.

## Next PRs required before any bot gets images

- **PR2 — Transport:** Telegram `sendPhoto`, multipart/form-data or approved
  hosted picture, photo caption limit handling, exact chat/topic routing,
  text fallback on *definitive* photo failure, and no duplicate send after an
  uncertain timeout. Keep existing photo attachments intact.
- **PR3 — Coverage:** audit all controlled text-only message classes, wire
  through a shared transport behind an OFF-by-default flag, stage a private
  Telegram chat canary, and verify retained messages/formatting/keys.
- **PR4 — Cost and caching:** verified `file_id` reuse, bounded rendering
  costs, stable image cache keys, telemetry, and broader rollout with
  explicit owner approval.

The current issue remains open until **all** bot-controlled text-only messages
covered by the spec get a picture without interfering with existing media.
Do not deploy, merge, provision paid bindings or change production without
owner sign-off.
