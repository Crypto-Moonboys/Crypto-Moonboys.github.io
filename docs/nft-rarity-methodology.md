# NFT Rarity Methodology: GKniftyHEADS vs NoBallGames

GKniftyHEADS and NoBallGames use the same broad adaptive weighted rarity framework while respecting the data each collection actually exposes. GKniftyHEADS currently has richer rarity/variation metadata. NoBallGames can have thinner metadata, so missing trait weight moves to live supply scarcity instead of fake traits. Both trackers use AtomicAssets as source of truth, ignore marketplace price for rarity scoring, preserve original mint numbers, and calculate surviving mint rank separately.

The important collector framing is not that the collections have two unrelated rarity philosophies. Both collections use the same broad adaptive weighted rarity framework and share the same collector goal:

1. Template / edition rarity
2. Asset / numbered-print rarity

The difference is how much usable metadata each collection currently exposes and how each tracker currently stores and surfaces the data. GKniftyHEADS currently has richer rarity/variation metadata. NoBallGames may have thinner metadata, but it still ranks fairly because missing trait weight is reassigned to live supply scarcity instead of fake traits.

## 1. What this tracker is

The GKniftyHEADS and NoBallGames pages are collection intelligence pages, not marketplace price pages.

Live tracker pages:

- `/wiki/gkniftyheads-nft-collection.html`
- `/wiki/noballgamess-nft-collection.html`

Tracker data folders:

- `data/gkniftyheads/`
- `data/noballgamess/`

The trackers help collectors compare templates and assets using on-chain supply, AtomicAssets metadata, asset state, trait exposure, mint position, and holder context where available. They can help identify stronger versions based on scarcity, live supply, traits, original mint number, surviving mint rank, and whether an asset is currently live/unburned.

They do not predict price. They do not use floor price, listings, market cap, volume, or sales in rarity scoring.

## 2. Source of truth rules

AtomicAssets is the source of truth for:

- collection name
- template IDs
- issued supply
- live supply checks
- asset IDs
- owner
- burned state
- template mint/original mint number
- immutable metadata
- image fields
- surviving mint rank inputs

AtomicHub is a marketplace/reference link only. It is not the scoring source and it is not the rarity source of truth.

NFTHive/HiveBP market analytics, when present, are display-only. They are not rarity inputs, not `final_score` inputs, and not `weighted_rarity_score` inputs.

Static JSON files are scheduled tracker output, page fallback data, and an audit trail. They let the static site render even when the live Worker/API layer is unavailable.

The WAX Bridge, when present, is a read-only Web2 REST facade. It is not a replacement for rarity scoring, not a transaction/signing layer, and not a claim or staking flow.

## 3. Shared rarity goal

Both GKniftyHEADS and NoBallGames are judged around the same collector logic:

- live surviving supply matters
- original mint number is permanent
- burns do not renumber NFTs
- surviving mint rank is separate from original mint number
- a high original mint can become very important if lower mints are burned/missing
- marketplace price, floor, sales, listings, market cap, and volume are not rarity inputs

The tracker separates edition-level scarcity from exact-asset scarcity so collectors can ask two different questions:

- Which template or edition is stronger?
- Which exact NFT inside that template is stronger?

The shared template scoring framework starts from this base formula:

```text
final_score =
  supplyScore * 50
+ rarityScore * 25
+ variationScore * 20
+ burnScore * 5
```

Where:

- `supplyScore` = live surviving supply scarcity
- `rarityScore` = rarity trait/name exposure scarcity where meaningful metadata exists
- `variationScore` = variation trait/name/metadata exposure scarcity where meaningful metadata exists
- `burnScore` = missing/burned supply bonus where supported by tracker data
- marketplace price/floor/sales/listings/market cap/volume = 0% and never used

Adaptive weighting protects thin metadata. If rarity metadata is missing, generic, repeated, or not meaningful, its 25% weight moves to live supply scarcity. If variation metadata is missing, generic, repeated, or not meaningful, its 20% weight moves to live supply scarcity. The tracker does not invent fake traits, does not treat `Not supplied` as rare, and does not use title/name fallback as weighted trait scoring by default.

Adaptive cases:

| Case | Supply | Rarity | Variation | Burn |
|---|---:|---:|---:|---:|
| Rarity and variation both meaningful | 50 | 25 | 20 | 5 |
| Rarity meaningful, variation missing/thin | 70 | 25 | 0 | 5 |
| Variation meaningful, rarity missing/thin | 75 | 0 | 20 | 5 |
| Rarity and variation both missing/thin | 95 | 0 | 0 | 5 |

Burns increase rarity through lower live supply and a small burn/missing bonus when tracker data supports it. If live supply is not counted and only issued-supply fallback exists, burn scoring is not invented.

