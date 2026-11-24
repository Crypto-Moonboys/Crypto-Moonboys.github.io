# Block Topia map baseline

GK approved the placement, camera angles, in-world scale, and close-zoom art for these seven maps on 24 November 2026. The reference is commit `9cc76583a6e1501d935af22e7c9b34cd0f99e6b6` ([PR #2098](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/pull/2098)), which includes the rear tower placement from #2096. Start from current `main` and use that reference to review changes affecting this baseline. Keep the following settings until GK requests a change to them.

| Map entry | Approved view and placement source |
| --- | --- |
| [Block Topia Survival](index.html) | 20 × 20, 2:1 isometric. [main.js](main.js) puts Bitcoin Cash at the rear on blocked tile `(1,4)`, Zcash at `(3,2)`, and WAX at `(7,2)`. The overview includes headroom for the tower. |
| [Lumina’s Waterfront](waterfront/index.html) | Top-down map with overhead landmark art. [harbor-art.js](waterfront/harbor-art.js) puts Bitcoin Cash on the rear harbor lot `(42,11)`, Zcash at `(16,21)`, and WAX at `(21,22)`. Keep the [restored harbor baseline](waterfront/README.md#preserve-the-restored-harbor). |
| [HODL Wars Lores](hodl-wars-lores/index.html) | Tilted Moon projection in [game.js](hodl-wars-lores/game.js). [lunar-world.mjs](hodl-wars-lores/lunar-world.mjs) puts Bitcoin Cash at the rear `(24,14)`, Zcash at `(28,20)`, and WAX at `(19,27)`. Keep the Landing Pad clear and all six lore stations reachable. |
| [Original Node City comparison](test-builds/compare/node-city/index.html) | 48 × 48 classic 2:1 isometric node grid. Keep the original framing and use the approved fixture placement in [comparison.mjs](test-builds/compare/comparison.mjs). The rear tower placement starts its lot search at `(18,20)`. |
| [Survival Grid comparison](test-builds/compare/survival/index.html) | 20 × 20, 2:1 isometric with an overview fitted to the tower. Keep Bitcoin Cash on the rear tile `(1,4)` and Zcash and WAX in their existing [comparison positions](test-builds/compare/comparison.mjs). |
| [Waterfront comparison](test-builds/compare/waterfront/index.html) | Top-down. [scenes.mjs](test-builds/compare/scenes.mjs) uses the shared [harbor renderer](waterfront/harbor-art.js) and its three approved landmark lots. |
| [Moon comparison](test-builds/compare/moon/index.html) | Tilted Moon camera. [comparison.mjs](test-builds/compare/comparison.mjs) places Bitcoin Cash at the rear starting at `(24,14)` and WAX at its existing comparison position. |

- Keep the original projections, camera framing and zoom behavior for each map, along with its ground anchors and depth order.
- Keep the tall Bitcoin Cash silhouette and its 1.7× draw scale relative to the standard miners. Its rear placement gives the skyline room while keeping the main routes clear.
- Use the appropriate isometric, overhead, or tilted Moon atlas. The approved miner sheets have twelve transparent 672 × 840 frames in four columns by three rows. Keep the 12 fps loop, stationary foundation, reduced-motion first frame, and high-quality sampling for the miners at close zoom.
- When changing relevant assets or rendering, check the affected views at overview and close zoom. Verify readable signage, a stable rock base, the tower’s height and silhouette, and landmark inspection where supported. If an edit affects the shared renderer or an atlas used by multiple routes, check each affected view.
