const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const REQUIRED_PATHS = [
  'index.html',
  'search.html',
  'categories/index.html',
  'js/wiki-index.json',
  'js/entity-map.json',
  'js/site-stats.json',
  'sitemap.xml'
];

const KEY_WIKI_PAGES = [
  'wiki/index.html',
  'wiki/alfie-the-bitcoin-kid-blaze.html',
  'wiki/crypto-moonboys.html'
];

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function fail(message) {
  throw new Error(message);
}

function checkRequiredFiles() {
  for (const relPath of REQUIRED_PATHS) {
    if (!exists(relPath)) {
      fail(`Missing required file: ${relPath}`);
    }
  }
}

function checkJson(relPath, { mustBeArray = false } = {}) {
  const raw = readText(relPath);
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    fail(`Invalid JSON in ${relPath}: ${err.message}`);
  }

  if (mustBeArray && !Array.isArray(data)) {
    fail(`${relPath} must be an array`);
  }

  if (Array.isArray(data) && data.length === 0) {
    fail(`Empty JSON array: ${relPath}`);
  }

  if (data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 0) {
    fail(`Empty JSON object: ${relPath}`);
  }

  return data;
}

function checkWikiFolder() {
  const wikiDir = path.join(ROOT, 'wiki');
  if (!fs.existsSync(wikiDir)) {
    fail('Missing /wiki folder');
  }

  const htmlFiles = fs.readdirSync(wikiDir).filter(name => name.endsWith('.html'));
  if (htmlFiles.length < 5) {
    fail(`Too few wiki pages: ${htmlFiles.length}`);
  }

  for (const fileName of htmlFiles.slice(0, 10)) {
    const content = fs.readFileSync(path.join(wikiDir, fileName), 'utf8');
    if (!content.includes('<title>')) {
      fail(`Missing <title> in wiki/${fileName}`);
    }
  }
}

function checkKeyWikiPages() {
  for (const relPath of KEY_WIKI_PAGES) {
    if (!exists(relPath)) {
      fail(`Missing key wiki page: ${relPath}`);
    }
  }

  const wikiIndex = readText('wiki/index.html');
  if (!wikiIndex.includes('/search.html')) {
    fail('wiki/index.html does not point to /search.html');
  }
}

function checkWikiIndexSchema() {
  const wikiIndex = checkJson('js/wiki-index.json', { mustBeArray: true });

  for (const [i, entry] of wikiIndex.entries()) {
    if (!entry || typeof entry !== 'object') {
      fail(`wiki-index entry ${i} is not an object`);
    }

    if (!entry.title || typeof entry.title !== 'string') {
      fail(`wiki-index entry ${i} missing title`);
    }

    if (!entry.url || typeof entry.url !== 'string') {
      fail(`wiki-index entry ${i} missing url`);
    }

    if (typeof entry.rank_score !== 'number' || Number.isNaN(entry.rank_score)) {
      fail(`wiki-index entry ${i} missing numeric rank_score`);
    }

    if (!entry.rank_signals || typeof entry.rank_signals !== 'object') {
      fail(`wiki-index entry ${i} missing rank_signals`);
    }

    if (!entry.rank_diagnostics || typeof entry.rank_diagnostics !== 'object') {
      fail(`wiki-index entry ${i} missing rank_diagnostics`);
    }

    if (!entry.search_index || typeof entry.search_index !== 'object') {
      fail(`wiki-index entry ${i} missing search_index`);
    }

    if (!entry.search_index.normalized_title || typeof entry.search_index.normalized_title !== 'string') {
      fail(`wiki-index entry ${i} missing search_index.normalized_title`);
    }

    if (!entry.url.startsWith('/')) {
      fail(`wiki-index entry ${i} has non-root-relative url: ${entry.url}`);
    }

    if (entry.url.includes('../')) {
      fail(`wiki-index entry ${i} has fragile relative url: ${entry.url}`);
    }
  }
}

function checkEntityMapSchema() {
  const entityMap = checkJson('js/entity-map.json', { mustBeArray: true });

  for (const [i, entry] of entityMap.entries()) {
    if (!entry || typeof entry !== 'object') {
      fail(`entity-map entry ${i} is not an object`);
    }

    if (!entry.entity_id || typeof entry.entity_id !== 'string') {
      fail(`entity-map entry ${i} missing entity_id`);
    }

    if (!entry.canonical_url || typeof entry.canonical_url !== 'string') {
      fail(`entity-map entry ${i} missing canonical_url`);
    }

    if (!entry.canonical_url.startsWith('/')) {
      fail(`entity-map entry ${i} has non-root-relative canonical_url: ${entry.canonical_url}`);
    }
  }
}

function checkSiteStatsSchema() {
  const stats = checkJson('js/site-stats.json');

  const requiredKeys = ['totalArticles', 'totalCategories'];
  for (const key of requiredKeys) {
    if (!(key in stats)) {
      fail(`site-stats missing key: ${key}`);
    }
    if (typeof stats[key] !== 'number' || Number.isNaN(stats[key])) {
      fail(`site-stats key ${key} must be numeric`);
    }
  }
}

function checkSitemap() {
  const sitemap = readText('sitemap.xml');

  if (!sitemap.includes('<urlset')) {
    fail('sitemap.xml missing <urlset');
  }

  const requiredUrls = [
    '/index.html',
    '/search.html',
    '/categories/index.html'
  ];

  for (const expected of requiredUrls) {
    if (!sitemap.includes(expected)) {
      fail(`sitemap.xml missing expected path: ${expected}`);
    }
  }
}

function run() {
  console.log('Running smoke tests...');

  checkRequiredFiles();
  checkWikiFolder();
  checkKeyWikiPages();
  checkWikiIndexSchema();
  checkEntityMapSchema();
  checkSiteStatsSchema();
  checkSitemap();

  console.log('Smoke tests passed ✅');
}

run();