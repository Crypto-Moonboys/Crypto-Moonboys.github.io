/**
 * game-state.js — Shared state factory for arcade games.
 *
 * Creates a lightweight state container for a single game instance.
 * Each game gets its own isolated state object with a consistent API.
 *
 * Usage note: individual game bootstraps may choose to manage state
 * with local variables for simplicity; this factory is provided as
 * shared infrastructure for games that prefer a structured container.
 */

/**
 * Creates a managed state container for a game instance.
 *
 * @param {object} [initialValues] - Optional overrides for default state fields.
 * @returns {{ get(key: string): any, set(key: string, value: any): void, reset(defaults?: object): void }}
 */
export function createGameState(initialValues) {
  var defaults = {
    score:   0,
    best:    0,
    running: false,
    paused:  false,
  };

  var state = Object.assign({}, defaults, initialValues || {});

  return {
    get: function (key) {
      return state[key];
    },
    set: function (key, value) {
      state[key] = value;
    },
    reset: function (overrides) {
      Object.assign(state, defaults, overrides || {});
    },
  };
}
