# NFT Rarity Methodology: GKniftyHEADS vs NoBallGames

GKniftyHEADS and NoBallGames are not scored as if they are the same collection. GKniftyHEADS is mainly template-and-trait weighted. NoBallGames is more template-plus-asset weighted, because individual mint position, surviving mint rank, holder concentration, and live asset context matter more. Both trackers use AtomicAssets as source of truth, ignore marketplace price for rarity scoring, preserve original mint numbers, and calculate surviving mint rank separately.

This document is for collectors who want to understand how to compare versions, and for developers who need to maintain the tracker without drifting into marketplace, wallet, or transaction logic.

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

## 3. Core rarity terms

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

Holder concentration counts how many live assets are held by wallets. This is especially useful for NoBallGames because asset-level and holder context are more important there.

## 4. Shared tracker architecture

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

## 5. GKniftyHEADS scoring model

GKniftyHEADS is primarily template-and-trait weighted. The current scoring contract in `scripts/generate-gkniftyheads-rarity.mjs` and `data/gkniftyheads/template-rarity.json` uses this numeric formula:

| Component | Weight | Meaning |
|---|---:|---|
| Live surviving supply scarcity | 50% | Lower live supply increases rarity. |
| Rarity trait exposure scarcity | 25% | Less common rarity traits score higher. |
| Variation trait exposure scarcity | 20% | Less common variations score higher. |
| Missing/burned scarcity bonus | 5% | Small cautious bonus only when supported by tracker data. |
| Marketplace price | 0% | Never used in rarity score. |

The generated GKniftyHEADS contract has `price_used: false`. Marketplace data is not part of the rarity formula.

GKniftyHEADS has a larger and more complex template set. The tracker is useful for finding:

- strongest fixed-supply templates
- scarce template IDs
- stronger rarity traits
- stronger variations
- live-supply scarcity
- templates affected by burn/missing supply checks
- utility/open mint templates that should not be compared directly to fixed-rarity templates

GKniftyHEADS separates templates into:

- ranked fixed-supply templates
- utility/open mint templates
- unissued templates

Duplicate or similar names/images may still be separate AtomicAssets template IDs. The page is a template rarity ranking, not a unique-artwork ranking.

To find a strong GKniftyHEADS version, look for:

- high `final_score`
- low live supply
- confirmed AtomicAssets template
- strong rarity trait
- strong variation trait
- fixed-supply status
- surviving supply scarcity
- image/name/template ID match so the collector knows exactly which version they are viewing

Do not treat utility/open mint templates as directly equivalent to limited fixed-supply rarity templates.

## 6. NoBallGames scoring model

NoBallGames is template-plus-asset weighted. It does not use the same numeric formula as GKniftyHEADS.

The current NoBallGames contract in `scripts/noballgamess-tracker-lib.mjs`, `data/noballgamess/template-rarity.json`, and `data/noballgamess/asset-rarity-leaderboard.json` documents score inputs rather than a single GKnifty-style percent table.

NoBallGames currently uses a scoring contract based on live supply, template status, trait exposure where available, and asset-level leaderboard signals such as original mint number and surviving mint rank. It is intentionally not documented as the same numeric formula as GKniftyHEADS because the collection structure is different.

Current NoBallGames template ranking uses:

- AtomicAssets as source of truth
- live supply when available
- issued supply only as explicit fallback
- fixed/open/unissued template separation
- `rarity_score` derived from live supply scarcity
- trait exposure where metadata supports it
- `price_used: false`
- `market_data_used: false`

Current NoBallGames asset-level leaderboards use:

- `original_mint_number`
- `surviving_mint_rank`
- live/unburned status
- template context

The holder leaderboard counts live assets held by wallet. Burned assets are excluded from live asset and holder leaderboards.

NoBallGames categories:

- ranked fixed-supply templates
- utility/open mint templates
- unissued templates
- holder leaderboard
- asset rarity leaderboard

To find a strong NoBallGames version, look for:

