const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function abs(p) {
  return path.join(ROOT, p);
}

function exists(p) {
  return fs.existsSync(abs(p));
}

function read(p) {
  return fs.readFileSync(abs(p), 'utf8');
}

function fail(msg) {
  throw new Error(msg);
}

function safeCheck(file, fn) {
  try {
    fn();
  } catch (err) {
    console.warn(`⚠️ Soft fail: ${file} → ${err.message}`);
  }
}

/* ---------- HARD CHECKS (must pass) ---------- */

function checkCoreFiles() {
  const required = [
    'index.html',
    'search.html',
    'js/wiki-index.json'
  ];

  required.forEach(f => {
    if (!exists(f)) fail(`Missing core file: ${f}`);
  });
}

function checkWikiIndex() {
  const data = JSON.parse(read('js/wiki-index.json'));

  if (!Array.isArray(data) || data.length === 0) {
    fail('wiki-index.json invalid or empty');
  }

  data.forEach((entry, i) => {
    if (!entry.title) fail(`entry ${i} missing title`);
    if (!entry.url) fail(`entry ${i} missing url`);
    if (typeof entry.rank_score !== 'number') {
      fail(`entry ${i} missing rank_score`);
    }
  });
}

/* ---------- SOFT CHECKS (warn only) ---------- */

function checkOptionalFiles() {
  safeCheck('entity-map', () => {
    JSON.parse(read('js/entity-map.json'));
  });

  safeCheck('site-stats', () => {
    JSON.parse(read('js/site-stats.json'));
  });

  safeCheck('sitemap', () => {
    const xml = read('sitemap.xml');
    if (!xml.includes('<urlset')) {
      throw new Error('invalid sitemap');
    }
  });
}

function checkWikiFolder() {
  safeCheck('wiki folder', () => {
    const wikiDir = abs('wiki');
    if (!fs.existsSync(wikiDir)) throw new Error('missing wiki');

    const files = fs.readdirSync(wikiDir).filter(f => f.endsWith('.html'));

    if (files.length < 3) throw new Error('too few wiki pages');
  });
}

/* ---------- RUN ---------- */

function run() {
  console.log('Running smoke tests...');

  checkCoreFiles();
  checkWikiIndex();

  checkOptionalFiles();
  checkWikiFolder();

  console.log('Smoke tests passed ✅');
}

run();