/**
 * game-registry.js — Central registry of all arcade games.
 *
 * Each game module registers itself (at module import time) using
 * GameRegistry.register().  The shell and any future listing/routing
 * logic queries the registry rather than hard-coding game IDs.
 *
 * Usage:
 *   import { GameRegistry } from '/js/arcade/core/game-registry.js';
 *   GameRegistry.register('snake', { label: '🐍 SnakeRun 3008', bootstrap: bootstrapSnake });
 *   GameRegistry.get('snake');   // → { label, bootstrap }
 *   GameRegistry.list();         // → [{ id, label, bootstrap }, …]
 */

var _registry = new Map();

export var GameRegistry = {
  /**
   * Register a game.
   * @param {string} id   - Unique game identifier (e.g. 'snake').
   * @param {object} meta - Metadata object; must include at least a `label` string.
   */
  register: function (id, meta) {
    if (typeof id !== 'string' || !id) {
      console.warn('[game-registry] register() called with invalid id:', id);
      return;
    }
    if (_registry.has(id)) {
      console.warn('[game-registry] duplicate registration for id "' + id + '" — overwriting previous entry');
    }
    _registry.set(id, Object.assign({ id: id }, meta));
  },

  /**
   * Retrieve a registered game by ID.
   * @param {string} id
   * @returns {object|null}
   */
  get: function (id) {
    return _registry.get(id) || null;
  },

  /**
   * Return an array of all registered games in insertion order.
   * @returns {object[]}
   */
  list: function () {
    return Array.from(_registry.values());
  },
};