- high asset rarity leaderboard position
- scarce template
- low live supply
- low original mint number
- strong surviving mint rank
- live/unburned asset
- useful holder/ownership context
- image and template ID correctly matching the desired artwork

A NoBallGames best version may be an individual asset, not only a template.

## 7. Why the two collections work differently

| Area | GKniftyHEADS | NoBallGames |
|---|---|---|
| Main rarity lens | Template-and-trait rarity | Template-plus-asset rarity |
| Best use | Finding rare templates/traits/variations | Finding strong individual versions/assets |
| Trait structure | Stronger trait/variation scoring | Trait exposure used more cautiously |
| Mint position | Useful as asset context | More important for individual asset comparison |
| Surviving mint rank | Useful support signal | Important asset-level signal |
| Holder leaderboard | Secondary | More useful due to asset/holder context |
| Utility/open mint handling | Separated from ranked fixed-supply templates | Separated from ranked fixed-supply templates |
| Market data | Display-only, not scoring | Display-only, not scoring |
| Best collector question | Which template/trait version is rarest? | Which exact asset/version is strongest? |

GKniftyHEADS is better treated as a structured collection rarity system. NoBallGames is better treated as a version-finding system where the exact asset can matter more.

## 8. How to find the best version

### For GKniftyHEADS

Best version checklist:

1. Start with Template Rarity Ranking.
2. Prefer ranked fixed-supply templates over open/utility templates for rarity comparisons.
3. Check live supply.
4. Check rarity trait and variation trait.
5. Check final score.
6. Confirm the template ID.
7. Open the AtomicHub reference link only after confirming the tracker data.
8. Check asset-level mint/rank if comparing two NFTs from the same template.

Strong GKniftyHEADS example logic:

- Rank `#1` template with low live supply is generally stronger than a common/high-supply template.
- A rare variation can matter.
- A lower original mint can matter inside the same template, but does not override the whole template score by itself.

### For NoBallGames

Best version checklist:

1. Start with Asset Rarity Leaderboard.
2. Check Template Rarity Ranking.
3. Check original mint number.
4. Check surviving mint rank.
5. Check live/unburned status.
6. Check holder leaderboard/context.
7. Check template stats.
8. Confirm image, title, template ID, and asset ID.
9. Use AtomicHub as a marketplace/reference link only.

Strong NoBallGames example logic:

- A low original mint from a scarce template can be stronger than a later mint from the same template.
- If lower mints are burned, surviving mint rank can make an asset more important among live NFTs.
- Holder concentration can make the collection context clearer, but does not equal price.

## 9. What the tracker does not do

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

## 10. Images and metadata

Images are pulled from AtomicAssets metadata fields. IPFS values are normalized for browser display. Raw CIDs, `ipfs://CID`, `/ipfs/CID`, and HTTPS URLs may all be normalized into usable browser URLs.

Local/static thumbnails or gateway URLs may be used depending on current implementation. Missing images should show placeholders, not broken rows.

Image display is separate from rarity scoring. A missing image should not change rarity maths.

## 11. Daily updates and fallback model

GitHub Actions refreshes tracker data. AtomicAssets data is cached into static JSON. Pages can render from static HTML/JSON. The WAX Bridge can provide clean read-only REST JSON. If the Worker/API fails, pages fall back to static JSON. Previous good data is preserved where designed.

Feed status may show `ok`, `degraded`, `error`, or `pending`.

`degraded` does not always mean data is unusable. It often means fallback/static data is being used. Error in optional market analytics should not break rarity data.

## 12. WAX Bridge relationship

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

## 13. Developer notes

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

## 14. Future improvements

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

## 15. Short collector summary

For GKniftyHEADS, the best version is usually found by comparing template rank, live supply, rarity trait, and variation trait. For NoBallGames, the best version is often found by combining template scarcity with the exact asset's original mint number, surviving mint rank, and live/unburned status. In both cases, rarity score is not market price. AtomicAssets data decides the tracker; marketplace data is only display/reference.
