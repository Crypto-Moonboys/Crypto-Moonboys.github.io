#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGenerateGkniftyheadsRarity } from './generate-gkniftyheads-rarity.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RARITY_JSON = path.join(ROOT, 'data', 'gkniftyheads', 'template-rarity.json');
const THUMB_PREFIX = '/img/gkniftyheads/thumbs/';

function readRows() {
  const data = JSON.parse(fs.readFileSync(RARITY_JSON, 'utf8'));
  return [
    ...(data.ranked_templates || []),
    ...(data.utility_open_mint_templates || []),
    ...(data.unissued_templates || []),
  ];
}

function hasLocalThumb(row) {
  const expected = `${THUMB_PREFIX}${row.template_id}.webp`;
  const filePath = path.join(ROOT, expected.replace(/^\//, ''));
  return row.thumbnail_url === expected && fs.existsSync(filePath);
}

function printCoverage(rows) {
  const imageRows = rows.filter((row) => row.image_url);
  const localRows = imageRows.filter(hasLocalThumb);
  const fallbackRows = imageRows.filter((row) => !hasLocalThumb(row));
  console.log(`${imageRows.length} total image rows / ${localRows.length} local thumbnails / ${fallbackRows.length} fallback`);
  if (fallbackRows.length) {
    console.log('Fallback rows:');
    for (const row of fallbackRows) {
      console.log(`- ${row.template_id}: ${row.image_url} (${row.thumbnail_error || row.thumbnail_status || 'missing local thumbnail'})`);
    }
  }
  return { total: imageRows.length, local: localRows.length, fallback: fallbackRows.length };
}

await runGenerateGkniftyheadsRarity(ROOT);
const coverage = printCoverage(readRows());
if (coverage.fallback > 0) {
  console.log('Retry later after checking the listed source images/gateways.');
}
