# Public Arcade branding cleanup

Replace only user-visible legacy game branding while preserving the working runtime restored by PR #1136.

Canonical public names:

- Meme Swarm 3008 (`meme-swarm-3008`)
- Chain Maze (`chain-maze`)
- Forkfield (`forkfield`)
- Bullrun Brick Smash (`bullrun-brick-smash`)
- Block Topia Dropzone (`block-topia-dropzone`)

Required scope:

1. Audit and update the five canonical game pages for visible legacy names in document titles, metadata, breadcrumbs, page headings, descriptive copy, buttons, canvas aria-labels, and any runtime-visible labels.
2. Update `js/game-fullscreen.js` `GAME_META` visible labels so fullscreen displays the canonical names. Keep canvas IDs, touch schemes, controls, and runtime keys unchanged.
3. Audit `games/leaderboard.html`, `games/index.html`, `how-to-play.html`, and `community.html` for visible legacy names and old public routes. Update only where legacy public branding remains.
4. Audit shared public-facing Arcade UI modules such as `js/arcade-meta-ui.js`, `js/arcade-graph.js`, `js/arcade-sync.js`, and `js/arcade-meta-system.js` for visible labels. Do not rename internal variables, source folders, import paths, canvas IDs, storage keys, or compatibility route names unless necessary for public output.
5. Add regression tests that fail if canonical public pages or fullscreen labels expose these retired names: `Invaders 3008`, `Pac-Chain`, `Asteroid Fork`, `Breakout Bullrun`, or `Tetris Block Topia`.
6. Preserve the full playable HTML runtime in all five canonical pages. Do not reintroduce `fetch(...index.html)` or `document.write()` loaders.
7. Remove this task file in the implementation commit.

No Worker, D1, score namespace, game ID, game mechanic, or authentication changes.