## 4. Two rarity layers

### Layer 1: Template / edition rarity

Template / edition rarity compares template editions against other template editions.

Inputs can include:

- live supply scarcity
- issued supply
- rarity trait/name scarcity where real metadata exists
- variation trait/name scarcity where real metadata exists
- missing/burned supply bonus where supported by tracker data
- utility/open/unissued separation

### Layer 2: Asset / numbered-print rarity

Asset / numbered-print rarity compares exact NFTs inside a template.

Inputs can include:

- asset ID
- original mint number
- surviving mint rank
- live/unburned status
- whether lower mints are burned/missing

Think of a template like a numbered art print run. A 10,000-edition print run works like NFT template mints. Print `#10,000` is normally not the strongest mint number. But if prints `#1` through `#9,999` are destroyed, print `#10,000` is still original `#10,000`, but it is now the only surviving print and surviving rank `#1`. If prints `#3` through `#9,999` are destroyed, print `#10,000` is still original `#10,000`, but surviving rank `#3` behind `#1` and `#2`.

Apply the same logic to NFTs:

- `original_mint_number` = permanent print number
- `surviving_mint_rank` = current live/unburned rank after burns
- burns never renumber the NFT

## 5. Core rarity terms

### Template

A template is an AtomicAssets NFT type. Many assets can exist under one template.

### Asset

An asset is an individual NFT owned by a wallet.

### Template ID

The permanent AtomicAssets ID for a template.

### Asset ID

The permanent AtomicAssets ID for one NFT.

### Issued supply

How many NFTs have been issued/minted under a template.

### Live supply

How many NFTs are currently live/unburned.

### Original mint number

The original AtomicAssets `template_mint`. Original mint numbers never change.

### Surviving mint rank

The NFT's rank among live/unburned NFTs in the same template after burns are excluded. This is separate from original mint number.

Example:

Original mints:

`#1`, `#2`, `#3`, `#4`, `#5`

If `#2` is burned:

- `#3` is still original mint `#3`.
- `#3` may become surviving mint rank `#2`.
- Burns do not renumber NFTs.

### Burned / missing supply

Burn/missing numbers are used only when supported by asset-state data. `pre_baseline_missing_or_burned` is a current supply delta from the first tracked baseline, not confirmed historic burn proof unless future snapshots prove disappearance after tracking began.

### Trait exposure

Trait exposure describes how common or uncommon a trait appears in the tracked collection data.

### Holder concentration

Holder concentration counts how many live assets are held by wallets.

## 6. Shared tracker architecture

Both trackers use the same broad architecture:

1. Template metadata cache
2. Live template supply cache
3. Template integrity audit
4. Asset-state cache
5. Asset refresh cursor
6. Surviving mint ranks
7. Template rarity output
8. Live asset rarity output
9. Trait exposure output
10. Holder leaderboard output where supported
11. Asset rarity leaderboard where supported
12. Sync status
13. Market analytics sidecar where present
14. Static wiki page render
15. GitHub Actions refresh

Important GKniftyHEADS files:

- `data/gkniftyheads/template-metadata-cache.json`
- `data/gkniftyheads/live-template-supply.json`
- `data/gkniftyheads/template-integrity-audit.json`
- `data/gkniftyheads/asset-state-cache.json`
- `data/gkniftyheads/asset-refresh-cursor.json`
- `data/gkniftyheads/surviving-mint-ranks.json`
- `data/gkniftyheads/template-rarity.json`
- `data/gkniftyheads/live-asset-rarity.json`
- `data/gkniftyheads/trait-exposure.json`
- `data/gkniftyheads/sync-status.json`
- `data/gkniftyheads/market-analytics.json` when present

Important NoBallGames files:

- `data/noballgamess/template-metadata-cache.json`
- `data/noballgamess/live-template-supply.json`
- `data/noballgamess/template-integrity-audit.json`
- `data/noballgamess/asset-state-cache.json`
- `data/noballgamess/asset-refresh-cursor.json`
- `data/noballgamess/surviving-mint-ranks.json`
- `data/noballgamess/template-rarity.json`
- `data/noballgamess/live-asset-rarity.json`
- `data/noballgamess/template-stats.json`
- `data/noballgamess/trait-exposure.json`
- `data/noballgamess/holder-leaderboard.json`
- `data/noballgamess/asset-rarity-leaderboard.json`
- `data/noballgamess/sync-status.json`
- `data/noballgamess/market-analytics.json` when present

## 7. Current GKniftyHEADS implementation

GKniftyHEADS currently has the fuller weighted template scoring model. The current scoring contract in `scripts/generate-gkniftyheads-rarity.mjs` and `data/gkniftyheads/template-rarity.json` uses this formula:

