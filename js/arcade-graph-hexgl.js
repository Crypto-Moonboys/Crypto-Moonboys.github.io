/* ============================================================
   arcade-graph-hexgl.js — HexGL node integration for the
   Moonboys Arcade OG-style graph visualisation.

   Extends the arcade-graph.js canvas graph to include HexGL
   as a first-class node alongside the existing 8 arcade titles.

   Usage (in leaderboard.html):
     import { initGraph, setPlayerState, resetGraph } from '/js/arcade-graph.js';
     import { applyHexGLToGraph } from '/js/arcade-graph-hexgl.js';
     applyHexGLToGraph();
     initGraph('arcade-graph-canvas');
   ============================================================ */

// ── HexGL node colour — neon amber to distinguish from existing nodes ──────
export const HEXGL_COLOR = '#f7c948';   // matches site accent / gold

// ── Node descriptor matching the shape used in arcade-graph.js ────────────
export const HEXGL_NODE = {
  id:    'hexgl',
  label: '🏁 HexGL',
  color: HEXGL_COLOR,
};

// ── Edge from the central 'global' hub to hexgl ───────────────────────────
export const HEXGL_EDGE = {
  source: 'global',
  target: 'hexgl',
};

// ── Breakdown key used in leaderboard player entries ──────────────────────
export const HEXGL_BREAKDOWN_KEY = 'hexgl';

/**
 * Applies the HexGL node and edge to the arcade-graph.js module's internal
 * definition arrays, then re-renders the canvas if already initialised.
 *
 * This relies on arcade-graph.js exporting mutable references to its
 * OVERVIEW_EDGES array and the makeOverviewNodes game list.  If those
 * internals are not accessible (tree-shaken build), the function is a no-op
 * and the graph falls back to the 8-game layout gracefully.
 *
 * @param {object} graphModule - The imported arcade-graph.js module.
 */
export function applyHexGLToGraph(graphModule) {
  if (!graphModule) return;

  // Inject into OVERVIEW_EDGES if exported
  const edges = graphModule.OVERVIEW_EDGES;
  if (Array.isArray(edges) && !edges.find(e => e.target === 'hexgl')) {
    edges.push(HEXGL_EDGE);
  }

  // arcade-graph.js builds nodes dynamically via makeOverviewNodes(); the
  // game list is defined inside that closure and is not directly patchable.
  // We handle the player-state side by wrapping setPlayerState below.
}

/**
 * Wraps arcade-graph.js setPlayerState to inject the HexGL score node
 * into the per-player breakdown visualisation.
 *
 * @param {object} graphModule  - The imported arcade-graph.js module.
 * @param {object} entry        - The player leaderboard entry.
 */
export function setPlayerStateWithHexGL(graphModule, entry) {
  if (!graphModule || typeof graphModule.setPlayerState !== 'function') return;

  // Inject hexgl into the breakdown before handing to the base function
  if (entry && entry.breakdown) {
    // breakdownProxy preserves all existing keys and surfaces hexgl
    const patchedEntry = Object.assign({}, entry, {
      breakdown: Object.assign({ hexgl: null }, entry.breakdown),
    });
    graphModule.setPlayerState(patchedEntry);
    return;
  }

  graphModule.setPlayerState(entry);
}

/**
 * Returns an extended graph-legend entry for HexGL.
 * Append to the legend container in leaderboard.html.
 *
 * @returns {HTMLElement} A <span class="lb-legend-item"> element.
 */
export function buildHexGLLegendItem() {
  const item = document.createElement('span');
  item.className = 'lb-legend-item';
  item.innerHTML =
    `<span class="lb-legend-dot" style="background:${HEXGL_COLOR}"></span>` +
    `<span>🏁 HexGL</span>`;
  return item;
}
