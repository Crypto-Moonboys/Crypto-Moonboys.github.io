'use strict';

/**
 * generate-entity-graph-lite.js
 *
 * Derives js/entity-graph-lite.json from js/graph-data.json.
 * The lite graph is a deterministic, mobile-friendly subset:
 *   - Top 75 nodes by rank_score (descending, then id for tie-breaking)
 *   - At most 3 strongest edges per node (by score, then weight)
 *
 * Run: node scripts/generate-entity-graph-lite.js
 */

const fs   = require('fs');
const path = require('path');

const INPUT  = path.join(__dirname, '..', 'js', 'graph-data.json');
const OUTPUT = path.join(__dirname, '..', 'js', 'entity-graph-lite.json');

const TOP_N_NODES         = 75;
const MAX_EDGES_PER_NODE  = 3;

function main() {
  if (!fs.existsSync(INPUT)) {
    console.error(`Missing input: ${INPUT}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(INPUT, 'utf8'));

  // ── Select top N nodes (deterministic: sort by rank_score desc, then id asc) ──
  const topNodes = [...data.nodes]
    .sort((a, b) => {
      const diff = (b.rank_score || 0) - (a.rank_score || 0);
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    })
    .slice(0, TOP_N_NODES);

  const topNodeIds = new Set(topNodes.map(n => n.id));

  // ── Filter edges to those connecting two top-N nodes ──────────────────────
  // Sort strongest first (score desc, then weight desc, then source asc for determinism)
  const candidateEdges = [...data.edges]
    .filter(e => topNodeIds.has(e.source) && topNodeIds.has(e.target))
    .sort((a, b) => {
      const scoreDiff  = (b.score  || 0) - (a.score  || 0);
      if (scoreDiff !== 0) return scoreDiff;
      const weightDiff = (b.weight || 0) - (a.weight || 0);
      if (weightDiff !== 0) return weightDiff;
      return a.source.localeCompare(b.source);
    });

  // ── Cap to MAX_EDGES_PER_NODE per endpoint ─────────────────────────────────
  const edgeCountByNode = new Map();
  const liteEdges = [];

  for (const edge of candidateEdges) {
    const sc = edgeCountByNode.get(edge.source) || 0;
    const tc = edgeCountByNode.get(edge.target) || 0;
    if (sc < MAX_EDGES_PER_NODE && tc < MAX_EDGES_PER_NODE) {
      liteEdges.push(edge);
      edgeCountByNode.set(edge.source, sc + 1);
      edgeCountByNode.set(edge.target, tc + 1);
    }
  }

  const lite = {
    generated_at: data.generated_at,
    lite: true,
    nodes: topNodes,
    edges: liteEdges,
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(lite, null, 2) + '\n', 'utf8');
  console.log(
    `✔ entity-graph-lite.json generated: ${lite.nodes.length} nodes, ${lite.edges.length} edges`
  );
}

main();
