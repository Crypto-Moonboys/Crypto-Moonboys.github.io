/**
 * arcade-manifest.js — Central registry of all live arcade games.
 *
 * Each entry describes:
 *   id            — unique game key (matches config.id and leaderboard key)
 *   label         — display name
 *   page          — URL path to the game page (must end with /)
 *   bootstrapPath — absolute path to the bootstrap module
 *   adapterExport — named export from the bootstrap module that is the adapter
 *   crossGameTags — compatibility tags for cross-game modifier system
 *
 * Live arcade games: invaders-3008, pac-chain, asteroid-fork, breakout-bullrun,
 *   tetris-block-topia, crystal-quest, block-topia-quest-maze, snake-run
 *
 * Consumed by:
 *   js/arcade/core/auto-mount-game.js   (browser auto-mount)
 *   scripts/arcade-architecture-audit.mjs (CI validation)
 */

export const ARCADE_MANIFEST = Object.freeze([
  {
    id: 'invaders',
    label: '👾 Invaders 3008',
    page: '/games/invaders-3008/',
    bootstrapPath: '/js/arcade/games/invaders/bootstrap.js',
    adapterExport: 'INVADERS_ADAPTER',
    crossGameTags: Object.freeze(['shooter']),
  },
  {
    id: 'pacchain',
    label: '🟡 Pac-Chain',
    page: '/games/pac-chain/',
    bootstrapPath: '/js/arcade/games/pac-chain/bootstrap.js',
    adapterExport: 'PAC_CHAIN_ADAPTER',
    crossGameTags: Object.freeze(['maze']),
  },
  {
    id: 'asteroids',
    label: '🌑 Asteroid Fork',
    page: '/games/asteroid-fork/',
    bootstrapPath: '/js/arcade/games/asteroid-fork/bootstrap.js',
    adapterExport: 'ASTEROID_FORK_ADAPTER',
    crossGameTags: Object.freeze(['shooter', 'physics']),
  },
  {
    id: 'breakout',
    label: '🧱 Breakout Bullrun',
    page: '/games/breakout-bullrun/',
    bootstrapPath: '/js/arcade/games/breakout-bullrun/bootstrap.js',
    adapterExport: 'BREAKOUT_BULLRUN_ADAPTER',
    crossGameTags: Object.freeze(['breakout']),
  },
  {
    id: 'snake',
    label: '🐍 SnakeRun 3008',
    page: '/games/snake-run/',
    bootstrapPath: '/js/arcade/games/snake-run/bootstrap.js',
    adapterExport: 'SNAKE_RUN_ADAPTER',
    crossGameTags: Object.freeze(['snake']),
  },
  {
    id: 'tetris',
    label: '🟦 Tetris Block Topia',
    page: '/games/tetris-block-topia/',
    bootstrapPath: '/js/arcade/games/tetris/bootstrap.js',
    adapterExport: 'TETRIS_ADAPTER',
    crossGameTags: Object.freeze(['physics']),
  },
  {
    id: 'blocktopia',
    label: '🗺️ Block Topia Quest Maze',
    page: '/games/block-topia-quest-maze/',
    bootstrapPath: '/js/arcade/games/block-topia-quest-maze/bootstrap.js',
    adapterExport: 'BTQM_ADAPTER',
    crossGameTags: Object.freeze(['maze']),
  },
  {
    id: 'crystal',
    label: '🧩 Crystal Quest',
    page: '/games/crystal-quest/',
    bootstrapPath: '/js/arcade/games/crystal-quest/bootstrap.js',
    adapterExport: 'CRYSTAL_QUEST_ADAPTER',
    crossGameTags: Object.freeze(['puzzle']),
  },
]);

/**
 * Look up a manifest entry by game id.
 *
 * @param {string} id
 * @returns {object|null}
 */
export function getManifestEntry(id) {
  return ARCADE_MANIFEST.find(function (e) { return e.id === id; }) || null;
}