```text
final_score =
  supplyScore * 50
+ rarityScore * 25
+ variationScore * 20
+ burnScore * 5
```

| Component | Weight | Meaning |
|---|---:|---|
| `supplyScore` | 50% | Live supply scarcity. Lower live supply increases rarity. |
| `rarityScore` | 25% | Rarity trait/name exposure scarcity. Less common rarity traits score higher. |
| `variationScore` | 20% | Variation trait/name exposure scarcity. Less common variations score higher. |
| `burnScore` | 5% | Missing/burned supply bonus where supported by tracker data. |
| Marketplace price/floor/sales/listings | 0% | Never used in rarity score. |

GKniftyHEADS has strong `rarity_trait` and `variation_trait` data, so the tracker can use those fields directly.

GKniftyHEADS separates templates into:

- ranked fixed-supply templates
- utility/open mint templates
- unissued templates

The tracker is useful for finding:

- strongest fixed-supply templates
- scarce template IDs
- stronger rarity traits
- stronger variations
- live-supply scarcity
- templates affected by burn/missing supply checks
- utility/open mint templates that should not be compared directly to fixed-rarity templates

Duplicate or similar names/images may still be separate AtomicAssets template IDs. The page is a template rarity ranking, not a unique-artwork ranking.

## 8. Current NoBallGames implementation

NoBallGames uses the same broad adaptive weighted rarity framework while keeping its structured NoBallGames tracker files.

Current NoBallGames template ranking:

- separates ranked fixed-supply templates, utility/open mint templates, and unissued templates
- calculates adaptive `final_score` from live supply scarcity, real rarity/variation metadata where available, and supported burn/missing data
- sorts ranked templates with 1/1 templates first, then `final_score`, then `live_supply`, then `template_id`
- excludes price and market data
- uses AtomicAssets as source of truth

NoBallGames also has extra structured outputs that help inspect exact versions:

- asset-state cache
- surviving mint ranks
- holder leaderboard
- asset rarity leaderboard
- template stats
- trait exposure output where metadata supports it

NoBallGames may have thinner metadata than GKniftyHEADS. When useful rarity or variation fields are absent, those weights move to live supply scarcity. The tracker should not invent fake rarity fields or fake variation fields just to mirror GKniftyHEADS.

## 9. Comparison table

| Area | GKniftyHEADS | NoBallGames |
|---|---|---|
| Shared rarity goal | Live supply, original mint, surviving mint rank, no market scoring | Same |
| Current template scoring | Adaptive weighted model; current data usually keeps 50/25/20/5 | Adaptive weighted model; thin metadata shifts trait weight to supply |
| Trait/name weighting | Active `rarity_trait` and `variation_trait` exposure scoring | Only where real metadata supports it; do not fake fields |
| Asset-level ranking | Original mint and surviving mint rank are separate asset-level context | Original mint and surviving mint rank are strongly surfaced |
| Data outputs | Template rarity, live asset rarity, trait exposure, asset state | Template rarity, template stats, trait exposure, holder leaderboard, asset rarity leaderboard, asset state |
| Best use today | Find strongest template/trait/variation, then inspect asset mint | Find scarce template, then inspect exact asset/mint/surviving rank |
| Marketplace data | Display-only, not scoring | Display-only, not scoring |

GKniftyHEADS is currently better equipped for weighted template/trait/variation comparison because its metadata is richer. NoBallGames still uses the same adaptive framework and gives a strong path to inspecting exact assets, mint numbers, surviving mint ranks, holder context, and live asset state.

## 10. How to find the best version

### For GKniftyHEADS

Best version checklist:

1. Start with template ranking.
2. Check `final_score`.
3. Check live supply.
4. Check rarity trait/name.
5. Check variation trait/name.
6. Check missing/burned supply.
7. Then compare exact NFTs inside that template using original mint number and surviving mint rank.

Strong GKniftyHEADS example logic:

- Rank `#1` template with low live supply is generally stronger than a common/high-supply template.
- A rare variation can matter.
- A lower original mint can matter inside the same template, but does not override the whole template score by itself.

### For NoBallGames

Best version checklist:

1. Start with ranked fixed-supply templates.
2. Check live supply.
3. Check asset rarity leaderboard.
4. Check original mint number.
5. Check surviving mint rank.
6. Check whether lower mints are burned/missing.
7. Check holder/context outputs.
8. Do not treat marketplace price as rarity score.

Strong NoBallGames example logic:

- A low original mint from a scarce template can be stronger than a later mint from the same template.
- If lower mints are burned, surviving mint rank can make an asset more important among live NFTs.
- Holder concentration can make the collection context clearer, but does not equal price.

## 11. What the tracker does not do

