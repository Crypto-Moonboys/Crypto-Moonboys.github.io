/**
 * bootstrap.js â€” HexGL (legacy entry point)
 *
 * The canonical HexGL experience is /games/hexgl-monster-max/.
 * /games/hexgl.html redirects there automatically.
 *
 * This module re-exports the canonical Monster Max bootstrap so that any
 * future import of this path still receives a fully functional implementation
 * instead of the old stub that returned getScore() = 0.
 */

export { bootstrapHexGLMonsterMax as bootstrapHexGL } from '../hexgl-monster-max/bootstrap.js';

export { HEXGL_MONSTER_MAX_ADAPTER as HEXGL_ADAPTER } from '../hexgl-monster-max/bootstrap.js';
