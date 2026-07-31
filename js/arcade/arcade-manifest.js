/**
 * arcade-manifest.js — Central registry of all live arcade games.
 *
 * Each entry describes:
 *   id            — stable game key (matches config.id and leaderboard key)
 *   label         — display name
 *   page          — URL path to the game page (must end with /)
 *   bootstrapPath — absolute path to the bootstrap module
 *   adapterExport — named export from the bootstrap module that is the adapter
 *   crossGameTags — compatibility tags for cross-game modifier system
 *
 * Consumed by:
 *   js/arcade/core/auto-mount-game.js
 *   scripts/arcade-architecture-audit.mjs
 */

export const ARCADE_MANIFEST = Object.freeze([
  {
    id: 'invaders',
    label: '👾 Meme Swarm 3008',
    page: '/games/invaders-3008/',
    bootstrapPath: '/js/arcade/games/invaders/bootstrap.js',
    adapterExport: 'INVADERS_ADAPTER',
    crossGameTags: Object.freeze(['shooter']),
  },
  {
    id: 'pacchain',
    label: '🟡 Chain Maze',
    page: '/games/pac-chain/',
    bootstrapPath: '/js/arcade/games/pac-chain/bootstrap.js',
    adapterExport: 'PAC_CHAIN_ADAPTER',
    crossGameTags: Object.freeze(['maze']),
  },
  {
    id: 'asteroids',
    label: '🌑 Forkfield',
    page: '/games/asteroid-fork/',
    bootstrapPath: '/js/arcade/games/asteroid-fork/bootstrap.js',
    adapterExport: 'ASTEROID_FORK_ADAPTER',
    crossGameTags: Object.freeze(['shooter', 'physics']),
  },
  {
    id: 'breakout',
    label: '🧱 Bullrun Brick Smash',
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
    label: '🟦 Block Topia Dropzone',
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
    id: 'kaiju',
    label: 'Kaiju Sticker Battle',
    page: '/games/kaiju-sticker-battle/',
    bootstrapPath: '/js/arcade/games/kaiju-sticker-battle/bootstrap.js',
    adapterExport: 'KAIJU_STICKER_BATTLE_ADAPTER',
    crossGameTags: Object.freeze(['cards', 'telegram']),
  },
]);

export function getManifestEntry(id) {
  return ARCADE_MANIFEST.find(function (e) { return e.id === id; }) || null;
}