This rarity tracker does not:

- give financial advice
- predict price
- use floor price in rarity scoring
- use market cap in rarity scoring
- use sales volume in rarity scoring
- use listing count in rarity scoring
- use last sale in rarity scoring
- use AtomicHub listing count in rarity scoring
- sign wallet transactions
- claim rewards
- stake NFTs
- replace AtomicAssets
- prove historic burns unless tracker data supports it

Price may matter to collectors in the marketplace, but it is not used by this tracker's rarity score.

## 12. Images and metadata

Images are pulled from AtomicAssets metadata fields. IPFS values are normalized for browser display. Raw CIDs, `ipfs://CID`, `/ipfs/CID`, and HTTPS URLs may all be normalized into usable browser URLs.

Local/static thumbnails or gateway URLs may be used depending on current implementation. Missing images should show placeholders, not broken rows.

Image display is separate from rarity scoring. A missing image should not change rarity maths.

## 13. Daily updates and fallback model

GitHub Actions refreshes tracker data. AtomicAssets data is cached into static JSON. Pages can render from static HTML/JSON. The WAX Bridge can provide clean read-only REST JSON. If the Worker/API fails, pages fall back to static JSON. Previous good data is preserved where designed.

Feed status may show `ok`, `degraded`, `error`, or `pending`.

`degraded` does not always mean data is unusable. It often means fallback/static data is being used. Error in optional market analytics should not break rarity data.

## 14. WAX Bridge relationship

The WAX Bridge:

- is a read-only REST facade
- lives in the Worker/API layer
- helps Web2 pages consume clean WAX JSON
- normalizes AtomicAssets data
- normalizes image URLs
- can verify ownership read-only if implemented
- does not change rarity scoring
- does not replace static tracker JSON
- does not add frontend Node, Anchor SDK, eosjs, or wallet signing

Static tracker JSON remains the fallback, audit trail, and scheduled generated output.

## 15. Developer notes

GKniftyHEADS scripts:

- `scripts/update-gkniftyheads-template-metadata-cache.mjs`
- `scripts/update-gkniftyheads-live-supply-cache.mjs`
- `scripts/update-gkniftyheads-asset-state-cache.mjs`
- `scripts/generate-gkniftyheads-rarity.mjs`
- `scripts/update-gkniftyheads-rarity-feed.mjs`
- `scripts/gkniftyheads-rarity-ranking.test.mjs`
- `scripts/gkniftyheads-staged-rarity-pipeline.test.mjs`

NoBallGames scripts:

- `scripts/update-noballgamess-template-metadata-cache.mjs`
- `scripts/update-noballgamess-live-supply-cache.mjs`
- `scripts/update-noballgamess-asset-state-cache.mjs`
- `scripts/generate-noballgamess-rarity.mjs`
- `scripts/update-noballgamess-rarity-feed.mjs`
- `scripts/noballgamess-rarity-tracker.test.mjs`

Shared files:

- `data/feed-registry.json`
- `data/feed-status.json`
- `.github/workflows/update-site-feeds.yml`
- `js/api-config.js`
- `js/wax-api-client.js` when present
- `js/wax-image-normalizer.js` when present
- `js/wax-collection-renderer.js` when present
- `workers/moonboys-api/routes/wax/` when present

## 16. Future parity note

Future updates may make NoBallGames trait and variation scoring richer if real metadata fields support it.

Possible target:

```text
target_score =
  live_supply_scarcity * 50
+ rarity_or_name_group_scarcity * 25
+ variation_or_metadata_group_scarcity * 20
+ missing_burned_supply_bonus * 5
```

But:

- do not invent fake rarity fields
- do not fake variation fields
- only use real AtomicAssets/template metadata
- asset-level original mint and surviving mint rank should remain a separate comparison layer

The adaptive weighted framework is implemented now. Future work should only add richer trait sources when they come from real AtomicAssets/template metadata.

## 17. Future improvements

Possible future improvements:

- collection-specific scoring config files
- richer per-asset explanation pages
- compare two NFT assets tool
- compare wallet holdings tool
- CSV exports for collectors
- more explicit trait schema mapping
- market analytics display cards marked display-only
- visual rarity dashboards
- local thumbnail cache improvements
- stronger burn-history tracking after more snapshots

These are future ideas, not claims that the features already exist.

## 18. Short collector summary

For GKniftyHEADS, the best version is usually found by comparing template rank, live supply, rarity trait/name, and variation trait/name, then checking exact assets inside that template. For NoBallGames, the best version is usually found by combining adaptive template score, live supply, and the exact asset's original mint number, surviving mint rank, and live/unburned status. In both cases, rarity score is not market price. AtomicAssets data decides the tracker; marketplace data is only display/reference.
