# PR Notes

This is the runtime follow-up to the canon-alignment merge.

Runtime files in scope on this branch now include:

- `js/identity-gate.js`
- `js/leaderboard-client.js`
- `js/arcade-sync.js`
- `js/arcade/core/game-shell.js`
- `games/asteroid-fork/index.html`
- `games/block-topia-quest-maze/index.html`
- `games/breakout-bullrun/index.html`
- `games/crystal-quest/index.html`
- `games/invaders-3008/index.html`
- `games/pac-chain/index.html`
- `games/snake-run/index.html`
- `games/tetris-block-topia/index.html`
- `workers/leaderboard-worker.js`

Current runtime state:

- Direct game URLs wait for server-backed Telegram verification before bootstrap.
- Competitive submission stays fail-closed on missing, invalid, mismatched, expired, or unlinked auth.
- No local pending competitive queue survives or flushes after linking.
- Leaderboard reads/writes stay restricted to Telegram-backed competitive identities.
