const fs = require('fs');
const path = require('path');

// 🔥 LOAD CONFIG
const CONFIG = require('../js/ranking-config.js');

const ROOT = path.join(__dirname, '..');
const WIKI_DIR = path.join(ROOT, 'wiki');
const OUTPUT = path.join(ROOT, 'js', 'wiki-index.json');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);

  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else if (file.endsWith('.html')) {
      results.push(fullPath);
    }
  });

  return results;
}

function extractTitle(html) {
  const match = html.match(/<title>(.*?)<\/title>/i);
  return match ? match[1].trim() : null;
}

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function buildSearchIndex(title) {
  const normalized = normalize(title);
  return {
    normalized_title: normalized,
    tokens: normalized.split(' ')
  };
}

function detectCategory(filePath) {
  const lower = filePath.toLowerCase();

  if (lower.includes('character')) return 'characters';
  if (lower.includes('faction')) return 'factions';
  if (lower.includes('token')) return 'tokens';
  if (lower.includes('concept')) return 'concepts';

  return 'misc';
}

function buildRankSignals(html, filePath) {
  const wordCount = html.split(/\s+/).length;
  const category = detectCategory(filePath);

  return {
    is_canonical: true,
    alias_count: 0,
    tag_count: 0,
    category,
    category_priority: CONFIG.CATEGORY_PRIORITY[category] || 3,
    has_description: html.includes('<meta name="description"'),
    article_word_count: wordCount,
    keyword_bag_size: Math.min(25, Math.floor(wordCount / 50))
  };
}

function computeRankScore(signals) {
  let score = 0;

  if (signals.is_canonical) score += CONFIG.WEIGHTS.canonical;
  if (signals.has_description) score += CONFIG.WEIGHTS.description;

  score += signals.category_priority * CONFIG.WEIGHTS.category;
  score += signals.article_word_count * CONFIG.WEIGHTS.word_count;
  score += signals.keyword_bag_size * CONFIG.WEIGHTS.keyword_bag;

  return Math.round(score);
}

function run() {
  console.log('Generating wiki index...');

  const files = walk(WIKI_DIR);
  const index = [];

  files.forEach(filePath => {
    const relative = path.relative(ROOT, filePath).replace(/\\/g, '/');

    // 🔥 REMOVE LEGACY INDEX PAGE
    if (relative === 'wiki/index.html') return;

    const html = fs.readFileSync(filePath, 'utf8');
    const title = extractTitle(html);

    if (!title) return;

    const url = '/' + relative;

    const rank_signals = buildRankSignals(html, filePath);
    const rank_score = computeRankScore(rank_signals);
    const search_index = buildSearchIndex(title);

    index.push({
      title,
      url,
      rank_score,
      rank_signals,
      search_index
    });
  });

  // 🔥 DETERMINISTIC SORT (FINAL FORM)
  index.sort((a, b) => {
    return (
      b.rank_score - a.rank_score ||
      a.title.localeCompare(b.title) ||
      a.url.localeCompare(b.url)
    );
  });

  fs.writeFileSync(OUTPUT, JSON.stringify(index, null, 2));

  console.log(`Generated ${index.length} entries`);
}

run();