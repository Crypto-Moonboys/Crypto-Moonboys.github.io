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

function parseJson(relPath) {
  try {
    return JSON.parse(read(relPath));
  } catch (err) {
    fail(`Invalid JSON in ${relPath}: ${err.message}`);
  }
}

function checkCoreFiles() {
  const required = [
    'index.html',
    'search.html',
    'categories/index.html',
    'js/wiki-index.json',
    'js/entity-map.json',
    'js/site-stats.json',
    'sitemap.xml'
  ];

  required.forEach(file => {
    if (!exists(file)) fail(`Missing core file: ${file}`);
  });
}

function checkWikiFolder() {
  const wikiDir = abs('wiki');

  if (!fs.existsSync(wikiDir)) {
    fail('Missing wiki directory');
  }

  const files = fs.readdirSync(wikiDir).filter(name => name.endsWith('.html'));

  if (files.length < 3) {
    fail(`Too few wiki pages: ${files.length}`);
  }

  for (const fileName of files.slice(0, 10)) {
    const html = fs.readFileSync(path.join(wikiDir, fileName), 'utf8');
    if (!html.includes('<title>')) {
      fail(`Missing <title> in wiki/${fileName}`);
    }
  }
}

function checkWikiIndex() {
  const data = parseJson('js/wiki-index.json');

  if (!Array.isArray(data) || data.length === 0) {
    fail('js/wiki-index.json invalid or empty');
  }

  data.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object') {
      fail(`wiki-index entry ${i} is not an object`);
    }

    if (!entry.title || typeof entry.title !== 'string') {
      fail(`wiki-index entry ${i} missing title`);
    }

    if (!entry.url || typeof entry.url !== 'string') {
      fail(`wiki-index entry ${i} missing url`);
    }

    if (!entry.url.startsWith('/wiki/')) {
      fail(`wiki-index entry ${i} url must start with /wiki/: ${entry.url}`);
    }

    if (entry.url === '/wiki/index.html') {
      fail(`wiki-index entry ${i} must not include legacy /wiki/index.html`);
    }

    if (entry.url.includes('../')) {
      fail(`wiki-index entry ${i} contains fragile relative path: ${entry.url}`);
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

    if (typeof entry.rank_signals.authority_score !== 'number' || Number.isNaN(entry.rank_signals.authority_score)) {
      fail(`wiki-index entry ${i} missing numeric rank_signals.authority_score`);
    }

    if (typeof entry.rank_diagnostics.authority_points !== 'number' || Number.isNaN(entry.rank_diagnostics.authority_points)) {
      fail(`wiki-index entry ${i} missing numeric rank_diagnostics.authority_points`);
    }

    if (entry.rank_diagnostics.final_rank_score !== entry.rank_score) {
      fail(`wiki-index entry ${i} final_rank_score does not match rank_score`);
    }

    if (!Array.isArray(entry.search_index.keyword_bag)) {
      fail(`wiki-index entry ${i} missing search_index.keyword_bag`);
    }

    if (!Array.isArray(entry.search_index.tokens)) {
      fail(`wiki-index entry ${i} missing search_index.tokens`);
    }

    const pagePath = abs(entry.url.replace(/^\//, ''));
    if (!fs.existsSync(pagePath)) {
      fail(`wiki-index entry ${i} points to missing page: ${entry.url}`);
    }
  });
}

function checkEntityMap() {
  const data = parseJson('js/entity-map.json');

  if (!Array.isArray(data) || data.length === 0) {
    fail('js/entity-map.json invalid or empty');
  }

  data.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object') {
      fail(`entity-map entry ${i} is not an object`);
    }

    if (!entry.entity_id || typeof entry.entity_id !== 'string') {
      fail(`entity-map entry ${i} missing entity_id`);
    }

    if (!entry.canonical_url || typeof entry.canonical_url !== 'string') {
      fail(`entity-map entry ${i} missing canonical_url`);
    }

    if (!entry.canonical_url.startsWith('/wiki/')) {
      fail(`entity-map entry ${i} canonical_url must start with /wiki/: ${entry.canonical_url}`);
    }

    if (entry.canonical_url === '/wiki/index.html') {
      fail(`entity-map entry ${i} must not include legacy /wiki/index.html`);
    }

    const pagePath = abs(entry.canonical_url.replace(/^\//, ''));
    if (!fs.existsSync(pagePath)) {
      fail(`entity-map entry ${i} points to missing page: ${entry.canonical_url}`);
    }
  });
}

function checkSiteStats() {
  const data = parseJson('js/site-stats.json');

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail('js/site-stats.json must be an object');
  }

  if ('totalArticles' in data && (typeof data.totalArticles !== 'number' || Number.isNaN(data.totalArticles))) {
    fail('js/site-stats.json totalArticles must be numeric');
  }

  if ('totalCategories' in data && (typeof data.totalCategories !== 'number' || Number.isNaN(data.totalCategories))) {
    fail('js/site-stats.json totalCategories must be numeric');
  }
}

