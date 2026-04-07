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

const REQUIRED_WIKI_PAGES = [
  'wiki/index.html',
  'wiki/alfie-the-bitcoin-kid-blaze.html',
  'wiki/crypto-moonboys.html'
];

function abs(relPath) {
  return path.join(ROOT, relPath);
}

function exists(relPath) {
  return fs.existsSync(abs(relPath));
}

function read(relPath) {
  return fs.readFileSync(abs(relPath), 'utf8');
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

function checkRequiredWikiPages() {
  for (const relPath of REQUIRED_WIKI_PAGES) {
    if (!exists(relPath)) {
      fail(`Missing required wiki page: ${relPath}`);
    }
  }
}

function checkWikiFolder() {
  const wikiDir = abs('wiki');
  if (!fs.existsSync(wikiDir)) {
    fail('Missing wiki directory');
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

function parseJson(relPath) {
  try {
    return JSON.parse(read(relPath));
  } catch (err) {
    fail(`Invalid JSON in ${relPath}: ${err.message}`);
  }
}

function checkWikiIndex() {
  const data = parseJson('js/wiki-index.json');

  if (!Array.isArray(data)) {
    fail('js/wiki-index.json must be an array');
  }
  if (data.length === 0) {
    fail('js/wiki-index.json is empty');
  }

  for (const [i, entry] of data.entries()) {
    if (!entry || typeof entry !== 'object') {
      fail(`wiki-index entry ${i} is not an object`);
    }

    if (!entry.title || typeof entry.title !== 'string') {
      fail(`wiki-index entry ${i} missing title`);
    }

    if (!entry.url || typeof entry.url !== 'string') {
      fail(`wiki-index entry ${i} missing url`);
    }

    if (!entry.url.startsWith('/')) {
      fail(`wiki-index entry ${i} url is not root-relative: ${entry.url}`);
    }

    if (entry.url.includes('../')) {
      fail(`wiki-index entry ${i} url contains fragile relative path: ${entry.url}`);
    }

    if (typeof entry.rank_score !== 'number' || Number.isNaN(entry.rank_score)) {
      fail(`wiki-index entry ${i} missing numeric rank_score`);
    }

    if (!entry.rank_signals || typeof entry.rank_signals !== 'object') {
      fail(`wiki-index entry ${i} missing rank_signals`);
    }

    if (!entry.search_index || typeof entry.search_index !== 'object') {
      fail(`wiki-index entry ${i} missing search_index`);
    }

    if (!entry.search_index.normalized_title || typeof entry.search_index.normalized_title !== 'string') {
      fail(`wiki-index entry ${i} missing search_index.normalized_title`);
    }
  }
}

function checkEntityMap() {
  const data = parseJson('js/entity-map.json');

  if (!Array.isArray(data)) {
    fail('js/entity-map.json must be an array');
  }
  if (data.length === 0) {
    fail('js/entity-map.json is empty');
  }

  for (const [i, entry] of data.entries()) {
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
      fail(`entity-map entry ${i} canonical_url is not root-relative: ${entry.canonical_url}`);
    }
  }
}

function checkSiteStats() {
  const data = parseJson('js/site-stats.json');

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail('js/site-stats.json must be an object');
  }

  const requiredKeys = ['totalArticles', 'totalCategories'];
  for (const key of requiredKeys) {
    if (!(key in data)) {
      fail(`js/site-stats.json missing key: ${key}`);
    }
    if (typeof data[key] !== 'number' || Number.isNaN(data[key])) {
      fail(`js/site-stats.json key ${key} must be numeric`);
    }
  }
}

function checkSitemap() {
  const xml = read('sitemap.xml');

  if (!xml.includes('<urlset')) {
    fail('sitemap.xml missing <urlset');
  }

  const expectedPaths = [
    '/index.html',
    '/search.html',
    '/categories/index.html'
  ];

  for (const expected of expectedPaths) {
    if (!xml.includes(expected)) {
      fail(`sitemap.xml missing expected path: ${expected}`);
    }
  }
}

function checkWikiIndexRedirect() {
  const content = read('wiki/index.html');

  if (!content.includes('/search.html')) {
    fail('wiki/index.html must redirect to /search.html');
  }

  if (content.toLowerCase().includes('recent articles')) {
    fail('wiki/index.html looks like a real content page instead of redirect stub');
  }
}

function run() {
  console.log('Running smoke tests...');

  checkRequiredFiles();
  checkRequiredWikiPages();
  checkWikiFolder();
  checkWikiIndex();
  checkEntityMap();
  checkSiteStats();
  checkSitemap();
  checkWikiIndexRedirect();

  console.log('Smoke tests passed ✅');
}

run();