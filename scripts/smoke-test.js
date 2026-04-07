const fs = require('fs');
const path = require('path');

const REQUIRED_PATHS = [
  'index.html',
  'search.html',
  'categories/index.html',
  'js/wiki-index.json',
  'js/entity-map.json',
  'js/site-stats.json',
  'sitemap.xml'
];

function checkExists(p) {
  if (!fs.existsSync(p)) {
    throw new Error(`Missing required file: ${p}`);
  }
}

function checkWikiPages() {
  const wikiDir = path.join(__dirname, '..', 'wiki');
  const files = fs.readdirSync(wikiDir).filter(f => f.endsWith('.html'));

  if (files.length < 5) {
    throw new Error(`Too few wiki pages: ${files.length}`);
  }

  files.slice(0, 5).forEach(f => {
    const full = path.join(wikiDir, f);
    const content = fs.readFileSync(full, 'utf-8');

    if (!content.includes('<title>')) {
      throw new Error(`Missing <title> in ${f}`);
    }
  });
}

function checkJson(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (!data || (Array.isArray(data) && data.length === 0)) {
    throw new Error(`Empty JSON: ${file}`);
  }
}

function run() {
  console.log('Running smoke tests...');

  REQUIRED_PATHS.forEach(checkExists);

  checkJson('js/wiki-index.json');
  checkJson('js/entity-map.json');
  checkJson('js/site-stats.json');

  checkWikiPages();

  console.log('Smoke tests passed');
}

run();
