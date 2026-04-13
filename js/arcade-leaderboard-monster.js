/* ============================================================
   arcade-leaderboard-monster.js — HexGL tab extension for
   the Moonboys Arcade Leaderboard.

   Exports patched TABS and GAME_LABELS arrays that include the
   🏁 HexGL entry. Import this alongside arcade-leaderboard.js
   and call patchLeaderboard() before initLeaderboard().
   ============================================================ */

// ── HexGL tab definition ──────────────────────────────────────────────────
export const HEXGL_TAB = {
  key:   'hexgl',
  label: '🏁 HexGL',
  icon:  '🏁',
};

// ── HexGL label for score-breakdown columns ───────────────────────────────
export const HEXGL_GAME_LABEL = '🏁 HexGL';

// ── Ordered list of tabs to inject after the built-in aggregate tabs ──────
// Aggregate tabs: global, seasonal, yearly, all-time
// Per-game tabs follow; HexGL is appended as a first-class title.
export const HEXGL_TAB_POSITION = 'after:tetris';  // inject after the Tetris tab

/**
 * Patches arcade-leaderboard.js module state to include the HexGL tab
 * and HexGL breakdown column.
 *
 * Call once per page load, before initLeaderboard().
 *
 * @param {object} lbModule - The imported arcade-leaderboard.js module.
 *   Expected exports: TABS (array), GAME_LABELS (object), BREAKDOWN_GAMES (array).
 *   Note: these are module-level constants — patching via this helper modifies
 *   the arrays/objects in place so that renderTabs() and renderTable() pick
 *   up the change without requiring a full re-import.
 */
export function patchLeaderboard(lbModule) {
  if (!lbModule) return;

  // Inject HEXGL_TAB after 'tetris' in the tab list
  const tabs = lbModule.TABS;
  if (Array.isArray(tabs) && !tabs.find(t => t.key === 'hexgl')) {
    const tetrisIdx = tabs.findIndex(t => t.key === 'tetris');
    const insertAt  = tetrisIdx >= 0 ? tetrisIdx + 1 : tabs.length;
    tabs.splice(insertAt, 0, HEXGL_TAB);
  }

  // Add HexGL to the GAME_LABELS map
  const labels = lbModule.GAME_LABELS;
  if (labels && typeof labels === 'object') {
    labels.hexgl = HEXGL_GAME_LABEL;
  }

  // Add 'hexgl' to BREAKDOWN_GAMES so it gets a column on aggregate tabs
  const breakdownGames = lbModule.BREAKDOWN_GAMES;
  if (Array.isArray(breakdownGames) && !breakdownGames.includes('hexgl')) {
    breakdownGames.push('hexgl');
  }
}

/**
 * Builds the full tab list with HexGL included, suitable for use with
 * a fresh leaderboard initialisation.
 *
 * @param {Array} baseTabs - The original TABS array from arcade-leaderboard.js.
 * @returns {Array} New array with HexGL tab inserted.
 */
export function buildTabsWithHexGL(baseTabs) {
  const copy       = [...(baseTabs || [])];
  const tetrisIdx  = copy.findIndex(t => t.key === 'tetris');
  const insertAt   = tetrisIdx >= 0 ? tetrisIdx + 1 : copy.length;
  if (!copy.find(t => t.key === 'hexgl')) {
    copy.splice(insertAt, 0, HEXGL_TAB);
  }
  return copy;
}

/**
 * Returns a GAME_LABELS map extended with the HexGL entry.
 *
 * @param {object} baseLabels - The original GAME_LABELS from arcade-leaderboard.js.
 * @returns {object} New object with hexgl key added.
 */
export function buildLabelsWithHexGL(baseLabels) {
  return Object.assign({}, baseLabels || {}, { hexgl: HEXGL_GAME_LABEL });
}