function checkSitemap() {
  const xml = read('sitemap.xml');

  if (!xml.includes('<urlset')) {
    fail('sitemap.xml missing <urlset>');
  }

  if (!xml.includes('<loc>https://crypto-moonboys.github.io/search.html</loc>')) {
    fail('sitemap.xml missing canonical /search.html');
  }

  if (xml.includes('/wiki/index.html')) {
    fail('sitemap.xml must not include legacy /wiki/index.html');
  }
}

function checkSearchPage() {
  const html = read('search.html');

  if (!html.includes('search-results-page')) {
    fail('search.html missing search results container');
  }

  if (!html.includes('ranking-debug')) {
    fail('search.html missing ranking debug panel');
  }
}

function checkBlockTopiaFrontendCrashGuards() {
  const npcSource = read('games/block-topia/world/npc-system.js');
  const createNpcDefIndex = npcSource.indexOf('function createNpc(');
  if (createNpcDefIndex === -1) {
    fail('games/block-topia/world/npc-system.js missing module-scope createNpc(...) helper');
  }

  const ensureStart = npcSource.indexOf('function ensureHunterEntities(');
  if (ensureStart === -1) {
    fail('games/block-topia/world/npc-system.js missing ensureHunterEntities(...)');
  }

  const stepHunterStart = npcSource.indexOf('function stepHunterNpc(');
  if (stepHunterStart === -1) {
    fail('games/block-topia/world/npc-system.js missing stepHunterNpc(...)');
  }

  const ensureBody = npcSource.slice(ensureStart, stepHunterStart);
  const createNpcCallInEnsure = ensureBody.indexOf('createNpc(');
  if (createNpcCallInEnsure === -1) {
    fail('ensureHunterEntities(...) no longer calls createNpc(...) for hunter spawn');
  }

  const createNpcCallIndex = ensureStart + createNpcCallInEnsure;
  if (createNpcDefIndex >= createNpcCallIndex) {
    fail('createNpc(...) must be defined before ensureHunterEntities(...) references it');
  }

  const isoSource = read('games/block-topia/render/iso-renderer.js');
  const overlayStart = isoSource.indexOf('function drawCovertNodeOverlay(');
  if (overlayStart === -1) {
    fail('games/block-topia/render/iso-renderer.js missing drawCovertNodeOverlay(...)');
  }

  const overlayEnd = isoSource.indexOf('function drawSignalRouterOverlay(', overlayStart);
  if (overlayEnd === -1) {
    fail('Unable to isolate drawCovertNodeOverlay(...) body in iso-renderer.js');
  }

  const overlayBody = isoSource.slice(overlayStart, overlayEnd);
  if (!overlayBody.includes('if (!node || !node.id || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return;')) {
    fail('drawCovertNodeOverlay(...) missing null/invalid node guard');
  }

  if (!overlayBody.includes('Number(covert?.risk)')) {
    fail('drawCovertNodeOverlay(...) must read covert risk with optional chaining');
  }

  if (overlayBody.includes('covert.risk')) {
    fail('drawCovertNodeOverlay(...) must not directly access covert.risk');
  }

  const networkSource = read('games/block-topia/network.js');
  const isRoomOpenStart = networkSource.indexOf('function isRoomOpen() {');
  if (isRoomOpenStart === -1) {
    fail('games/block-topia/network.js missing isRoomOpen()');
  }

  const isConnectedStart = networkSource.indexOf('export function isConnected()', isRoomOpenStart);
  if (isConnectedStart === -1) {
    fail('Unable to isolate isRoomOpen() body in games/block-topia/network.js');
  }

  const isRoomOpenBody = networkSource.slice(isRoomOpenStart, isConnectedStart);
  if (!isRoomOpenBody.includes('if (!room || !room.sessionId) return false;')) {
    fail('isRoomOpen() must require room + sessionId before send eligibility');
  }

  const requiredConnectionShapes = [
    'conn.ws',
    'conn.transport?.ws',
    'conn.transport?.socket',
    'conn.socket',
    'conn.websocket',
  ];
  for (const shape of requiredConnectionShapes) {
    if (!isRoomOpenBody.includes(shape)) {
      fail(`isRoomOpen() missing Colyseus socket shape support: ${shape}`);
    }
  }

  if (!isRoomOpenBody.includes("typeof candidate.readyState === 'number'")) {
    fail('isRoomOpen() must check candidate.readyState before accepting socket candidate');
  }

  if (!isRoomOpenBody.includes('return ws.readyState === OPEN;')) {
    fail('isRoomOpen() must still gate sends on OPEN readyState');
  }
}

function run() {
  console.log('Running smoke tests...');

  checkCoreFiles();
  checkWikiFolder();
  checkWikiIndex();
  checkEntityMap();
  checkSiteStats();
  checkSitemap();
  checkSearchPage();
  checkBlockTopiaFrontendCrashGuards();

  console.log('Smoke tests passed ✅');
}

run();
