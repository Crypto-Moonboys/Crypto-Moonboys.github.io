#!/usr/bin/env node
/**
 * scripts/generate-link-graph.js
 *
 * Builds js/link-graph.json from js/link-map.json only.
 *
 * For every page in link-map.json the output contains:
 *   existing_outbound  — links the page already contains  (from existing_links)
 *   suggested_outbound — links the page could add         (from suggested_links)
 *   outbound_count     — existing_outbound.length + suggested_outbound.length
 *   inbound_from       — pages whose existing_links include this page
 *   inbound_count      — inbound_from.length
 *
 * Rules:
 *   - No HTML files are read or modified
 *   - No ranking / SAM / publisher data is used or changed
 *   - Output keys and array values are deterministically sorted
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT           = path.resolve(__dirname, '..');
const LINK_MAP_PATH  = path.join(ROOT, 'js', 'link-map.json');
const OUTPUT_PATH    = path.join(ROOT, 'js', 'link-graph.json');

function main() {
  const linkMap = JSON.parse(fs.readFileSync(LINK_MAP_PATH, 'utf8'));

  const pages = Object.keys(linkMap).sort();

  // Build inbound index: page → Set of pages whose existing_links contain it
  const inboundMap = new Map();
  for (const page of pages) {
    if (!inboundMap.has(page)) inboundMap.set(page, new Set());
    for (const target of (linkMap[page].existing_links || [])) {
      if (!inboundMap.has(target)) inboundMap.set(target, new Set());
      inboundMap.get(target).add(page);
    }
  }

  const graph = {};
  for (const page of pages) {
    const existingOutbound  = (linkMap[page].existing_links  || []).slice().sort();
    const suggestedOutbound = (linkMap[page].suggested_links || []).slice().sort();
    const inboundFrom       = Array.from(inboundMap.get(page) || []).sort();

    graph[page] = {
      outbound_count:    existingOutbound.length + suggestedOutbound.length,
      inbound_count:     inboundFrom.length,
      existing_outbound: existingOutbound,
      suggested_outbound: suggestedOutbound,
      inbound_from:      inboundFrom,
    };
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(graph, null, 2) + '\n', 'utf8');

  const totalExisting  = pages.reduce((s, p) => s + graph[p].existing_outbound.length,  0);
  const totalSuggested = pages.reduce((s, p) => s + graph[p].suggested_outbound.length, 0);
  console.log(
    `✅  link-graph written: ${pages.length} pages, ` +
    `${totalExisting} existing outbound, ${totalSuggested} suggested outbound → ${OUTPUT_PATH}`
  );
}

main();
