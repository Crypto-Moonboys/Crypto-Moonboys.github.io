/**
 * bootstrap.js â€” HexGL Monster Mode (legacy entry point)
 *
 * The canonical HexGL experience is /games/hexgl-monster-max/.
 * /games/hexgl-monster.html redirects there automatically.
 *
 * This module re-exports the canonical Monster Max bootstrap so that any
 * future import of this path still receives the real, fully functional
 * implementation with a correct score formula and real submission flow.
 */

export { bootstrapHexGLMonsterMax as bootstrapHexGLMonster } from '../hexgl-monster-max/bootstrap.js';

export { HEXGL_MONSTER_MAX_ADAPTER as HEXGL_MONSTER_ADAPTER } from '../hexgl-monster-max/bootstrap.js';
