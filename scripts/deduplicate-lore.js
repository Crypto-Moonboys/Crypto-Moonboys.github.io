'use strict';

const fs   = require('fs');
const path = require('path');

const WIKI_DIR = path.join(__dirname, '..', 'wiki');

// Normalize paragraph text for comparison
function normalize(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim()
    .toLowerCase();
}

// Remove near-identical paragraphs
function deduplicateParagraphs(html) {
  const paragraphs = html.match(/<p[\s\S]*?<\/p>/gi) || [];
  const seen = new Set();
  const uniqueParagraphs = [];

  paragraphs.forEach(p => {
    const key = normalize(p);
    if (!seen.has(key)) {
      seen.add(key);
      uniqueParagraphs.push(p);
    }
  });

  let index = 0;
  return html.replace(/<p[\s\S]*?<\/p>/gi, () => uniqueParagraphs[index++] || '');
}

function processFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  const cleaned  = deduplicateParagraphs(original);

  if (original !== cleaned) {
    fs.writeFileSync(filePath, cleaned, 'utf8');
    console.log(`✔ Deduplicated lore in: ${path.basename(filePath)}`);
  }
}

fs.readdirSync(WIKI_DIR)
  .filter(file => file.endsWith('.html'))
  .forEach(file => processFile(path.join(WIKI_DIR, file)));

console.log('🎯 Lore deduplication complete.');
