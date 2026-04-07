#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'js', 'wiki-index.json');
const OUTPUT_DIR = path.join(ROOT, 'snapshots');

if (!fs.existsSync(INDEX_PATH)) {
  console.error('wiki-index.json not found');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));

if (!Array.isArray(data)) {
  console.error('Invalid wiki-index.json');
  process.exit(1);
}

// take top 50 only
const snapshot = data.slice(0, 50).map(item => ({
  title: item.title,
  url: item.url,
  rank_score: item.rank_score
}));

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR);
}

const date = new Date().toISOString().slice(0, 10);
const file = path.join(OUTPUT_DIR, `ranking-${date}.json`);

fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));

console.log(`Saved ranking snapshot: ${file}`);