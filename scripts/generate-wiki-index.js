const fs = require('fs');
const path = require('path');

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
  return {
    normalized_title: normalize(title),
    tokens: normalize(title).split(' ')
  };
}

function buildRankSignals(html) {
  const wordCount = html.split(/\s+/).length;

  return {
    is_canonical: true,
    alias_count: 0,
    tag_count: 0,
    category_priority: 3,
    has_description: html.includes('<meta name="description"'),
    article_word_count: wordCount,
    keyword_bag_size: Math.min(25, Math.floor(wordCount / 50))
  };
}

function computeRankScore(signals) {
  let score = 0;

  if (signals.is_canonical) score += 20;
  if (signals.has_description) score += 10;

  score += signals.category_priority * 5;
  score += Math.min(20, Math.floor(signals.article_word_count / 100));
  score += signals.keyword_bag_size;

  return score;
}

function run() {
  console.log('Generating wiki index...');

  const files = walk(WIKI_DIR);
  const index = [];

  files.forEach(filePath => {
    const relative = path.relative(ROOT, filePath).replace(/\\/g, '/');

    // 🔥 CRITICAL FIX — REMOVE LEGACY INDEX PAGE
    if (relative === 'wiki/index.html') return;

    const html = fs.readFileSync(filePath, 'utf8');
    const title = extractTitle(html);

    if (!title) return;

    const url = '/' + relative;

    const rank_signals = buildRankSignals(html);
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

  index.sort((a, b) => {
    return b.rank_score - a.rank_score || a.title.localeCompare(b.title);
  });

  fs.writeFileSync(OUTPUT, JSON.stringify(index, null, 2));

  console.log(`Generated ${index.length} entries`);
}

run();
