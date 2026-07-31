#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const steps = [
  ['Generate wiki index', 'scripts/generate-wiki-index.js'],
  ['Generate link map', 'scripts/generate-link-map.js'],
  ['Generate link graph', 'scripts/generate-link-graph.js'],
  ['Refresh wiki index authority signals', 'scripts/generate-wiki-index.js'],
  ['Generate entity map', 'scripts/generate-entity-map.js'],
  ['Generate entity relationship graph', 'scripts/generate-entity-graph.js'],
  ['Generate graph visualisation data', 'scripts/generate-graph-data.js'],
  ['Generate mobile graph data', 'scripts/generate-entity-graph-lite.js'],
  ['Generate sitemap', 'scripts/generate-sitemap.js'],
  ['Generate site statistics', 'scripts/generate-site-stats.js'],
];

for (const [label, script] of steps) {
  console.log(`\n[publishing-surfaces] ${label}`);
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=4096',
    },
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`[publishing-surfaces] Failed to start ${script}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[publishing-surfaces] ${label} failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }
}

console.log('\n[publishing-surfaces] All public indexes, graph files, statistics and sitemap outputs are current.');
